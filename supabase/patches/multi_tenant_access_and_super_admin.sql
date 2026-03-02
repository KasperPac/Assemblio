create table if not exists public.profile_tenant_access (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references auth.users(id) on delete cascade,
  tenant_id uuid not null references public.tenant(id),
  role text not null default 'member',
  created_at timestamptz not null default now(),
  unique (profile_id, tenant_id)
);

insert into public.profile_tenant_access (profile_id, tenant_id, role)
select p.id, p.tenant_id, p.role
from public.profiles p
on conflict (profile_id, tenant_id) do nothing;

create or replace function public.current_tenant_id()
returns uuid
language sql
security definer
set search_path = public
as $$
  select tenant_id from public.profiles where id = auth.uid()
$$;

grant execute on function public.current_tenant_id() to anon, authenticated;

create or replace function public.current_profile_role()
returns text
language sql
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

grant execute on function public.current_profile_role() to anon, authenticated;

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(public.current_profile_role() = 'super_admin', false)
$$;

grant execute on function public.is_super_admin() to anon, authenticated;

create or replace function public.has_tenant_access(p_tenant_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select
    public.is_super_admin()
    or exists (
      select 1
      from public.profile_tenant_access pta
      where pta.profile_id = auth.uid()
        and pta.tenant_id = p_tenant_id
    )
$$;

grant execute on function public.has_tenant_access(uuid) to anon, authenticated;

create or replace function public.set_active_tenant(p_tenant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_tenant_id is null then
    raise exception 'Tenant is required';
  end if;

  if not public.has_tenant_access(p_tenant_id) then
    raise exception 'No access to tenant';
  end if;

  update public.profiles
  set tenant_id = p_tenant_id
  where id = auth.uid();
end;
$$;

grant execute on function public.set_active_tenant(uuid) to authenticated;

alter table public.tenant enable row level security;
drop policy if exists tenant_read on public.tenant;
create policy tenant_read on public.tenant
  for select
  using (public.has_tenant_access(id));

alter table public.profiles enable row level security;
drop policy if exists profiles_is_self on public.profiles;
drop policy if exists profiles_insert_self on public.profiles;
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_is_self on public.profiles
  for select
  using (id = auth.uid() or public.is_super_admin());
create policy profiles_insert_self on public.profiles
  for insert
  with check (id = auth.uid());
create policy profiles_update_self on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

alter table public.profile_tenant_access enable row level security;
drop policy if exists profile_tenant_access_select on public.profile_tenant_access;
drop policy if exists profile_tenant_access_insert on public.profile_tenant_access;
drop policy if exists profile_tenant_access_update on public.profile_tenant_access;
drop policy if exists profile_tenant_access_delete on public.profile_tenant_access;
create policy profile_tenant_access_select on public.profile_tenant_access
  for select
  using (profile_id = auth.uid() or public.is_super_admin());
create policy profile_tenant_access_insert on public.profile_tenant_access
  for insert
  with check (public.is_super_admin());
create policy profile_tenant_access_update on public.profile_tenant_access
  for update
  using (public.is_super_admin())
  with check (public.is_super_admin());
create policy profile_tenant_access_delete on public.profile_tenant_access
  for delete
  using (public.is_super_admin());

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
    execute format('alter table public.%I enable row level security', tbl);
    execute format('drop policy if exists %I_tenant_isolation on public.%I', tbl, tbl);
    execute format(
      'create policy %I_tenant_isolation on public.%I using ((tenant_id = public.current_tenant_id()) or public.is_super_admin()) with check ((tenant_id = public.current_tenant_id()) or public.is_super_admin())',
      tbl,
      tbl
    );
  end loop;
end $$;
