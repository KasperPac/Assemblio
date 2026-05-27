-- supabase/patches/2026-05-27-orders-target-ship-date.sql
alter table public.orders
  add column if not exists target_ship_date timestamptz;
