-- Component description and supplier part number entry
--
-- Adds description column to component.
-- supplier_part_number already exists on supplier_components — no schema change needed there.

alter table public.component
  add column if not exists description text;
