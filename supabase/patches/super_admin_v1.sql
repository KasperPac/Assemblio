-- Super-admin v1: tenant suspension + soft-delete, manual override marker,
-- super_admin home tenant, and an append-only audit log.

-- 1) tenant: suspension + soft-delete columns
alter table public.tenant
  add column if not exists suspended_at      timestamptz,
  add column if not exists suspended_reason  text,
  add column if not exists deleted_at        timestamptz;

-- 2) tenant_subscription: manual-override marker for Stripe webhooks
alter table public.tenant_subscription
  add column if not exists manual_override_at timestamptz;

-- 3) profiles: super_admin home tenant (for "Exit view-as")
alter table public.profiles
  add column if not exists super_admin_home_tenant_id uuid references public.tenant(id);

-- 4) super_admin_audit_log
create table if not exists public.super_admin_audit_log (
  id                uuid primary key default gen_random_uuid(),
  actor_id          uuid not null references auth.users(id),
  action            text not null,
  target_tenant_id  uuid references public.tenant(id),
  target_user_id    uuid references auth.users(id),
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

create index if not exists super_admin_audit_log_created_at_idx
  on public.super_admin_audit_log (created_at desc);
create index if not exists super_admin_audit_log_target_tenant_idx
  on public.super_admin_audit_log (target_tenant_id, created_at desc);

alter table public.super_admin_audit_log enable row level security;

drop policy if exists super_admin_audit_log_select on public.super_admin_audit_log;
drop policy if exists super_admin_audit_log_insert on public.super_admin_audit_log;
create policy super_admin_audit_log_select on public.super_admin_audit_log
  for select using (public.is_super_admin());
create policy super_admin_audit_log_insert on public.super_admin_audit_log
  for insert with check (public.is_super_admin());
-- no update/delete policies => append-only

-- 5) Promote kasper (idempotent — runs once, no-op afterwards)
update public.profiles
set
  role = 'super_admin',
  super_admin_home_tenant_id = coalesce(super_admin_home_tenant_id, tenant_id)
where id = '5a019756-ede3-4614-be1e-41afed6b6b63';
