# Shopify Status Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the Shopify status feedback loop — all API routes currently redirect to `/app/settings` which silently drops `?shopify=` params, and the integrations page never shows any feedback. Fix by correcting redirect targets and adding a visible, dismissible `StatusBanner` above the Shopify card.

**Architecture:** All Shopify API routes redirect to `/app/settings/integrations?shopify=<status>` directly. A new `StatusBanner` client component is rendered at the page level (above the card) with success/warning/error variants; dismiss strips the param via `router.replace`. Status rendering is removed from `ShopifyConnect` and `ShopifyManage` since it now lives at the page level.

**Tech Stack:** Next.js 15 App Router, CSS Modules, Manuva design tokens (`--ok`, `--warning`, `--danger`).

---

## File Map

**Modified:**
- `src/app/api/shopify/auth/route.ts` — 3 redirect targets
- `src/app/api/shopify/callback/route.ts` — all `/app/settings?shopify=` redirect targets
- `src/app/api/shopify/disconnect/route.ts` — `buildFailedUrl` helper + 3 standalone redirects
- `src/app/api/shopify/sync/route.ts` — 6 `returnTo` fallback occurrences
- `src/app/shopify-connect/page.tsx` — `install-expired` redirect
- `src/app/app/settings/integrations/page.tsx` — add `StatusBanner`, extend `Props` type
- `src/app/app/settings/integrations/shopify-manage.tsx` — remove `shopifyStatus`/`syncError` props
- `src/app/app/settings/integrations/shopify-connect.tsx` — remove `status`/`detail` props and notice block
- `src/app/app/settings/integrations/integrations.module.css` — add banner styles
- `src/app/app/settings/integrations/sync-submit-form.tsx` — pass `return_to` query param

**Created:**
- `src/app/app/settings/integrations/status-banner.tsx` — dismissible status banner (client component)

---

### Task 0: Fix redirect targets in all Shopify API routes

**Goal:** Every Shopify API route redirects to `/app/settings/integrations?shopify=<status>` so query params survive the settings page's internal redirect.

**Files:**
- Modify: `src/app/api/shopify/auth/route.ts`
- Modify: `src/app/api/shopify/callback/route.ts`
- Modify: `src/app/api/shopify/disconnect/route.ts`
- Modify: `src/app/api/shopify/sync/route.ts`
- Modify: `src/app/shopify-connect/page.tsx`

**Acceptance Criteria:**
- [ ] `auth/route.ts`: all 3 `/app/settings?shopify=` redirects point to `/app/settings/integrations?shopify=`
- [ ] `callback/route.ts`: all `/app/settings?shopify=` redirects and the shop-mismatch `new URL("/app/settings", ...)` point to `/app/settings/integrations`
- [ ] `disconnect/route.ts`: `buildFailedUrl` uses `/app/settings/integrations`; all other redirects fixed
- [ ] `sync/route.ts`: every `returnTo ?? "/app/settings"` fallback reads `returnTo ?? "/app/settings/integrations"`
- [ ] `shopify-connect/page.tsx`: `install-expired` redirects to `/app/settings/integrations?shopify=install-expired`
- [ ] `npx tsc --noEmit` passes with no errors
- [ ] `grep -r '"/app/settings?shopify=' src/app/api/shopify/` returns no matches

**Verify:** `npx tsc --noEmit` → no output. Grep returns empty.

**Steps:**

- [ ] **Step 1: Fix `auth/route.ts` — 3 redirects**

The current file has three `"/app/settings?shopify=` strings. Change all three:

```typescript
// was: new URL("/app/settings?shopify=config-missing", request.url)
return NextResponse.redirect(
  new URL("/app/settings/integrations?shopify=config-missing", request.url)
);

// was: new URL("/app/settings?shopify=invalid-shop", request.url)
return NextResponse.redirect(
  new URL("/app/settings/integrations?shopify=invalid-shop", request.url)
);

// was: new URL("/app/settings?shopify=missing-tenant", request.url)
return NextResponse.redirect(
  new URL("/app/settings/integrations?shopify=missing-tenant", request.url)
);
```

- [ ] **Step 2: Fix `callback/route.ts` — settings redirects + shop-mismatch URL**

Two types of change needed:

1. Replace every `"/app/settings?shopify=` string with `"/app/settings/integrations?shopify=`.

2. Fix the shop-mismatch block that builds a URL differently. Find:
```typescript
const mismatchUrl = new URL("/app/settings", request.url);
mismatchUrl.searchParams.set("shopify", "state-shop-mismatch");
```
Change to:
```typescript
const mismatchUrl = new URL("/app/settings/integrations", request.url);
mismatchUrl.searchParams.set("shopify", "state-shop-mismatch");
```

Also fix the login redirect that currently hardcodes `/app/settings` as the redirect-after-login target:
```typescript
// was: new URL("/login?redirect=/app/settings", request.url)
new URL("/login?redirect=/app/settings/integrations", request.url)
```

- [ ] **Step 3: Fix `disconnect/route.ts` — `buildFailedUrl` helper and standalone redirects**

Replace `buildFailedUrl`:
```typescript
function buildFailedUrl(request: NextRequest, detail: string) {
  const failedUrl = new URL("/app/settings/integrations", request.url);
  failedUrl.searchParams.set("shopify", "disconnect-failed");
  failedUrl.searchParams.set("sync_error", detail.slice(0, 180));
  return failedUrl;
}
```

Replace all remaining `"/app/settings?shopify=` occurrences in the file:
```typescript
// missing-tenant
new URL("/app/settings/integrations?shopify=missing-tenant", request.url)

// no-store
new URL("/app/settings/integrations?shopify=no-store", request.url)

// disconnected (two occurrences)
new URL("/app/settings/integrations?shopify=disconnected", request.url)
```

Also fix the login redirect:
```typescript
// was: new URL("/login?redirect=/app/settings", request.url)
new URL("/login?redirect=/app/settings/integrations", request.url)
```

- [ ] **Step 4: Fix `sync/route.ts` — 6 `returnTo` fallback occurrences**

Find every `returnTo ?? "/app/settings"` or `returnTo ?? "/app/settings"` string and replace the fallback:

```typescript
// tenant resolution failure (~line 25)
const dest = new URL(returnTo ?? "/app/settings/integrations", request.url);

// no store (~line 57)
const dest = new URL(returnTo ?? "/app/settings/integrations", request.url);

// no token (~line 71)
const dest = new URL(returnTo ?? "/app/settings/integrations", request.url);

// missing scopes (~line 79)
const dest = new URL(returnTo ?? "/app/settings/integrations", request.url);

// sync success (~line 110–112)
const successPath = returnTo
  ? `${returnTo}?shopify=sync-ok&products=${result.products}&orders=${result.orders}`
  : `/app/settings/integrations?shopify=sync-ok&products=${result.products}&orders=${result.orders}`;

// sync failure (~line 127)
const failedBase = returnTo ?? "/app/settings/integrations";
```

Also fix the login redirect:
```typescript
// was: new URL("/login?redirect=/app/settings", request.url)
new URL("/login?redirect=/app/settings/integrations", request.url)
```

- [ ] **Step 5: Fix `shopify-connect/page.tsx`**

```typescript
// was: redirect("/app/settings?shopify=install-expired");
redirect("/app/settings/integrations?shopify=install-expired");
```

- [ ] **Step 6: Verify**

```bash
npx tsc --noEmit
```
Expected: no output (no errors).

```bash
grep -rn '"/app/settings?shopify=' src/app/api/shopify/ src/app/shopify-connect/
```
Expected: no matches.

- [ ] **Step 7: Commit**

```bash
git add src/app/api/shopify/ src/app/shopify-connect/page.tsx
git commit -m "fix(shopify): redirect to /app/settings/integrations to preserve shopify= params"
```

---

### Task 1: StatusBanner component and integrations page wiring

**Goal:** Add a dismissible `StatusBanner` above the Shopify card on the integrations page, remove the old inline status from `ShopifyConnect`/`ShopifyManage`, and pass `return_to` from the sync form.

**Files:**
- Create: `src/app/app/settings/integrations/status-banner.tsx`
- Modify: `src/app/app/settings/integrations/integrations.module.css`
- Modify: `src/app/app/settings/integrations/page.tsx`
- Modify: `src/app/app/settings/integrations/shopify-manage.tsx`
- Modify: `src/app/app/settings/integrations/shopify-connect.tsx`
- Modify: `src/app/app/settings/integrations/sync-submit-form.tsx`

**Acceptance Criteria:**
- [ ] Banner renders above the Shopify card when `?shopify=` is present
- [ ] Banner does not render when `?shopify=` is absent
- [ ] `connected`, `disconnected`, `sync-ok` → success (green) variant
- [ ] `connected-webhooks-failed` → warning (amber) variant
- [ ] All other values → error (red) variant
- [ ] Dismiss button removes `?shopify=`, `?sync_error=`, `?products=`, `?orders=` from URL via `router.replace`
- [ ] `sync-ok` message appends product/order counts when those params are present
- [ ] `status`/`detail`/`statusText` removed from `ShopifyConnect`; `shopifyStatus`/`syncError` removed from `ShopifyManage`
- [ ] `SyncSubmitForm` action includes `?return_to=/app/settings/integrations`
- [ ] `npx tsc --noEmit` passes

**Verify:** `npx tsc --noEmit` → no output.

**Steps:**

- [ ] **Step 1: Create `status-banner.tsx`**

Create `src/app/app/settings/integrations/status-banner.tsx` with this exact content:

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
  "install-expired": "Install session expired. Start again from the Shopify App Store.",
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

  const variantClass =
    variant === "success"
      ? styles["banner--success"]
      : variant === "warning"
      ? styles["banner--warning"]
      : styles["banner--error"];

  return (
    <div className={`${styles.banner} ${variantClass}`} role="status">
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

Note: the variant class uses explicit ternary rather than a template-literal key (`styles[\`banner--${variant}\`]`) to satisfy TypeScript's CSS module type checking.

- [ ] **Step 2: Add banner styles to `integrations.module.css`**

Append to the end of `src/app/app/settings/integrations/integrations.module.css`:

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
  margin-top: var(--space-6);
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

- [ ] **Step 3: Update `page.tsx` — add `StatusBanner`, extend `Props`**

Current `page.tsx` starts with:
```typescript
type Props = {
  searchParams?: Promise<{
    shopify?: string;
    sync_error?: string;
  }>;
};
```

Change to:
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

Add the import at the top of the file (after the existing imports):
```typescript
import StatusBanner from "./status-banner";
```

`params` is already destructured from `searchParams` — it now automatically includes `products` and `orders` since the type is extended.

In the JSX return, add the banner between `<PageHeader ... />` and `<div className={styles.grid}>`:

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

Remove the `shopifyStatus` and `syncError` props from the `<ShopifyManage>` call — it now looks like:
```tsx
<ShopifyManage stores={stores ?? []} />
```

- [ ] **Step 4: Remove `shopifyStatus`/`syncError` from `ShopifyManage`**

In `src/app/app/settings/integrations/shopify-manage.tsx`, the current `Props` type is:
```typescript
type Props = {
  stores: Store[];
  shopifyStatus?: string;
  syncError?: string;
};
```

Change to:
```typescript
type Props = {
  stores: Store[];
};
```

Remove `shopifyStatus` and `syncError` from the component parameters. Remove the line passing them to `<ShopifyConnect>`:
```typescript
// Remove this:
<ShopifyConnect status={shopifyStatus} detail={syncError} />
// Replace with:
<ShopifyConnect />
```

- [ ] **Step 5: Remove status display from `ShopifyConnect`**

In `src/app/app/settings/integrations/shopify-connect.tsx`:

1. Remove the `Props` type entirely (it only held `status` and `detail`).
2. Remove the `statusText` record constant.
3. Change the component signature from `export default function ShopifyConnect({ status, detail }: Props)` to `export default function ShopifyConnect()`.
4. Remove the `{status ? <p className={styles.notice}>...</p> : null}` block.

The component keeps its `useState` for the shop input and the connection form — only the status-display logic is removed.

Also remove the `.notice` CSS class from `integrations.module.css` (it is no longer used):
```css
/* Delete this block: */
.notice {
  margin: 0;
  font-size: var(--fs-sm);
  color: var(--ok);
  line-height: var(--lh-normal);
}
```

- [ ] **Step 6: Update `sync-submit-form.tsx` — pass `return_to`**

In `src/app/app/settings/integrations/sync-submit-form.tsx`, change the form action:

```typescript
// was:
action="/api/shopify/sync"
// change to:
action="/api/shopify/sync?return_to=/app/settings/integrations"
```

- [ ] **Step 7: Verify**

```bash
npx tsc --noEmit
```
Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add src/app/app/settings/integrations/
git commit -m "feat(integrations): add StatusBanner for Shopify OAuth/sync/disconnect feedback"
```
