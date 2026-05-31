# Products Critical Fixes — Design Spec
> 2026-06-01 · Fixes A1, A2, B1 from `docs/review/product/products-review.md`

---

## Scope

Three critical findings from the pre-launch products review:

| ID | Finding | Severity |
|----|---------|----------|
| A1 | "Last sync" label uses `created_at`, never updates after initial import | 🔴 Critical |
| A2 | `{{customer_first_name}}` hardcoded empty string in notification engine — silently sends blank names | 🔴 Critical |
| B1 | Products list page has no `<h1>` heading — screen readers find no heading landmark | 🔴 Critical |

---

## A1 — Add `last_synced_at` to `product`

### Problem
`src/app/app/products/[productId]/page.tsx` line 310 sets `const lastSync = product.created_at`. The header description reads "Last sync X ago" but `created_at` never changes after the initial Shopify import. The label is permanently wrong for any re-synced product.

### Solution

**1. Migration patch** — `supabase/patches/product_last_synced_at.sql`
```sql
ALTER TABLE public.product ADD COLUMN last_synced_at timestamptz;
```
No backfill needed — existing rows will have `null`, which is handled by the fallback below.

**2. Sync update** — `src/lib/shopify/sync.ts`, `upsertProducts()`
Add `last_synced_at: new Date().toISOString()` to each row in the `sourcedRows` map. Postgres upsert with `onConflict: "tenant_id,shopify_id"` will update this field on every re-sync; `created_at` remains unchanged.

**3. Product detail page** — `src/app/app/products/[productId]/page.tsx`
- Add `last_synced_at: string | null` to the `ProductRecord` type
- Add `last_synced_at` to the `.select()` call
- Replace `const lastSync = product.created_at` with:
  ```ts
  const lastSync = product.last_synced_at ?? product.created_at;
  const syncLabel = product.last_synced_at ? "Last sync" : "Added";
  ```
- Update the `PageHeader` description to use `syncLabel` instead of the hardcoded "Last sync" string, so manually-created products show "Added X ago" rather than a misleading sync timestamp.

---

## A2 — Populate `customer_first_name` end-to-end

### Problem
The notification engine (`src/lib/notifications/notification-engine.ts` line 79) has `customer_first_name: ""` hardcoded. The notifications UI shows `{{customer_first_name}}` in the placeholder example. Any template using this variable silently sends blank names with no warning to the user.

Additionally, `customer_email` is also missing from the sync — the column exists in the `orders` schema but `orderRows` never populates it. Both gaps are fixed together.

### Solution

**1. Migration patch** — `supabase/patches/orders_customer_name.sql`
```sql
ALTER TABLE public.orders ADD COLUMN customer_first_name text;
```

**2. Shopify GraphQL query** — `src/lib/shopify/sync.ts`, `fetchOrders()`
Extend the orders query to fetch customer fields:
```graphql
nodes {
  id
  name
  cancelledAt
  displayFulfillmentStatus
  customer { firstName email }
  lineItems(first: 100) { ... }
}
```
Update `ShopifyOrderNode` type:
```ts
customer: { firstName: string | null; email: string | null } | null;
```

**3. Order upsert** — `orderRows` mapping in `syncShopifyStoreData()`
```ts
customer_email: order.customer?.email?.toLowerCase() ?? null,
customer_first_name: order.customer?.firstName ?? null,
```

**4. GDPR redact handler** — `src/lib/shopify/gdpr.ts`, `handleCustomersRedact()`
`customer_first_name` is PII. Extend the `.update()` call that currently nulls `customer_email` to also null `customer_first_name`:
```ts
.update({ customer_email: null, customer_first_name: null })
```
Also extend `handleCustomersDataRequest()` comment to note that `customer_first_name` is now a stored PII field.

**5. Notification engine** — `src/lib/notifications/notification-engine.ts`
The existing select already joins through `order_line_id → orders`. Extend the select to include `customer_first_name`:
```ts
orders:order_id ( id, order_number, customer_email, customer_first_name )
```
Replace hardcoded empty string:
```ts
customer_first_name: order?.customer_first_name ?? "",
```

---

## B1 — `<h1>` on products list page

### Problem
`src/app/app/products/page.tsx` renders a `<p>` tag for the product count and an import button — no `<h1>`. The CSS file has a `.header h1` rule that is never triggered. Screen readers navigate to this page with no heading landmark.

### Solution

**`src/app/app/products/page.tsx`**

Import `PageHeader` (already used on the product detail page, same `@/app/app/_ui/page-header` path).

Replace the custom `<div className={styles.header}>` block:
```tsx
<PageHeader
  title="Products"
  description={`${filteredProducts.length} of ${products.length} products`}
  actions={
    <form method="post" action="/api/shopify/sync">
      <button type="submit" className={styles.importButton}>
        Import Products
      </button>
    </form>
  }
/>
```

The `PageHeader` component renders `title` as an `<h1>` (confirmed in `src/app/app/_ui/page-header.tsx`). The unused `.header` CSS block can be left in place — it causes no harm and can be cleaned up separately.

---

## Files changed

| File | Change |
|------|--------|
| `supabase/patches/product_last_synced_at.sql` | New — adds `last_synced_at` column |
| `supabase/patches/orders_customer_name.sql` | New — adds `customer_first_name` column |
| `src/lib/shopify/sync.ts` | Add `last_synced_at` to product upsert; add `customer { firstName email }` to order query + type; populate `customer_email` + `customer_first_name` in order rows |
| `src/app/app/products/[productId]/page.tsx` | Add `last_synced_at` to type + query; update `lastSync`/`syncLabel` logic |
| `src/lib/notifications/notification-engine.ts` | Add `customer_first_name` to select; replace hardcoded `""` |
| `src/lib/shopify/gdpr.ts` | Null `customer_first_name` in redact handler |
| `src/app/app/products/page.tsx` | Import + use `PageHeader` with `title`, `description`, `actions` |

---

## Out of scope

- A3–A5, B2–B6, C1–C6, D1–D5 from the products review (separate work items)
- Backfilling `last_synced_at` for existing rows (null falls back to "Added" label gracefully)
- Backfilling `customer_first_name` for existing orders (null falls back to empty string in templates, same as today)
