create or replace view public.product_profitability
  with (security_invoker = true)
as
select
  ol.tenant_id,
  sv.id                                        as variant_id,
  sv.title                                     as variant_title,
  sp.title                                     as product_title,
  count(jcs.id)::int                           as job_count,
  coalesce(sum(jcs.sell_price), 0)             as total_revenue,
  avg(jcs.planned_margin_pct)                  as avg_planned_margin_pct,
  avg(jcar.actual_margin_pct)                  as avg_actual_margin_pct,
  sum(jcar.actual_margin)                      as total_actual_margin
from public.order_line ol
join public.job_cost_snapshot jcs
  on jcs.order_line_id = ol.id
join public.shopify_variant sv
  on sv.id = ol.variant_id
join public.shopify_product sp
  on sp.id = sv.product_id
left join public.job_cost_actual_rollup jcar
  on jcar.order_line_id = ol.id
group by
  ol.tenant_id,
  sv.id,
  sv.title,
  sp.title;
