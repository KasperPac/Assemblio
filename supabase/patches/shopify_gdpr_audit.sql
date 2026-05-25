-- GDPR webhook audit log for Shopify mandatory compliance webhooks.
-- Records every customers/data_request, customers/redact, shop/redact event we receive,
-- so we can prove compliance during App Store review and ongoing operation.

create table if not exists public.shopify_gdpr_request (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  shop_domain text not null,
  webhook_id text,
  payload jsonb,
  status text not null default 'received',
  error text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  constraint shopify_gdpr_request_topic_chk
    check (topic in ('customers/data_request', 'customers/redact', 'shop/redact'))
);

create index if not exists idx_shopify_gdpr_request_shop on public.shopify_gdpr_request (shop_domain);
create index if not exists idx_shopify_gdpr_request_topic on public.shopify_gdpr_request (topic, received_at desc);

alter table public.shopify_gdpr_request enable row level security;
