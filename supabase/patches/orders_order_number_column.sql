-- Add the orders.order_number column referenced by the orders queue,
-- the dashboard, the order detail page, and the Shopify sync writer.
--
-- schema.sql declares this column on public.orders, but it never made
-- it into the deployed database, which causes
--   GET /app/orders => 'Failed to load orders'
--   PostgREST error: column orders.order_number does not exist
-- and similar failures wherever the column is selected. Idempotent so
-- it can be applied without checking the current schema state.

alter table public.orders
  add column if not exists order_number text;
