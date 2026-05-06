-- stocktake_redesign_schema.sql
-- Adds: new session/line columns, variance_reason table,
--       bin location on component, updated status check constraint.

-- 1. Extend stocktake_session status check to include new values
alter table public.stocktake_session
  drop constraint if exists stocktake_session_status_check;

alter table public.stocktake_session
  add constraint stocktake_session_status_check
  check (status in ('draft','open','counting','reconciliation','approved','completed','locked','archived'));

-- 2. New columns on stocktake_session
alter table public.stocktake_session
  add column if not exists reference_number text,
  add column if not exists session_type     text not null default 'full'
    check (session_type in ('initial','full')),
  add column if not exists notes            text,
  add column if not exists blind_count      boolean not null default false,
  add column if not exists approved_by      uuid references public.profiles(id),
  add column if not exists approved_at      timestamptz;

-- Unique reference_number per tenant (nulls allowed for old rows)
create unique index if not exists stocktake_session_reference_number_tenant_uniq
  on public.stocktake_session (tenant_id, reference_number)
  where reference_number is not null;

-- 3. variance_reason lookup table
create table if not exists public.stocktake_variance_reason (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenant(id) on delete cascade,
  name       text not null,
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists stocktake_variance_reason_tenant_id_idx
  on public.stocktake_variance_reason (tenant_id);

alter table public.stocktake_variance_reason enable row level security;

drop policy if exists "tenant isolation" on public.stocktake_variance_reason;
create policy "tenant isolation" on public.stocktake_variance_reason
  using (
    (tenant_id = public.current_tenant_id())
    or public.is_super_admin()
  )
  with check (
    (tenant_id = public.current_tenant_id())
    or public.is_super_admin()
  );

-- 4. New columns on stocktake_line
alter table public.stocktake_line
  add column if not exists notes               text,
  add column if not exists counted_by          uuid references public.profiles(id),
  add column if not exists counted_at          timestamptz,
  add column if not exists variance_reason_id  uuid references public.stocktake_variance_reason(id);

-- 5. Bin location on component
alter table public.component
  add column if not exists bin_sub_location text,
  add column if not exists bin_row          text,
  add column if not exists bin_bay          text;

-- 6. Seed default variance reasons for all existing tenants
insert into public.stocktake_variance_reason (tenant_id, name, sort_order)
select t.id, r.name, r.sort_order
from public.tenant t
cross join (
  values
    ('Damage',           1),
    ('Theft',            2),
    ('Data Entry Error', 3),
    ('Found Stock',      4),
    ('Supplier Shortage',5),
    ('Other',            6)
) as r(name, sort_order)
where not exists (
  select 1 from public.stocktake_variance_reason vr where vr.tenant_id = t.id
);

-- 7. Grant permissions
grant select, insert, update, delete
  on public.stocktake_variance_reason to authenticated, service_role;
