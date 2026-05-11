-- Adds updated_at to orders so the dashboard can compute:
--   - this-week / last-week throughput
--   - 30-day fulfillment count
--   - per-order lead time (created_at → updated_at)
alter table public.orders
  add column if not exists updated_at timestamptz;

create index if not exists orders_updated_at_idx on public.orders (updated_at);

comment on column public.orders.updated_at is 'Timestamp the order status last changed (e.g. moved to fulfilled). Used by dashboard for throughput, lead time, and fulfillment rate metrics.';
