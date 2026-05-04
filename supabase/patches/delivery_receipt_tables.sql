-- delivery_receipt
create table if not exists public.delivery_receipt (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null references public.tenant(id),
  supplier_id           uuid references public.suppliers(id),
  supplier_name_override text,
  supplier_reference    text not null,
  purchase_order_id     uuid references public.purchase_order(id),
  location_id           uuid not null references public.location(id),
  received_at           timestamptz not null default now(),
  notes                 text,
  stock_in_reason       text check (stock_in_reason in (
                          'supplier_delivery','customer_return','opening_stock',
                          'sample','adjustment','other'
                        )),
  status                text not null default 'unmatched'
                          check (status in ('unmatched','po_linked','discrepancy')),
  created_by            uuid not null references auth.users(id),
  created_at            timestamptz not null default now()
);

alter table public.delivery_receipt enable row level security;

create policy "tenant_isolation_select" on public.delivery_receipt
  for select using (tenant_id = public.current_tenant_id());

create policy "tenant_isolation_insert" on public.delivery_receipt
  for insert with check (tenant_id = public.current_tenant_id());

create policy "tenant_isolation_update" on public.delivery_receipt
  for update using (tenant_id = public.current_tenant_id());

-- delivery_receipt_line
create table if not exists public.delivery_receipt_line (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.tenant(id),
  delivery_receipt_id    uuid not null references public.delivery_receipt(id) on delete cascade,
  component_id           uuid not null references public.component(id),
  purchase_order_line_id uuid references public.purchase_order_line(id),
  quantity_delivered     numeric not null check (quantity_delivered > 0),
  quantity_expected      numeric,
  notes                  text,
  created_at             timestamptz not null default now()
);

alter table public.delivery_receipt_line enable row level security;

create policy "tenant_isolation_select" on public.delivery_receipt_line
  for select using (tenant_id = public.current_tenant_id());

create policy "tenant_isolation_insert" on public.delivery_receipt_line
  for insert with check (tenant_id = public.current_tenant_id());

create policy "tenant_isolation_update" on public.delivery_receipt_line
  for update using (tenant_id = public.current_tenant_id());
