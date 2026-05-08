-- supabase/patches/settings_redesign_schema.sql

-- Tenant: add logo, timezone, currency
alter table public.tenant
  add column if not exists logo_url  text,
  add column if not exists timezone  text not null default 'Pacific/Auckland',
  add column if not exists currency  text not null default 'NZD';

-- Profiles: add full_name and status
alter table public.profiles
  add column if not exists full_name text,
  add column if not exists status    text not null default 'active';

-- Tenant invoices
create table if not exists public.tenant_invoices (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenant(id) on delete cascade,
  period       text not null,
  amount_cents integer not null,
  currency     text not null default 'AUD',
  storage_path text not null,
  created_at   timestamptz not null default now()
);

alter table public.tenant_invoices enable row level security;

drop policy if exists tenant_admins_read_invoices on public.tenant_invoices;
create policy tenant_admins_read_invoices on public.tenant_invoices
  for select using (
    tenant_id = public.current_tenant_id()
    and (
      public.current_profile_role() in ('admin', 'super_admin')
      or public.is_super_admin()
    )
  );

-- Trigger: auto-create profile + access row for invited users
create or replace function public.handle_invited_user()
returns trigger language plpgsql security definer as $$
begin
  if new.raw_user_meta_data->>'invited_tenant_id' is not null then
    insert into public.profiles (id, tenant_id, role, full_name, status)
    values (
      new.id,
      (new.raw_user_meta_data->>'invited_tenant_id')::uuid,
      coalesce(new.raw_user_meta_data->>'invited_role', 'member'),
      coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
      'active'
    )
    on conflict (id) do nothing;

    insert into public.profile_tenant_access (profile_id, tenant_id, role)
    values (
      new.id,
      (new.raw_user_meta_data->>'invited_tenant_id')::uuid,
      coalesce(new.raw_user_meta_data->>'invited_role', 'member')
    )
    on conflict (profile_id, tenant_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_invited_user();
