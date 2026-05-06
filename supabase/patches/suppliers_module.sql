-- Extend suppliers table
alter table public.suppliers
  add column if not exists contact_name text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists website text,
  add column if not exists address text,
  add column if not exists payment_terms text,
  add column if not exists default_currency text,
  add column if not exists default_lead_time_days integer,
  add column if not exists notes text,
  add column if not exists is_active boolean not null default true;

-- supplier_contacts
create table if not exists public.supplier_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  role text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.supplier_contacts enable row level security;

create policy "tenant_isolation_select" on public.supplier_contacts
  for select using (
    (tenant_id = public.current_tenant_id())
    or public.is_super_admin()
  );
create policy "tenant_isolation_insert" on public.supplier_contacts
  for insert with check (
    (tenant_id = public.current_tenant_id())
    or public.is_super_admin()
  );
create policy "tenant_isolation_update" on public.supplier_contacts
  for update using (
    (tenant_id = public.current_tenant_id())
    or public.is_super_admin()
  )
  with check (
    (tenant_id = public.current_tenant_id())
    or public.is_super_admin()
  );
create policy "tenant_isolation_delete" on public.supplier_contacts
  for delete using (
    (tenant_id = public.current_tenant_id())
    or public.is_super_admin()
  );

-- supplier_components (catalog)
create table if not exists public.supplier_components (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  component_id uuid not null references public.component(id) on delete cascade,
  supplier_part_number text,
  unit_cost numeric check (unit_cost >= 0),
  currency text,
  lead_time_days integer check (lead_time_days >= 0),
  moq numeric check (moq >= 0),
  is_preferred boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  constraint supplier_components_unique unique (tenant_id, supplier_id, component_id)
);

alter table public.supplier_components enable row level security;

create policy "tenant_isolation_select" on public.supplier_components
  for select using (
    (tenant_id = public.current_tenant_id())
    or public.is_super_admin()
  );
create policy "tenant_isolation_insert" on public.supplier_components
  for insert with check (
    (tenant_id = public.current_tenant_id())
    or public.is_super_admin()
  );
create policy "tenant_isolation_update" on public.supplier_components
  for update using (
    (tenant_id = public.current_tenant_id())
    or public.is_super_admin()
  )
  with check (
    (tenant_id = public.current_tenant_id())
    or public.is_super_admin()
  );
create policy "tenant_isolation_delete" on public.supplier_components
  for delete using (
    (tenant_id = public.current_tenant_id())
    or public.is_super_admin()
  );

-- supplier_component_price_breaks
create table if not exists public.supplier_component_price_breaks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  supplier_component_id uuid not null references public.supplier_components(id) on delete cascade,
  min_quantity numeric not null check (min_quantity > 0),
  unit_cost numeric not null check (unit_cost >= 0),
  created_at timestamptz not null default now()
);

alter table public.supplier_component_price_breaks enable row level security;

create policy "tenant_isolation_select" on public.supplier_component_price_breaks
  for select using ((tenant_id = public.current_tenant_id()) or public.is_super_admin());
create policy "tenant_isolation_insert" on public.supplier_component_price_breaks
  for insert with check ((tenant_id = public.current_tenant_id()) or public.is_super_admin());
create policy "tenant_isolation_update" on public.supplier_component_price_breaks
  for update using ((tenant_id = public.current_tenant_id()) or public.is_super_admin())
  with check ((tenant_id = public.current_tenant_id()) or public.is_super_admin());
create policy "tenant_isolation_delete" on public.supplier_component_price_breaks
  for delete using ((tenant_id = public.current_tenant_id()) or public.is_super_admin());

-- Extend purchase_order with expected delivery date
alter table public.purchase_order
  add column if not exists expected_date timestamptz;

-- Extend purchase_order_line with unit cost captured at time of ordering
alter table public.purchase_order_line
  add column if not exists unit_cost numeric check (unit_cost >= 0);

-- FK indexes for join performance
create index if not exists supplier_contacts_supplier_id_idx on public.supplier_contacts (supplier_id);
create index if not exists supplier_components_supplier_id_idx on public.supplier_components (supplier_id);
create index if not exists supplier_components_component_id_idx on public.supplier_components (component_id);
create index if not exists supplier_component_price_breaks_supplier_component_id_idx
  on public.supplier_component_price_breaks (supplier_component_id);
