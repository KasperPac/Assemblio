## Shopify Integration Audit

### Shipped

- **OAuth install start** — Validates shop domain, loads tenant from `profiles`, generates HMAC-signed state cookie with nonce + tenantId + exp (10 min), redirects to Shopify OAuth.
  - `src/app/api/shopify/auth/route.ts:19-74`
  - Shop domain regex + normalization: `src/lib/shopify/auth.ts:3-28`
  - State nonce + signed payload: `src/lib/shopify/auth.ts:69-84`

- **OAuth callback** — Verifies Shopify HMAC on callback URL, verifies signed state cookie, checks expiry, nonce match, shop match, re-loads tenant from session, blocks cross-tenant store conflict, exchanges code for token, upserts `shopify_store` + `shopify_install_tokens`, then registers webhooks.
  - `src/app/api/shopify/callback/route.ts:20-188`
  - Callback HMAC: `src/lib/shopify/auth.ts:86-98`
  - Cross-tenant conflict guard: `src/app/api/shopify/callback/route.ts:122-132`
  - Token upsert onto `shopify_install_tokens` with `onConflict: "shopify_store_id"`: `src/app/api/shopify/callback/route.ts:153-162`

- **Webhook registration on install** — Registers `APP_UNINSTALLED`, `ORDERS_CREATE/UPDATED/CANCELLED/FULFILLED`, `PRODUCTS_CREATE/UPDATE`; tolerates "address has already been taken".
  - `src/lib/shopify/client.ts:49-89`

- **Webhook endpoint with HMAC + idempotency** — Reads raw body, verifies base64 HMAC-SHA256, checks identity headers, upserts `shopify_webhook_event` with `ignoreDuplicates: true` on `webhook_id`, short-circuits duplicates, logs `event_log`, handles `app/uninstalled` status flip, triggers sync for configured topics.
  - `src/app/api/shopify/webhooks/route.ts:12-130`
  - HMAC verify: `src/lib/shopify/auth.ts:100-107`
  - Idempotency helper: `src/lib/shopify/webhook.ts:14-16`
  - Topic whitelist for sync: `src/lib/shopify/webhook.ts:1-12,31-43`

- **Manual sync endpoint** — `POST /api/shopify/sync` gated by session; requires tenant; optional `store_id`; validates scopes before running; writes `last_synced_at`/`last_sync_status`/`last_sync_meta`.
  - `src/app/api/shopify/sync/route.ts:7-127`
  - Scope gate: `src/lib/shopify/scopes.ts:1-16`

- **Disconnect endpoint** — Deletes token row and flips `shopify_store.status` to `disconnected` with backward-compatible fallback for older schemas.
  - `src/app/api/shopify/disconnect/route.ts:12-101`

- **GraphQL client with pinned API version** — Defaults to `2026-01`, overridable via `SHOPIFY_API_VERSION`; sends `X-Shopify-Access-Token`; throws on HTTP/GraphQL errors.
  - `src/lib/shopify/client.ts:10-47`

- **Catalog + order ingestion** — Paginated `products`/`orders` GraphQL fetch, upserts to `shopify_product`/`shopify_variant`/`orders`/`order_line` with tenant-scoped unique constraints; triggers per-order allocation reconcile; logs `activity_log: SHOPIFY_SYNC_COMPLETED`.
  - `src/lib/shopify/sync.ts:59-333`
  - Fetch pagination loops: `src/lib/shopify/sync.ts:98-176`
  - Allocation reconcile integration: `src/lib/shopify/sync.ts:300-309`

- **Settings UI panel** — Install form, status message mapping, per-store sync + disconnect actions, sync overlay UX.
  - `src/app/app/settings/page.tsx:188-320`
  - `src/app/app/settings/shopify-connect.tsx:1-68`
  - `src/app/app/settings/sync-submit-form.tsx:1-40`

- **Schema + patches** — `shopify_store`, `shopify_install_tokens`, `shopify_webhook_event`, `shopify_product`, `shopify_variant` with tenant-scoped unique indexes.
  - `supabase/schema.sql:168-222,191-200`
  - `supabase/patches/shopify_app_patch.sql:7-93`

- **Unit tests** — Webhook helpers and scope parsing.
  - `src/lib/shopify/webhook.test.ts:1-67`
  - `src/lib/shopify/scopes.test.ts:1-16`

- **Read-only inventory posture enforced** — No calls to `inventoryAdjustQuantities`, `inventorySetQuantities`, or `write_inventory` anywhere in `src/`. Only `admin/api/.../graphql.json` reads exist.
  - Verified via grep on `src/`.

### Partial

- **Shopify location -> local `location` mapping** — Spec requires mapping Shopify locations to local `location` rows. No location fetch, upsert, or mapping table exists. `read_locations` is not in the default `SHOPIFY_SCOPES` fallback either.
  - Gap: `src/lib/shopify/auth.ts:33` (default scopes = `read_products,read_orders` only)
  - Gap: `src/lib/shopify/sync.ts` has no locations query
  - Effort: **M**

- **Order line ingestion loses Shopify line identity** — Sync groups line items by variant and upserts on `(tenant_id, order_id, variant_id)`, so multiple Shopify line items for the same variant collapse into one row and there is no `shopify_line_item_id`. Unit price / line price are never written (defaulted to 0).
  - `src/lib/shopify/sync.ts:270-298`
  - `supabase/schema.sql:295-305` (no `shopify_line_item_id` column; `unit_sell_price`/`line_sell_price` default 0)
  - Effort: **M**

- **Webhook processing is "resync everything"** — On `orders/*` or `products/*` the handler re-runs the full `syncShopifyStoreData` instead of applying just the webhook payload. Idempotent at the event level, but inefficient and couples every webhook latency to a full sync; also breaks if Shopify retries the webhook during a long sync.
  - `src/app/api/shopify/webhooks/route.ts:84-127`
  - Effort: **L**

- **Fulfillment webhook handling** — `ORDERS_FULFILLED` is registered and accepted as a sync topic, but the mapped status only flips to `fulfilled` if the order's `displayFulfillmentStatus` from the next full fetch happens to include "fulfilled". There is no direct mutation from the `fulfillment` webhook payload itself.
  - `src/lib/shopify/sync.ts:90-96`
  - Effort: **S**

- **Webhook handler fails closed on DB error** — `shopify_webhook_event` upsert error returns 500, which causes Shopify to retry; fine, but there is no bounded retry/dead-letter. Also, `event_log` insert (line 60-64) is fire-and-forget with no error handling.
  - `src/app/api/shopify/webhooks/route.ts:32-65`
  - Effort: **S**

- **Manual sync `/api/shopify/sync` accepts only POST form-submits** — Redirects on every branch; not a JSON API. Spec implies POST `/api/shopify/sync` as a first-class endpoint; current shape is UI-only.
  - `src/app/api/shopify/sync/route.ts:7-127`
  - Effort: **S**

- **OAuth start tenant lookup is weak** — `.from("profiles").select("tenant_id").single()` with no `.eq("id", user.id)` filter; relies on RLS to scope to the current user. Callback does filter explicitly (line 90), so the two are inconsistent.
  - `src/app/api/shopify/auth/route.ts:44-47`
  - Effort: **S**

- **Orders pagination capped at 250** — Hard stop in `fetchOrders` means large stores miss historical orders on first sync.
  - `src/lib/shopify/sync.ts:161-173`
  - Effort: **S**

- **`NEXT_PUBLIC_APP_URL` used for callback + webhook registration** — Required, but not validated to be HTTPS. Shopify will reject non-HTTPS webhook URLs; silent failure surfaces only as `connected-webhooks-failed`.
  - `src/lib/shopify/auth.ts:34-42`, `src/lib/shopify/client.ts:50-51`
  - Effort: **S**

### Missing

- **Shopify `location` sync + mapping UI/table** — No ingestion of Shopify locations, no mapping row linking `shopify_location_id` -> local `location.id`. Spec requires this; Flow 5 in FLOWS.MD describes allocating against default location only as a fallback. Effort: **M**.

- **`locations/update` webhook topic** — Not registered; no handler. Effort: **S**.

- **Refund webhook (`refunds/create`)** — Not registered; not handled. FLOWS.MD calls it out as optional/future. Effort: **M**.

- **Unit price / line price capture from Shopify** — Sync query does not fetch `lineItems { originalUnitPriceSet, discountedUnitPriceSet }`; local `order_line.unit_sell_price`/`line_sell_price` are always 0. Effort: **S**.

- **`shopify_line_item_id` column + granular line storage** — No way to correlate a local `order_line` row back to a Shopify line item for refunds, edits, or dedup. Effort: **M**.

- **Rate-limit / retry handling** — No handling of Shopify 429 `Retry-After`, no GraphQL `throttleStatus` inspection, no exponential backoff. A large first sync can fail partway. Effort: **M**.

- **Per-webhook handlers** — No distinct logic for `orders/create` vs `orders/cancelled` vs `products/update`; everything falls through to `syncShopifyStoreData`. Effort: **L**.

- **GDPR mandatory webhooks** — Shopify requires `customers/data_request`, `customers/redact`, `shop/redact` for public app distribution. Not registered, not implemented. Effort: **M**.

- **App uninstall cleanup beyond status flag** — `app/uninstalled` flips `shopify_store.status`, but token is not revoked/purged and webhook registrations are not explicitly cleaned. Effort: **S**.

- **OAuth scope drift detection** — Token `scopes` column is written once at install and compared by `getMissingSyncScopes`, but there is no re-consent flow when `SHOPIFY_SCOPES` changes (only a sync-time error message). Effort: **M**.

- **Install logging / audit trail** — No `activity_log` entries for install, uninstall, disconnect, or webhook delivery beyond the generic `event_log` insert. Effort: **S**.

- **Integration/E2E tests for full OAuth + webhook pipeline** — Only helper-level vitest specs; no integration tests mocking Shopify callback or webhook HTTP flow. Effort: **M**.

### Risks / policy violations

- **No Shopify inventory writes detected.** Grep for `inventoryAdjust`, `inventorySetQuantities`, `write_inventory` returned zero matches across `src/`. Policy compliance upheld. (`src/lib/shopify/client.ts`, `src/lib/shopify/sync.ts`)

- **HMAC verification present on both callback and webhook.** Constant-time `timingSafeEqual`, length-checked. `src/lib/shopify/auth.ts:78-107`. OK.

- **Webhook idempotency is correct at event level.** `shopify_webhook_event.webhook_id` is unique; `ignoreDuplicates: true` + `.select("id").single()` returns no row on duplicates, and `isDuplicateWebhookEvent` short-circuits with 200. `src/app/api/shopify/webhooks/route.ts:32-51`. OK — though note the internal work (`syncShopifyStoreData`) is itself idempotent by upsert, not by event key, so a duplicate webhook that slips past the early guard (e.g. identical `webhook_id` races) would still re-pull. Low risk.

- **Tenant is never taken from the client on sensitive paths.** Install, callback, sync, disconnect all resolve `tenant_id` from the Supabase session's `profiles` row. Callback additionally re-verifies that the state-cookie `tenantId` matches the session tenant (`src/app/api/shopify/callback/route.ts:93-97`) and rejects cross-tenant store domain reuse (lines 122-132). OK.

- **State cookie signing uses `SHOPIFY_API_SECRET` as the HMAC key.** Acceptable, but reusing the Shopify shared secret for a second purpose couples two concerns; a dedicated `ASSEMBLIO_STATE_SECRET` would be safer. `src/lib/shopify/auth.ts:73-76`. Minor.

- **OAuth start cookie is `sameSite: "lax"` with `secure: true`.** Good for top-level redirect from Shopify back to callback. OK. `src/app/api/shopify/auth/route.ts:66-72`.

- **`NEXT_PUBLIC_APP_URL` trust.** Used to build both `redirect_uri` and webhook `callbackUrl`. Env-controlled, not client-controlled, but not validated to be HTTPS. Medium risk if misconfigured.

- **`shopify_webhook_event` payload stored unredacted.** Contains full Shopify order payload including PII (customer email, address) with `rls enable` set (`supabase/schema.sql:200`) but no explicit RLS policies visible in this patch — depends on global policy.

- **Webhook handler does heavy work inline (full sync) before returning 200.** Shopify's 5-second delivery timeout is at risk on large stores; retries will fire. Not a security violation, but a reliability risk that compounds the partial item above.

- **No rate-limit handling.** Risk of partial-state corruption on large first syncs; mitigated by upsert idempotency but still a reliability concern.
