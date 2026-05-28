-- Rollback: restore original business-table policies with super-admin bypass,
--           restore original platform-table SELECT policies, and clean up helpers.

-- A. Standard <table>_tenant_isolation ALL-ops policies (original 22 + extended set).
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    -- original 22 tables
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
      'create policy %I_tenant_isolation on public.%I using ((tenant_id = public.current_tenant_id()) or public.is_super_admin()) with check ((tenant_id = public.current_tenant_id()) or public.is_super_admin())',
      tbl, tbl
    );
  end loop;
end $$;

-- B. "Tenant isolation" quoted ALL-ops policies (planning_module_schema.sql).
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
      'create policy %I on public.%I using ((tenant_id = public.current_tenant_id()) or public.is_super_admin()) with check ((tenant_id = public.current_tenant_id()) or public.is_super_admin())',
      'Tenant isolation', tbl
    );
  end loop;
end $$;

-- C. "tenant isolation" lowercase quoted ALL-ops policy (stocktake_redesign_schema.sql).
drop policy if exists "tenant isolation" on public.stocktake_variance_reason;
create policy "tenant isolation" on public.stocktake_variance_reason
  using ((tenant_id = public.current_tenant_id()) or public.is_super_admin())
  with check ((tenant_id = public.current_tenant_id()) or public.is_super_admin());

-- D. Per-operation quoted "tenant_isolation_*" policies.
-- delivery_receipt
drop policy if exists "tenant_isolation_select" on public.delivery_receipt;
drop policy if exists "tenant_isolation_insert" on public.delivery_receipt;
drop policy if exists "tenant_isolation_update" on public.delivery_receipt;
create policy "tenant_isolation_select" on public.delivery_receipt
  for select using ((tenant_id = public.current_tenant_id()) or public.is_super_admin());
create policy "tenant_isolation_insert" on public.delivery_receipt
  for insert with check ((tenant_id = public.current_tenant_id()) or public.is_super_admin());
create policy "tenant_isolation_update" on public.delivery_receipt
  for update using ((tenant_id = public.current_tenant_id()) or public.is_super_admin())
  with check ((tenant_id = public.current_tenant_id()) or public.is_super_admin());

-- delivery_receipt_line
drop policy if exists "tenant_isolation_select" on public.delivery_receipt_line;
drop policy if exists "tenant_isolation_insert" on public.delivery_receipt_line;
drop policy if exists "tenant_isolation_update" on public.delivery_receipt_line;
create policy "tenant_isolation_select" on public.delivery_receipt_line
  for select using ((tenant_id = public.current_tenant_id()) or public.is_super_admin());
create policy "tenant_isolation_insert" on public.delivery_receipt_line
  for insert with check ((tenant_id = public.current_tenant_id()) or public.is_super_admin());
create policy "tenant_isolation_update" on public.delivery_receipt_line
  for update using ((tenant_id = public.current_tenant_id()) or public.is_super_admin())
  with check ((tenant_id = public.current_tenant_id()) or public.is_super_admin());

-- supplier_contacts
drop policy if exists "tenant_isolation_select" on public.supplier_contacts;
drop policy if exists "tenant_isolation_insert" on public.supplier_contacts;
drop policy if exists "tenant_isolation_update" on public.supplier_contacts;
drop policy if exists "tenant_isolation_delete" on public.supplier_contacts;
create policy "tenant_isolation_select" on public.supplier_contacts
  for select using ((tenant_id = public.current_tenant_id()) or public.is_super_admin());
create policy "tenant_isolation_insert" on public.supplier_contacts
  for insert with check ((tenant_id = public.current_tenant_id()) or public.is_super_admin());
create policy "tenant_isolation_update" on public.supplier_contacts
  for update using ((tenant_id = public.current_tenant_id()) or public.is_super_admin())
  with check ((tenant_id = public.current_tenant_id()) or public.is_super_admin());
create policy "tenant_isolation_delete" on public.supplier_contacts
  for delete using ((tenant_id = public.current_tenant_id()) or public.is_super_admin());

-- supplier_components
drop policy if exists "tenant_isolation_select" on public.supplier_components;
drop policy if exists "tenant_isolation_insert" on public.supplier_components;
drop policy if exists "tenant_isolation_update" on public.supplier_components;
drop policy if exists "tenant_isolation_delete" on public.supplier_components;
create policy "tenant_isolation_select" on public.supplier_components
  for select using ((tenant_id = public.current_tenant_id()) or public.is_super_admin());
create policy "tenant_isolation_insert" on public.supplier_components
  for insert with check ((tenant_id = public.current_tenant_id()) or public.is_super_admin());
create policy "tenant_isolation_update" on public.supplier_components
  for update using ((tenant_id = public.current_tenant_id()) or public.is_super_admin())
  with check ((tenant_id = public.current_tenant_id()) or public.is_super_admin());
create policy "tenant_isolation_delete" on public.supplier_components
  for delete using ((tenant_id = public.current_tenant_id()) or public.is_super_admin());

-- supplier_component_price_breaks
drop policy if exists "tenant_isolation_select" on public.supplier_component_price_breaks;
drop policy if exists "tenant_isolation_insert" on public.supplier_component_price_breaks;
drop policy if exists "tenant_isolation_update" on public.supplier_component_price_breaks;
drop policy if exists "tenant_isolation_delete" on public.supplier_component_price_breaks;
create policy "tenant_isolation_select" on public.supplier_component_price_breaks
  for select using ((tenant_id = public.current_tenant_id()) or public.is_super_admin());
create policy "tenant_isolation_insert" on public.supplier_component_price_breaks
  for insert with check ((tenant_id = public.current_tenant_id()) or public.is_super_admin());
create policy "tenant_isolation_update" on public.supplier_component_price_breaks
  for update using ((tenant_id = public.current_tenant_id()) or public.is_super_admin())
  with check ((tenant_id = public.current_tenant_id()) or public.is_super_admin());
create policy "tenant_isolation_delete" on public.supplier_component_price_breaks
  for delete using ((tenant_id = public.current_tenant_id()) or public.is_super_admin());

-- order_source_sla
drop policy if exists "tenant_isolation_select" on public.order_source_sla;
drop policy if exists "tenant_isolation_insert" on public.order_source_sla;
drop policy if exists "tenant_isolation_update" on public.order_source_sla;
drop policy if exists "tenant_isolation_delete" on public.order_source_sla;
create policy "tenant_isolation_select" on public.order_source_sla
  for select using ((tenant_id = public.current_tenant_id()) or public.is_super_admin());
create policy "tenant_isolation_insert" on public.order_source_sla
  for insert with check ((tenant_id = public.current_tenant_id()) or public.is_super_admin());
create policy "tenant_isolation_update" on public.order_source_sla
  for update using ((tenant_id = public.current_tenant_id()) or public.is_super_admin())
  with check ((tenant_id = public.current_tenant_id()) or public.is_super_admin());
create policy "tenant_isolation_delete" on public.order_source_sla
  for delete using ((tenant_id = public.current_tenant_id()) or public.is_super_admin());

-- E. Custom-named policies.
-- tenant_dashboard_config: restore super-admin bypass.
drop policy if exists tenant_members_select on public.tenant_dashboard_config;
create policy tenant_members_select on public.tenant_dashboard_config
  for select using (
    tenant_id = public.current_tenant_id()
    or public.is_super_admin()
  );

drop policy if exists tenant_admins_write on public.tenant_dashboard_config;
create policy tenant_admins_write on public.tenant_dashboard_config
  for all
  using (
    (
      tenant_id = public.current_tenant_id()
      or public.is_super_admin()
    )
    and (
      exists (
        select 1 from public.profiles
        where id = auth.uid()
          and tenant_id = public.current_tenant_id()
          and role in ('admin', 'super_admin')
      )
      or public.is_super_admin()
    )
  )
  with check (
    (
      tenant_id = public.current_tenant_id()
      or public.is_super_admin()
    )
    and (
      exists (
        select 1 from public.profiles
        where id = auth.uid()
          and tenant_id = public.current_tenant_id()
          and role in ('admin', 'super_admin')
      )
      or public.is_super_admin()
    )
  );

-- tenant_invoices: restore super-admin bypass.
drop policy if exists tenant_admins_read_invoices on public.tenant_invoices;
create policy tenant_admins_read_invoices on public.tenant_invoices
  for select using (
    (tenant_id = public.current_tenant_id() and public.current_profile_role() in ('admin', 'super_admin'))
    or public.is_super_admin()
  );

-- F. Restore original platform-table SELECT policies (undo Section 4 of forward migration).
drop policy if exists profiles_is_self on public.profiles;
create policy profiles_is_self on public.profiles
  for select using (id = auth.uid() or public.is_super_admin());

drop policy if exists profile_tenant_access_select on public.profile_tenant_access;
create policy profile_tenant_access_select on public.profile_tenant_access
  for select using (profile_id = auth.uid() or public.is_super_admin());

drop policy if exists tenant_read on public.tenant;
create policy tenant_read on public.tenant
  for select using (public.has_tenant_access(id));

drop policy if exists tenant_subscription_select on public.tenant_subscription;
create policy tenant_subscription_select on public.tenant_subscription
  for select using (tenant_id = public.current_tenant_id() or public.is_super_admin());

drop policy if exists super_admin_audit_log_select on public.super_admin_audit_log;
create policy super_admin_audit_log_select on public.super_admin_audit_log
  for select using (public.is_super_admin());

-- G. Remove the CHECK constraint added by the forward migration.
--    (The NOT NULL constraint is intentionally not restored — a nullable column
--    tolerates non-null values; restoring NOT NULL requires first ensuring no
--    null rows exist, which cannot be guaranteed in a generic rollback.)
alter table public.profiles
  drop constraint if exists profiles_tenant_id_required_for_members;

-- H. Drop is_platform_operator() — no other objects depend on it post-rollback.
drop function if exists public.is_platform_operator();
