-- Super-admin write policies for tenant + tenant_subscription.
-- Both tables had RLS enabled but only SELECT policies. INSERT/UPDATE
-- silently failed under RLS even for super_admin, causing createTenant,
-- extendTrial, and changePlan to return no rows.

drop policy if exists tenant_insert_super_admin on public.tenant;
create policy tenant_insert_super_admin on public.tenant
  for insert with check (public.is_super_admin());

drop policy if exists tenant_subscription_insert_super_admin on public.tenant_subscription;
create policy tenant_subscription_insert_super_admin on public.tenant_subscription
  for insert with check (public.is_super_admin());

drop policy if exists tenant_subscription_update_super_admin on public.tenant_subscription;
create policy tenant_subscription_update_super_admin on public.tenant_subscription
  for update using (public.is_super_admin()) with check (public.is_super_admin());
