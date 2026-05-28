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
security definer
set search_path = public
as $$
  select coalesce(public.current_profile_role() in ('super_admin', 'platform_observer'), false)
$$;

grant execute on function public.is_platform_operator() to anon, authenticated;

-- 3. Tighten business-table RLS: drop super-admin bypass entirely.
--    Every user (including super-admin) sees only rows whose tenant_id
--    matches their current active tenant. For a tenant-less super-admin
--    with no active tenant, current_tenant_id() returns NULL and no rows match.
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
      'create policy %I_tenant_isolation on public.%I using (tenant_id = public.current_tenant_id()) with check (tenant_id = public.current_tenant_id())',
      tbl, tbl
    );
  end loop;
end $$;

-- 4. Extend platform-table READ policies to platform_observer.
--    Writes stay gated to is_super_admin() — those policies are unchanged.
drop policy if exists profiles_is_self on public.profiles;
create policy profiles_is_self on public.profiles
  for select
  using (id = auth.uid() or public.is_platform_operator());

drop policy if exists profile_tenant_access_select on public.profile_tenant_access;
create policy profile_tenant_access_select on public.profile_tenant_access
  for select
  using (profile_id = auth.uid() or public.is_platform_operator());

drop policy if exists tenant_read on public.tenant;
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
insert into public.super_admin_audit_log (actor_id, action, metadata)
select id, 'privacy_model_tightened', jsonb_build_object(
  'note', 'business-table RLS no longer bypassed by is_super_admin()',
  'migration', 'super_admin_foundation.sql'
)
from public.profiles
where role = 'super_admin'
limit 1;
