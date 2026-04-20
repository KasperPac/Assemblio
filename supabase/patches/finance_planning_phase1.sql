alter table public.order_line
  add column if not exists unit_sell_price numeric not null default 0,
  add column if not exists line_sell_price numeric not null default 0;

create table if not exists public.department (
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

create table if not exists public.staff_member (
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

create table if not exists public.staff_availability_week (
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

create table if not exists public.cost_rate_schedule (
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

create table if not exists public.product_bom_labor (
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
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_cost_snapshot (
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

create table if not exists public.job_labor_plan (
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

create table if not exists public.job_actual_time_entry (
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

create table if not exists public.job_cost_actual_rollup (
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

create table if not exists public.department_capacity_week (
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

create table if not exists public.department_utilization_week (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
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

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
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
    'department_utilization_week'
  ]
  loop
    execute format('alter table public.%I enable row level security', tbl);

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = tbl
        and policyname = format('%s_tenant_isolation', tbl)
    ) then
      execute format(
        'create policy %I_tenant_isolation on public.%I using ((tenant_id = public.current_tenant_id()) or public.is_super_admin()) with check ((tenant_id = public.current_tenant_id()) or public.is_super_admin())',
        tbl,
        tbl
      );
    end if;
  end loop;
end $$;

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

grant execute on function public.generate_financial_plans_for_open_orders(date) to authenticated;
