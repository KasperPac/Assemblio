# Shopify Status Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the broken feedback loop where Shopify OAuth, disconnect, and sync results redirect to `/app/settings` — which silently drops all `?shopify=` query params — and surface those results as a visible, dismissible banner on the integrations page.

**Architecture:** All API routes redirect to `/app/settings/integrations?shopify=<status>` directly. A new `StatusBanner` client component reads the `shopifyStatus` prop (passed from the server page component) and renders above the Shopify card with success/warning/error variants. Dismiss strips the param via `router.replace`. Status display is removed from `ShopifyConnect` and `ShopifyManage`.

**Tech Stack:** Next.js 15 App Router, CSS Modules, Manuva design tokens (`--ok`, `--warning`, `--danger`).

---

## File Map

**Modified:**
- `src/app/api/shopify/auth/route.ts` — fix 3 redirect targets
- `src/app/api/shopify/callback/route.ts` — fix all `/app/settings?shopify=` redirect targets
- `src/app/api/shopify/disconnect/route.ts` — fix `buildFailedUrl` + 3 redirect targets
- `src/app/api/shopify/sync/route.ts` — fix `returnTo` fallback default
- `src/app/app/settings/integrations/sync-submit-form.tsx` — pass `return_to` param
- `src/app/app/settings/integrations/shopify-manage.tsx` — remove `shopifyStatus`/`syncError` props
- `src/app/app/settings/integrations/shopify-connect.tsx` — remove status/notice rendering
- `src/app/app/settings/integrations/page.tsx` — render `StatusBanner` above card
- `src/app/app/settings/integrations/integrations.module.css` — add banner styles
- `src/app/shopify-connect/page.tsx` — fix `install-expired` redirect target

**Created:**
- `src/app/app/settings/integrations/status-banner.tsx` — dismissible banner component

---

## Task 0: Fix redirect targets across all API routes

**Goal:** All Shopify API routes redirect to `/app/settings/integrations?shopify=<status>` so the query param reaches the page that displays it.

**Files:**
- Modify: `src/app/api/shopify/auth/route.ts`
- Modify: `src/app/api/shopify/callback/route.ts`
- Modify: `src/app/api/shopify/disconnect/route.ts`
- Modify: `src/app/api/shopify/sync/route.ts`
- Modify: `src/app/shopify-connect/page.tsx`

**Acceptance Criteria:**
- [ ] `auth/route.ts`: all 3 `/app/settings?shopify=` redirects changed to `/app/settings/integrations?shopify=`
- [ ] `callback/route.ts`: all `/app/settings?shopify=` redirects changed to `/app/settings/integrations?shopify=`
- [ ] `disconnect/route.ts`: `buildFailedUrl` uses `/app/settings/integrations`; all other redirects fixed
- [ ] `sync/route.ts`: `returnTo ?? "/app/settings"` fallback changed to `returnTo ?? "/app/settings/integrations"`
- [ ] `shopify-connect/page.tsx`: `install-expired` redirect targets `/app/settings/integrations?shopify=install-expired`
- [ ] `npx tsc --noEmit` passes

**Verify:** `npx tsc --noEmit` → no errors. Grep confirms no remaining `"/app/settings?shopify=` strings in API routes.

**Steps:**

- [ ] **Step 1: Fix `auth/route.ts`**

Replace all 3 occurrences of `"/app/settings?shopify=` with `"/app/settings/integrations?shopify=`:

```typescript
// config-missing
return NextResponse.redirect(
  new URL("/app/settings/integrations?shopify=config-missing", request.url)
);

// invalid-shop
return NextResponse.redirect(
  new URL("/app/settings/integrations?shopify=invalid-shop", request.url)
);

// missing-tenant
return NextResponse.redirect(
  new URL("/app/settings/integrations?shopify=missing-tenant", request.url)
);
```

- [ ] **Step 2: Fix `callback/route.ts`**

Replace all occurrences of `"/app/settings?shopify=` with `"/app/settings/integrations?shopify=`. Also fix the shop-mismatch redirect which uses `new URL("/app/settings", request.url)` — change to `new URL("/app/settings/integrations", request.url)`.

- [ ] **Step 3: Fix `disconnect/route.ts`**

Change `buildFailedUrl` to use `/app/settings/integrations`:

```typescript
function buildFailedUrl(request: NextRequest, detail: string) {
  const failedUrl = new URL("/app/settings/integrations", request.url);
  failedUrl.searchParams.set("shopify", "disconnect-failed");
  failedUrl.searchParams.set("sync_error", detail.slice(0, 180));
  return failedUrl;
}
```

Replace remaining `"/app/settings?shopify=` occurrences with `"/app/settings/integrations?shopify=`.

- [ ] **Step 4: Fix `sync/route.ts`**

Change the `returnTo` fallback from `/app/settings` to `/app/settings/integrations` in all places:

```typescript
// Line ~25: tenant resolution failure
const dest = new URL(returnTo ?? "/app/settings/integrations", request.url);

// Line ~57: no store
const dest = new URL(returnTo ?? "/app/settings/integrations", request.url);

// Line ~71: no token
const dest = new URL(returnTo ?? "/app/settings/integrations", request.url);

// Line ~79: missing scopes
const dest = new URL(returnTo ?? "/app/settings/integrations", request.url);

// Line ~110: sync success
const successPath = returnTo
  ? `${returnTo}?shopify=sync-ok&products=${result.products}&orders=${result.orders}`
  : `/app/settings/integrations?shopify=sync-ok&products=${result.products}&orders=${result.orders}`;

// Line ~127: sync failure
const failedBase = returnTo ?? "/app/settings/integrations";
```

- [ ] **Step 5: Fix `shopify-connect/page.tsx`**

```typescript
redirect("/app/settings/integrations?shopify=install-expired");
```

- [ ] **Step 6: Verify**

```bash
npx tsc --noEmit
```

Expected: no errors.

```bash
grep -r '"/app/settings?shopify=' src/app/api/shopify/
```

Expected: no matches.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/shopify/ src/app/shopify-connect/page.tsx
git commit -m "fix(shopify): redirect to /app/settings/integrations to preserve shopify= params"
```

---

## Task 1: StatusBanner component and integrations page wiring

**Goal:** Create a dismissible `StatusBanner` component and render it above the Shopify card on the integrations page. Remove status display from `ShopifyConnect` and `ShopifyManage`.

**Files:**
- Create: `src/app/app/settings/integrations/status-banner.tsx`
- Modify: `src/app/app/settings/integrations/page.tsx`
- Modify: `src/app/app/settings/integrations/integrations.module.css`
- Modify: `src/app/app/settings/integrations/shopify-manage.tsx`
- Modify: `src/app/app/settings/integrations/shopify-connect.tsx`
- Modify: `src/app/app/settings/integrations/sync-submit-form.tsx`

**Acceptance Criteria:**
- [ ] Banner renders above the Shopify card when `?shopify=` is present
- [ ] Banner does not render when `?shopify=` is absent
- [ ] Success variant (green) for: `connected`, `disconnected`, `sync-ok`
- [ ] Warning variant (amber) for: `connected-webhooks-failed`
- [ ] Error variant (red) for all other values
- [ ] Dismiss button strips `?shopify=` and `?sync_error=` via `router.replace`
- [ ] `sync-ok` message shows product and order counts when `?products=` / `?orders=` params are present
- [ ] Status display removed from `ShopifyConnect` and `ShopifyManage`
- [ ] `SyncSubmitForm` posts to `/api/shopify/sync?return_to=/app/settings/integrations`
- [ ] `npx tsc --noEmit` passes

**Verify:** `npx tsc --noEmit` → no errors.

**Steps:**

- [ ] **Step 1: Create `status-banner.tsx`**

```typescript
"use client";

import { useRouter } from "next/navigation";
import styles from "./integrations.module.css";

type BannerVariant = "success" | "warning" | "error";

const SUCCESS_STATUSES = new Set(["connected", "disconnected", "sync-ok"]);
const WARNING_STATUSES = new Set(["connected-webhooks-failed"]);

function getVariant(status: string): BannerVariant {
  if (SUCCESS_STATUSES.has(status)) return "success";
  if (WARNING_STATUSES.has(status)) return "warning";
  return "error";
}

const STATUS_TEXT: Record<string, string> = {
  connected: "Shopify store connected successfully.",
  "connected-webhooks-failed":
    "Store connected, but webhook registration failed. Check app URL and try reconnecting.",
  "install-expired":
    "Install session expired. Start again from the Shopify App Store.",
  disconnected: "Shopify store disconnected.",
  "disconnect-failed": "Could not disconnect Shopify store. Try again.",
  "sync-ok": "Shopify sync completed.",
  "sync-failed": "Shopify sync failed. Check scopes and token validity.",
  "config-missing":
    "Shopify config missing. Set SHOPIFY_API_KEY, SHOPIFY_API_SECRET, and NEXT_PUBLIC_APP_URL.",
  "invalid-shop": "Invalid shop domain. Use your-store.myshopify.com.",
  "invalid-hmac": "Shopify callback failed HMAC validation.",
  "invalid-callback": "Missing callback fields from Shopify.",
  "state-missing": "OAuth state cookie missing. Start install again.",
  "state-invalid": "OAuth state could not be decoded.",
  "state-expired": "OAuth state expired. Start install again.",
  "state-nonce-mismatch":
    "OAuth state nonce mismatch. Complete install in the same tab you started it in.",
  "state-shop-mismatch":
    "OAuth shop mismatch. Use the same shop domain you entered in Settings.",
  "token-failed": "Could not exchange auth code for access token.",
  "store-save-failed": "Could not save Shopify store.",
  "token-save-failed": "Could not save Shopify access token.",
  "missing-tenant": "No workspace found for current user.",
  "no-store": "No active Shopify store connected for this workspace.",
  "no-token": "No Shopify access token found. Reconnect the store.",
  "tenant-mismatch": "Workspace mismatch during OAuth. Sign in and try again.",
  "tenant-store-conflict":
    "This Shopify store is already linked to a different Manuva account.",
};

type Props = {
  status: string;
  detail?: string;
  products?: string;
  orders?: string;
};

export default function StatusBanner({ status, detail, products, orders }: Props) {
  const router = useRouter();
  const variant = getVariant(status);

  let text = STATUS_TEXT[status] ?? status;
  if (status === "sync-ok" && (products || orders)) {
    const parts: string[] = [];
    if (products) parts.push(`${products} products`);
    if (orders) parts.push(`${orders} orders`);
    text = `Shopify sync completed — ${parts.join(", ")} synced.`;
  }
  if (detail && variant !== "success") {
    text = `${text} (${detail})`;
  }

  function dismiss() {
    const url = new URL(window.location.href);
    url.searchParams.delete("shopify");
    url.searchParams.delete("sync_error");
    url.searchParams.delete("products");
    url.searchParams.delete("orders");
    router.replace(url.pathname + (url.search || ""));
  }

  return (
    <div className={`${styles.banner} ${styles[`banner--${variant}`]}`} role="status">
      <span className={styles.bannerText}>{text}</span>
      <button
        type="button"
        className={styles.bannerDismiss}
        onClick={dismiss}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Add banner styles to `integrations.module.css`**

Append to the end of the file:

```css
/* status-banner.tsx */
.banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-sm);
  border: 1px solid;
  font-size: var(--fs-sm);
  line-height: var(--lh-normal);
}

.banner--success {
  color: var(--ok);
  border-color: color-mix(in srgb, var(--ok) 30%, transparent);
  background: color-mix(in srgb, var(--ok) 8%, transparent);
}

.banner--warning {
  color: var(--warning);
  border-color: color-mix(in srgb, var(--warning) 30%, transparent);
  background: color-mix(in srgb, var(--warning) 8%, transparent);
}

.banner--error {
  color: var(--danger);
  border-color: color-mix(in srgb, var(--danger) 30%, transparent);
  background: color-mix(in srgb, var(--danger) 8%, transparent);
}

.bannerText {
  flex: 1;
}

.bannerDismiss {
  flex-shrink: 0;
  background: none;
  border: none;
  font-size: 1.1rem;
  line-height: 1;
  cursor: pointer;
  color: inherit;
  opacity: 0.6;
  padding: 0 2px;
}

.bannerDismiss:hover {
  opacity: 1;
}
```

- [ ] **Step 3: Wire banner into `page.tsx`**

Add `StatusBanner` import and render it above `.grid` when `shopifyStatus` is present:

```typescript
import StatusBanner from "./status-banner";
```

Update the `Props` type to include `products` and `orders`:

```typescript
type Props = {
  searchParams?: Promise<{
    shopify?: string;
    sync_error?: string;
    products?: string;
    orders?: string;
  }>;
};
```

`searchParams` is already awaited once into `params` — just add `products` and `orders` to the existing destructure. Then in JSX, above `<div className={styles.grid}>`:

```tsx
{params.shopify && (
  <StatusBanner
    status={params.shopify}
    detail={params.sync_error}
    products={params.products}
    orders={params.orders}
  />
)}
```

- [ ] **Step 4: Remove status props from `ShopifyManage`**

Remove `shopifyStatus` and `syncError` from the `Props` type and component signature. Remove the props passed to `<ShopifyConnect />`. Remove `status` and `detail` props from `ShopifyConnect` call.

- [ ] **Step 5: Remove status/notice from `ShopifyConnect`**

Remove the `status?: string` and `detail?: string` props, the `statusText` map, and the `{status ? <p ...>}` block. The component only renders the connection form now.

- [ ] **Step 6: Update `sync-submit-form.tsx`**

Change the form action to include `return_to`:

```typescript
action="/api/shopify/sync?return_to=/app/settings/integrations"
```

- [ ] **Step 7: Update `page.tsx` call to `ShopifyManage`**

Remove `shopifyStatus` and `syncError` props from the `<ShopifyManage>` call.

- [ ] **Step 8: Verify**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add src/app/app/settings/integrations/
git commit -m "feat(integrations): add StatusBanner for Shopify OAuth/sync/disconnect feedback"
```
