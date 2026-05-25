# Shopify Public App Submission — MVP Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the existing Shopify integration from "private/dev-store working" to "ready to submit for Shopify App Store review." Minimum viable scope only — defers location sync, rate limiting, per-webhook handlers, and order line price capture (those stay open in `docs/_audit/02_shopify.md`).

**Architecture decisions (locked):**
- **App surface:** Embedded thin surface inside Shopify Admin (status + sync trigger + open-in-manuva link). Full app stays at `app.manuva.app` and opens in a new top-level tab.
- **Billing:** Free to install on Shopify. Manuva subscription required, billed externally via Stripe. Pricing disclosure in the App Store listing description and on the embedded surface.
- **App type in `shopify.app.toml`:** `embedded = true`, but the only embedded route is `/shopify/embedded/*` — everything else stays standalone.
- **API auth for embedded surface:** Shopify App Bridge session tokens, verified server-side, exchanged for our existing Supabase session via a short-lived cookie tied to `shopify_store_id`.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres + Auth + RLS), CSS Modules, TypeScript, `@shopify/app-bridge` + `@shopify/app-bridge-react` (CDN script, not React lib, to keep bundle small).

**Reference:** Shopify App Store requirements — https://shopify.dev/docs/apps/launch/app-requirements-checklist

---

## File Map

**Created:**
- `shopify.app.toml` — Shopify CLI config, embedded + scopes + webhook endpoints
- `src/app/api/shopify/webhooks/gdpr/customers-data-request/route.ts`
- `src/app/api/shopify/webhooks/gdpr/customers-redact/route.ts`
- `src/app/api/shopify/webhooks/gdpr/shop-redact/route.ts`
- `src/lib/shopify/gdpr.ts` — GDPR webhook handlers (data export, customer redact, shop redact)
- `src/lib/shopify/session-token.ts` — App Bridge session token verification (JWT, HS256, Shopify API secret)
- `src/lib/shopify/uninstall.ts` — token purge + webhook deregistration + status flip in one transaction
- `src/app/shopify/embedded/layout.tsx` — App Bridge CDN script, iframe-friendly CSP, no Manuva chrome
- `src/app/shopify/embedded/page.tsx` — embedded status page (server component) + client App Bridge wrapper
- `src/app/shopify/embedded/embedded-client.tsx` — App Bridge initialization, session token bridge
- `src/app/shopify/embedded/embedded.module.css`
- `src/app/api/shopify/embedded/session/route.ts` — verifies App Bridge JWT, returns store status + manuva subscription state
- `supabase/patches/shopify_gdpr_audit.sql` — `shopify_gdpr_request` audit log table
- `docs/shopify-app-listing/README.md` — listing copy, pricing disclosure, support contact
- `docs/shopify-app-listing/assets/` — icon + screenshot briefs (actual PNGs delivered separately)
- `docs/shopify-app-listing/dev-store-qa-checklist.md` — manual QA script for review

**Modified:**
- `src/lib/shopify/client.ts` — register GDPR webhooks alongside existing topics; HTTPS validation for `NEXT_PUBLIC_APP_URL`
- `src/lib/shopify/auth.ts` — validate `NEXT_PUBLIC_APP_URL` is HTTPS at module load; export session-token verification helper
- `src/app/api/shopify/webhooks/route.ts` — split routing so GDPR topics go to dedicated handlers (or document why they stay here)
- `src/app/api/shopify/callback/route.ts` — write `activity_log` entry on successful install
- `src/middleware.ts` (if exists, otherwise create) — set `Content-Security-Policy: frame-ancestors https://*.myshopify.com https://admin.shopify.com` for `/shopify/embedded/*`; relax `SameSite` on session cookies for that path only
- `next.config.ts` — `headers()` block for `/shopify/embedded/*` (CSP, X-Frame-Options removed)
- `package.json` — add `jose` (already present? verify) for JWT verification; no App Bridge npm dep (use CDN)

---

## Task 1: GDPR webhook handlers (mandatory blocker)

**Goal:** Implement and register the three mandatory Shopify GDPR webhooks. Without these, the App Store will reject the submission immediately.

**Spec:** https://shopify.dev/docs/apps/build/privacy-law-compliance

The three topics are:
- `customers/data_request` — merchant requests a customer's data; we must email it to the merchant within 30 days (audit log is fine for MVP since we don't store customer PII beyond what's already in webhook payloads).
- `customers/redact` — delete a specific customer's PII 48h after request. We must purge from `shopify_webhook_event.payload`, `orders.customer_*`, and any cached customer data.
- `shop/redact` — fires 48h after app uninstall. Delete all data for the shop. We must purge `shopify_store`, `shopify_install_tokens`, `shopify_webhook_event`, `product`/`product_variant` rows tied to that shop, and any `orders`/`order_line` rows.

**Files:**
- Create: `src/lib/shopify/gdpr.ts`
- Create: `src/app/api/shopify/webhooks/gdpr/customers-data-request/route.ts`
- Create: `src/app/api/shopify/webhooks/gdpr/customers-redact/route.ts`
- Create: `src/app/api/shopify/webhooks/gdpr/shop-redact/route.ts`
- Create: `supabase/patches/shopify_gdpr_audit.sql` (table: `shopify_gdpr_request` with `id`, `topic`, `shop_domain`, `payload_hash`, `received_at`, `processed_at`, `status`)
- Modify: `src/lib/shopify/client.ts` — add the three GDPR topics to `WEBHOOK_TOPICS_TO_REGISTER`

**Acceptance Criteria:**
- [ ] Each GDPR route handler reads raw body, verifies HMAC via existing `verifyShopifyWebhookHmac`, and returns 200 within Shopify's 5s deadline
- [ ] Each handler writes a row to `shopify_gdpr_request` with `status='received'` then processes async (or inline if fast)
- [ ] `customers/data_request` handler enqueues an email to the merchant's listed support email — for MVP, an email to the platform owner is acceptable, document this
- [ ] `customers/redact` handler nullifies `customer_email`, `customer_first_name`, `customer_last_name`, `shipping_address_*` on matching `orders` rows scoped to that shop
- [ ] `shop/redact` handler deletes all `shopify_store` + cascaded rows for that shop and writes `activity_log` entry
- [ ] Webhook registration on install includes all three GDPR topics
- [ ] Unit tests for each handler verify HMAC verification, duplicate-event short-circuit (reuse `shopify_webhook_event` table), and the side effects
- [ ] HMAC verification failure returns 401 (not 500) so Shopify stops retrying
- [ ] `supabase/patches/shopify_gdpr_audit.sql` runs cleanly on a fresh DB

---

## Task 2: App uninstall cleanup

**Goal:** When `app/uninstalled` fires, fully revoke the merchant's connection: delete access token, mark webhooks as gone, flip status. Leave the data in place until `shop/redact` fires 48h later — Shopify requires this separation.

**Files:**
- Create: `src/lib/shopify/uninstall.ts`
- Modify: `src/app/api/shopify/webhooks/route.ts` — call `handleAppUninstalled(shopDomain)` in the `app/uninstalled` branch

**Acceptance Criteria:**
- [ ] `handleAppUninstalled(shopDomain)` deletes the row in `shopify_install_tokens` for the shop
- [ ] Flips `shopify_store.status` to `uninstalled` (new status value alongside `connected`/`disconnected`)
- [ ] Writes `activity_log` entry `SHOPIFY_APP_UNINSTALLED` with `shop_domain` + `tenant_id`
- [ ] Does NOT delete `shopify_store` itself or any synced data — that waits for `shop/redact`
- [ ] Reinstalling the app for the same shop replaces the token cleanly (existing callback upsert path works because `shopify_install_tokens.onConflict = "shopify_store_id"`)
- [ ] Unit test covers reinstall-after-uninstall path
- [ ] `npx tsc --noEmit` passes

---

## Task 3: HTTPS validation + Shopify CLI config

**Goal:** Catch the silent-failure case where `NEXT_PUBLIC_APP_URL` is set to `http://...` and webhook registration fails opaquely. Add the Shopify CLI config file required for `shopify app deploy`.

**Files:**
- Modify: `src/lib/shopify/auth.ts` — assert `NEXT_PUBLIC_APP_URL` starts with `https://` at module load (throw clear error otherwise; allow `http://localhost` only when `NODE_ENV !== "production"`)
- Modify: `src/lib/shopify/client.ts` — same validation before constructing webhook callback URL
- Create: `shopify.app.toml` at repo root

**`shopify.app.toml` shape (draft):**
```toml
client_id = "<from Shopify Partners dashboard>"
name = "Manuva"
application_url = "https://app.manuva.app/"
embedded = true

[access_scopes]
scopes = "read_products,read_orders,read_locations"

[auth]
redirect_urls = [
  "https://app.manuva.app/api/shopify/callback"
]

[webhooks]
api_version = "2026-01"

[[webhooks.subscriptions]]
topics = ["customers/data_request"]
uri = "https://app.manuva.app/api/shopify/webhooks/gdpr/customers-data-request"

[[webhooks.subscriptions]]
topics = ["customers/redact"]
uri = "https://app.manuva.app/api/shopify/webhooks/gdpr/customers-redact"

[[webhooks.subscriptions]]
topics = ["shop/redact"]
uri = "https://app.manuva.app/api/shopify/webhooks/gdpr/shop-redact"

[app_proxy]
# none

[pos]
embedded = false

[build]
include_config_on_deploy = true
```

**Acceptance Criteria:**
- [ ] Production boot fails fast with a clear error if `NEXT_PUBLIC_APP_URL` is not HTTPS
- [ ] `shopify.app.toml` exists at repo root with all three GDPR webhooks declared
- [ ] `client_id` left as a placeholder + comment pointing to Shopify Partners dashboard
- [ ] README or this plan documents the `shopify app deploy` flow

---

## Task 4: Session token verification helper

**Goal:** Server-side helper that verifies a Shopify App Bridge JWT (session token), returns the shop domain, and rejects expired/invalid tokens. Required for the embedded surface.

**Spec:** https://shopify.dev/docs/apps/build/authentication-authorization/session-tokens

JWT specifics: HS256, signing key = Shopify API secret, `iss` = `https://<shop>/admin`, `dest` = `https://<shop>`, `aud` = Shopify API key, max `nbf` skew 5s.

**Files:**
- Create: `src/lib/shopify/session-token.ts`
- Verify `jose` is already in deps; if not, add it

**Acceptance Criteria:**
- [ ] `verifyShopifySessionToken(token: string): Promise<{ shop: string, dest: string, sub: string }>` resolves on valid tokens
- [ ] Rejects: bad signature, expired (`exp < now`), `aud !== SHOPIFY_API_KEY`, `iss`/`dest` mismatch on shop
- [ ] Allows 5s `nbf` clock skew
- [ ] Unit test with a known-good JWT fixture and several rejection cases
- [ ] `npx tsc --noEmit` passes

---

## Task 5: Embedded admin surface

**Goal:** A small, iframe-friendly page at `/shopify/embedded` that loads inside Shopify Admin via App Bridge, shows connection + sync status, lets the merchant trigger a manual sync, and links out to `app.manuva.app` for everything else. Must work in iframe with no Manuva header/nav chrome.

**Behavior:**
1. Merchant clicks the app in Shopify Admin nav → Shopify loads `https://app.manuva.app/shopify/embedded?shop=<shop>&host=<host>&...` in iframe
2. App Bridge initializes from `host` query param
3. Client requests a session token from App Bridge and POSTs it to `/api/shopify/embedded/session`
4. Server verifies token, looks up `shopify_store` by `shop`, checks if a tenant + Manuva subscription exists, returns status JSON
5. UI renders one of: "Not connected to Manuva yet" (with sign-up CTA), "Subscription required" (with upgrade CTA), or "Connected — last synced X ago" (with manual sync button + open-in-Manuva link)

**Files:**
- Create: `src/app/shopify/embedded/layout.tsx` — App Bridge CDN script tag, minimal CSS reset, no Manuva chrome
- Create: `src/app/shopify/embedded/page.tsx` — server component, reads `shop` + `host` from searchParams, validates basic shape
- Create: `src/app/shopify/embedded/embedded-client.tsx` — client component, App Bridge init, session token fetch, state machine
- Create: `src/app/shopify/embedded/embedded.module.css`
- Create: `src/app/api/shopify/embedded/session/route.ts`
- Modify: `next.config.ts` — `async headers()` returning CSP `frame-ancestors https://*.myshopify.com https://admin.shopify.com` and removing `X-Frame-Options` for `/shopify/embedded/:path*`

**Acceptance Criteria:**
- [ ] Page loads cleanly inside an iframe served from `admin.shopify.com` — verified manually with dev store
- [ ] App Bridge initializes from `host` param; missing/invalid `host` shows a "open from Shopify Admin" message
- [ ] Session token POST → `/api/shopify/embedded/session` returns `{ status, lastSyncedAt, manuvaSubscription }` JSON
- [ ] If shop is not in `shopify_store`, returns `status: "not-installed"` and the UI shows a "Reinstall" link to `/api/shopify/install?shop=<shop>`
- [ ] If shop exists but no tenant has an active Manuva subscription, shows "Subscription required" + link to `https://manuva.app/pricing`
- [ ] Manual sync button POSTs to existing `/api/shopify/sync` with the store ID and shows progress / completion state
- [ ] "Open Manuva" link opens a new tab to `https://app.manuva.app/app` (target=`_top` not used — App Bridge `Redirect` action with `REMOTE` mode)
- [ ] Embedded page has no Manuva header, no global nav, no marketing chrome — it's a single Polaris-like card
- [ ] Visual styling uses Manuva tokens (`--bg-card`, `--ink-strong`, etc.) but kept minimal
- [ ] `next.config.ts` headers verified via `curl -I` against the deployed embedded URL

---

## Task 6: App listing assets + copy

**Goal:** Produce everything the Partner Dashboard requires for submission: icon, screenshots, listing copy (with the pricing disclosure), support contact, demo store, privacy policy + terms URLs.

**Shopify requirements:**
- App icon: 1200×1200 PNG, transparent or solid bg
- Feature image: 1600×900 PNG
- Screenshots: minimum 3, max 6, 1600×900 PNG
- App listing copy: tagline (max 100 chars), benefits (3 bullets, each max 80 chars), description (200–2000 words)
- Privacy policy URL, terms of service URL, support email + URL
- Demo store credentials (dev store with the app installed and sample data)
- Pricing details — list as "Free to install. Manuva subscription required, plans from $X/month, billed separately at manuva.app/pricing"

**Files:**
- Create: `docs/shopify-app-listing/README.md` — all copy in markdown form for review
- Create: `docs/shopify-app-listing/assets/icon-brief.md` — design brief for the icon (since I can't produce a PNG)
- Create: `docs/shopify-app-listing/assets/screenshot-brief.md` — brief for the 4 screenshots (suggested: connect flow, sync status, BOM + production order tied to Shopify order, location mapping)
- Create: `docs/shopify-app-listing/dev-store-qa-checklist.md` — manual QA script

**Acceptance Criteria:**
- [ ] `README.md` contains: tagline, 3 benefit bullets, full description with explicit external-subscription disclosure, support email (`support@manuva.app` or owner's choice), privacy + terms URLs
- [ ] Description explicitly says "Free to install. A Manuva subscription is required to sync data, starting at $X/month — see manuva.app/pricing"
- [ ] Icon brief specifies dimensions, file format, colors from Manuva design system, and where to source the source SVG (`public/Manuva_svg.svg`)
- [ ] Screenshot brief lists 4 scenes with exact data conditions (e.g. "show 12 products synced, 1 production order in progress")
- [ ] QA checklist covers: install, GDPR webhook delivery (simulated via Shopify CLI), uninstall, reinstall, sync trigger from embedded surface
- [ ] User confirms support email + privacy/terms URLs before submission

---

## Task 7: Dev-store QA pass

**Goal:** End-to-end manual test against a fresh Shopify development store before clicking Submit. Catch the things automated tests miss.

**Files:**
- Use: `docs/shopify-app-listing/dev-store-qa-checklist.md` from Task 6

**Acceptance Criteria:**
- [ ] Fresh install from Partner Dashboard → callback succeeds → settings page shows "connected"
- [ ] All 3 GDPR webhooks return 200 when triggered via `shopify webhook trigger` CLI
- [ ] Manual sync from embedded surface completes and shows updated `last_synced_at`
- [ ] Uninstall from Shopify Admin → `app/uninstalled` webhook fires → token row deleted, status flipped, data retained
- [ ] Reinstall on same store works without manual cleanup
- [ ] Simulate `shop/redact` via Shopify CLI → all rows for that shop gone, `activity_log` entry written
- [ ] Embedded surface verified in real Shopify Admin iframe (not just direct URL)
- [ ] No console errors in browser when embedded surface loads
- [ ] HMAC failures (manually tampered request) return 401

---

## Task 8: Submission

**Goal:** Click Submit. This is operational, not code.

**Acceptance Criteria:**
- [ ] All assets uploaded to Partner Dashboard
- [ ] Demo store credentials filled in
- [ ] Privacy + terms URLs filled in
- [ ] App URL + redirect URLs match `shopify.app.toml`
- [ ] GDPR webhook URLs verified in Partner Dashboard match the deployed routes
- [ ] Submit clicked
- [ ] User notified, monitoring inbox for review feedback (typical turnaround: 5–10 business days)

---

## Out of scope (deferred to follow-up)

These remain open in `docs/_audit/02_shopify.md` and are NOT required for first submission. Listed here so reviewers don't see them as gaps in the plan:

- Shopify location → local `location` mapping
- `locations/update` webhook handler
- `refunds/create` webhook
- Order line price capture + `shopify_line_item_id` column
- Rate-limit / 429 backoff
- Per-webhook incremental handlers (replace "full resync on any webhook")
- OAuth scope drift re-consent flow
- `read_inventory` / `write_inventory` scopes (intentionally not requested per audit policy)
- Shopify Billing API (intentionally not used — app is free on Shopify)
