-- Atomic bulk-receive for an entire purchase order.
--
-- src/app/app/goods-inwards/actions.ts.receivePurchaseOrder previously
-- looped over the PO's lines from Node, calling
-- receive_purchase_order_line per line via supabase.rpc, and
-- silently `return`-ed mid-loop on the first error. The PO ended up
-- with some lines fully received, others untouched, no status
-- update, and no error surfaced to the operator.
--
-- This RPC moves the loop into Postgres so receive_purchase_order_line
-- is invoked inside one transaction. Any per-line failure rolls back
-- every prior line's movement, balance update, and quantity_received
-- bump in the same call.

create or replace function public.receive_purchase_order(
  p_purchase_order_id uuid,
  p_location_id uuid
)
returns table (
  lines_received integer,
  quantity_received numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant_id uuid;
  v_status text;
  v_line record;
  v_applied numeric;
  v_lines_received integer := 0;
  v_quantity_received numeric := 0;
begin
  v_tenant_id := public.current_tenant_id();
  if v_tenant_id is null then
    raise exception 'No tenant context for user';
  end if;

  select status into v_status
  from public.purchase_order
  where id = p_purchase_order_id
    and tenant_id = v_tenant_id
  for update;

  if v_status is null then
    raise exception 'Purchase order not found for tenant';
  end if;

  if v_status in ('received', 'cancelled', 'archived') then
    return query select 0::integer, 0::numeric;
    return;
  end if;

  for v_line in
    select id, quantity, quantity_received
    from public.purchase_order_line
    where purchase_order_id = p_purchase_order_id
      and tenant_id = v_tenant_id
      and quantity_received < quantity
    order by id
  loop
    v_applied := public.receive_purchase_order_line(
      v_line.id,
      greatest(v_line.quantity - coalesce(v_line.quantity_received, 0), 0),
      p_location_id
    );
    if v_applied > 0 then
      v_lines_received := v_lines_received + 1;
      v_quantity_received := v_quantity_received + v_applied;
    end if;
  end loop;

  return query select v_lines_received, v_quantity_received;
end;
$$;

grant execute on function public.receive_purchase_order(uuid, uuid) to authenticated, service_role;
