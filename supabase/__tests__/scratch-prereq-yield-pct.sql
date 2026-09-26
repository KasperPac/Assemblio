-- supabase/__tests__/scratch-prereq-yield-pct.sql
-- SCRATCH ONLY — never run against production.
--
-- Brings the scratch harness's product_bom_component.yield_pct up to date
-- with production, which already has it. schema.sql lags production (see
-- scripts/scratch-db.sh's PATCHES comment); the patch that originally added
-- this column (patches/bom_builder_redesign_schema.sql) also alters a
-- shopify_variant table that generalize_variant_schema.sql later renamed to
-- product_variant, so that patch can't be replayed as-is against current
-- schema.sql. Re-declare just the column here instead — harness-only, since
-- production doesn't need it done again.
alter table public.product_bom_component
  add column if not exists yield_pct numeric not null default 1.0
    check (yield_pct > 0 and yield_pct <= 1.0);
