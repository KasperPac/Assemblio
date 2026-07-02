-- Shopify product categories: product_type, tags, standard-taxonomy category,
-- and collections. Read-only mirrors of Shopify. Apply manually before deploy.

-- 1. Scalar category fields on product ----------------------------------------
alter table public.product
  add column if not exists product_type text,
  add column if not exists tags text[] not null default '{}',
  add column if not exists category_name text,
  add column if not exists category_full_name text;

create index if not exists product_tenant_product_type_idx
  on public.product (tenant_id, product_type);
create index if not exists product_tags_gin_idx
  on public.product using gin (tags);

-- 2. Collections ---------------------------------------------------------------
create table if not exists public.shopify_collection (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  shopify_id text not null,
  title text not null,
  handle text,
  created_at timestamptz not null default now(),
  unique (tenant_id, shopify_id)
);

create table if not exists public.product_collection (
  tenant_id uuid not null references public.tenant(id),
  product_id uuid not null references public.product(id) on delete cascade,
  collection_id uuid not null references public.shopify_collection(id) on delete cascade,
  primary key (product_id, collection_id)
);

create index if not exists product_collection_collection_idx
  on public.product_collection (collection_id);
create index if not exists shopify_collection_tenant_idx
  on public.shopify_collection (tenant_id);

-- 3. RLS -----------------------------------------------------------------------
-- No is_super_admin() bypass: these are tenant-scoped business tables, so they
-- follow the same stripped policy that super_admin_foundation.sql enforces for
-- product / product_variant (a platform operator with no active tenant sees zero
-- rows). Keeping the form identical here means the policy is correct regardless
-- of the order these two patches are applied.
alter table public.shopify_collection enable row level security;
drop policy if exists shopify_collection_tenant_isolation on public.shopify_collection;
create policy shopify_collection_tenant_isolation on public.shopify_collection
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());

alter table public.product_collection enable row level security;
drop policy if exists product_collection_tenant_isolation on public.product_collection;
create policy product_collection_tenant_isolation on public.product_collection
  using (tenant_id = public.current_tenant_id())
  with check (tenant_id = public.current_tenant_id());
