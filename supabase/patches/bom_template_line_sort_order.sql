-- Add sort_order to bom_template_line for drag-and-drop reordering.
-- Idempotent. Apply manually before deploying.

alter table public.bom_template_line
  add column if not exists sort_order integer not null default 0;
