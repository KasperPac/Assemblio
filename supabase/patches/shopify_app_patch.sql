alter table public.component add column if not exists cost_per_unit numeric not null default 0;
alter table public.component add column if not exists reorder_point numeric not null default 0;

alter table public.shopify_store add column if not exists last_synced_at timestamptz;
alter table public.shopify_store add column if not exists last_sync_status text;
alter table public.shopify_store add column if not exists last_sync_meta jsonb;

alter table public.shopify_product add column if not exists image_url text;
alter table public.inventory_balance add column if not exists in_prod numeric not null default 0;
alter table public.inventory_movement add column if not exists delta_on_hand numeric not null default 0;
alter table public.inventory_movement add column if not exists delta_in_prod numeric not null default 0;

create table if not exists public.shopify_install_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  shopify_store_id uuid not null references public.shopify_store(id) on delete cascade,
  access_token text not null,
  scopes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shopify_store_id)
);

create table if not exists public.shopify_webhook_event (
  id uuid primary key default gen_random_uuid(),
  webhook_id text not null unique,
  shop_domain text not null,
  topic text not null,
  payload jsonb,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'shopify_store_tenant_store_unique'
  ) then
    alter table public.shopify_store
      add constraint shopify_store_tenant_store_unique
      unique (tenant_id, store_domain);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'shopify_product_tenant_shopify_unique'
  ) then
    alter table public.shopify_product
      add constraint shopify_product_tenant_shopify_unique
      unique (tenant_id, shopify_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'shopify_variant_tenant_shopify_unique'
  ) then
    alter table public.shopify_variant
      add constraint shopify_variant_tenant_shopify_unique
      unique (tenant_id, shopify_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_tenant_shopify_unique'
  ) then
    alter table public.orders
      add constraint orders_tenant_shopify_unique
      unique (tenant_id, shopify_order_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'order_line_tenant_order_variant_unique'
  ) then
    alter table public.order_line
      add constraint order_line_tenant_order_variant_unique
      unique (tenant_id, order_id, variant_id);
  end if;
end $$;

alter table public.shopify_webhook_event enable row level security;