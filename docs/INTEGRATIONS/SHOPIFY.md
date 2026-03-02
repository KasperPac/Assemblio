# Shopify Integration — Assemblio (Read-only inventory policy)

## Inventory policy (LOCKED)
- Assemblio DOES NOT write inventory adjustments to Shopify.
- Shopify scopes should remain read-only for inventory unless ADR approved.

## What Shopify is used for
- Catalog ingestion (products/variants/SKUs)
- Orders ingestion (webhooks)
- Location mapping

## App posture
- Currently: Admin embedded app
- Soon: custom app (still uses Admin API OAuth; distribution differs)

## Auth (OAuth Authorization Code Grant)
- Install route redirects merchant to Shopify OAuth
- Callback verifies HMAC + state, exchanges code for access token
- Access token stored in Supabase (`shopify_install_tokens`)

## Required scopes (minimum recommended)
- read_products
- read_orders
- read_locations
Optional:
- read_inventory (only if showing Shopify inventory reference in UI)

Avoid:
- write_inventory (not required under locked policy)

## Webhooks
Your actual webhook endpoints are defined in:
`src/app/api/shopify/webhooks/route.ts`

Rules for all webhooks:
- Verify HMAC signature
- Implement idempotency (event_log)
- Return 200 quickly; heavy work should be minimized and retry-safe

Suggested topics (confirm against your existing endpoints):
- orders/create
- orders/updated (if used)
- orders/cancelled
- refunds/create (if used)
- products/update
- locations/update

## Shopify rate limits
- Handle 429 with Retry-After
- Prefer batching/pagination for imports
- Store last sync cursors/timestamps in Supabase if needed

## Data mapping
- Shopify Product -> `shopify_product`
- Shopify Variant -> `shopify_variant`
- Shopify Location -> `location`
- Shopify Order -> `order`
- Shopify Order line item -> `order_line`
