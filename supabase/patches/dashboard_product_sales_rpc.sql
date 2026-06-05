-- Per-product sales + material cost over a date window (by real order date,
-- historical orders included). SECURITY INVOKER so caller RLS applies.
create or replace function public.dashboard_product_sales(
  p_tenant_id uuid,
  p_from date,
  p_to date
)
returns table (
  product_id uuid,
  title text,
  units numeric,
  revenue numeric,
  material_cost numeric,
  profit numeric,
  has_bom boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with variant_cost as (
    select pb.variant_id, sum(pbc.quantity * c.cost_per_unit) as unit_cost
    from public.product_bom pb
    join public.product_bom_component pbc on pbc.product_bom_id = pb.id
    join public.component c on c.id = pbc.component_id
    where pb.tenant_id = p_tenant_id and pb.is_active
    group by pb.variant_id
  )
  select
    v.product_id,
    p.title,
    sum(ol.quantity) as units,
    sum(ol.line_sell_price) as revenue,
    sum(ol.quantity * coalesce(vc.unit_cost, 0)) as material_cost,
    sum(ol.line_sell_price) - sum(ol.quantity * coalesce(vc.unit_cost, 0)) as profit,
    bool_or(vc.unit_cost is not null) as has_bom
  from public.order_line ol
  join public.orders o on o.id = ol.order_id
  join public.product_variant v on v.id = ol.variant_id
  join public.product p on p.id = v.product_id
  left join variant_cost vc on vc.variant_id = v.id
  where ol.tenant_id = p_tenant_id
    and o.tenant_id = p_tenant_id
    and coalesce(o.shopify_processed_at, o.shopify_created_at) >= p_from
    and coalesce(o.shopify_processed_at, o.shopify_created_at) < (p_to + 1)
  group by v.product_id, p.title
  order by revenue desc;
$$;
