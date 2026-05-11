create table if not exists public.tenant_subscription (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null unique references public.tenant(id) on delete cascade,
  selected_tier           text not null check (selected_tier in ('starter','growth','pro','enterprise')),
  status                  text not null check (status in ('trialing','active','past_due','canceled')),
  billing_interval        text check (billing_interval in ('monthly','annual')),
  trial_started_at        timestamptz not null,
  trial_ends_at           timestamptz not null,
  stripe_customer_id      text unique,
  stripe_subscription_id  text unique,
  current_period_end      timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index if not exists idx_tenant_subscription_status on public.tenant_subscription (status);
create index if not exists idx_tenant_subscription_stripe_customer on public.tenant_subscription (stripe_customer_id);

alter table public.tenant_subscription enable row level security;

drop policy if exists "members read tenant_subscription" on public.tenant_subscription;
create policy "members read tenant_subscription"
  on public.tenant_subscription
  for select
  using (public.has_tenant_access(tenant_id));

create or replace function public.tenant_subscription_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_tenant_subscription_updated_at on public.tenant_subscription;
create trigger trg_tenant_subscription_updated_at
  before update on public.tenant_subscription
  for each row execute function public.tenant_subscription_set_updated_at();
