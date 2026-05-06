-- supabase/patches/locations_manager_schema.sql

-- bin_sub_location: sub-areas within a warehouse (e.g. Mezzanine)
create table if not exists public.bin_sub_location (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenant(id) on delete cascade,
  warehouse_id  uuid not null references public.location(id) on delete cascade,
  name          text not null,
  created_at    timestamptz not null default now(),
  unique (tenant_id, warehouse_id, name)
);

alter table public.bin_sub_location enable row level security;

drop policy if exists bin_sub_location_tenant_isolation on public.bin_sub_location;
create policy bin_sub_location_tenant_isolation on public.bin_sub_location
  using (
    (tenant_id = public.current_tenant_id())
    or public.is_super_admin()
  )
  with check (
    (tenant_id = public.current_tenant_id())
    or public.is_super_admin()
  );

-- bin_aisle: aisles within a warehouse, optionally tagged to a sub-location
-- note: aisle names are unique warehouse-wide (not per sub-location),
-- so two aisles in different sub-locations cannot share the same name within the same warehouse.
create table if not exists public.bin_aisle (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenant(id) on delete cascade,
  warehouse_id     uuid not null references public.location(id) on delete cascade,
  sub_location_id  uuid references public.bin_sub_location(id) on delete set null,
  name             text not null,
  created_at       timestamptz not null default now(),
  unique (tenant_id, warehouse_id, name)
);

alter table public.bin_aisle enable row level security;

drop policy if exists bin_aisle_tenant_isolation on public.bin_aisle;
create policy bin_aisle_tenant_isolation on public.bin_aisle
  using (
    (tenant_id = public.current_tenant_id())
    or public.is_super_admin()
  )
  with check (
    (tenant_id = public.current_tenant_id())
    or public.is_super_admin()
  );

-- bin_bay: bays within an aisle
create table if not exists public.bin_bay (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenant(id) on delete cascade,
  aisle_id   uuid not null references public.bin_aisle(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, aisle_id, name)
);

alter table public.bin_bay enable row level security;

drop policy if exists bin_bay_tenant_isolation on public.bin_bay;
create policy bin_bay_tenant_isolation on public.bin_bay
  using (
    (tenant_id = public.current_tenant_id())
    or public.is_super_admin()
  )
  with check (
    (tenant_id = public.current_tenant_id())
    or public.is_super_admin()
  );

-- Grant permissions
grant select, insert, update, delete
  on public.bin_sub_location to authenticated, service_role;
grant select, insert, update, delete
  on public.bin_aisle to authenticated, service_role;
grant select, insert, update, delete
  on public.bin_bay to authenticated, service_role;

-- FK performance indexes
create index if not exists bin_sub_location_warehouse_id_idx on public.bin_sub_location (warehouse_id);
create index if not exists bin_sub_location_tenant_id_idx on public.bin_sub_location (tenant_id);
create index if not exists bin_aisle_warehouse_id_idx on public.bin_aisle (warehouse_id);
create index if not exists bin_aisle_tenant_id_idx on public.bin_aisle (tenant_id);
create index if not exists bin_aisle_sub_location_id_idx on public.bin_aisle (sub_location_id);
create index if not exists bin_bay_aisle_id_idx on public.bin_bay (aisle_id);
create index if not exists bin_bay_tenant_id_idx on public.bin_bay (tenant_id);
create index if not exists component_bin_sub_location_id_idx on public.component (bin_sub_location_id);
create index if not exists component_bin_aisle_id_idx on public.component (bin_aisle_id);
create index if not exists component_bin_bay_id_idx on public.component (bin_bay_id);

-- Migrate component table: drop old text fields, add FK references
alter table public.component
  drop column if exists bin_sub_location,
  drop column if exists bin_row,
  drop column if exists bin_bay;

alter table public.component
  add column if not exists bin_sub_location_id uuid references public.bin_sub_location(id) on delete set null,
  add column if not exists bin_aisle_id        uuid references public.bin_aisle(id) on delete set null,
  add column if not exists bin_bay_id          uuid references public.bin_bay(id) on delete set null;
