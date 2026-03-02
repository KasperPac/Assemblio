create or replace function public.receive_purchase_order_line(
  p_purchase_order_line_id uuid,
  p_receive_qty numeric,
  p_location_id uuid
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_order_id uuid;
  v_component_id uuid;
  v_po_status text;
  v_remaining numeric;
  v_applied numeric;
begin
  v_tenant_id := public.current_tenant_id();
  if v_tenant_id is null then
    raise exception 'No tenant context for user';
  end if;

  select
    pol.purchase_order_id,
    pol.component_id,
    (pol.quantity - pol.quantity_received),
    po.status
  into
    v_order_id,
    v_component_id,
    v_remaining,
    v_po_status
  from public.purchase_order_line pol
  join public.purchase_order po on po.id = pol.purchase_order_id
  where pol.id = p_purchase_order_line_id
    and pol.tenant_id = v_tenant_id
    and po.tenant_id = v_tenant_id
  for update;

  if v_order_id is null then
    raise exception 'Purchase order line not found for tenant';
  end if;

  if v_po_status in ('received', 'cancelled', 'archived') then
    return 0;
  end if;

  if p_receive_qty is null or p_receive_qty <= 0 then
    return 0;
  end if;

  v_applied := least(greatest(v_remaining, 0), p_receive_qty);
  if v_applied <= 0 then
    return 0;
  end if;

  perform public.apply_inventory_movement(
    v_component_id,
    p_location_id,
    v_applied,
    0,
    'purchase_order_receipt',
    'purchase_order',
    v_order_id
  );

  update public.purchase_order_line
  set quantity_received = quantity_received + v_applied
  where id = p_purchase_order_line_id
    and tenant_id = v_tenant_id;

  if not exists (
    select 1
    from public.purchase_order_line
    where purchase_order_id = v_order_id
      and tenant_id = v_tenant_id
      and quantity_received < quantity
  ) then
    update public.purchase_order
    set status = 'received'
    where id = v_order_id
      and tenant_id = v_tenant_id
      and status <> 'cancelled';
  end if;

  return v_applied;
end;
$$;

grant execute on function public.receive_purchase_order_line(uuid, numeric, uuid)
  to authenticated;
