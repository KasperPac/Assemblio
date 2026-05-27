-- Orders pipeline redesign — apply order: 1 of 5
-- Adds orders.source ('shopify' | 'manual') and backfills manual orders.
alter table public.orders
  add column if not exists source text not null default 'shopify'
  check (source in ('shopify', 'manual'));

-- Backfill: orders without a shopify_order_id are manual
update public.orders
  set source = 'manual'
  where shopify_order_id is null
    and source = 'shopify';
