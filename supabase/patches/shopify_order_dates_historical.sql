-- Real Shopify order timestamps + stats-only (historical) classification.
alter table public.orders add column if not exists shopify_created_at timestamptz;
alter table public.orders add column if not exists shopify_processed_at timestamptz;
alter table public.orders add column if not exists shopify_updated_at timestamptz;
alter table public.orders add column if not exists fulfilled_at timestamptz;
alter table public.orders add column if not exists historical boolean not null default false;

-- Orders whose order date is before this are imported for stats only (no stock /
-- planning). Null = nothing is historical.
alter table public.shopify_store add column if not exists stats_only_before date;
