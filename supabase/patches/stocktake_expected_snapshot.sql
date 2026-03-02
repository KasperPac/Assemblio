alter table public.stocktake_line
  add column if not exists expected_on_hand numeric not null default 0;

update public.stocktake_line
set expected_on_hand = counted
where expected_on_hand is null;
