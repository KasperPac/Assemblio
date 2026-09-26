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

  select ol.id, ol.order_id, ol.variant_id, ol.quantity, o.historical
  into v_line
  from public.order_line ol
  join public.orders o on o.id = ol.order_id
  where ol.id = p_order_line_id and ol.tenant_id = p_tenant_id;
  if v_line.id is null then
    raise exception 'forbidden: order line does not belong to this tenant'
      using errcode = '42501';
  end if;

  -- Ruling 16: a historical order is a backfilled record of a sale that
  -- already happened before Manuva tracked stock for this item — there is
  -- no shelf to take it off. Refused before any write, same as the other
  -- validation above.
  if v_line.historical then
    raise exception 'sale consumption does not apply to historical orders';
  end if;

  if not exists (
    select 1 from public.location l
    where l.id = p_location_id and l.tenant_id = p_tenant_id
  ) then
    raise exception 'forbidden: location does not belong to this tenant'
      using errcode = '42501';
  end if;

  -- Guard a corrupt/cross-tenant order_line.variant_id: the FK on
  -- order_line.variant_id only checks that the variant exists, not that it
  -- belongs to the same tenant as the order line. Without this, the
  -- tenant-scoped kind join below would just find no row and fall through
  -- to the generic "retail items only" refusal, which reads like an
  -- ordinary manufactured-item refusal rather than the tenant breach it is.
  if not exists (
    select 1 from public.product_variant v
    where v.id = v_line.variant_id and v.tenant_id = p_tenant_id
  ) then
    raise exception 'forbidden: variant does not belong to this tenant'
      using errcode = '42501';
  end if;

  select p.kind into v_kind
  from public.product_variant v
  join public.product p on p.id = v.product_id
  where v.id = v_line.variant_id
    and v.tenant_id = p_tenant_id
    and p.tenant_id = p_tenant_id;
  if v_kind is distinct from 'retail' then
    raise exception 'sale consumption applies to retail items only';
  end if;

  -- Looked up BEFORE the claim insert (Ruling 7b): a retail product can
  -- carry an untracked sibling variant with no active BOM of its own (e.g.
  -- freshly Shopify-imported, not yet run through create_retail_item).
  -- Selling it is a no-op, not an error, and must never claim the order
  -- line — a later create_retail_item call still needs to see it
  -- unbaselined so it can decide whether to baseline it itself.
  select b.id into v_bom_id
  from public.product_bom b
  where b.tenant_id = p_tenant_id and b.variant_id = v_line.variant_id and b.is_active;
  if v_bom_id is null then
    return 0;
  end if;

  -- The claim insert stays the serialisation point for everything after it:
  -- two concurrent consumers race on this INSERT and the loser returns here.
  insert into public.order_line_consumption (tenant_id, order_line_id, order_id, location_id)
  values (p_tenant_id, v_line.id, v_line.order_id, p_location_id)
  on conflict (order_line_id) do nothing;
  if not found then
    return 0;
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

-- Retail item scaffold, one transaction. A retail item is a normal variant
-- whose product has kind = 'retail' and whose active BOM is a single
-- component at qty 1; the component carries cost, supplier, reorder point
-- and the stock. p_variant_id null → create product + variant. Non-null →
-- attach to that variant (a Shopify-imported one, typically).
create or replace function public.create_retail_item(
  p_tenant_id uuid,
  p_variant_id uuid,
  p_name text,
  p_sku text,
  p_barcode text,
  p_cost_per_unit numeric,
  p_supplier_id uuid,
  p_location_id uuid,
  p_reorder_point numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := nullif(trim(p_name), '');
  v_sku text := nullif(trim(p_sku), '');
  v_barcode text := nullif(trim(p_barcode), '');
  v_product_id uuid;
  v_product_kind text;
  v_variant_id uuid;
  v_component_id uuid;
  v_location_id uuid;
  v_bom_id uuid;
  v_version integer;
begin
  perform public.assert_tenant_write_access(p_tenant_id);

  if v_name is null then
    raise exception 'name is required';
  end if;

  v_location_id := coalesce(
    p_location_id,
    (select l.id from public.location l where l.tenant_id = p_tenant_id and l.is_default limit 1)
  );
  if v_location_id is null then
    raise exception 'no default location: set one in Settings → Locations first';
  end if;
  if not exists (select 1 from public.location l where l.id = v_location_id and l.tenant_id = p_tenant_id) then
    raise exception 'forbidden: location does not belong to this tenant' using errcode = '42501';
  end if;
  if p_supplier_id is not null and not exists (
    select 1 from public.suppliers s where s.id = p_supplier_id and s.tenant_id = p_tenant_id
  ) then
    raise exception 'forbidden: supplier does not belong to this tenant' using errcode = '42501';
  end if;

  if p_variant_id is null then
    insert into public.product (tenant_id, title, source, kind)
    values (p_tenant_id, v_name, 'manual', 'retail')
    returning id into v_product_id;

    insert into public.product_variant (tenant_id, product_id, title, sku, barcode, source)
    values (p_tenant_id, v_product_id, 'Default', v_sku, v_barcode, 'manual')
    returning id into v_variant_id;
  else
    select v.id, v.product_id into v_variant_id, v_product_id
    from public.product_variant v
    where v.id = p_variant_id and v.tenant_id = p_tenant_id
    for update;
    if v_variant_id is null then
      raise exception 'forbidden: variant does not belong to this tenant' using errcode = '42501';
    end if;
    if exists (
      select 1 from public.product_bom b
      where b.tenant_id = p_tenant_id and b.variant_id = v_variant_id and b.is_active
    ) then
      raise exception 'this variant already has an active BOM';
    end if;

    -- Ruling 7a: kind lives on the product, not the variant. Flipping it
    -- to retail here would apply to every variant of the product — if a
    -- manufactured sibling still has its own active (multi-line) BOM, its
    -- sale would start silently consuming those components too.
    select p.kind into v_product_kind from public.product p where p.id = v_product_id;
    if v_product_kind = 'manufactured' and exists (
      select 1 from public.product_bom b
      join public.product_variant v2 on v2.id = b.variant_id
      where v2.tenant_id = p_tenant_id
        and v2.product_id = v_product_id
        and v2.id <> v_variant_id
        and b.is_active
    ) then
      raise exception 'this product has manufactured variants with active BOMs; retail tracking applies to the whole product';
    end if;

    update public.product set kind = 'retail' where id = v_product_id and tenant_id = p_tenant_id;
    update public.product_variant
      set barcode = coalesce(barcode, v_barcode)
      where id = v_variant_id;
  end if;

  insert into public.component (tenant_id, name, sku, cost_per_unit, supplier_id, location_id, reorder_point)
  values (p_tenant_id, v_name, v_sku, coalesce(p_cost_per_unit, 0), p_supplier_id, v_location_id, coalesce(p_reorder_point, 0))
  returning id into v_component_id;

  insert into public.inventory_balance (tenant_id, component_id, location_id)
  values (p_tenant_id, v_component_id, v_location_id)
  on conflict (tenant_id, component_id, location_id) do nothing;

  select coalesce(max(b.version), 0) + 1 into v_version
  from public.product_bom b
  where b.tenant_id = p_tenant_id and b.variant_id = v_variant_id;

  insert into public.product_bom (tenant_id, variant_id, version, status, is_active)
  values (p_tenant_id, v_variant_id, v_version, 'active', true)
  returning id into v_bom_id;

  insert into public.product_bom_component (tenant_id, product_bom_id, component_id, quantity, yield_pct, position)
  values (p_tenant_id, v_bom_id, v_component_id, 1, 1.0, 0);

  -- Baseline: sales already fulfilled (or imported as historical) before
  -- this variant became retail are reflected in the opening stock count.
  -- Mark them consumed so a later sync never takes them off the shelf again.
  insert into public.order_line_consumption (tenant_id, order_line_id, order_id, location_id, baseline)
  select p_tenant_id, ol.id, ol.order_id, v_location_id, true
  from public.order_line ol
  join public.orders o on o.id = ol.order_id
  where ol.tenant_id = p_tenant_id
    and ol.variant_id = v_variant_id
    and (lower(o.status) = 'fulfilled' or o.historical)
  on conflict (order_line_id) do nothing;

  return v_variant_id;
end;
$$;

revoke all on function public.create_retail_item(uuid, uuid, text, text, text, numeric, uuid, uuid, numeric) from public, anon;
grant execute on function public.create_retail_item(uuid, uuid, text, text, text, numeric, uuid, uuid, numeric) to authenticated, service_role;
