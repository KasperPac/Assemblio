create extension if not exists "pgcrypto";

create table public.tenant (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  has_planning_module boolean not null default false,
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
  supplier_id uuid references public.suppliers(id),
  location_id uuid references public.location(id),
  name text not null,
  sku text,
  unit text,
  cost_per_unit numeric not null default 0,
  reorder_point numeric not null default 0,
  low_stock_level numeric not null default 0,
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
  app_id text not null default 'public' check (app_id in ('public', 'unlisted')),
  stats_only_before date,
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

create table public.product (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  shopify_id text,
  title text not null,
  description text,
  image_url text,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  unique (tenant_id, shopify_id),
  constraint product_source_shopify_id_chk
    check ((source = 'shopify' and shopify_id is not null)
        or (source <> 'shopify' and shopify_id is null))
);

create table public.product_variant (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  product_id uuid not null references public.product(id),
  shopify_id text,
  title text,
  sku text,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  unique (tenant_id, shopify_id),
  constraint product_variant_source_shopify_id_chk
    check ((source = 'shopify' and shopify_id is not null)
        or (source <> 'shopify' and shopify_id is null))
);

create table public.product_bom (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  variant_id uuid not null references public.product_variant(id),
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

create table public.bom_template (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table public.bom_template_line (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  template_id uuid not null references public.bom_template(id) on delete cascade,
  component_id uuid not null references public.component(id),
  quantity numeric not null default 0,
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
  order_number text,
  customer_email text,
  status text not null default 'open',
  shopify_created_at timestamptz,
  shopify_processed_at timestamptz,
  shopify_updated_at timestamptz,
  fulfilled_at timestamptz,
  historical boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tenant_id, shopify_order_id)
);

create table public.order_line (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  order_id uuid not null references public.orders(id),
  variant_id uuid not null references public.product_variant(id),
  quantity numeric not null,
  unit_sell_price numeric not null default 0,
  line_sell_price numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (tenant_id, order_id, variant_id)
);

create table public.department (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  name text not null,
  code text not null,
  is_active boolean not null default true,
  default_efficiency_pct numeric not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create table public.staff_member (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  user_id uuid references auth.users(id) on delete set null,
  department_id uuid not null references public.department(id),
  name text not null,
  employment_type text not null default 'salary',
  annual_salary numeric,
  hourly_rate numeric,
  standard_weekly_hours numeric not null default 38,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.staff_availability_week (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  staff_member_id uuid not null references public.staff_member(id) on delete cascade,
  week_start date not null,
  contracted_hours numeric not null default 0,
  leave_hours numeric not null default 0,
  training_hours numeric not null default 0,
  non_productive_hours numeric not null default 0,
  overtime_hours numeric not null default 0,
  available_hours_net numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (staff_member_id, week_start)
);

create table public.cost_rate_schedule (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  department_id uuid references public.department(id) on delete cascade,
  staff_member_id uuid references public.staff_member(id) on delete cascade,
  effective_from date not null,
  effective_to date,
  labor_rate_per_hour numeric not null default 0,
  admin_rate_per_hour numeric not null default 0,
  electricity_rate_per_kwh numeric not null default 0,
  gas_rate_per_unit numeric not null default 0,
  overhead_rate_per_hour numeric not null default 0,
  currency text not null default 'AUD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_bom_labor (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  product_bom_id uuid not null references public.product_bom(id) on delete cascade,
  department_id uuid not null references public.department(id),
  operation_name text not null,
  sequence integer not null default 1,
  setup_hours numeric not null default 0,
  run_hours_per_unit numeric not null default 0,
  admin_hours_per_unit numeric not null default 0,
  electricity_kwh_per_unit numeric not null default 0,
  gas_units_per_unit numeric not null default 0,
  blocked_by integer[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.job_cost_snapshot (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_line_id uuid references public.order_line(id) on delete cascade,
  source_product_bom_id uuid not null references public.product_bom(id),
  snapshot_status text not null default 'planned',
  sell_price numeric not null default 0,
  planned_material_cost numeric not null default 0,
  planned_labor_cost numeric not null default 0,
  planned_admin_cost numeric not null default 0,
  planned_electricity_cost numeric not null default 0,
  planned_gas_cost numeric not null default 0,
  planned_overhead_cost numeric not null default 0,
  planned_total_cost numeric not null default 0,
  planned_margin numeric not null default 0,
  planned_margin_pct numeric not null default 0,
  rate_snapshot_json jsonb not null default '{}'::jsonb,
  bom_snapshot_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.job_labor_plan (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_line_id uuid not null references public.order_line(id) on delete cascade,
  job_cost_snapshot_id uuid not null references public.job_cost_snapshot(id) on delete cascade,
  source_product_bom_labor_id uuid references public.product_bom_labor(id) on delete set null,
  department_id uuid not null references public.department(id),
  operation_name text not null,
  sequence integer not null default 1,
  week_start date not null,
  planned_units numeric not null default 0,
  planned_setup_hours numeric not null default 0,
  planned_run_hours numeric not null default 0,
  planned_total_hours numeric not null default 0,
  status text not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.job_actual_time_entry (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_line_id uuid not null references public.order_line(id) on delete cascade,
  job_labor_plan_id uuid references public.job_labor_plan(id) on delete set null,
  department_id uuid not null references public.department(id),
  staff_member_id uuid references public.staff_member(id) on delete set null,
  entry_type text not null default 'manual',
  started_at timestamptz,
  ended_at timestamptz,
  hours numeric not null default 0,
  labor_rate_snapshot numeric not null default 0,
  labor_cost_amount numeric not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.job_cost_actual_rollup (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_line_id uuid not null references public.order_line(id) on delete cascade,
  actual_material_cost numeric not null default 0,
  actual_labor_cost numeric not null default 0,
  actual_admin_cost numeric not null default 0,
  actual_electricity_cost numeric not null default 0,
  actual_gas_cost numeric not null default 0,
  actual_overhead_cost numeric not null default 0,
  actual_total_cost numeric not null default 0,
  actual_margin numeric not null default 0,
  actual_margin_pct numeric not null default 0,
  actual_hours_total numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (order_line_id)
);

create table public.department_capacity_week (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  department_id uuid not null references public.department(id) on delete cascade,
  week_start date not null,
  available_hours numeric not null default 0,
  overtime_hours numeric not null default 0,
  capacity_hours_total numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (tenant_id, department_id, week_start)
);

create table public.department_utilization_week (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  department_id uuid not null references public.department(id) on delete cascade,
  week_start date not null,
  planned_hours numeric not null default 0,
  actual_hours numeric not null default 0,
  available_hours numeric not null default 0,
  overload_hours numeric not null default 0,
  idle_hours numeric not null default 0,
  utilization_pct numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (tenant_id, department_id, week_start)
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
  actor_type text not null default 'user',
  actor_label text,
  event text not null,
  entity_type text,
  entity_id uuid,
  summary text,
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
    'product',
    'product_variant',
    'product_bom',
    'product_bom_component',
    'inventory_balance',
    'inventory_movement',
    'orders',
    'order_line',
    'department',
    'staff_member',
    'staff_availability_week',
    'cost_rate_schedule',
    'product_bom_labor',
    'job_cost_snapshot',
    'job_labor_plan',
    'job_actual_time_entry',
    'job_cost_actual_rollup',
    'department_capacity_week',
    'department_utilization_week',
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

create or replace function public.generate_job_financial_plan(
  p_order_line_id uuid,
  p_start_week date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_order_line record;
  v_product_bom_id uuid;
  v_snapshot_id uuid;
  v_material_cost numeric := 0;
  v_labor_cost numeric := 0;
  v_admin_cost numeric := 0;
  v_electricity_cost numeric := 0;
  v_gas_cost numeric := 0;
  v_overhead_cost numeric := 0;
  v_total_cost numeric := 0;
  v_margin numeric := 0;
  v_margin_pct numeric := 0;
  v_rate_snapshot jsonb := '[]'::jsonb;
  v_bom_snapshot jsonb := '{}'::jsonb;
begin
  v_tenant_id := public.current_tenant_id();
  if v_tenant_id is null then
    raise exception 'No tenant context for user';
  end if;

  select
    ol.id,
    ol.order_id,
    ol.variant_id,
    ol.quantity,
    ol.line_sell_price
  into v_order_line
  from public.order_line ol
  where ol.id = p_order_line_id
    and ol.tenant_id = v_tenant_id;

  if not found then
    raise exception 'Order line not found for tenant';
  end if;

  select pb.id
  into v_product_bom_id
  from public.product_bom pb
  where pb.tenant_id = v_tenant_id
    and pb.variant_id = v_order_line.variant_id
    and pb.is_active = true
  order by pb.version desc, pb.created_at desc
  limit 1;

  if v_product_bom_id is null then
    raise exception 'No active BOM found for order line %', p_order_line_id;
  end if;

  delete from public.job_cost_snapshot
  where tenant_id = v_tenant_id
    and order_line_id = p_order_line_id
    and snapshot_status = 'planned';

  delete from public.job_labor_plan
  where tenant_id = v_tenant_id
    and order_line_id = p_order_line_id;

  select
    coalesce(sum(pbc.quantity * v_order_line.quantity * c.cost_per_unit), 0)
  into v_material_cost
  from public.product_bom_component pbc
  join public.component c on c.id = pbc.component_id
  where pbc.tenant_id = v_tenant_id
    and pbc.product_bom_id = v_product_bom_id;

  select
    coalesce(sum((pbl.setup_hours + (pbl.run_hours_per_unit * v_order_line.quantity)) * coalesce(crs.labor_rate_per_hour, 0)), 0),
    coalesce(sum((pbl.admin_hours_per_unit * v_order_line.quantity) * coalesce(crs.admin_rate_per_hour, 0)), 0),
    coalesce(sum((pbl.electricity_kwh_per_unit * v_order_line.quantity) * coalesce(crs.electricity_rate_per_kwh, 0)), 0),
    coalesce(sum((pbl.gas_units_per_unit * v_order_line.quantity) * coalesce(crs.gas_rate_per_unit, 0)), 0),
    coalesce(sum((pbl.setup_hours + (pbl.run_hours_per_unit * v_order_line.quantity)) * coalesce(crs.overhead_rate_per_hour, 0)), 0),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'department_id', pbl.department_id,
          'operation_name', pbl.operation_name,
          'labor_rate_per_hour', coalesce(crs.labor_rate_per_hour, 0),
          'admin_rate_per_hour', coalesce(crs.admin_rate_per_hour, 0),
          'electricity_rate_per_kwh', coalesce(crs.electricity_rate_per_kwh, 0),
          'gas_rate_per_unit', coalesce(crs.gas_rate_per_unit, 0),
          'overhead_rate_per_hour', coalesce(crs.overhead_rate_per_hour, 0)
        )
        order by pbl.sequence
      ),
      '[]'::jsonb
    )
  into
    v_labor_cost,
    v_admin_cost,
    v_electricity_cost,
    v_gas_cost,
    v_overhead_cost,
    v_rate_snapshot
  from public.product_bom_labor pbl
  left join lateral (
    select
      labor_rate_per_hour,
      admin_rate_per_hour,
      electricity_rate_per_kwh,
      gas_rate_per_unit,
      overhead_rate_per_hour
    from public.cost_rate_schedule crs
    where crs.tenant_id = v_tenant_id
      and crs.department_id = pbl.department_id
      and crs.staff_member_id is null
      and crs.effective_from <= p_start_week
      and (crs.effective_to is null or crs.effective_to >= p_start_week)
    order by crs.effective_from desc
    limit 1
  ) crs on true
  where pbl.tenant_id = v_tenant_id
    and pbl.product_bom_id = v_product_bom_id;

  select jsonb_build_object(
    'product_bom_id', v_product_bom_id,
    'material_line_count', coalesce(count(*), 0),
    'quantity', v_order_line.quantity
  )
  into v_bom_snapshot
  from public.product_bom_component
  where tenant_id = v_tenant_id
    and product_bom_id = v_product_bom_id;

  v_total_cost := v_material_cost + v_labor_cost + v_admin_cost + v_electricity_cost + v_gas_cost + v_overhead_cost;
  v_margin := coalesce(v_order_line.line_sell_price, 0) - v_total_cost;
  v_margin_pct := case
    when coalesce(v_order_line.line_sell_price, 0) = 0 then 0
    else v_margin / v_order_line.line_sell_price
  end;

  insert into public.job_cost_snapshot (
    tenant_id,
    order_id,
    order_line_id,
    source_product_bom_id,
    snapshot_status,
    sell_price,
    planned_material_cost,
    planned_labor_cost,
    planned_admin_cost,
    planned_electricity_cost,
    planned_gas_cost,
    planned_overhead_cost,
    planned_total_cost,
    planned_margin,
    planned_margin_pct,
    rate_snapshot_json,
    bom_snapshot_json,
    updated_at
  ) values (
    v_tenant_id,
    v_order_line.order_id,
    v_order_line.id,
    v_product_bom_id,
    'planned',
    coalesce(v_order_line.line_sell_price, 0),
    v_material_cost,
    v_labor_cost,
    v_admin_cost,
    v_electricity_cost,
    v_gas_cost,
    v_overhead_cost,
    v_total_cost,
    v_margin,
    v_margin_pct,
    v_rate_snapshot,
    v_bom_snapshot,
    now()
  )
  returning id into v_snapshot_id;

  insert into public.job_labor_plan (
    tenant_id,
    order_id,
    order_line_id,
    job_cost_snapshot_id,
    source_product_bom_labor_id,
    department_id,
    operation_name,
    sequence,
    week_start,
    planned_units,
    planned_setup_hours,
    planned_run_hours,
    planned_total_hours,
    status,
    updated_at
  )
  select
    v_tenant_id,
    v_order_line.order_id,
    v_order_line.id,
    v_snapshot_id,
    pbl.id,
    pbl.department_id,
    pbl.operation_name,
    pbl.sequence,
    (p_start_week + ((greatest(pbl.sequence, 1) - 1) * 7))::date,
    v_order_line.quantity,
    pbl.setup_hours,
    pbl.run_hours_per_unit * v_order_line.quantity,
    pbl.setup_hours + (pbl.run_hours_per_unit * v_order_line.quantity),
    'planned',
    now()
  from public.product_bom_labor pbl
  where pbl.tenant_id = v_tenant_id
    and pbl.product_bom_id = v_product_bom_id;

  return v_snapshot_id;
end;
$$;

grant execute on function public.generate_job_financial_plan(uuid, date) to authenticated;

create or replace function public.refresh_department_utilization_week(
  p_week_start date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
begin
  v_tenant_id := public.current_tenant_id();
  if v_tenant_id is null then
    raise exception 'No tenant context for user';
  end if;

  if p_week_start is null then
    delete from public.department_utilization_week
    where tenant_id = v_tenant_id;
  else
    delete from public.department_utilization_week
    where tenant_id = v_tenant_id
      and week_start = p_week_start;
  end if;

  insert into public.department_utilization_week (
    tenant_id,
    department_id,
    week_start,
    planned_hours,
    actual_hours,
    available_hours,
    overload_hours,
    idle_hours,
    utilization_pct,
    updated_at
  )
  select
    cap.tenant_id,
    cap.department_id,
    cap.week_start,
    coalesce(plan.planned_hours, 0),
    coalesce(actual.actual_hours, 0),
    cap.capacity_hours_total,
    greatest(coalesce(plan.planned_hours, 0) - cap.capacity_hours_total, 0),
    greatest(cap.capacity_hours_total - coalesce(plan.planned_hours, 0), 0),
    case
      when cap.capacity_hours_total = 0 then 0
      else coalesce(plan.planned_hours, 0) / cap.capacity_hours_total
    end,
    now()
  from public.department_capacity_week cap
  left join (
    select
      tenant_id,
      department_id,
      week_start,
      sum(planned_total_hours) as planned_hours
    from public.job_labor_plan
    where tenant_id = v_tenant_id
      and (p_week_start is null or week_start = p_week_start)
    group by tenant_id, department_id, week_start
  ) plan
    on plan.tenant_id = cap.tenant_id
   and plan.department_id = cap.department_id
   and plan.week_start = cap.week_start
  left join (
    select
      tenant_id,
      department_id,
      date_trunc('week', coalesce(started_at, created_at))::date as week_start,
      sum(hours) as actual_hours
    from public.job_actual_time_entry
    where tenant_id = v_tenant_id
      and (
        p_week_start is null
        or date_trunc('week', coalesce(started_at, created_at))::date = p_week_start
      )
    group by tenant_id, department_id, date_trunc('week', coalesce(started_at, created_at))::date
  ) actual
    on actual.tenant_id = cap.tenant_id
   and actual.department_id = cap.department_id
   and actual.week_start = cap.week_start
  where cap.tenant_id = v_tenant_id
    and (p_week_start is null or cap.week_start = p_week_start);
end;
$$;

grant execute on function public.refresh_department_utilization_week(date) to authenticated;

create or replace function public.refresh_job_actual_cost_rollup(
  p_order_line_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_order_id uuid;
  v_sell_price numeric := 0;
  v_actual_material_cost numeric := 0;
  v_actual_admin_cost numeric := 0;
  v_actual_electricity_cost numeric := 0;
  v_actual_gas_cost numeric := 0;
  v_actual_overhead_cost numeric := 0;
  v_actual_labor_cost numeric := 0;
  v_actual_hours_total numeric := 0;
  v_actual_total_cost numeric := 0;
  v_actual_margin numeric := 0;
  v_actual_margin_pct numeric := 0;
begin
  v_tenant_id := public.current_tenant_id();
  if v_tenant_id is null then
    raise exception 'No tenant context for user';
  end if;

  select
    ol.order_id,
    coalesce(ol.line_sell_price, 0)
  into
    v_order_id,
    v_sell_price
  from public.order_line ol
  where ol.id = p_order_line_id
    and ol.tenant_id = v_tenant_id;

  if v_order_id is null then
    raise exception 'Order line not found for tenant';
  end if;

  select
    coalesce(jcs.planned_material_cost, 0),
    coalesce(jcs.planned_admin_cost, 0),
    coalesce(jcs.planned_electricity_cost, 0),
    coalesce(jcs.planned_gas_cost, 0),
    coalesce(jcs.planned_overhead_cost, 0)
  into
    v_actual_material_cost,
    v_actual_admin_cost,
    v_actual_electricity_cost,
    v_actual_gas_cost,
    v_actual_overhead_cost
  from public.job_cost_snapshot jcs
  where jcs.tenant_id = v_tenant_id
    and jcs.order_line_id = p_order_line_id
  order by jcs.created_at desc
  limit 1;

  select
    coalesce(sum(hours), 0),
    coalesce(sum(labor_cost_amount), 0)
  into
    v_actual_hours_total,
    v_actual_labor_cost
  from public.job_actual_time_entry
  where tenant_id = v_tenant_id
    and order_line_id = p_order_line_id;

  v_actual_total_cost :=
    v_actual_material_cost
    + v_actual_labor_cost
    + v_actual_admin_cost
    + v_actual_electricity_cost
    + v_actual_gas_cost
    + v_actual_overhead_cost;
  v_actual_margin := v_sell_price - v_actual_total_cost;
  v_actual_margin_pct := case
    when v_sell_price = 0 then 0
    else v_actual_margin / v_sell_price
  end;

  insert into public.job_cost_actual_rollup (
    tenant_id,
    order_id,
    order_line_id,
    actual_material_cost,
    actual_labor_cost,
    actual_admin_cost,
    actual_electricity_cost,
    actual_gas_cost,
    actual_overhead_cost,
    actual_total_cost,
    actual_margin,
    actual_margin_pct,
    actual_hours_total,
    updated_at
  ) values (
    v_tenant_id,
    v_order_id,
    p_order_line_id,
    v_actual_material_cost,
    v_actual_labor_cost,
    v_actual_admin_cost,
    v_actual_electricity_cost,
    v_actual_gas_cost,
    v_actual_overhead_cost,
    v_actual_total_cost,
    v_actual_margin,
    v_actual_margin_pct,
    v_actual_hours_total,
    now()
  )
  on conflict (order_line_id)
  do update set
    actual_material_cost = excluded.actual_material_cost,
    actual_labor_cost = excluded.actual_labor_cost,
    actual_admin_cost = excluded.actual_admin_cost,
    actual_electricity_cost = excluded.actual_electricity_cost,
    actual_gas_cost = excluded.actual_gas_cost,
    actual_overhead_cost = excluded.actual_overhead_cost,
    actual_total_cost = excluded.actual_total_cost,
    actual_margin = excluded.actual_margin,
    actual_margin_pct = excluded.actual_margin_pct,
    actual_hours_total = excluded.actual_hours_total,
    updated_at = excluded.updated_at;
end;
$$;

grant execute on function public.refresh_job_actual_cost_rollup(uuid) to authenticated;

create or replace function public.create_job_actual_time_entry(
  p_order_line_id uuid,
  p_department_id uuid,
  p_hours numeric,
  p_staff_member_id uuid default null,
  p_started_at timestamptz default null,
  p_ended_at timestamptz default null,
  p_note text default null,
  p_entry_type text default 'manual'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_order_id uuid;
  v_job_labor_plan_id uuid;
  v_effective_date date;
  v_rate numeric := 0;
  v_time_entry_id uuid;
begin
  v_tenant_id := public.current_tenant_id();
  if v_tenant_id is null then
    raise exception 'No tenant context for user';
  end if;

  if p_hours is null or p_hours <= 0 then
    raise exception 'Hours must be greater than zero';
  end if;

  select ol.order_id
  into v_order_id
  from public.order_line ol
  where ol.id = p_order_line_id
    and ol.tenant_id = v_tenant_id;

  if v_order_id is null then
    raise exception 'Order line not found for tenant';
  end if;

  v_effective_date := coalesce((p_started_at at time zone 'utc')::date, current_date);

  if p_staff_member_id is not null then
    select coalesce(
      sm.hourly_rate,
      (
        select crs.labor_rate_per_hour
        from public.cost_rate_schedule crs
        where crs.tenant_id = v_tenant_id
          and crs.staff_member_id = p_staff_member_id
          and crs.effective_from <= v_effective_date
          and (crs.effective_to is null or crs.effective_to >= v_effective_date)
        order by crs.effective_from desc
        limit 1
      ),
      (
        select crs.labor_rate_per_hour
        from public.cost_rate_schedule crs
        where crs.tenant_id = v_tenant_id
          and crs.department_id = p_department_id
          and crs.staff_member_id is null
          and crs.effective_from <= v_effective_date
          and (crs.effective_to is null or crs.effective_to >= v_effective_date)
        order by crs.effective_from desc
        limit 1
      ),
      0
    )
    into v_rate
    from public.staff_member sm
    where sm.id = p_staff_member_id
      and sm.tenant_id = v_tenant_id;
  else
    select coalesce(crs.labor_rate_per_hour, 0)
    into v_rate
    from public.cost_rate_schedule crs
    where crs.tenant_id = v_tenant_id
      and crs.department_id = p_department_id
      and crs.staff_member_id is null
      and crs.effective_from <= v_effective_date
      and (crs.effective_to is null or crs.effective_to >= v_effective_date)
    order by crs.effective_from desc
    limit 1;
  end if;

  select jlp.id
  into v_job_labor_plan_id
  from public.job_labor_plan jlp
  where jlp.tenant_id = v_tenant_id
    and jlp.order_line_id = p_order_line_id
    and jlp.department_id = p_department_id
  order by
    case
      when p_started_at is not null
        and jlp.week_start = date_trunc('week', p_started_at)::date then 0
      else 1
    end,
    jlp.sequence asc,
    jlp.created_at asc
  limit 1;

  insert into public.job_actual_time_entry (
    tenant_id,
    order_id,
    order_line_id,
    job_labor_plan_id,
    department_id,
    staff_member_id,
    entry_type,
    started_at,
    ended_at,
    hours,
    labor_rate_snapshot,
    labor_cost_amount,
    note,
    updated_at
  ) values (
    v_tenant_id,
    v_order_id,
    p_order_line_id,
    v_job_labor_plan_id,
    p_department_id,
    p_staff_member_id,
    coalesce(nullif(p_entry_type, ''), 'manual'),
    p_started_at,
    p_ended_at,
    p_hours,
    v_rate,
    p_hours * v_rate,
    nullif(p_note, ''),
    now()
  )
  returning id into v_time_entry_id;

  perform public.refresh_job_actual_cost_rollup(p_order_line_id);
  perform public.refresh_department_utilization_week(date_trunc('week', coalesce(p_started_at, now()))::date);

  return v_time_entry_id;
end;
$$;

grant execute on function public.create_job_actual_time_entry(uuid, uuid, numeric, uuid, timestamptz, timestamptz, text, text) to authenticated;

create or replace function public.generate_financial_plans_for_open_orders(
  p_start_week date default current_date
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_order_line record;
  v_generated_count integer := 0;
begin
  v_tenant_id := public.current_tenant_id();
  if v_tenant_id is null then
    raise exception 'No tenant context for user';
  end if;

  for v_order_line in
    select ol.id
    from public.order_line ol
    join public.orders o on o.id = ol.order_id
    where ol.tenant_id = v_tenant_id
      and o.status not in ('fulfilled', 'cancelled')
  loop
    perform public.generate_job_financial_plan(v_order_line.id, p_start_week);
    v_generated_count := v_generated_count + 1;
  end loop;

  perform public.refresh_department_utilization_week(p_start_week);

  return v_generated_count;
end;
$$;

-- ============================================================
-- Planning Module Tables
-- ============================================================

-- Job routing step — live tracking record per order-line per routing stage
create table if not exists public.job_routing_step (
  id                uuid        primary key default gen_random_uuid(),
  tenant_id         uuid        not null references public.tenant(id),
  order_line_id     uuid        not null references public.order_line(id) on delete cascade,
  department_id     uuid        not null references public.department(id),
  bom_labor_id      uuid        references public.product_bom_labor(id) on delete set null,
  sequence          integer     not null,
  blocked_by        integer[]   not null default '{}',
  operation_name    text        not null,
  status            text        not null default 'blocked'
                                check (status in ('blocked','queued','active','complete','skipped')),
  scheduled_start   timestamptz,
  scheduled_end     timestamptz,
  actual_start      timestamptz,
  actual_end        timestamptz,
  started_by        uuid        references auth.users(id),
  completed_by      uuid        references auth.users(id),
  priority          integer     not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (order_line_id, sequence)
);

create index if not exists jrs_tenant_idx       on public.job_routing_step(tenant_id);
create index if not exists jrs_order_line_idx   on public.job_routing_step(order_line_id);
create index if not exists jrs_department_idx   on public.job_routing_step(department_id);
create index if not exists jrs_dept_status_idx  on public.job_routing_step(tenant_id, department_id, status);

alter table public.job_routing_step enable row level security;

create policy "Tenant isolation" on public.job_routing_step
  using  (tenant_id = current_tenant_id() or public.is_super_admin())
  with check (tenant_id = current_tenant_id() or public.is_super_admin());

-- Product notification trigger — per-BOM per-sequence notification config
create table if not exists public.product_notification_trigger (
  id               uuid     primary key default gen_random_uuid(),
  tenant_id        uuid     not null references public.tenant(id),
  product_bom_id   uuid     not null references public.product_bom(id) on delete cascade,
  routing_sequence integer  not null,
  message_template text     not null,
  channel          text     not null default 'email'
                            check (channel in ('email')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (tenant_id, product_bom_id, routing_sequence)
);

alter table public.product_notification_trigger enable row level security;

create policy "Tenant isolation" on public.product_notification_trigger
  using  (tenant_id = current_tenant_id() or public.is_super_admin())
  with check (tenant_id = current_tenant_id() or public.is_super_admin());

-- Notification log — audit trail of every sent notification
create table if not exists public.notification_log (
  id              uuid     primary key default gen_random_uuid(),
  tenant_id       uuid     not null references public.tenant(id),
  order_id        uuid     not null references public.orders(id),
  order_line_id   uuid     not null references public.order_line(id),
  trigger_id      uuid     references public.product_notification_trigger(id) on delete set null,
  channel         text     not null check (channel in ('email')),
  recipient       text     not null,
  sent_at         timestamptz not null default now(),
  delivery_status text     not null default 'sent'
                           check (delivery_status in ('sent','delivered','failed')),
  created_at      timestamptz not null default now()
);

create index if not exists notif_log_order_idx       on public.notification_log(order_id);
create index if not exists notif_log_order_line_idx  on public.notification_log(order_line_id);
create index if not exists notif_log_tenant_idx      on public.notification_log(tenant_id);

alter table public.notification_log enable row level security;

create policy "Tenant isolation" on public.notification_log
  using  (tenant_id = current_tenant_id() or public.is_super_admin())
  with check (tenant_id = current_tenant_id() or public.is_super_admin());

grant execute on function public.generate_financial_plans_for_open_orders(date) to authenticated;
