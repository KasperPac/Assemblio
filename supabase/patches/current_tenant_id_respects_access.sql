-- Tighten public.current_tenant_id() so it respects profile_tenant_access.
--
-- Previous behaviour (multi_tenant_access_and_super_admin.sql line 15-22):
--   returned profiles.tenant_id without verifying that the user still had a
--   matching membership in profile_tenant_access. If access was revoked but
--   profiles.tenant_id was not also cleared, the user kept RLS access at the
--   database layer (PostgREST, anon key) even though the app-layer
--   getServerTenantContext() check would have caught it.
--
-- New behaviour: returns the active tenant only if the caller is a super
-- admin OR has an active profile_tenant_access row matching that tenant.
-- Otherwise returns null, which makes every tenant-isolation policy
-- fail-closed for that user.

create or replace function public.current_tenant_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select p.tenant_id
  from public.profiles p
  where p.id = auth.uid()
    and p.tenant_id is not null
    and (
      public.is_super_admin()
      or exists (
        select 1
        from public.profile_tenant_access pta
        where pta.profile_id = p.id
          and pta.tenant_id = p.tenant_id
      )
    )
$$;

grant execute on function public.current_tenant_id() to anon, authenticated;
