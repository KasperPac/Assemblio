-- supabase/patches/2026-05-27-order-line-shipped-at-and-indexes.sql
alter table public.order_line
  add column if not exists shipped_at timestamptz;

create index if not exists orders_tenant_target_ship_idx
  on public.orders (tenant_id, target_ship_date);
create index if not exists orders_tenant_source_idx
  on public.orders (tenant_id, source);
create index if not exists order_line_order_id_shipped_at_idx
  on public.order_line (order_id, shipped_at);
