create table if not exists public.stripe_event_log (
  id           uuid primary key default gen_random_uuid(),
  event_id     text not null unique,
  event_type   text not null,
  processed_at timestamptz not null default now()
);

alter table public.stripe_event_log enable row level security;
