create table if not exists public.tenant_dashboard_config (
  tenant_id  uuid primary key references public.tenant(id) on delete cascade,
  preset     text not null default 'owner',
  widgets    text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.tenant_dashboard_config enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'tenant_dashboard_config' and policyname = 'tenant_members_select'
  ) then
    create policy tenant_members_select on public.tenant_dashboard_config
      for select using (tenant_id = public.current_tenant_id());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'tenant_dashboard_config' and policyname = 'tenant_admins_write'
  ) then
    create policy tenant_admins_write on public.tenant_dashboard_config
      for all using (
        tenant_id = public.current_tenant_id()
        and exists (
          select 1 from public.profiles
          where id = auth.uid()
            and tenant_id = public.current_tenant_id()
            and role in ('admin', 'super_admin')
        )
      );
  end if;
end $$;
