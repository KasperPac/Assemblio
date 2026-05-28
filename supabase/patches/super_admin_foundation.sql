-- super_admin_foundation.sql
-- Foundation migration for the tenant-less platform operator model.
--
-- SCOPE: Removes the is_super_admin() bypass from ALL tenant-isolated *business*
-- tables so that a platform operator with no active tenant sees zero business rows.
-- Platform-table WRITE policies (tenant_update, tenant INSERT/UPDATE, audit INSERT,
-- storage.objects logo/avatar policies) intentionally retain is_super_admin() because
-- these are platform-level operations that do not involve reading tenant business data.
-- Similarly, has_tenant_access() and current_tenant_id() retain is_super_admin()
-- internally — required for set_active_tenant() to work.
--
-- APPLICATION ORDER DEPENDENCY: This migration must be applied BEFORE or TOGETHER
-- WITH the context.ts update (Task 2). Applying this SQL alone will cause any
-- super_admin profile with tenant_id = NULL to be redirected out of the app by
-- getServerTenantContext(), since that function currently returns null when tenant_id
-- is null. Task 2 adds the tenant-less branch that handles this case.

-- 1. Allow tenant_id to be null for platform operators.
alter table public.profiles alter column tenant_id drop not null;

alter table public.profiles
  add constraint profiles_tenant_id_required_for_members
  check (
    tenant_id is not null
    or role in ('super_admin', 'platform_observer')
  );

-- 2. New SQL helper: covers both platform operator roles.
create or replace function public.is_platform_operator()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_profile_role() in ('super_admin', 'platform_observer'), false)
$$;

grant execute on function public.is_platform_operator() to anon, authenticated;

-- 3a. Tighten business-table RLS: drop super-admin bypass from tables that use
--     the standard <table>_tenant_isolation ALL-ops policy convention.
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    -- original 22 tables from multi_tenant_access_and_super_admin.sql
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
    'event_log',
    -- finance_planning_phase1.sql
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
    -- locations_manager_schema.sql
    'bin_sub_location',
    'bin_aisle',
    'bin_bay',
    -- bom_template_rls.sql
    'bom_template',
    'bom_template_line'
  ]
  loop
    execute format('drop policy if exists %I_tenant_isolation on public.%I', tbl, tbl);
    execute format(
      'create policy %I_tenant_isolation on public.%I using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id())',
      tbl, tbl
    );
  end loop;
end $$;

-- 3b. Tables using quoted "Tenant isolation" ALL-ops policy (planning_module_schema.sql).
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'job_routing_step',
    'product_notification_trigger',
    'notification_log'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', 'Tenant isolation', tbl);
    execute format(
      'create policy %I on public.%I using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id())',
      'Tenant isolation', tbl
    );
  end loop;
end $$;

-- 3c. Tables using quoted "tenant isolation" ALL-ops policy (stocktake_redesign_schema.sql).
drop policy if exists "tenant isolation" on public.stocktake_variance_reason;
create policy "tenant isolation" on public.stocktake_variance_reason
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- 3d. Tables using quoted per-operation "tenant_isolation_*" policies.
-- delivery_receipt (no DELETE policy in original)
drop policy if exists "tenant_isolation_select" on public.delivery_receipt;
drop policy if exists "tenant_isolation_insert" on public.delivery_receipt;
drop policy if exists "tenant_isolation_update" on public.delivery_receipt;
create policy "tenant_isolation_select" on public.delivery_receipt
  for select using (tenant_id = public.current_tenant_id());
create policy "tenant_isolation_insert" on public.delivery_receipt
  for insert with check (tenant_id = public.current_tenant_id());
create policy "tenant_isolation_update" on public.delivery_receipt
  for update using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- delivery_receipt_line (no DELETE policy in original)
drop policy if exists "tenant_isolation_select" on public.delivery_receipt_line;
drop policy if exists "tenant_isolation_insert" on public.delivery_receipt_line;
drop policy if exists "tenant_isolation_update" on public.delivery_receipt_line;
create policy "tenant_isolation_select" on public.delivery_receipt_line
  for select using (tenant_id = public.current_tenant_id());
create policy "tenant_isolation_insert" on public.delivery_receipt_line
  for insert with check (tenant_id = public.current_tenant_id());
create policy "tenant_isolation_update" on public.delivery_receipt_line
  for update using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

-- supplier_contacts
drop policy if exists "tenant_isolation_select" on public.supplier_contacts;
drop policy if exists "tenant_isolation_insert" on public.supplier_contacts;
drop policy if exists "tenant_isolation_update" on public.supplier_contacts;
drop policy if exists "tenant_isolation_delete" on public.supplier_contacts;
create policy "tenant_isolation_select" on public.supplier_contacts
  for select using (tenant_id = public.current_tenant_id());
create policy "tenant_isolation_insert" on public.supplier_contacts
  for insert with check (tenant_id = public.current_tenant_id());
create policy "tenant_isolation_update" on public.supplier_contacts
  for update using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());
create policy "tenant_isolation_delete" on public.supplier_contacts
  for delete using (tenant_id = public.current_tenant_id());

-- supplier_components
drop policy if exists "tenant_isolation_select" on public.supplier_components;
drop policy if exists "tenant_isolation_insert" on public.supplier_components;
drop policy if exists "tenant_isolation_update" on public.supplier_components;
drop policy if exists "tenant_isolation_delete" on public.supplier_components;
create policy "tenant_isolation_select" on public.supplier_components
  for select using (tenant_id = public.current_tenant_id());
create policy "tenant_isolation_insert" on public.supplier_components
  for insert with check (tenant_id = public.current_tenant_id());
create policy "tenant_isolation_update" on public.supplier_components
  for update using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());
create policy "tenant_isolation_delete" on public.supplier_components
  for delete using (tenant_id = public.current_tenant_id());

-- supplier_component_price_breaks
drop policy if exists "tenant_isolation_select" on public.supplier_component_price_breaks;
drop policy if exists "tenant_isolation_insert" on public.supplier_component_price_breaks;
drop policy if exists "tenant_isolation_update" on public.supplier_component_price_breaks;
drop policy if exists "tenant_isolation_delete" on public.supplier_component_price_breaks;
create policy "tenant_isolation_select" on public.supplier_component_price_breaks
  for select using (tenant_id = public.current_tenant_id());
create policy "tenant_isolation_insert" on public.supplier_component_price_breaks
  for insert with check (tenant_id = public.current_tenant_id());
create policy "tenant_isolation_update" on public.supplier_component_price_breaks
  for update using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());
create policy "tenant_isolation_delete" on public.supplier_component_price_breaks
  for delete using (tenant_id = public.current_tenant_id());

-- order_source_sla
drop policy if exists "tenant_isolation_select" on public.order_source_sla;
drop policy if exists "tenant_isolation_insert" on public.order_source_sla;
drop policy if exists "tenant_isolation_update" on public.order_source_sla;
drop policy if exists "tenant_isolation_delete" on public.order_source_sla;
create policy "tenant_isolation_select" on public.order_source_sla
  for select using (tenant_id = public.current_tenant_id());
create policy "tenant_isolation_insert" on public.order_source_sla
  for insert with check (tenant_id = public.current_tenant_id());
create policy "tenant_isolation_update" on public.order_source_sla
  for update using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());
create policy "tenant_isolation_delete" on public.order_source_sla
  for delete using (tenant_id = public.current_tenant_id());

-- 3e. Tables with custom policy names.
-- tenant_dashboard_config: remove super-admin bypass from read and write policies.
drop policy if exists tenant_members_select on public.tenant_dashboard_config;
create policy tenant_members_select on public.tenant_dashboard_config
  for select using (tenant_id = public.current_tenant_id());

drop policy if exists tenant_admins_write on public.tenant_dashboard_config;
create policy tenant_admins_write on public.tenant_dashboard_config
  for all
  using (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.profiles
      where id = auth.uid()
        and tenant_id = public.current_tenant_id()
        and role in ('admin', 'super_admin')
    )
  )
  with check (
    tenant_id = public.current_tenant_id()
    and exists (
      select 1 from public.profiles
      where id = auth.uid()
        and tenant_id = public.current_tenant_id()
        and role in ('admin', 'super_admin')
    )
  );

-- tenant_invoices: remove super-admin bypass (writes remain service-role only).
drop policy if exists tenant_admins_read_invoices on public.tenant_invoices;
create policy tenant_admins_read_invoices on public.tenant_invoices
  for select using (
    tenant_id = public.current_tenant_id()
    and public.current_profile_role() in ('admin', 'super_admin')
  );

-- 4. Extend platform-table READ policies to platform_observer.
--    Write policies on platform tables remain gated to is_super_admin() — unchanged.
drop policy if exists profiles_is_self on public.profiles;
create policy profiles_is_self on public.profiles
  for select
  using (id = auth.uid() or public.is_platform_operator());

drop policy if exists profile_tenant_access_select on public.profile_tenant_access;
create policy profile_tenant_access_select on public.profile_tenant_access
  for select
  using (profile_id = auth.uid() or public.is_platform_operator());

drop policy if exists tenant_read on public.tenant;
-- has_tenant_access(id) already covers super_admin (it calls is_super_admin() internally).
-- is_platform_operator() is the additional grant that lets platform_observer list tenants.
create policy tenant_read on public.tenant
  for select
  using (public.has_tenant_access(id) or public.is_platform_operator());

drop policy if exists tenant_subscription_select on public.tenant_subscription;
create policy tenant_subscription_select on public.tenant_subscription
  for select
  using (tenant_id = public.current_tenant_id() or public.is_platform_operator());

drop policy if exists super_admin_audit_log_select on public.super_admin_audit_log;
create policy super_admin_audit_log_select on public.super_admin_audit_log
  for select
  using (public.is_platform_operator());

-- 5. Audit marker.
do $$
declare
  v_actor_id uuid;
begin
  select id into v_actor_id from public.profiles where role = 'super_admin' limit 1;
  -- Fall back to a nil UUID in CI/staging environments with no super_admin profile yet.
  if v_actor_id is null then
    v_actor_id := '00000000-0000-0000-0000-000000000000'::uuid;
  end if;
  insert into public.super_admin_audit_log (actor_id, action, metadata)
  values (v_actor_id, 'privacy_model_tightened', jsonb_build_object(
    'note', 'business-table RLS no longer bypassed by is_super_admin() — all tables covered',
    'migration', 'super_admin_foundation.sql'
  ));
end $$;
