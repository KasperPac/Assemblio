# Shopify Integration — Bridge App Design

**Date:** 2026-05-10
**Status:** Approved

## Overview

A thin bridge that handles Shopify OAuth installation, account linking, and webhook registration. It lives inside the existing Next.js monorepo with no separate service or deployment. The only goal of v1 is a clean install pipeline: merchant clicks install → Shopify OAuth → Manuva account linked (or created) → webhooks registered → merchant redirected to Shopify admin.

## Architecture

### New API routes (`src/app/api/shopify/`)

| Route | Method | Purpose |
|---|---|---|
| `/api/shopify/install` | GET | Entry point — validates shop, redirects to Shopify OAuth consent screen |
| `/api/shopify/callback` | GET | Receives auth code, exchanges for token, links account, registers webhooks |
| `/api/shopify/webhooks/[topic]` | POST | Receives Shopify webhook events |

### New UI page

`src/app/app/shopify-connect/page.tsx` — shown only when the installing merchant has no active Manuva session. Provides sign-in and sign-up (trial creation) flows, then completes the installation.

### New library (`src/lib/shopify/`)

- `client.ts` — Shopify API client initialisation using `@shopify/shopify-api`
- `account-linking.ts` — finds or creates a tenant from a `shop_domain`

### New dependency

`@shopify/shopify-api` — official Node SDK for HMAC verification, OAuth token exchange, and webhook registration.

### New Supabase table: `shopify_installation`

```sql
create table shopify_installation (
  id            uuid primary key default gen_random_uuid(),
  shop_domain   text not null unique,
  access_token  text,
  tenant_id     uuid references tenant(id),
  scopes        text,
  installed_at  timestamptz not null default now(),
  uninstalled_at timestamptz
);
```

RLS: accessible only by the owning tenant and service role.

## Install Flow

```
1. Merchant visits install URL:
   https://manuva.app/api/shopify/install?shop=mystore.myshopify.com

2. install/route.ts:
   - Validate shop param format (*.myshopify.com)
   - Generate random state nonce, store in a short-lived HttpOnly cookie
   - Build Shopify OAuth URL with required scopes
   - 302 redirect → Shopify consent screen

3. Merchant approves → Shopify redirects to:
   https://manuva.app/api/shopify/callback?shop=...&code=...&state=...&hmac=...

4. callback/route.ts — verify:
   - Verify HMAC using @shopify/shopify-api
   - Verify state matches cookie
   - Re-validate shop param

5. callback/route.ts — exchange:
   - POST to Shopify: exchange code → permanent access token
   - Upsert shopify_installation row (shop_domain, access_token, scopes, installed_at)

6. callback/route.ts — account linking:
   - If shopify_installation already has tenant_id → re-install, skip to step 8
   - If Manuva session cookie present → link to that tenant, skip to step 8
   - Otherwise → generate short-lived signed token (10-min TTL, encodes shop_domain),
     redirect to /app/shopify-connect?shop=...&token=...

7. /app/shopify-connect page:
   - Shows shop domain being linked
   - "Sign in" or "Start free trial" options
   - On success → server action writes tenant_id to shopify_installation,
     redirects back to complete step 8

8. Register mandatory webhooks (app/uninstalled) via Shopify REST Admin API
9. Redirect merchant → their Shopify admin (https://<shop>/admin)
```

### Scopes (v1)

`read_orders,write_orders`

Scope changes force a re-auth; Shopify automatically sends the merchant back through the install URL.

## Webhook Handler

`POST /api/shopify/webhooks/[topic]/route.ts`

1. Read raw body as `Buffer` before any JSON parsing
2. Verify `X-Shopify-Hmac-Sha256` header against `SHOPIFY_API_SECRET`
3. Return `200 OK` immediately (Shopify retries on anything else)
4. Route by topic:

| Topic | Action |
|---|---|
| `app/uninstalled` | Set `uninstalled_at = now()`, nullify `access_token` on the `shopify_installation` row |

Additional topics (`orders/create`, `orders/updated`, etc.) are added here as the integration expands.

## shopify-connect Page

Shown only when the installing merchant has no active Manuva session. Renders outside the main app shell (no sidebar/nav). Content:

- Headline: "Connect your Shopify store to Manuva"
- Shop domain displayed so the merchant knows which store they're linking
- **Sign in** tab — existing Manuva account
- **Start free trial** tab — creates a new tenant + user, then links

The `token` query param is a short-lived signed token (HMAC-SHA256, 10-min TTL) encoding `shop_domain`. This prevents someone from hitting the page directly and linking an arbitrary shop to their account. Token is verified server-side in the linking server action.

## Environment Variables

```
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
SHOPIFY_APP_URL=https://manuva.app
SHOPIFY_SCOPES=read_orders,write_orders
```

## Files Created

```
src/
  app/
    api/shopify/
      install/route.ts
      callback/route.ts
      webhooks/[topic]/route.ts
    app/shopify-connect/
      page.tsx
      actions.ts
      shopify-connect.module.css
  lib/shopify/
    client.ts
    account-linking.ts
supabase/migrations/XXXX_shopify_installation.sql
```

## Out of Scope (v1)

- Embedded app UI inside Shopify admin
- Order sync (webhook handlers register the topic but no sync logic yet)
- Billing / subscription management
- App Store listing (deploy as unlisted first; listing is a manual Shopify Partners process)
