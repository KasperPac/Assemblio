-- Compatibility views consumed by the dashboard page and widgets.
-- The dashboard references shorter aliases (product, supplier, bom_component)
-- while the underlying tables are named shopify_product, suppliers, product_bom_component.

create or replace view public.product
  with (security_invoker = on)
  as
  select id, tenant_id, title, description, image_url, shopify_id, created_at
  from public.shopify_product;

create or replace view public.supplier
  with (security_invoker = on)
  as
  select *
  from public.suppliers
  where is_active = true;

-- bom_component exposes BOM lines from the active product_bom only.
create or replace view public.bom_component
  with (security_invoker = on)
  as
  select pbc.id,
         pbc.tenant_id,
         pbc.product_bom_id,
         pbc.component_id,
         pbc.quantity,
         pbc.yield_pct,
         pb.variant_id,
         pbc.created_at
  from public.product_bom_component pbc
  join public.product_bom pb on pb.id = pbc.product_bom_id
  where pb.is_active = true;

grant select on public.product, public.supplier, public.bom_component to authenticated;
