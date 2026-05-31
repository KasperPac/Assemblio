-- A1 fix: track when a product was last synced from Shopify.
-- Nullable so manually-created products are unaffected.
ALTER TABLE public.product ADD COLUMN last_synced_at timestamptz;
