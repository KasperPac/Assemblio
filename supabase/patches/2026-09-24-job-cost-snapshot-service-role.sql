-- ---------------------------------------------------------------------
-- MANUVA-16 — let the Shopify sync write job cost snapshots.
--
-- Problem
-- -------
-- generate_job_financial_plan() opened with:
--
--     v_tenant_id := public.current_tenant_id();
--     if v_tenant_id is null then raise exception 'No tenant context for user'; end if;
--
-- current_tenant_id() resolves through auth.uid(). The Shopify sync calls this
-- RPC on the service-role client (src/lib/shopify/sync.ts), where auth.uid() is
-- null — so every call raised and no synced order has ever had a cost snapshot.
-- Planned margin has read $0 since the feature shipped.
--
-- The failure was invisible because supabase-js .rpc() resolves with
-- { data, error } rather than throwing, and the call site never read error: the
-- sync counted plan_runs and reported plan_errors: 0. That half is fixed in
-- sync.ts alongside this patch.
--
-- Fix
-- ---
-- Derive the tenant from the order line rather than from the caller, then apply
-- assert_tenant_write_access() to it. That guard already allows service-role and
-- super-admin and is NULL-safe for everyone else, so:
--
--   * service-role (Shopify sync) — allowed, tenant comes from the row
--   * the owning user             — allowed, guard confirms it is their tenant
--   * a user of another tenant    — refused, exactly as before
--
-- No signature change, and no p_tenant_id argument a caller could get wrong.
--
-- generate_financial_plans_for_open_orders() is deliberately NOT changed:
-- "every open order line for my tenant" has no meaning without a caller tenant,
-- so it stays user-only. It is called from /app/costing.
--
-- The function body below is finance_planning_phase1.sql's verbatim, with only
-- the opener replaced. Idempotent: create or replace only.
-- ---------------------------------------------------------------------

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
  -- Tenant comes from the row, not the caller, so a trusted server caller with
  -- no auth.uid() still resolves one. The guard below is what decides whether
  -- this caller may write to that tenant.
  select ol.tenant_id into v_tenant_id
  from public.order_line ol
  where ol.id = p_order_line_id;

  if v_tenant_id is null then
    raise exception 'Order line not found';
  end if;

  perform public.assert_tenant_write_access(v_tenant_id);

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

revoke execute on function public.generate_job_financial_plan(uuid, date) from public, anon;
grant execute on function public.generate_job_financial_plan(uuid, date) to authenticated, service_role;
