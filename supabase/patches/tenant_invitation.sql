create table if not exists public.tenant_invitation (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenant(id) on delete cascade,
  email        text not null,
  role         text not null default 'member' check (role in ('admin','member')),
  token        text not null unique,
  invited_by   uuid not null references auth.users(id),
  expires_at   timestamptz not null,
  accepted_at  timestamptz,
  created_at   timestamptz not null default now()
);

create unique index if not exists tenant_invitation_pending_unique
  on public.tenant_invitation (tenant_id, lower(email))
  where accepted_at is null;

create index if not exists idx_tenant_invitation_token on public.tenant_invitation (token);

alter table public.tenant_invitation enable row level security;

drop policy if exists "members read tenant_invitation" on public.tenant_invitation;
create policy "members read tenant_invitation"
  on public.tenant_invitation
  for select
  using (public.has_tenant_access(tenant_id));
