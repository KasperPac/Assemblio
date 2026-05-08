-- Enforce unique sequence numbers within each BOM
-- Required for dependency tracking integrity: blocked_by int[] stores sequence values
alter table public.product_bom_labor
  add constraint if not exists product_bom_labor_bom_sequence_unique
  unique (product_bom_id, sequence);
