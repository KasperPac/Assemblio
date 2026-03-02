alter table public.purchase_order_line
  add column if not exists quantity_received numeric not null default 0;

update public.purchase_order_line
set quantity_received = 0
where quantity_received is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'purchase_order_line_qty_received_nonnegative'
  ) then
    alter table public.purchase_order_line
      add constraint purchase_order_line_qty_received_nonnegative
      check (quantity_received >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'purchase_order_line_qty_received_le_quantity'
  ) then
    alter table public.purchase_order_line
      add constraint purchase_order_line_qty_received_le_quantity
      check (quantity_received <= quantity);
  end if;
end $$;
