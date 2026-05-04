create or replace function public.receive_delivery_receipt(
  p_delivery_receipt_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id  uuid;
  v_receipt    record;
  v_line       record;
  v_remaining  numeric;
  v_applied    numeric;
  v_discrepant boolean := false;
  v_complete   boolean;
begin
  v_tenant_id := public.current_tenant_id();
  if v_tenant_id is null then
    raise exception 'No tenant context';
  end if;

  select * into v_receipt
  from public.delivery_receipt
  where id = p_delivery_receipt_id and tenant_id = v_tenant_id
  for update;

  if not found then
    raise exception 'Delivery receipt not found: %', p_delivery_receipt_id;
  end if;

  -- guard against double-processing
  if v_receipt.status <> 'unmatched' then
    raise exception 'Receipt % has already been processed (status: %)',
      p_delivery_receipt_id, v_receipt.status;
  end if;

  for v_line in
    select * from public.delivery_receipt_line
    where delivery_receipt_id = p_delivery_receipt_id
      and tenant_id = v_tenant_id
  loop
    perform public.apply_inventory_movement(
      v_line.component_id,
      v_receipt.location_id,
      v_line.quantity_delivered,
      0,
      'delivery_receipt',
      'delivery_receipt',
      p_delivery_receipt_id
    );

    if v_line.purchase_order_line_id is not null then
      select (pol.quantity - pol.quantity_received)
        into v_remaining
      from public.purchase_order_line pol
      where pol.id = v_line.purchase_order_line_id
        and pol.tenant_id = v_tenant_id
      for update;

      v_applied := least(v_line.quantity_delivered, greatest(v_remaining, 0));

      if v_applied > 0 then
        update public.purchase_order_line
        set quantity_received = quantity_received + v_applied
        where id = v_line.purchase_order_line_id
          and tenant_id = v_tenant_id;
      end if;

      if v_line.quantity_expected is not null
         and v_line.quantity_delivered <> v_line.quantity_expected then
        v_discrepant := true;
      end if;
    end if;
  end loop;

  -- compute and write receipt status
  update public.delivery_receipt
  set status = case
    when v_receipt.purchase_order_id is null then 'unmatched'
    when v_discrepant then 'discrepancy'
    else 'po_linked'
  end
  where id = p_delivery_receipt_id
    and tenant_id = v_tenant_id;

  -- auto-close PO if fully received
  if v_receipt.purchase_order_id is not null then
    select not exists (
      select 1 from public.purchase_order_line
      where purchase_order_id = v_receipt.purchase_order_id
        and tenant_id = v_tenant_id
        and quantity_received < quantity
    ) into v_complete;

    if v_complete then
      update public.purchase_order
      set status = 'received'
      where id = v_receipt.purchase_order_id
        and tenant_id = v_tenant_id;
    end if;
  end if;
end;
$$;

grant execute on function public.receive_delivery_receipt(uuid) to authenticated;

-- retire old RPCs
drop function if exists public.receive_purchase_order(uuid, uuid);
drop function if exists public.receive_purchase_order_line(uuid, numeric, uuid);
