alter table public.delivery_receipt_line
  add column if not exists cost_per_unit numeric;
