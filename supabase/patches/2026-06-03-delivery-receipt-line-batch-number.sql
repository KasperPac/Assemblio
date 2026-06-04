alter table public.delivery_receipt_line
  add column if not exists batch_number text;
