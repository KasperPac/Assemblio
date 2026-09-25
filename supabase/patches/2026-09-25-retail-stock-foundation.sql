-- supabase/patches/2026-09-25-retail-stock-foundation.sql
--
-- MANUVA-27 plan 1: retail items carry shelf stock, and a fulfilled sale of
-- one decrements on_hand exactly once.
--
-- Before this, nothing in the sales path consumed stock: reconcile-order.ts
-- only moved `reserved`, and fulfilment released the reservation. For a
-- manufacturer that is fine (on_hand moves via adjustments and stocktakes).
-- For a pure-resale tenant the sale IS the consumption event.
--
-- Scope is deliberately product.kind = 'retail'. Consuming on sale for
-- manufactured products would double-count against their manual process.
--
-- Idempotent: safe to re-run.

alter table public.product
  add column if not exists kind text not null default 'manufactured';
do $$ begin
  alter table public.product add constraint product_kind_chk
    check (kind in ('manufactured', 'retail'));
exception when duplicate_object then null; end $$;

alter table public.product_variant add column if not exists barcode text;
create index if not exists product_variant_tenant_barcode_idx
  on public.product_variant (tenant_id, barcode) where barcode is not null;

-- One row per order line whose sale has been consumed. The unique key on
-- order_line_id is the serialisation point: two concurrent consumers race
-- on this INSERT, Postgres hands it to exactly one, and the loser writes
-- nothing. MANUVA-20 was this same operation split across round trips.
-- `baseline` rows were never consumed; they mark sales the opening stock
-- count already reflects (written by create_retail_item).
create table if not exists public.order_line_consumption (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  order_line_id uuid not null references public.order_line(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  location_id uuid not null references public.location(id),
  baseline boolean not null default false,
  created_at timestamptz not null default now(),
  constraint order_line_consumption_line_key unique (order_line_id)
);
create index if not exists order_line_consumption_tenant_order_idx
  on public.order_line_consumption (tenant_id, order_id);

alter table public.order_line_consumption enable row level security;
drop policy if exists tenant_isolation_select on public.order_line_consumption;
create policy tenant_isolation_select on public.order_line_consumption
  for select using (tenant_id = current_tenant_id());
-- No insert/update/delete policies: rows are written only by the DEFINER
-- functions below.

create or replace function public.apply_sale_consumption(
  p_tenant_id uuid,
  p_order_line_id uuid,
  p_location_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line record;
  v_kind text;
  v_bom_id uuid;
  v_comp record;
  v_required numeric;
  v_released numeric;
  v_count integer := 0;
begin
  if p_tenant_id is null or p_order_line_id is null or p_location_id is null then
    raise exception 'tenant, order line and location are required';
  end if;

  perform public.assert_tenant_write_access(p_tenant_id);

  select ol.id, ol.order_id, ol.variant_id, ol.quantity
  into v_line
  from public.order_line ol
  where ol.id = p_order_line_id and ol.tenant_id = p_tenant_id;
  if v_line.id is null then
    raise exception 'forbidden: order line does not belong to this tenant'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.location l
    where l.id = p_location_id and l.tenant_id = p_tenant_id
  ) then
    raise exception 'forbidden: location does not belong to this tenant'
      using errcode = '42501';
  end if;

  select p.kind into v_kind
  from public.product_variant v
  join public.product p on p.id = v.product_id
  where v.id = v_line.variant_id;
  if v_kind is distinct from 'retail' then
    raise exception 'sale consumption applies to retail items only';
  end if;

  insert into public.order_line_consumption (tenant_id, order_line_id, order_id, location_id)
  values (p_tenant_id, v_line.id, v_line.order_id, p_location_id)
  on conflict (order_line_id) do nothing;
  if not found then
    return 0;
  end if;

  select b.id into v_bom_id
  from public.product_bom b
  where b.tenant_id = p_tenant_id and b.variant_id = v_line.variant_id and b.is_active;
  if v_bom_id is null then
    raise exception 'retail item has no active BOM';
  end if;

  for v_comp in
    select bc.component_id, sum(bc.quantity) as qty
    from public.product_bom_component bc
    where bc.tenant_id = p_tenant_id and bc.product_bom_id = v_bom_id
    group by bc.component_id
  loop
    v_required := v_line.quantity * v_comp.qty;

    with removed as (
      delete from public.order_component_allocation a
      where a.tenant_id = p_tenant_id
        and a.order_line_id = v_line.id
        and a.component_id = v_comp.component_id
      returning a.quantity
    )
    select coalesce(sum(quantity), 0) into v_released from removed;

    insert into public.inventory_movement (
      tenant_id, component_id, location_id,
      delta_on_hand, delta_in_prod, delta_reserved,
      reason, reference_type, reference_id
    ) values (
      p_tenant_id, v_comp.component_id, p_location_id,
      -v_required, 0, -v_released,
      'sale', 'order', v_line.order_id
    );

    insert into public.inventory_balance (tenant_id, component_id, location_id, on_hand, in_prod, reserved)
    values (p_tenant_id, v_comp.component_id, p_location_id, -v_required, 0, 0)
    on conflict (tenant_id, component_id, location_id) do update
      set on_hand = public.inventory_balance.on_hand - v_required,
          reserved = greatest(0, public.inventory_balance.reserved - v_released),
          updated_at = now();

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.apply_sale_consumption(uuid, uuid, uuid) from public, anon;
grant execute on function public.apply_sale_consumption(uuid, uuid, uuid) to authenticated, service_role;
