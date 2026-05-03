-- Add inventory_movement.delta_reserved and rectify historical
-- reservation movements that polluted delta_on_hand.
--
-- Reservation logic in src/lib/allocation/engine.ts wrote a reservation
-- by inserting a movement with delta_on_hand = -deltaReserved, then
-- updated inventory_balance.reserved (without touching on_hand). This
-- broke the invariant sum(delta_on_hand) == inventory_balance.on_hand
-- and caused the reconciliation audit to flag every reservation as
-- drift.
--
-- After this patch:
--   * delta_reserved exists on inventory_movement
--   * historical movements with reason in ('order_reserve',
--     'order_release') have their fake delta_on_hand moved into
--     delta_reserved (with the same magnitude but inverted sign, since
--     order_reserve previously wrote -deltaReserved into delta_on_hand)
--   * those rows now carry delta_on_hand = 0, so reconciliation lines
--     up with inventory_balance.on_hand again
--
-- Application code change (committed alongside this patch) writes new
-- reservation movements with delta_on_hand = 0 and delta_reserved
-- carrying the actual reservation delta.

alter table public.inventory_movement
  add column if not exists delta_reserved numeric not null default 0;

-- Backfill historical reservation rows. Idempotent: only rewrites rows
-- where delta_on_hand is non-zero AND delta_reserved is still zero, so
-- re-running the patch after new movements have been written safely
-- skips them.
update public.inventory_movement
set
  delta_reserved = -delta_on_hand,
  delta_on_hand = 0
where reason in ('order_reserve', 'order_release')
  and delta_on_hand <> 0
  and delta_reserved = 0;

create index if not exists inventory_movement_delta_reserved_idx
  on public.inventory_movement (component_id, location_id)
  where delta_reserved <> 0;
