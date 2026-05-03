-- Add tenant-isolated RLS to public.bom_template and public.bom_template_line.
--
-- Both tables carry tenant_id columns but were never added to the
-- per-table RLS loop in multi_tenant_access_and_super_admin.sql. Without
-- a policy, any authenticated user (or anyone with the anon key) could
-- read or write any tenant's BOM templates via PostgREST. Apply the
-- same tenant_isolation pattern used everywhere else in the schema.

alter table public.bom_template enable row level security;
drop policy if exists bom_template_tenant_isolation on public.bom_template;
create policy bom_template_tenant_isolation on public.bom_template
  using (
    (tenant_id = public.current_tenant_id())
    or public.is_super_admin()
  )
  with check (
    (tenant_id = public.current_tenant_id())
    or public.is_super_admin()
  );

alter table public.bom_template_line enable row level security;
drop policy if exists bom_template_line_tenant_isolation on public.bom_template_line;
create policy bom_template_line_tenant_isolation on public.bom_template_line
  using (
    (tenant_id = public.current_tenant_id())
    or public.is_super_admin()
  )
  with check (
    (tenant_id = public.current_tenant_id())
    or public.is_super_admin()
  );
