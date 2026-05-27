-- Orders pipeline redesign — apply order: 2 of 5
-- Adds orders.target_ship_date (nullable).
alter table public.orders
  add column if not exists target_ship_date timestamptz;
