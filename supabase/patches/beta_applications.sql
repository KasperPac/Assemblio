create table if not exists public.beta_applications (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null,
  company_name text not null,
  team_size text,
  use_case text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'used')),
  signup_token uuid unique,
  source_plan text,
  source_billing text,
  created_at timestamptz not null default now(),
  approved_at timestamptz,
  used_at timestamptz
);

create unique index if not exists beta_applications_email_open
  on public.beta_applications (lower(email))
  where status in ('pending', 'approved');

create index if not exists beta_applications_status_created_idx
  on public.beta_applications (status, created_at desc);

alter table public.beta_applications enable row level security;
-- intentionally no policies; only service-role server code reads/writes this table.
