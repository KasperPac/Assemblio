-- Square connector. Additive; never changes Shopify writes or ledger semantics.
-- Requires the retail-stock foundation and orders-source patches.
begin;

create unique index if not exists location_tenant_id_id_uq on public.location(tenant_id,id);
create unique index if not exists product_variant_tenant_id_id_uq on public.product_variant(tenant_id,id);
create unique index if not exists orders_tenant_id_id_uq on public.orders(tenant_id,id);

create table if not exists public.sales_channel (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  kind text not null check(kind in ('square','shopify')),
  external_account_id text not null,
  stock_write_enabled boolean not null default false,
  baseline_confirmed_at timestamptz,
  sync_lease_token uuid, sync_lease_until timestamptz,
  created_at timestamptz not null default now(),
  unique(tenant_id,id), unique(tenant_id,kind,external_account_id),
  check(not stock_write_enabled or baseline_confirmed_at is not null)
);
create table if not exists public.square_connection (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  sales_channel_id uuid not null,
  merchant_id text not null,
  environment text not null check(environment in ('sandbox','production')),
  status text not null default 'active' check(status in ('active','needs_reconnect','disconnected')),
  connected_by uuid references auth.users(id) on delete set null,
  last_order_sync_at timestamptz,
  connected_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(tenant_id,environment), unique(merchant_id,environment), unique(sales_channel_id),
  foreign key(tenant_id,sales_channel_id) references public.sales_channel(tenant_id,id) on delete cascade
);
create table if not exists public.square_credential (
  connection_id uuid primary key references public.square_connection(id) on delete cascade,
  access_token_enc text not null, refresh_token_enc text not null,
  key_version integer not null check(key_version>0),
  access_expires_at timestamptz not null,
  version integer not null default 1 check(version>0),
  refresh_lease_until timestamptz, updated_at timestamptz not null default now()
);
create table if not exists public.square_location_link (
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  sales_channel_id uuid not null, square_location_id text not null, location_id uuid not null,
  primary key(sales_channel_id,square_location_id), unique(sales_channel_id,location_id),
  foreign key(tenant_id,sales_channel_id) references public.sales_channel(tenant_id,id) on delete cascade,
  foreign key(tenant_id,location_id) references public.location(tenant_id,id)
);
create table if not exists public.channel_item_link (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenant(id) on delete cascade,
  sales_channel_id uuid not null, external_variation_id text not null, name text not null,
  origin text not null default 'catalog' check(origin in ('catalog','order')),
  sku text, barcode text, variant_id uuid, tracked_location_ids text[] not null default '{}',
  match_method text check(match_method in ('barcode','sku','manual')),
  status text not null default 'unmatched' check(status in ('linked','unmatched','ambiguous','ignored')),
  ignored_reason text, stock_conversion_ratio numeric check(stock_conversion_ratio>0 and stock_conversion_ratio::text not in ('NaN','Infinity','-Infinity')),
  updated_at timestamptz not null default now(),
  unique(tenant_id,sales_channel_id,external_variation_id),
  foreign key(tenant_id,sales_channel_id) references public.sales_channel(tenant_id,id) on delete cascade,
  foreign key(tenant_id,variant_id) references public.product_variant(tenant_id,id),
  check(origin <> 'order' or stock_conversion_ratio is not null),
  check(status <> 'linked' or variant_id is not null),
  check(status <> 'ignored' or nullif(btrim(ignored_reason),'') is not null)
);
-- NULL ratio is an ordinary stockable variation; converted aliases consume
-- stock but must never each advertise or overwrite the complete shared stock.
create unique index if not exists channel_item_link_stockable_variant_uq
  on public.channel_item_link(sales_channel_id,variant_id) where status='linked' and stock_conversion_ratio is null;
create table if not exists public.square_webhook_event (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenant(id) on delete cascade,
  sales_channel_id uuid not null, event_id text not null unique, event_type text not null, payload jsonb not null,
  status text not null default 'pending' check(status in ('pending','processing','processed','failed')),
  attempts integer not null default 0, last_error text, lease_until timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(tenant_id,sales_channel_id) references public.sales_channel(tenant_id,id) on delete cascade
);
create index if not exists square_webhook_event_work_idx on public.square_webhook_event(status,lease_until,created_at);
create table if not exists public.channel_stock_write (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenant(id) on delete cascade,
  sales_channel_id uuid not null, variant_id uuid not null, external_variation_id text not null,
  external_location_id text not null, quantity numeric not null check(quantity>=0 and quantity::text not in ('NaN','Infinity','-Infinity')),
  status text not null default 'pending' check(status in ('pending','processing','sent','failed')),
  attempts integer not null default 0, lease_until timestamptz, square_calculated_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(tenant_id,sales_channel_id) references public.sales_channel(tenant_id,id) on delete cascade,
  foreign key(tenant_id,variant_id) references public.product_variant(tenant_id,id)
);

alter table public.orders add column if not exists sales_channel_id uuid;
alter table public.orders add column if not exists external_order_id text;
alter table public.orders add column if not exists square_payload jsonb;
alter table public.orders add column if not exists square_consumed_at timestamptz;
alter table public.orders add column if not exists source text not null default 'shopify';
alter table public.orders drop constraint if exists orders_source_check;
alter table public.orders add constraint orders_source_check check(source in ('shopify','manual','square'));
do $$ begin
  alter table public.orders add constraint orders_sales_channel_tenant_fk foreign key(tenant_id,sales_channel_id)
    references public.sales_channel(tenant_id,id);
exception when duplicate_object then null; end $$;
create unique index if not exists orders_channel_external_uq on public.orders(tenant_id,sales_channel_id,external_order_id);
create index if not exists orders_square_pending_idx on public.orders(tenant_id,sales_channel_id,created_at,id)
  where source='square' and square_consumed_at is null and not historical;

-- Required variant IDs on order_line make unresolved/service lines unsuitable there.
-- Preserve every external line here, and consume only after the whole order resolves.
create table if not exists public.square_order_line (
  id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenant(id) on delete cascade,
  sales_channel_id uuid not null, order_id uuid not null, external_line_id text not null,
  external_variation_id text, name text not null, quantity numeric not null check(quantity>0 and quantity::text not in ('NaN','Infinity','-Infinity')),
  unit_sell_price numeric not null default 0 check(unit_sell_price>=0 and unit_sell_price::text not in ('NaN','Infinity','-Infinity')),
  line_sell_price numeric not null default 0 check(line_sell_price>=0 and line_sell_price::text not in ('NaN','Infinity','-Infinity')),
  variant_id uuid, stock_conversion_ratio numeric,
  status text not null default 'pending_mapping' check(status in ('pending_mapping','ready','ignored','consumed')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(tenant_id,order_id,external_line_id),
  foreign key(tenant_id,sales_channel_id) references public.sales_channel(tenant_id,id) on delete cascade,
  foreign key(tenant_id,order_id) references public.orders(tenant_id,id) on delete cascade,
  foreign key(tenant_id,variant_id) references public.product_variant(tenant_id,id)
);
create index if not exists square_order_line_pending_idx on public.square_order_line(tenant_id,sales_channel_id,order_id) where status='pending_mapping';
create table if not exists public.square_inventory_count (
  tenant_id uuid not null references public.tenant(id) on delete cascade, sales_channel_id uuid not null,
  external_variation_id text not null, square_location_id text not null, quantity numeric not null,
  calculated_at timestamptz not null, is_echo boolean not null default false, absorbed_through timestamptz,
  updated_at timestamptz not null default now(),
  primary key(sales_channel_id,external_variation_id,square_location_id),
  foreign key(tenant_id,sales_channel_id) references public.sales_channel(tenant_id,id) on delete cascade
);

-- Domain tables have SELECT-only membership policies. All writes are trusted server operations.
do $$ declare v_table text; begin
  foreach v_table in array array['sales_channel','square_connection','square_location_link','channel_item_link',
    'square_webhook_event','channel_stock_write','square_order_line','square_inventory_count'] loop
    execute format('alter table public.%I enable row level security',v_table);
    execute format('revoke all on public.%I from public, anon, authenticated',v_table);
    execute format('grant select on public.%I to authenticated',v_table);
    execute format('grant all on public.%I to service_role',v_table);
    execute format('drop policy if exists square_member_read on public.%I',v_table);
    execute format('create policy square_member_read on public.%I for select to authenticated using (tenant_id = public.current_tenant_id())',v_table);
  end loop;
end $$;
alter table public.square_credential enable row level security;
revoke all on public.square_credential from public,anon,authenticated;
grant all on public.square_credential to service_role;

create or replace function public.save_square_connection(
  p_tenant_id uuid,p_user_id uuid,p_merchant_id text,p_environment text,
  p_access_token_enc text,p_refresh_token_enc text,p_key_version integer,p_access_expires_at timestamptz
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_channel uuid; v_existing text;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode='42501'; end if;
  if nullif(btrim(p_merchant_id),'') is null or p_environment not in ('sandbox','production') then
    raise exception 'merchant and valid environment required';
  end if;
  perform 1 from public.tenant where id=p_tenant_id for update;
  if not found then raise exception 'tenant not found'; end if;
  select id,sales_channel_id,merchant_id into v_id,v_channel,v_existing from public.square_connection
    where tenant_id=p_tenant_id and environment=p_environment for update;
  if v_id is not null and v_existing<>p_merchant_id then raise exception 'disconnect does not authorize switching merchant'; end if;
  if v_id is null then
    insert into public.sales_channel(tenant_id,kind,external_account_id)
      values(p_tenant_id,'square',p_environment||':'||p_merchant_id) returning id into v_channel;
    insert into public.square_connection(tenant_id,sales_channel_id,merchant_id,environment,connected_by)
      values(p_tenant_id,v_channel,p_merchant_id,p_environment,p_user_id) returning id into v_id;
  else
    update public.square_connection set status='active',connected_by=p_user_id,connected_at=now(),updated_at=now() where id=v_id;
  end if;
  -- Reauthorization never silently resumes inventory writes.
  update public.sales_channel set stock_write_enabled=false where id=v_channel and tenant_id=p_tenant_id;
  insert into public.square_credential(connection_id,access_token_enc,refresh_token_enc,key_version,access_expires_at)
    values(v_id,p_access_token_enc,p_refresh_token_enc,p_key_version,p_access_expires_at)
  on conflict(connection_id) do update set access_token_enc=excluded.access_token_enc,
    refresh_token_enc=excluded.refresh_token_enc,key_version=excluded.key_version,access_expires_at=excluded.access_expires_at,
    version=public.square_credential.version+1,refresh_lease_until=null,updated_at=now();
  return v_id;
end $$;

create or replace function public.claim_square_refresh_lease(p_connection_id uuid,p_lease_seconds integer default 60)
returns setof public.square_credential language plpgsql security definer set search_path=public as $$
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode='42501'; end if;
  return query update public.square_credential set refresh_lease_until=now()+make_interval(secs=>greatest(5,least(p_lease_seconds,300)))
    where connection_id=p_connection_id and (refresh_lease_until is null or refresh_lease_until<now()) returning *;
end $$;

create or replace function public.claim_square_sync(p_tenant_id uuid,p_sales_channel_id uuid,p_lease_seconds integer default 180)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_token uuid;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode='42501'; end if;
  update public.sales_channel set sync_lease_token=gen_random_uuid(),
    sync_lease_until=now()+make_interval(secs=>greatest(30,least(p_lease_seconds,300)))
    where id=p_sales_channel_id and tenant_id=p_tenant_id and kind='square'
      and (sync_lease_until is null or sync_lease_until<now()) returning sync_lease_token into v_token;
  return v_token;
end $$;

create or replace function public.claim_square_webhook_events(p_limit integer default 20)
returns setof public.square_webhook_event language plpgsql security definer set search_path=public as $$
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode='42501'; end if;
  return query with candidates as (
    select id from public.square_webhook_event where
      (status in ('pending','failed') and (lease_until is null or lease_until<now()))
      or (status='processing' and lease_until<now())
    order by created_at for update skip locked limit greatest(1,least(p_limit,100))
  ) update public.square_webhook_event e set status='processing',attempts=e.attempts+1,
    lease_until=now()+interval '5 minutes',updated_at=now() from candidates c where e.id=c.id returning e.*;
end $$;

create or replace function public.release_square_sync(p_tenant_id uuid,p_sales_channel_id uuid,p_lease_token uuid)
returns boolean language plpgsql security definer set search_path=public as $$
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode='42501'; end if;
  update public.sales_channel set sync_lease_token=null,sync_lease_until=null
    where id=p_sales_channel_id and tenant_id=p_tenant_id and sync_lease_token=p_lease_token;
  return found;
end $$;

create or replace function public.square_create_retail_link(p_tenant_id uuid,p_link_id uuid,p_lease_token uuid default null)
returns uuid language plpgsql security definer set search_path=public as $$
declare v_link public.channel_item_link; v_variant uuid;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode='42501'; end if;
  select * into v_link from public.channel_item_link where id=p_link_id and tenant_id=p_tenant_id for update;
  if v_link.id is null then raise exception 'mapping not found'; end if;
  if cardinality(v_link.tracked_location_ids)=0 then raise exception 'non-stock Square entries cannot create retail stock'; end if;
  perform 1 from public.sales_channel where id=v_link.sales_channel_id and tenant_id=p_tenant_id for update;
  if exists(select 1 from public.sales_channel where id=v_link.sales_channel_id and (
    (p_lease_token is not null and (sync_lease_token is distinct from p_lease_token or sync_lease_until is null or sync_lease_until<=clock_timestamp()))
    or (p_lease_token is null and sync_lease_token is not null and sync_lease_until>clock_timestamp()))) then
    raise exception 'Square sync is running; retry after it completes';
  end if;
  if v_link.status='linked' then return v_link.variant_id; end if;
  update public.sales_channel set stock_write_enabled=false where id=v_link.sales_channel_id and tenant_id=p_tenant_id;
  v_variant:=public.create_retail_item(p_tenant_id,null,v_link.name,v_link.sku,v_link.barcode,0,null,null,0);
  update public.channel_item_link set variant_id=v_variant,status='linked',match_method='manual',
    stock_conversion_ratio=v_link.stock_conversion_ratio,ignored_reason=null,updated_at=now() where id=p_link_id;
  return v_variant;
end $$;

create or replace function public.square_set_stock_writes(p_tenant_id uuid,p_channel_id uuid,p_enabled boolean,p_baseline_confirmed boolean,p_lease_token uuid default null)
returns void language plpgsql security definer set search_path=public as $$
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode='42501'; end if;
  perform 1 from public.sales_channel where id=p_channel_id and tenant_id=p_tenant_id and kind='square' for update;
  if not found then raise exception 'channel not found'; end if;
  if exists(select 1 from public.sales_channel where id=p_channel_id and (
    (p_lease_token is not null and (sync_lease_token is distinct from p_lease_token or sync_lease_until is null or sync_lease_until<=clock_timestamp()))
    or (p_lease_token is null and sync_lease_token is not null and sync_lease_until>clock_timestamp()))) then
    raise exception 'Square sync is running; retry after it completes';
  end if;
  if p_enabled then
    if not exists(select 1 from public.square_connection where sales_channel_id=p_channel_id and tenant_id=p_tenant_id and status='active')
      or not exists(select 1 from public.square_location_link where sales_channel_id=p_channel_id and tenant_id=p_tenant_id)
      or not exists(select 1 from public.channel_item_link where sales_channel_id=p_channel_id and tenant_id=p_tenant_id and status='linked' and stock_conversion_ratio is null)
      or exists(select 1 from public.channel_item_link where sales_channel_id=p_channel_id and tenant_id=p_tenant_id and status in ('unmatched','ambiguous')) then
      raise exception 'resolve catalog and location mappings before enabling stock writes';
    end if;
    if not p_baseline_confirmed and not exists(select 1 from public.sales_channel where id=p_channel_id and baseline_confirmed_at is not null) then
      raise exception 'confirm opening stock count before enabling stock writes';
    end if;
    if exists(select bc.component_id from public.channel_item_link m
      join public.product_bom b on b.tenant_id=m.tenant_id and b.variant_id=m.variant_id and b.is_active
      join public.product_bom_component bc on bc.tenant_id=b.tenant_id and bc.product_bom_id=b.id
      where m.tenant_id=p_tenant_id and m.sales_channel_id=p_channel_id and m.status='linked'
      and m.stock_conversion_ratio is null group by bc.component_id having count(distinct m.id)>1) then
      raise exception 'stock writes require one stockable Square variation per component; resolve shared-component mappings';
    end if;
  end if;
  update public.sales_channel set stock_write_enabled=p_enabled,
    baseline_confirmed_at=case when p_enabled then coalesce(baseline_confirmed_at,now()) else baseline_confirmed_at end
    where id=p_channel_id and tenant_id=p_tenant_id;
end $$;

create or replace function public.square_disconnect(p_tenant_id uuid,p_connection_id uuid,p_lease_token uuid default null)
returns void language plpgsql security definer set search_path=public as $$
declare v_channel uuid;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode='42501'; end if;
  select sales_channel_id into v_channel from public.square_connection where id=p_connection_id and tenant_id=p_tenant_id for update;
  if v_channel is null then raise exception 'connection not found'; end if;
  perform 1 from public.sales_channel where id=v_channel and tenant_id=p_tenant_id for update;
  if exists(select 1 from public.sales_channel where id=v_channel and (
    (p_lease_token is not null and (sync_lease_token is distinct from p_lease_token or sync_lease_until is null or sync_lease_until<=clock_timestamp()))
    or (p_lease_token is null and sync_lease_token is not null and sync_lease_until>clock_timestamp()))) then
    raise exception 'Square sync lease expired or belongs to another worker'; end if;
  update public.sales_channel set stock_write_enabled=false where id=v_channel and tenant_id=p_tenant_id;
  update public.square_connection set status='disconnected',updated_at=now() where id=p_connection_id;
  delete from public.square_credential where connection_id=p_connection_id;
end $$;

create or replace function public.square_apply_inventory_count(
  p_tenant_id uuid,p_sales_channel_id uuid,p_external_variation_id text,p_square_location_id text,
  p_quantity numeric,p_calculated_at timestamptz,p_is_echo boolean default false,p_lease_token uuid default null
) returns boolean language plpgsql security definer set search_path=public as $$
declare v_link public.channel_item_link; v_location uuid; v_component uuid; v_bom uuid;
  v_previous timestamptz; v_current numeric; v_reserved numeric; v_target numeric; v_delta numeric; v_baseline timestamptz;
  v_lease_token uuid; v_lease_until timestamptz;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode='42501'; end if;
  if p_quantity is null or p_quantity<0 or p_quantity::text in ('NaN','Infinity','-Infinity') or p_calculated_at is null then
    raise exception 'nonnegative finite quantity and calculated_at required';
  end if;
  -- Same channel lock as ingestion serializes counts against completed sales.
  select baseline_confirmed_at,sync_lease_token,sync_lease_until into v_baseline,v_lease_token,v_lease_until
    from public.sales_channel where id=p_sales_channel_id and tenant_id=p_tenant_id and kind='square'
    and baseline_confirmed_at is not null for update;
  if not found then return false; end if;
  if (p_lease_token is not null and (v_lease_token is distinct from p_lease_token or v_lease_until is null or v_lease_until<=clock_timestamp()))
    or (p_lease_token is null and v_lease_token is not null and v_lease_until>clock_timestamp()) then
    raise exception 'Square sync lease expired or belongs to another worker';
  end if;
  if p_calculated_at<=v_baseline then return false; end if;
  if not exists(select 1 from public.square_connection where sales_channel_id=p_sales_channel_id and tenant_id=p_tenant_id and status='active') then return false; end if;
  if exists(select 1 from public.square_order_line s join public.orders o on o.id=s.order_id and o.tenant_id=s.tenant_id
    where s.tenant_id=p_tenant_id and s.sales_channel_id=p_sales_channel_id and s.status='pending_mapping' and not o.historical)
    or exists(select 1 from public.square_webhook_event where tenant_id=p_tenant_id and sales_channel_id=p_sales_channel_id
      and event_type like 'order.%' and status in ('pending','processing','failed')) then return false; end if;
  select * into v_link from public.channel_item_link where tenant_id=p_tenant_id and sales_channel_id=p_sales_channel_id
    and external_variation_id=p_external_variation_id and status='linked' and stock_conversion_ratio is null
    and p_square_location_id=any(tracked_location_ids);
  if v_link.id is null then return false; end if;
  select location_id into v_location from public.square_location_link where tenant_id=p_tenant_id
    and sales_channel_id=p_sales_channel_id and square_location_id=p_square_location_id;
  if v_location is null then return false; end if;
  select b.id into v_bom from public.product_bom b join public.product_variant v on v.id=b.variant_id and v.tenant_id=b.tenant_id
    join public.product p on p.id=v.product_id and p.tenant_id=v.tenant_id
    where b.tenant_id=p_tenant_id and b.variant_id=v_link.variant_id and b.is_active and p.kind='retail';
  if v_bom is null or (select count(*) from public.product_bom_component where product_bom_id=v_bom and tenant_id=p_tenant_id)<>1 then
    raise exception 'absolute Square count requires a single-component retail BOM';
  end if;
  select component_id into v_component from public.product_bom_component
    where product_bom_id=v_bom and tenant_id=p_tenant_id and quantity=1 and yield_pct=1;
  if v_component is null or not exists(select 1 from public.component where id=v_component and tenant_id=p_tenant_id) then
    raise exception 'absolute Square count requires a same-tenant component with BOM quantity one';
  end if;
  -- Two external items mapping the same stocked variant cannot each overwrite its total.
  if exists(select 1 from public.channel_item_link where tenant_id=p_tenant_id and sales_channel_id=p_sales_channel_id
    and status='linked' and stock_conversion_ratio is null and variant_id=v_link.variant_id and id<>v_link.id and p_square_location_id=any(tracked_location_ids)) then
    raise exception 'absolute Square count is ambiguous across external variations';
  end if;
  if exists(select 1 from public.channel_item_link m
    join public.product_bom b on b.tenant_id=m.tenant_id and b.variant_id=m.variant_id and b.is_active
    join public.product_bom_component bc on bc.tenant_id=b.tenant_id and bc.product_bom_id=b.id
    where m.tenant_id=p_tenant_id and m.sales_channel_id=p_sales_channel_id and m.status='linked'
    and m.stock_conversion_ratio is null and m.id<>v_link.id and bc.component_id=v_component
    and p_square_location_id=any(m.tracked_location_ids)) then
    raise exception 'absolute Square count is ambiguous across variants sharing one component';
  end if;
  -- A timeout does not prove the outbound count was rejected by Square. Wait
  -- for the idempotent retry's exact timestamp proof before treating it as inbound.
  if not p_is_echo and exists(select 1 from public.channel_stock_write where tenant_id=p_tenant_id
    and sales_channel_id=p_sales_channel_id and external_variation_id=p_external_variation_id
    and external_location_id=p_square_location_id and quantity=p_quantity
    and status in ('pending','processing','failed') and square_calculated_at is null) then return false; end if;
  -- A count obtained before an already-consumed sale cannot restore its stock.
  if not p_is_echo and exists(select 1 from public.orders o
    join public.order_line ol on ol.order_id=o.id and ol.tenant_id=o.tenant_id
    join public.order_line_consumption c on c.order_line_id=ol.id and c.tenant_id=ol.tenant_id
    where o.tenant_id=p_tenant_id and o.sales_channel_id=p_sales_channel_id and not o.historical
    and o.square_consumed_at is not null and ol.variant_id=v_link.variant_id and c.location_id=v_location
    and o.fulfilled_at>p_calculated_at) then return false; end if;
  select calculated_at into v_previous from public.square_inventory_count where sales_channel_id=p_sales_channel_id
    and external_variation_id=p_external_variation_id and square_location_id=p_square_location_id;
  if v_previous is not null and p_calculated_at<=v_previous then return false; end if;
  v_target:=p_quantity;
  insert into public.inventory_balance(tenant_id,component_id,location_id)
    values(p_tenant_id,v_component,v_location) on conflict(tenant_id,component_id,location_id) do nothing;
  select on_hand,reserved into v_current,v_reserved from public.inventory_balance where tenant_id=p_tenant_id
    and component_id=v_component and location_id=v_location for update;
  if not p_is_echo and v_reserved>0 then
    raise exception 'Square available count cannot replace physical stock while reservations exist; manual review required';
  end if;
  v_delta:=v_target-v_current;
  if v_delta<>0 and not p_is_echo then
    insert into public.inventory_movement(tenant_id,component_id,location_id,delta_on_hand,delta_in_prod,delta_reserved,reason,reference_type,reference_id)
      values(p_tenant_id,v_component,v_location,v_delta,0,0,'square_count','sales_channel',p_sales_channel_id);
    update public.inventory_balance set on_hand=v_target,updated_at=now() where tenant_id=p_tenant_id
      and component_id=v_component and location_id=v_location;
  end if;
  insert into public.square_inventory_count(tenant_id,sales_channel_id,external_variation_id,square_location_id,quantity,calculated_at,is_echo,absorbed_through)
    values(p_tenant_id,p_sales_channel_id,p_external_variation_id,p_square_location_id,p_quantity,p_calculated_at,
      p_is_echo,case when not p_is_echo then p_calculated_at end)
    on conflict(sales_channel_id,external_variation_id,square_location_id) do update
    set quantity=excluded.quantity,calculated_at=excluded.calculated_at,is_echo=excluded.is_echo,
      absorbed_through=coalesce(excluded.absorbed_through,public.square_inventory_count.absorbed_through),updated_at=now();
  return true;
end $$;

create or replace function public.ingest_square_order(
  p_tenant_id uuid,p_sales_channel_id uuid,p_external_order_id text,p_square_location_id text,
  p_lines jsonb,p_payload jsonb default '{}',p_lease_token uuid default null
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_order uuid; v_closed timestamptz; v_baseline timestamptz; v_consumed timestamptz; v_baselined boolean;
  v_historical boolean; v_location uuid; v_line jsonb; v_group record; v_order_line uuid; v_external_variation text;
  v_lease_token uuid; v_lease_until timestamptz;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode='42501'; end if;
  if p_payload->>'state' is distinct from 'COMPLETED' or nullif(p_external_order_id,'') is null then
    raise exception 'only completed Square orders can be ingested';
  end if;
  v_closed:=(p_payload->>'closed_at')::timestamptz;
  if v_closed is null or jsonb_typeof(p_lines)<>'array' then raise exception 'closed_at and lines array required'; end if;
  select baseline_confirmed_at,sync_lease_token,sync_lease_until into v_baseline,v_lease_token,v_lease_until from public.sales_channel
    where id=p_sales_channel_id and tenant_id=p_tenant_id and kind='square' for update;
  if not found then raise exception 'Square channel not found'; end if;
  if (p_lease_token is not null and (v_lease_token is distinct from p_lease_token or v_lease_until is null or v_lease_until<=clock_timestamp()))
    or (p_lease_token is null and v_lease_token is not null and v_lease_until>clock_timestamp()) then
    raise exception 'Square sync lease expired or belongs to another worker';
  end if;
  if not exists(select 1 from public.square_connection where sales_channel_id=p_sales_channel_id and tenant_id=p_tenant_id and status='active') then
    raise exception 'Square connection is not active';
  end if;
  insert into public.orders(tenant_id,sales_channel_id,external_order_id,source,status,historical,fulfilled_at,order_number,square_payload)
    values(p_tenant_id,p_sales_channel_id,p_external_order_id,'square','open',v_baseline is null or v_closed<v_baseline,
      v_closed,p_external_order_id,jsonb_build_object('id',p_external_order_id,'location_id',p_square_location_id,
      'state','COMPLETED','closed_at',v_closed,'created_at',p_payload->>'created_at'))
    on conflict(tenant_id,sales_channel_id,external_order_id) do nothing returning id into v_order;
  if v_order is not null then
    for v_line in select value from jsonb_array_elements(p_lines) loop
      if nullif(v_line->>'uid','') is null then raise exception 'line UID required'; end if;
      v_external_variation:=coalesce(nullif(v_line->>'catalog_object_id',''),'custom:'||p_external_order_id||':'||(v_line->>'uid'));
      -- Removed catalog items and custom lines must remain operator-resolvable.
      -- These queue entries are sale aliases only and never stock API targets.
      insert into public.channel_item_link(tenant_id,sales_channel_id,external_variation_id,name,origin,status,stock_conversion_ratio,tracked_location_ids)
        values(p_tenant_id,p_sales_channel_id,v_external_variation,coalesce(v_line->>'name','Unnamed Square line'),
          'order','unmatched',1,array[p_square_location_id])
        on conflict(tenant_id,sales_channel_id,external_variation_id) do nothing;
      insert into public.square_order_line(tenant_id,sales_channel_id,order_id,external_line_id,external_variation_id,name,quantity,unit_sell_price,line_sell_price)
        values(p_tenant_id,p_sales_channel_id,v_order,v_line->>'uid',v_external_variation,
          coalesce(v_line->>'name','Unnamed Square line'),(v_line->>'quantity')::numeric,
          coalesce((v_line->>'unit_sell_price')::numeric,0),coalesce((v_line->>'line_sell_price')::numeric,0));
    end loop;
  end if;
  select id,historical,square_consumed_at into v_order,v_historical,v_consumed from public.orders
    where tenant_id=p_tenant_id and sales_channel_id=p_sales_channel_id and external_order_id=p_external_order_id for update;
  if v_consumed is not null then return v_order; end if;
  -- Use persisted location, quantities and date on replay, never replacement event input.
  select l.location_id into v_location from public.square_location_link l join public.orders o
    on o.id=v_order and l.square_location_id=o.square_payload->>'location_id'
    where l.tenant_id=p_tenant_id and l.sales_channel_id=p_sales_channel_id;
  update public.square_order_line s set status='pending_mapping',variant_id=null,stock_conversion_ratio=null,updated_at=now()
    where s.order_id=v_order and s.tenant_id=p_tenant_id;
  update public.square_order_line s set status=case when m.status='ignored' or (m.origin='catalog' and
    not ((select square_payload->>'location_id' from public.orders where id=v_order)=any(m.tracked_location_ids))) then 'ignored' else 'ready' end,
    variant_id=m.variant_id,stock_conversion_ratio=m.stock_conversion_ratio,updated_at=now()
    from public.channel_item_link m where s.order_id=v_order and s.tenant_id=p_tenant_id
    and m.tenant_id=s.tenant_id and m.sales_channel_id=s.sales_channel_id and m.external_variation_id=s.external_variation_id
    and (m.status='ignored' or (m.status='linked' and exists(
      select 1 from public.product_variant v join public.product p on p.id=v.product_id and p.tenant_id=v.tenant_id
      join public.product_bom b on b.variant_id=v.id and b.tenant_id=v.tenant_id and b.is_active
      where v.id=m.variant_id and v.tenant_id=p_tenant_id and p.kind='retail')));
  if exists(select 1 from public.square_order_line where order_id=v_order and status='pending_mapping') or v_location is null then
    return v_order;
  end if;
  for v_group in select variant_id,sum(quantity*coalesce(stock_conversion_ratio,1)) quantity,sum(line_sell_price) line_sell_price
    from public.square_order_line where order_id=v_order and tenant_id=p_tenant_id and status='ready' group by variant_id loop
    insert into public.order_line(tenant_id,order_id,variant_id,quantity,unit_sell_price,line_sell_price)
      values(p_tenant_id,v_order,v_group.variant_id,v_group.quantity,v_group.line_sell_price/v_group.quantity,v_group.line_sell_price)
      returning id into v_order_line;
    -- A later-arriving order may already be reflected in an absolute Square count.
    -- Baseline that variant without an additional movement; keep the claim idempotent.
    select exists(select 1 from public.square_inventory_count c join public.channel_item_link m
      on m.tenant_id=c.tenant_id and m.sales_channel_id=c.sales_channel_id and m.external_variation_id=c.external_variation_id
      join public.orders o on o.id=v_order
      where c.tenant_id=p_tenant_id and c.sales_channel_id=p_sales_channel_id
      and m.status='linked' and m.stock_conversion_ratio is null and m.variant_id=v_group.variant_id
      and c.square_location_id=o.square_payload->>'location_id' and c.absorbed_through>=o.fulfilled_at) into v_baselined;
    if v_historical or v_baselined then
      insert into public.order_line_consumption(tenant_id,order_line_id,order_id,location_id,baseline)
        values(p_tenant_id,v_order_line,v_order,v_location,true);
    else perform public.apply_sale_consumption(p_tenant_id,v_order_line,v_location); end if;
  end loop;
  update public.square_order_line set status='consumed',updated_at=now() where order_id=v_order and status='ready';
  update public.orders set status='fulfilled',square_consumed_at=now() where id=v_order and tenant_id=p_tenant_id;
  return v_order;
end $$;

-- Replay persisted, resolved orders without rescanning unbounded Square history.
-- Invalid/incomplete mappings do not occupy the limited batch and starve others.
create or replace function public.retry_square_pending_orders(
  p_tenant_id uuid,p_sales_channel_id uuid,p_lease_token uuid,p_limit integer default 100
) returns integer language plpgsql security definer set search_path=public as $$
declare v_order record; v_count integer:=0;
begin
  if not public.is_service_role() then raise exception 'forbidden' using errcode='42501'; end if;
  perform 1 from public.sales_channel where id=p_sales_channel_id and tenant_id=p_tenant_id and kind='square'
    and sync_lease_token=p_lease_token and sync_lease_until>clock_timestamp() for update;
  if not found then raise exception 'Square sync lease expired or belongs to another worker'; end if;
  for v_order in select o.id,o.external_order_id,o.square_payload from public.orders o
    where o.tenant_id=p_tenant_id and o.sales_channel_id=p_sales_channel_id and o.source='square'
      and not o.historical and o.square_consumed_at is null
      and exists(select 1 from public.square_location_link l where l.tenant_id=p_tenant_id
        and l.sales_channel_id=p_sales_channel_id and l.square_location_id=o.square_payload->>'location_id')
      and not exists(select 1 from public.square_order_line s
        left join public.channel_item_link m on m.tenant_id=s.tenant_id and m.sales_channel_id=s.sales_channel_id
          and m.external_variation_id=s.external_variation_id
        where s.order_id=o.id and s.tenant_id=p_tenant_id and not coalesce(
          m.status='ignored' or (m.status='linked' and exists(
            select 1 from public.product_variant v join public.product p on p.id=v.product_id and p.tenant_id=v.tenant_id
            join public.product_bom b on b.variant_id=v.id and b.tenant_id=v.tenant_id and b.is_active
            where v.id=m.variant_id and v.tenant_id=p_tenant_id and p.kind='retail')),false))
    order by o.created_at,o.id limit greatest(1,least(p_limit,500))
  loop
    perform public.ingest_square_order(p_tenant_id,p_sales_channel_id,v_order.external_order_id,
      v_order.square_payload->>'location_id','[]',v_order.square_payload,p_lease_token);
    if exists(select 1 from public.orders where id=v_order.id and tenant_id=p_tenant_id and square_consumed_at is not null) then
      v_count:=v_count+1;
    end if;
  end loop;
  return v_count;
end $$;

-- Every connector RPC is service-role-only, including DEFINER execution.
revoke all on function public.save_square_connection(uuid,uuid,text,text,text,text,integer,timestamptz) from public,anon,authenticated;
revoke all on function public.claim_square_refresh_lease(uuid,integer) from public,anon,authenticated;
revoke all on function public.claim_square_sync(uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.release_square_sync(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.claim_square_webhook_events(integer) from public,anon,authenticated;
revoke all on function public.square_create_retail_link(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.square_set_stock_writes(uuid,uuid,boolean,boolean,uuid) from public,anon,authenticated;
revoke all on function public.ingest_square_order(uuid,uuid,text,text,jsonb,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.square_disconnect(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.square_apply_inventory_count(uuid,uuid,text,text,numeric,timestamptz,boolean,uuid) from public,anon,authenticated;
revoke all on function public.retry_square_pending_orders(uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.save_square_connection(uuid,uuid,text,text,text,text,integer,timestamptz),
  public.claim_square_refresh_lease(uuid,integer),public.claim_square_webhook_events(integer),
  public.claim_square_sync(uuid,uuid,integer),public.release_square_sync(uuid,uuid,uuid),
  public.square_create_retail_link(uuid,uuid,uuid),public.square_set_stock_writes(uuid,uuid,boolean,boolean,uuid),
  public.ingest_square_order(uuid,uuid,text,text,jsonb,jsonb,uuid),public.square_disconnect(uuid,uuid,uuid),
  public.square_apply_inventory_count(uuid,uuid,text,text,numeric,timestamptz,boolean,uuid),
  public.retry_square_pending_orders(uuid,uuid,uuid,integer) to service_role;
commit;
