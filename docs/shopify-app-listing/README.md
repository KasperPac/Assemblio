# Manuva — Shopify App Store Listing

All copy and metadata for the Partner Dashboard listing. Review and edit before submission.

---

## App identity

| Field            | Value                                                                  |
| ---------------- | ---------------------------------------------------------------------- |
| **App name**     | Manuva                                                                 |
| **Tagline**      | Manufacturing operations for Shopify brands                             |
| **App URL**      | `https://app.manuva.app/`                                              |
| **App handle**   | `manuva`                                                               |
| **Categories**   | Operations &rarr; Inventory management, Operations &rarr; Manufacturing |
| **Languages**    | English (en)                                                           |

---

## Pricing — IMPORTANT for review

> **Free to install.** Manuva is a standalone manufacturing-operations SaaS that connects to your Shopify store as a read-only integration. Every new Manuva workspace starts with a **free 30-day trial** with full access; after that a Manuva subscription (from **USD $99/month** when billed annually) is required to keep syncing products and orders. Subscriptions are managed at [manuva.app/pricing](https://manuva.app/pricing) and billed independently of your Shopify invoice.

In the Partner Dashboard, list the pricing as:

- **Type:** Free
- **Description:** "Free to install. Includes a free 30-day trial of Manuva; after that a Manuva subscription is required to sync products and orders, from USD $99/month (billed annually). Plans and billing are managed at manuva.app/pricing — Manuva does not charge merchants through Shopify."

This pattern is the standard "connector SaaS" model used by Shopify apps like HubSpot, ShipStation, and Zoho. Disclosure is in the description, app surface, and on the embedded page itself.

---

## Listing description

### Short pitch (used as the tagline / search snippet — keep under 100 chars)

> Manufacturing operations for Shopify brands: BOMs, production orders, multi-location inventory, and stock allocation.

### Key benefits (3 bullets, each under 80 chars)

1. Build BOMs and route Shopify orders through production with one click.
2. Multi-location inventory, automatic reorder points, supplier purchasing.
3. Read-only Shopify sync — Manuva never edits your catalog or stock levels.

### Long description (used on the listing page — aim for 300-600 words)

> **Manuva turns Shopify orders into production work.**
>
> If you make what you sell — whether you're a small candle brand, a furniture maker, or a 40-person factory — Manuva fills the gap between your Shopify store and your shop floor.
>
> **What Manuva does**
>
> - **Sync products and orders from Shopify** — Manuva pulls your full product catalog and incoming orders into a manufacturing-aware workspace. Read-only access only: Manuva never writes to your Shopify inventory or catalog.
> - **Build BOMs (Bill of Materials)** — Define which components go into each product variant, with quantities, suppliers, and per-unit costs. Roll-up costing tells you what each variant actually costs to make.
> - **Production orders from Shopify orders** — Convert any synced Shopify order into a production order. Manuva allocates components against on-hand inventory, surfaces shortages, and tracks WIP through your stages.
> - **Multi-location inventory** — Track on-hand, reserved, and in-production quantities across multiple warehouses or bin locations.
> - **Purchasing and goods-inwards** — Create POs from low-stock signals, receive deliveries against POs, reconcile variances.
> - **Stocktakes that don't lock the system** — Run cycle counts or full stocktakes with mobile-friendly count screens.
>
> **What Manuva doesn't do**
>
> Manuva is designed to live alongside Shopify, not replace any of its features. Specifically:
> - Manuva never writes inventory or product changes back to Shopify.
> - Manuva does not handle Shopify checkout, payments, shipping labels, or customer messaging.
> - Manuva does not require any changes to your storefront, theme, or checkout flow.
>
> **Who Manuva is for**
>
> - Brands manufacturing or assembling their own products
> - Operations leads who currently track BOMs in spreadsheets
> - Teams running 2-50 SKUs with components, sub-assemblies, or batching
>
> **Pricing**
>
> Free to install. Syncing requires a Manuva subscription starting at **USD $99/month** (billed annually). Free 30-day trial. Plans and billing live at manuva.app/pricing. Manuva does not charge merchants through Shopify.
>
> **Privacy and compliance**
>
> Manuva is GDPR-compliant. Customer data is only retained as part of synced order records. Mandatory privacy webhooks (`customers/data_request`, `customers/redact`, `shop/redact`) are implemented per Shopify policy. Read [our privacy policy](https://manuva.app/privacy).
>
> **Support**
>
> Email: `hello@manuva.app` — typical response within one business day. Or reach the team via the contact form at [manuva.app/about#contact](https://manuva.app/about#contact).

---

## Required URLs

| Field                  | URL                                       | Status                                |
| ---------------------- | ----------------------------------------- | ------------------------------------- |
| **App URL**            | https://app.manuva.app/                   | Confirmed                             |
| **Install URL**        | https://app.manuva.app/api/shopify/install | Confirmed                             |
| **Embedded URL**       | https://app.manuva.app/shopify/embedded   | Confirmed (Task 5)                    |
| **Privacy policy**     | https://manuva.app/privacy                | Confirmed live                         |
| **Terms of service**   | https://manuva.app/terms                  | Confirmed live                         |
| **Support email**      | hello@manuva.app                          | Confirmed in the `/about#contact` block |
| **Support URL**        | https://manuva.app/about#contact          | Anchor on /about; no standalone page. NOT `/#contact` — the homepage has no `id="contact"`, that section moved to /about. |

Action items before submission:

- [ ] Confirm `hello@manuva.app` is monitored within one business day (already advertised on site)
- [ ] Decide whether to point the Partner Dashboard "Support URL" at the `/about#contact` anchor or skip the URL field and use email-only (Shopify accepts either)

---

## Required webhook URLs

These are declared in `shopify.app.toml` at the repo root and registered automatically on install.

| Topic                      | URL                                                                              |
| -------------------------- | -------------------------------------------------------------------------------- |
| `customers/data_request`   | https://app.manuva.app/api/shopify/webhooks/gdpr/customers-data-request          |
| `customers/redact`         | https://app.manuva.app/api/shopify/webhooks/gdpr/customers-redact                |
| `shop/redact`              | https://app.manuva.app/api/shopify/webhooks/gdpr/shop-redact                     |
| `app/uninstalled`          | https://app.manuva.app/api/shopify/webhooks                                      |
| `orders/*`, `products/*`   | https://app.manuva.app/api/shopify/webhooks                                      |

---

## Demo store credentials

Required for app review. Reviewer logs in to your demo Shopify dev store with the app installed and exercises the integration.

| Field             | Value                                                        |
| ----------------- | ------------------------------------------------------------ |
| Demo store URL    | `https://manuvatraining.myshopify.com`                        |
| Manuva login      | `reviewer@manuva.app`                                         |
| Manuva password   | _(set at signup — paste into the Partner Dashboard, not here)_ |
| Manuva tenant     | **Shopify Review** — store connected, catalogue + orders synced |

### App testing information — paste this into the Partner Dashboard

> **Important — read before installing.** Manuva is a standalone manufacturing-operations
> SaaS (like ShipStation or HubSpot); the Shopify app is a read-only connector to an
> existing Manuva workspace. Installing from the App Store alone will show
> "This Shopify store isn't connected to a Manuva account yet" — that is expected, not a
> failure. A store is linked from inside Manuva, not from Shopify.
>
> **The demo store below is already installed and linked, so you can skip straight to
> testing:**
>
> 1. In the dev store's admin, open **Apps → Manuva**. The embedded panel shows the
>    connected store, the last sync time and status.
> 2. Click **Sync now** — the status timestamp advances within a couple of seconds.
> 3. Click **Open Manuva** — a new tab opens the full workspace at `app.manuva.app/app`.
>    Sign in with the credentials above if prompted.
> 4. In Manuva, **Products** shows the store's catalogue and **Orders** shows the synced
>    orders, each with its Shopify order number.
>
> **If you want to verify the connect flow yourself on a different store:** sign in to
> `app.manuva.app` first, then go to **Settings → Integrations → Shopify → Manage**, enter
> the store domain and click Connect. That is the OAuth path merchants use.
>
> **Scopes.** `read_products` and `read_orders` only. Manuva never writes to Shopify, and
> does not request protected customer data — synced orders deliberately store no customer
> name or email.

**Verified 2026-09-22** — the Shopify Review tenant holds 33 products / 74 variants,
3 orders (1 open), 32 components with inventory balances, 48 active BOMs, 3 locations
and 5 suppliers. Reviewer sign-in confirmed: lands in Shopify Review with Products and
Orders populated.

The demo store should have:
- At least 12 products with variants
- At least 1 paid order in the last 30 days
- Manuva installed via OAuth (not test install)
- The matching Manuva tenant should have at least 1 BOM, 1 location, 1 production order in progress
- A note in the listing reviewer's checklist saying "click 'Open Manuva' from the embedded surface for full functionality"

---

## Scopes requested

Read-only by design. Declared in `shopify.app.toml`.

- `read_products` — sync product catalog into Manuva
- `read_orders` — sync orders into Manuva for production planning

**No write scopes.** Manuva never modifies your Shopify catalog, inventory, or order state.

---

## Asset checklist

Visual assets to produce before submission. Briefs are in `assets/`:

- [ ] App icon (1200×1200 PNG) — see `assets/icon-brief.md`
- [ ] Feature image (1600×900 PNG) — see `assets/icon-brief.md`
- [ ] Screenshots (3-6, each 1600×900 PNG) — see `assets/screenshot-brief.md`
- [ ] Optional demo video (60-120s) — flagged in `assets/screenshot-brief.md`

---

## Submission checklist

Before clicking submit in Partner Dashboard:

- [ ] `shopify.app.toml` deployed via `shopify app deploy` with real `client_id`
- [ ] Decide support URL (`/about#contact` anchor) vs email-only in Partner Dashboard
- [ ] Demo store credentials filled in
- [ ] All visual assets uploaded
- [ ] `hello@manuva.app` monitored
- [ ] `supabase/patches/shopify_gdpr_audit.sql` applied to production database
- [ ] GDPR webhook URLs return 200 when triggered via `shopify webhook trigger`
- [ ] `dev-store-qa-checklist.md` walked through end-to-end with no failures
