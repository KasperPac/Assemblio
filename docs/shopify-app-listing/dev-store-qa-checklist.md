# Dev-Store QA Checklist

End-to-end manual test before clicking Submit in the Partner Dashboard. Run this against a **fresh** Shopify development store with no prior install of Manuva.

Estimated time: 45-60 minutes.

---

## Pre-flight

- [ ] `shopify.app.toml` has real `client_id` (not the placeholder)
- [ ] `shopify app deploy` succeeded
- [ ] `NEXT_PUBLIC_APP_URL` in production env is `https://app.manuva.app`
- [ ] `SHOPIFY_API_KEY` and `SHOPIFY_API_SECRET` in production env match the Partner Dashboard app
- [ ] `supabase/patches/shopify_gdpr_audit.sql` has been applied to the production database
- [ ] You have access to a fresh Shopify development store with no Manuva install
- [ ] You have Shopify CLI installed: `shopify version` works

---

## Install flow

- [ ] From Partner Dashboard, click "Test on development store" &rarr; select fresh dev store
- [ ] OAuth consent screen appears with these scopes: `read_products`, `read_orders` (no others)
- [ ] After clicking "Install", land back on `app.manuva.app/app/settings/integrations` (or embedded surface if Shopify-managed install)
- [ ] In the database, `shopify_store` has a new row with status `connected` (or `active`)
- [ ] In the database, `shopify_install_tokens` has a matching access token row
- [ ] All webhooks are registered: open Partner Dashboard &rarr; App &rarr; Webhooks. Verify ALL of these are present:
  - [ ] `customers/data_request` &rarr; `https://app.manuva.app/api/shopify/webhooks/gdpr/customers-data-request`
  - [ ] `customers/redact` &rarr; `.../gdpr/customers-redact`
  - [ ] `shop/redact` &rarr; `.../gdpr/shop-redact`
  - [ ] `app/uninstalled` &rarr; `https://app.manuva.app/api/shopify/webhooks`
  - [ ] `orders/create`, `orders/updated`, `orders/cancelled`, `orders/fulfilled` &rarr; main webhook URL
  - [ ] `products/create`, `products/update` &rarr; main webhook URL

---

## Embedded surface

- [ ] In Shopify Admin nav, click Apps &rarr; Manuva
- [ ] Embedded surface loads inside an iframe (URL bar still shows `admin.shopify.com`)
- [ ] No console errors in browser devtools
- [ ] If the merchant has no Manuva subscription: surface shows the "Subscription required" message + "View pricing" CTA
- [ ] If the merchant has an active subscription: surface shows "Last synced" + "Sync now" + "Open Manuva"
- [ ] Click "Sync now" &rarr; status updates to "Sync queued at HH:MM:SS" within 2 seconds
- [ ] After the sync completes, `shopify_store.last_synced_at` advances and `last_sync_status` is `ok`
- [ ] Click "Open Manuva" &rarr; new tab opens to `https://app.manuva.app/app`

---

## Catalog + order sync

- [ ] Manually create 3-5 products in the Shopify dev store admin
- [ ] Trigger a sync (either from embedded surface or `/app/settings/integrations`)
- [ ] All products appear in Manuva at `/app/products` with `source = "shopify"`
- [ ] Place a test order in the dev store (Shopify lets you mark orders as paid in dev mode)
- [ ] Trigger a sync
- [ ] The order appears in Manuva at `/app/orders` with `shopify_order_id` populated

---

## GDPR webhooks

For each topic, trigger from Shopify CLI:

```bash
shopify webhook trigger \
  --topic customers/data_request \
  --api-version 2026-01 \
  --address https://app.manuva.app/api/shopify/webhooks/gdpr/customers-data-request \
  --client-secret $SHOPIFY_API_SECRET
```

- [ ] `customers/data_request` returns 200 (and `shopify_gdpr_request` row written with `status = completed`)
- [ ] `customers/redact` returns 200 (row written; if a matching order exists, `customer_email` is nulled)
- [ ] `shop/redact` returns 200 (row written; for a sole-store tenant, products/orders deleted)
- [ ] Send a tampered request (wrong HMAC) to any GDPR endpoint &rarr; returns 401 (NOT 500)
- [ ] In the database, no `shopify_gdpr_request` row was created for the 401 request

---

## Uninstall + reinstall

- [ ] In Shopify Admin, click Apps &rarr; Manuva &rarr; Delete app
- [ ] In Manuva DB: `shopify_install_tokens` row for this store is deleted
- [ ] In Manuva DB: `shopify_store.status` is `uninstalled`
- [ ] In Manuva DB: synced products/orders are STILL THERE (deleted later by `shop/redact`)
- [ ] `activity_log` has a row with `event = SHOPIFY_APP_UNINSTALLED`
- [ ] Reinstall the app on the same dev store
- [ ] OAuth completes cleanly, new token row created, `shopify_store.status` flips back to `connected`
- [ ] Sync still works

---

## App-uninstalled + shop/redact sequence

- [ ] Uninstall again
- [ ] Wait 48 hours OR manually trigger `shop/redact` via Shopify CLI
- [ ] Products, variants, orders, order_lines, webhook_event rows for that shop are deleted
- [ ] `shopify_store` row is deleted
- [ ] `activity_log` has a row with `event = SHOPIFY_GDPR_SHOP_REDACT`

---

## Security spot checks

- [ ] HTTPS is enforced on all endpoints (test: `curl http://app.manuva.app/api/shopify/install` should fail or redirect to HTTPS)
- [ ] Webhook endpoints reject requests with no HMAC header (401)
- [ ] Webhook endpoints reject requests with wrong HMAC (401)
- [ ] Embedded session endpoint rejects requests with no Authorization header (401)
- [ ] Embedded session endpoint rejects expired session tokens (401)
- [ ] Embedded session endpoint rejects session tokens signed with a different secret (401)

---

## Listing readiness

- [ ] All TODO items in `README.md` resolved (terms URL, support page/email)
- [ ] All icon + screenshot files in `assets/` exist and meet dimensions
- [ ] Demo store credentials filled in
- [ ] Pricing description matches the actual `manuva.app/pricing` page
- [ ] Privacy policy link works

---

## Sign-off

When every item above is checked, capture a screenshot of the embedded surface + a recorded sync trigger as proof, save them to `assets/sign-off/`, and proceed to Task 8 (Submit).
