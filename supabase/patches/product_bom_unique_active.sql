-- Enforce one-active-BOM-per-variant at the database level.
--
-- The allocation engine and setBomActive action assume that each
-- (tenant_id, variant_id) pair has at most one product_bom row with
-- is_active = true. Today this is only enforced in app code, so two
-- concurrent setBomActive calls (or any direct INSERT/UPDATE) can
-- leave multiple active BOMs for the same variant. The engine then
-- calls .maybeSingle() against the active-BOM lookup and raises an
-- unpredictable error.
--
-- A partial unique index makes the invariant impossible to violate.

create unique index if not exists product_bom_one_active_per_variant
  on public.product_bom (tenant_id, variant_id)
  where is_active = true;
