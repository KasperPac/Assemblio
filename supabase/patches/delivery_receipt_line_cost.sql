alter table public.delivery_receipt_line
  add column if not exists cost_per_unit numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'delivery_receipt_line_cost_per_unit_nonnegative'
  ) then
    alter table public.delivery_receipt_line
      add constraint delivery_receipt_line_cost_per_unit_nonnegative
      check (cost_per_unit >= 0);
  end if;
end $$;
