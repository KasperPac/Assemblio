-- Atomic RPC for the reservation movement + balance update.
--
-- src/lib/allocation/reconcile-order.ts.updateReservedWithMovement
-- previously wrote inventory_movement, then read and wrote
-- inventory_balance in three separate non-transactional statements.
-- A crash or HTTP timeout between steps left the ledger inconsistent
-- (movement logged but balance.reserved not bumped, or vice versa).
--
-- This RPC performs the same operation in a single SQL transaction
-- so it either completes fully or has no visible effect. Callers
-- should pass a non-zero p_delta_reserved (positive to reserve,
-- negative to release).

create or replace function public.apply_reserved_movement(
  p_tenant_id uuid,
  p_component_id uuid,
  p_location_id uuid,
  p_order_id uuid,
  p_delta_reserved numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason text;
  v_existing_id uuid;
  v_current_reserved numeric;
  v_next_reserved numeric;
begin
  if p_delta_reserved = 0 then
    return;
  end if;

  if p_tenant_id is null
     or p_component_id is null
     or p_location_id is null then
    raise exception 'tenant, component and location are required';
  end if;

  v_reason := case when p_delta_reserved > 0 then 'order_reserve' else 'order_release' end;

  insert into public.inventory_movement (
    tenant_id,
    component_id,
    location_id,
    delta_on_hand,
    delta_in_prod,
    delta_reserved,
    reason,
    reference_type,
    reference_id
  )
  values (
    p_tenant_id,
    p_component_id,
    p_location_id,
    0,
    0,
    p_delta_reserved,
    v_reason,
    'order',
    p_order_id
  );

  select id, reserved
  into v_existing_id, v_current_reserved
  from public.inventory_balance
  where tenant_id = p_tenant_id
    and component_id = p_component_id
    and location_id = p_location_id
  for update;

  if v_existing_id is null then
    v_next_reserved := greatest(0, p_delta_reserved);
    insert into public.inventory_balance (
      tenant_id,
      component_id,
      location_id,
      on_hand,
      in_prod,
      reserved
    )
    values (
      p_tenant_id,
      p_component_id,
      p_location_id,
      0,
      0,
      v_next_reserved
    );
  else
    v_next_reserved := greatest(0, coalesce(v_current_reserved, 0) + p_delta_reserved);
    update public.inventory_balance
    set reserved = v_next_reserved
    where id = v_existing_id;
  end if;
end;
$$;

grant execute on function public.apply_reserved_movement(uuid, uuid, uuid, uuid, numeric) to authenticated, service_role;
