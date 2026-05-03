-- Atomic stocktake apply.
--
-- src/app/app/stocktake/actions.ts.applyStocktakeSession looped over
-- the session's stocktake_line rows, called the per-line
-- apply_inventory_movement RPC for each, and on the first error
-- silently `return`-ed mid-loop. The session was left in 'approved'
-- with some lines applied and others not, with no error surfaced to
-- the operator.
--
-- Move the loop into a single SECURITY DEFINER plpgsql function so
-- the entire apply (movements + balance updates + status flip)
-- happens in one transaction. A failure on any line rolls back every
-- prior write in the same call.

create or replace function public.apply_stocktake_session(
  p_session_id uuid
)
returns table (
  applied_lines integer,
  adjustment_count integer,
  expected_total numeric,
  counted_total numeric,
  variance_from_expected numeric,
  applied_delta_total numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session record;
  v_line record;
  v_balance_on_hand numeric;
  v_delta numeric;
  v_applied integer := 0;
  v_adjustments integer := 0;
  v_expected numeric := 0;
  v_counted numeric := 0;
  v_variance numeric := 0;
  v_applied_delta numeric := 0;
begin
  if p_session_id is null then
    raise exception 'session id is required';
  end if;

  select id, status, location_id, tenant_id
  into v_session
  from public.stocktake_session
  where id = p_session_id
  for update;

  if v_session.id is null then
    raise exception 'stocktake session not found';
  end if;

  if v_session.status <> 'approved' then
    raise exception 'session must be approved before applying (current status: %)', v_session.status;
  end if;

  for v_line in
    select id, component_id, expected_on_hand, counted
    from public.stocktake_line
    where session_id = v_session.id
      and tenant_id = v_session.tenant_id
  loop
    select on_hand into v_balance_on_hand
    from public.inventory_balance
    where tenant_id = v_session.tenant_id
      and location_id = v_session.location_id
      and component_id = v_line.component_id
    for update;

    v_balance_on_hand := coalesce(v_balance_on_hand, 0);
    v_delta := coalesce(v_line.counted, 0) - v_balance_on_hand;

    v_applied := v_applied + 1;
    v_expected := v_expected + coalesce(v_line.expected_on_hand, 0);
    v_counted := v_counted + coalesce(v_line.counted, 0);
    v_variance := v_variance + (coalesce(v_line.counted, 0) - coalesce(v_line.expected_on_hand, 0));
    v_applied_delta := v_applied_delta + v_delta;

    if v_delta = 0 then
      continue;
    end if;

    insert into public.inventory_movement (
      tenant_id,
      component_id,
      location_id,
      delta_on_hand,
      delta_in_prod,
      reason,
      reference_type,
      reference_id
    )
    values (
      v_session.tenant_id,
      v_line.component_id,
      v_session.location_id,
      v_delta,
      0,
      'stocktake_adjustment',
      'stocktake_session',
      v_session.id
    );

    if v_balance_on_hand is null or not exists (
      select 1
      from public.inventory_balance
      where tenant_id = v_session.tenant_id
        and location_id = v_session.location_id
        and component_id = v_line.component_id
    ) then
      insert into public.inventory_balance (
        tenant_id,
        component_id,
        location_id,
        on_hand,
        in_prod,
        reserved
      )
      values (
        v_session.tenant_id,
        v_line.component_id,
        v_session.location_id,
        coalesce(v_line.counted, 0),
        0,
        0
      );
    else
      update public.inventory_balance
      set on_hand = coalesce(v_line.counted, 0)
      where tenant_id = v_session.tenant_id
        and location_id = v_session.location_id
        and component_id = v_line.component_id;
    end if;

    v_adjustments := v_adjustments + 1;
  end loop;

  update public.stocktake_session
  set status = 'completed'
  where id = v_session.id
    and tenant_id = v_session.tenant_id;

  return query
    select
      v_applied,
      v_adjustments,
      v_expected,
      v_counted,
      v_variance,
      v_applied_delta;
end;
$$;

grant execute on function public.apply_stocktake_session(uuid) to authenticated, service_role;
