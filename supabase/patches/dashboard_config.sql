-- Dashboard configuration per tenant: stores active preset and ordered widget list.
create table if not exists public.tenant_dashboard_config (
  tenant_id  uuid primary key references public.tenant(id) on delete cascade,
  preset     text not null default 'owner',
  widgets    text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.tenant_dashboard_config enable row level security;

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
