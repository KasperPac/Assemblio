create extension if not exists "pgcrypto";

create table public.tenant (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.tenant_domain (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  domain text not null unique,
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenant(id),
  role text not null default 'member',
  created_at timestamptz not null default now()
);

create table public.profile_tenant_access (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenant(id),
  role text not null default 'member',
  created_at timestamptz not null default now(),
  unique (profile_id, tenant_id)
);

create or replace function public.current_tenant_id()
returns uuid
language sql
security definer
set search_path = public
as $$
  select tenant_id from public.profiles where id = auth.uid()
$$;

grant execute on function public.current_tenant_id() to anon, authenticated;

create or replace function public.current_profile_role()
returns text
language sql
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

grant execute on function public.current_profile_role() to anon, authenticated;

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(public.current_profile_role() = 'super_admin', false)
$$;

grant execute on function public.is_super_admin() to anon, authenticated;

create or replace function public.has_tenant_access(p_tenant_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    public.is_super_admin()
    or exists (
      select 1
      from public.profile_tenant_access pta
      where pta.profile_id = auth.uid()
        and pta.tenant_id = p_tenant_id
    )
$$;

grant execute on function public.has_tenant_access(uuid) to anon, authenticated;

create or replace function public.set_active_tenant(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_tenant_id is null then
    raise exception 'Tenant is required';
  end if;

  if not public.has_tenant_access(p_tenant_id) then
    raise exception 'No access to tenant';
  end if;

  update public.profiles
  set tenant_id = p_tenant_id
  where id = auth.uid();
end;
$$;

grant execute on function public.set_active_tenant(uuid) to authenticated;

alter table public.tenant enable row level security;
create policy tenant_read on public.tenant
  for select
  using (public.has_tenant_access(id));

alter table public.profiles enable row level security;
create policy profiles_is_self on public.profiles
  for select
  using (id = auth.uid() or public.is_super_admin());
create policy profiles_insert_self on public.profiles
  for insert
  with check (id = auth.uid());
create policy profiles_update_self on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

alter table public.profile_tenant_access enable row level security;
create policy profile_tenant_access_select on public.profile_tenant_access
  for select
  using (profile_id = auth.uid() or public.is_super_admin());
create policy profile_tenant_access_insert on public.profile_tenant_access
  for insert
  with check (public.is_super_admin());
create policy profile_tenant_access_update on public.profile_tenant_access
  for update
  using (public.is_super_admin())
  with check (public.is_super_admin());
create policy profile_tenant_access_delete on public.profile_tenant_access
  for delete
  using (public.is_super_admin());

create table public.component_group (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.component (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  group_id uuid references public.component_group(id),
  name text not null,
  sku text,
  unit text,
  cost_per_unit numeric not null default 0,
  reorder_point numeric not null default 0,
  created_at timestamptz not null default now()
);

create table public.location (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  name text not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.shopify_store (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  store_domain text not null,
  status text not null default 'active',
  last_synced_at timestamptz,
  last_sync_status text,
  last_sync_meta jsonb,
  created_at timestamptz not null default now(),
  unique (tenant_id, store_domain)
);

create table public.shopify_install_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  shopify_store_id uuid not null references public.shopify_store(id) on delete cascade,
  access_token text not null,
  scopes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shopify_store_id)
);

create table public.shopify_webhook_event (
  id uuid primary key default gen_random_uuid(),
  webhook_id text not null unique,
  shop_domain text not null,
  topic text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

alter table public.shopify_webhook_event enable row level security;

create table public.shopify_product (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  shopify_id text not null,
  title text not null,
  description text,
  image_url text,
  created_at timestamptz not null default now(),
  unique (tenant_id, shopify_id)
);

create table public.shopify_variant (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  product_id uuid not null references public.shopify_product(id),
  shopify_id text not null,
  title text,
  sku text,
  created_at timestamptz not null default now(),
  unique (tenant_id, shopify_id)
);

create table public.product_bom (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  variant_id uuid not null references public.shopify_variant(id),
  version integer not null,
  status text not null default 'draft',
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.product_bom_component (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  product_bom_id uuid not null references public.product_bom(id),
  component_id uuid not null references public.component(id),
  quantity numeric not null,
  created_at timestamptz not null default now()
);

create table public.inventory_balance (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  component_id uuid not null references public.component(id),
  location_id uuid not null references public.location(id),
  on_hand numeric not null default 0,
  in_prod numeric not null default 0,
  reserved numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (component_id, location_id)
);

create table public.inventory_movement (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  component_id uuid not null references public.component(id),
  location_id uuid not null references public.location(id),
  delta_on_hand numeric not null default 0,
  delta_in_prod numeric not null default 0,
  reason text not null,
  reference_type text,
  reference_id uuid,
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  shopify_order_id text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  unique (tenant_id, shopify_order_id)
);

create table public.order_line (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  order_id uuid not null references public.orders(id),
  variant_id uuid not null references public.shopify_variant(id),
  quantity numeric not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, order_id, variant_id)
);

create table public.order_component_allocation (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  order_line_id uuid not null references public.order_line(id),
  component_id uuid not null references public.component(id),
  quantity numeric not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, order_line_id, component_id)
);

create table public.stocktake_session (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  location_id uuid not null references public.location(id),
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table public.stocktake_line (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  session_id uuid not null references public.stocktake_session(id),
  component_id uuid not null references public.component(id),
  expected_on_hand numeric not null default 0,
  counted numeric not null,
  created_at timestamptz not null default now()
);

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  name text not null,
  created_at timestamptz not null default now()
);

create table public.purchase_order (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  supplier_id uuid not null references public.suppliers(id),
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table public.purchase_order_line (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  purchase_order_id uuid not null references public.purchase_order(id),
  component_id uuid not null references public.component(id),
  quantity numeric not null,
  quantity_received numeric not null default 0,
  constraint purchase_order_line_qty_received_nonnegative check (quantity_received >= 0),
  constraint purchase_order_line_qty_received_le_quantity check (quantity_received <= quantity),
  created_at timestamptz not null default now()
);

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  actor_id uuid references auth.users(id),
  event text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create table public.event_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  event_type text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'tenant_domain',
    'component_group',
    'component',
    'location',
    'shopify_store',
    'shopify_install_tokens',
    'shopify_product',
    'shopify_variant',
    'product_bom',
    'product_bom_component',
    'inventory_balance',
    'inventory_movement',
    'orders',
    'order_line',
    'order_component_allocation',
    'stocktake_session',
    'stocktake_line',
    'suppliers',
    'purchase_order',
    'purchase_order_line',
    'activity_log',
    'event_log'
  ]
  loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format(
      'create policy %I_tenant_isolation on public.%I using ((tenant_id = public.current_tenant_id()) or public.is_super_admin()) with check ((tenant_id = public.current_tenant_id()) or public.is_super_admin())',
      tbl,
      tbl
    );
  end loop;
end $$;

create or replace function public.apply_inventory_movement(
  p_component_id uuid,
  p_location_id uuid,
  p_delta_on_hand numeric,
  p_delta_in_prod numeric,
  p_reason text,
  p_reference_type text,
  p_reference_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_movement_id uuid;
begin
  v_tenant_id := public.current_tenant_id();
  if v_tenant_id is null then
    raise exception 'No tenant context for user';
  end if;

  insert into public.inventory_movement (
    tenant_id,
    component_id,
    location_id,
    delta_on_hand,
    delta_in_prod,
    reason,
    reference_type,
    reference_id
  ) values (
    v_tenant_id,
    p_component_id,
    p_location_id,
    p_delta_on_hand,
    p_delta_in_prod,
    p_reason,
    p_reference_type,
    p_reference_id
  )
  returning id into v_movement_id;

  insert into public.inventory_balance (
    tenant_id,
    component_id,
    location_id,
    on_hand,
    in_prod,
    updated_at
  ) values (
    v_tenant_id,
    p_component_id,
    p_location_id,
    p_delta_on_hand,
    p_delta_in_prod,
    now()
  )
  on conflict (component_id, location_id)
  do update set
    on_hand = public.inventory_balance.on_hand + excluded.on_hand,
    in_prod = public.inventory_balance.in_prod + excluded.in_prod,
    updated_at = now();

  return v_movement_id;
end;
$$;

grant execute on function public.apply_inventory_movement(uuid, uuid, numeric, numeric, text, text, uuid)
  to authenticated;

create or replace function public.receive_purchase_order_line(
  p_purchase_order_line_id uuid,
  p_receive_qty numeric,
  p_location_id uuid
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_order_id uuid;
  v_component_id uuid;
  v_po_status text;
  v_remaining numeric;
  v_applied numeric;
begin
  v_tenant_id := public.current_tenant_id();
  if v_tenant_id is null then
    raise exception 'No tenant context for user';
  end if;

  select
    pol.purchase_order_id,
    pol.component_id,
    (pol.quantity - pol.quantity_received),
    po.status
  into
    v_order_id,
    v_component_id,
    v_remaining,
    v_po_status
  from public.purchase_order_line pol
  join public.purchase_order po on po.id = pol.purchase_order_id
  where pol.id = p_purchase_order_line_id
    and pol.tenant_id = v_tenant_id
    and po.tenant_id = v_tenant_id
  for update;

  if v_order_id is null then
    raise exception 'Purchase order line not found for tenant';
  end if;

  if v_po_status in ('received', 'cancelled', 'archived') then
    return 0;
  end if;

  if p_receive_qty is null or p_receive_qty <= 0 then
    return 0;
  end if;

  v_applied := least(greatest(v_remaining, 0), p_receive_qty);
  if v_applied <= 0 then
    return 0;
  end if;

  perform public.apply_inventory_movement(
    v_component_id,
    p_location_id,
    v_applied,
    0,
    'purchase_order_receipt',
    'purchase_order',
    v_order_id
  );

  update public.purchase_order_line
  set quantity_received = quantity_received + v_applied
  where id = p_purchase_order_line_id
    and tenant_id = v_tenant_id;

  if not exists (
    select 1
    from public.purchase_order_line
    where purchase_order_id = v_order_id
      and tenant_id = v_tenant_id
      and quantity_received < quantity
  ) then
    update public.purchase_order
    set status = 'received'
    where id = v_order_id
      and tenant_id = v_tenant_id
      and status <> 'cancelled';
  end if;

  return v_applied;
end;
$$;

grant execute on function public.receive_purchase_order_line(uuid, numeric, uuid)
  to authenticated;

