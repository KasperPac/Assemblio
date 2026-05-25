-- Generalize product/variant tables so non-Shopify tenants can own products,
-- variants, and BOMs. Renames shopify_product -> product and
-- shopify_variant -> product_variant, makes shopify_id nullable, adds a
-- `source` column gated by a CHECK constraint that requires shopify_id iff
-- the row originated from Shopify.

begin;

alter table public.shopify_product  rename to product;
alter table public.shopify_variant  rename to product_variant;

alter table public.product          alter column shopify_id drop not null;
alter table public.product_variant  alter column shopify_id drop not null;

alter table public.product          add column source text not null default 'manual';
alter table public.product_variant  add column source text not null default 'manual';

-- Every pre-existing row came from Shopify sync (only create path before today).
update public.product          set source = 'shopify' where shopify_id is not null;
update public.product_variant  set source = 'shopify' where shopify_id is not null;

alter table public.product
  add constraint product_source_shopify_id_chk
  check ((source = 'shopify' and shopify_id is not null)
      or (source <> 'shopify' and shopify_id is null));

alter table public.product_variant
  add constraint product_variant_source_shopify_id_chk
  check ((source = 'shopify' and shopify_id is not null)
      or (source <> 'shopify' and shopify_id is null));

commit;
