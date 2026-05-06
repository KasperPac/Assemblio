-- bom_builder_redesign_schema.sql
-- Adds: yield_pct to product_bom_component, price to shopify_variant

-- Add yield_pct to product_bom_component
-- Stored as decimal (0 < yield_pct <= 1.0), displayed as % in UI
-- Line cost formula: unit_cost × quantity ÷ yield_pct
alter table public.product_bom_component
  add column if not exists yield_pct numeric not null default 1.0
    check (yield_pct > 0 and yield_pct <= 1.0);

-- Add price to shopify_variant for margin calculations
-- Populated by Shopify sync; NULL until first sync after this patch
alter table public.shopify_variant
  add column if not exists price numeric;
