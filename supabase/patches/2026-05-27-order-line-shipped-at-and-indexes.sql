-- Orders pipeline redesign — apply order: 5 of 5
-- Add order_line.shipped_at + pipeline indexes. Requires patches 1 and 2 (column refs).
alter table public.order_line
  add column if not exists shipped_at timestamptz;

create index if not exists orders_tenant_target_ship_idx
  on public.orders (tenant_id, target_ship_date);
create index if not exists orders_tenant_source_idx
  on public.orders (tenant_id, source);
create index if not exists order_line_order_id_shipped_at_idx
  on public.order_line (order_id, shipped_at);
