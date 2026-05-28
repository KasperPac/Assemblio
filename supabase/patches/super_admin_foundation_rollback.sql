-- Rollback: restore original business-table policies with super-admin bypass.
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
    execute format('drop policy if exists %I_tenant_isolation on public.%I', tbl, tbl);
    execute format(
      'create policy %I_tenant_isolation on public.%I using ((tenant_id = public.current_tenant_id()) or public.is_super_admin()) with check ((tenant_id = public.current_tenant_id()) or public.is_super_admin())',
      tbl, tbl
    );
  end loop;
end $$;

-- Note: does NOT restore the NOT NULL constraint on profiles.tenant_id
-- (a nullable column tolerates non-null values).
