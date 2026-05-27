-- supabase/patches/2026-05-27-orders-source.sql
alter table public.orders
  add column if not exists source text not null default 'shopify'
  check (source in ('shopify', 'manual'));

-- Backfill: orders without a shopify_order_id are manual
update public.orders
  set source = 'manual'
  where shopify_order_id is null
    and source = 'shopify';
