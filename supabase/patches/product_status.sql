-- Real product status. Synced from Shopify (ACTIVE / DRAFT / ARCHIVED);
-- manual products default to 'active'.
alter table public.product
  add column if not exists status text not null default 'active';

alter table public.product
  drop constraint if exists product_status_chk;

alter table public.product
  add constraint product_status_chk
  check (status in ('active', 'draft', 'archived'));
