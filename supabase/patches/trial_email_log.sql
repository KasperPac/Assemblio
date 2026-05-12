create table if not exists public.trial_email_log (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenant(id) on delete cascade,
  kind       text not null check (kind in ('t_minus_3','t_minus_1','expired')),
  sent_at    timestamptz not null default now(),
  unique (tenant_id, kind)
);

alter table public.trial_email_log enable row level security;
