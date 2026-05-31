# Products Critical Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three critical pre-launch bugs in the Products feature: wrong "Last sync" timestamp (A1), `{{customer_first_name}}` always empty in notification emails (A2), and missing `<h1>` on the products list page (B1).

**Architecture:** Two DB patch files add the required columns; the Shopify sync populates them; the GDPR redact handler is extended to scrub the new PII field; the notification engine and product detail page are wired up to use the new data; the products list page replaces its custom header with the shared `PageHeader` component.

**Tech Stack:** Next.js 15 App Router, Supabase Postgres, TypeScript, Vitest

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/patches/product_last_synced_at.sql` | Create | DDL: add `last_synced_at` to `product` |
| `supabase/patches/orders_customer_name.sql` | Create | DDL: add `customer_first_name` to `orders` |
| `src/lib/shopify/sync.ts` | Modify | Populate `last_synced_at` on product upsert; add customer fields to order GraphQL query + row mapping |
| `src/lib/shopify/gdpr.ts` | Modify | Null `customer_first_name` alongside `customer_email` in redact handler |
| `src/lib/shopify/gdpr.test.ts` | Modify | Seed `customer_first_name`; assert it is nulled after redact |
| `src/lib/notifications/notification-engine.ts` | Modify | Add `customer_first_name` to Supabase select; replace hardcoded `""` |
| `src/app/app/products/[productId]/page.tsx` | Modify | Add `last_synced_at` to type + query; use correct label in header |
| `src/app/app/products/page.tsx` | Modify | Replace custom header `<div>` with `<PageHeader title="Products" …>` |

---

## Task 1: DB patches — add `last_synced_at` and `customer_first_name`

**Files:**
- Create: `supabase/patches/product_last_synced_at.sql`
- Create: `supabase/patches/orders_customer_name.sql`

- [ ] **Step 1: Create the product patch**

  `supabase/patches/product_last_synced_at.sql`:
  ```sql
  -- A1 fix: track when a product was last synced from Shopify.
  -- Nullable so manually-created products are unaffected.
  ALTER TABLE public.product ADD COLUMN last_synced_at timestamptz;
  ```

- [ ] **Step 2: Create the orders patch**

  `supabase/patches/orders_customer_name.sql`:
  ```sql
  -- A2 fix: store customer first name for use in notification templates.
  -- Nullable; populated on next sync. Scrubbed by customers/redact GDPR handler.
  ALTER TABLE public.orders ADD COLUMN customer_first_name text;
  ```

- [ ] **Step 3: Apply both patches to the database**

  Run each file against your Supabase project. Via the Supabase dashboard: open the SQL editor, paste each file's contents, and run. Via the CLI (if configured):
  ```bash
  supabase db push
  ```
  Verify the columns exist:
  ```sql
  SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_name IN ('product', 'orders')
    AND column_name IN ('last_synced_at', 'customer_first_name')
  ORDER BY table_name, column_name;
  ```
  Expected: two rows — `orders.customer_first_name` (text, YES) and `product.last_synced_at` (timestamp with time zone, YES).

- [ ] **Step 4: Commit**

  ```bash
  git add supabase/patches/product_last_synced_at.sql supabase/patches/orders_customer_name.sql
  git commit -m "feat(db): add product.last_synced_at and orders.customer_first_name columns"
  ```

---

## Task 2: Sync — populate `last_synced_at` on product upsert

**Files:**
- Modify: `src/lib/shopify/sync.ts` (the `upsertProducts` function, lines 60–75)

- [ ] **Step 1: Update `upsertProducts` to stamp `last_synced_at`**

  In `src/lib/shopify/sync.ts`, find the `upsertProducts` function. Replace the `sourcedRows` mapping so every row carries the current timestamp:

  **Before:**
  ```typescript
  async function upsertProducts(
    admin: ReturnType<typeof createSupabaseAdminClient>,
    rows: Array<{
      tenant_id: string;
      shopify_id: string;
      title: string;
      description: string;
      image_url: string | null;
    }>
  ) {
    const sourcedRows = rows.map((row) => ({ ...row, source: "shopify" as const }));
    const { error } = await admin
      .from("product")
      .upsert(sourcedRows, { onConflict: "tenant_id,shopify_id" });
    assertNoError(error, "Failed to upsert product");
  }
  ```

  **After:**
  ```typescript
  async function upsertProducts(
    admin: ReturnType<typeof createSupabaseAdminClient>,
    rows: Array<{
      tenant_id: string;
      shopify_id: string;
      title: string;
      description: string;
      image_url: string | null;
    }>
  ) {
    const now = new Date().toISOString();
    const sourcedRows = rows.map((row) => ({
      ...row,
      source: "shopify" as const,
      last_synced_at: now,
    }));
    const { error } = await admin
      .from("product")
      .upsert(sourcedRows, { onConflict: "tenant_id,shopify_id" });
    assertNoError(error, "Failed to upsert product");
  }
  ```

  Using the same timestamp for all rows in one sync run keeps them consistent and avoids N `new Date()` calls.

- [ ] **Step 2: Type-check**

  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors. If TypeScript complains that `last_synced_at` is not in the Supabase generated types, the column may not be reflected yet — this is fine; the upsert still works at runtime. Proceed.

- [ ] **Step 3: Commit**

  ```bash
  git add src/lib/shopify/sync.ts
  git commit -m "feat(sync): stamp last_synced_at on every Shopify product upsert"
  ```

---

## Task 3: Sync — fetch customer name + email for orders

**Files:**
- Modify: `src/lib/shopify/sync.ts` (`ShopifyOrderNode` type, `fetchOrders` query, `orderRows` mapping)

- [ ] **Step 1: Extend `ShopifyOrderNode` type**

  In `src/lib/shopify/sync.ts`, find the `ShopifyOrderNode` type (lines 24–36). Add the `customer` field:

  **Before:**
  ```typescript
  type ShopifyOrderNode = {
    id: string;
    name: string;
    cancelledAt: string | null;
    displayFulfillmentStatus: string | null;
    lineItems: {
      nodes: Array<{
        quantity: number;
        variant: { id: string } | null;
        originalUnitPriceSet: { shopMoney: { amount: string } } | null;
      }>;
    };
  };
  ```

  **After:**
  ```typescript
  type ShopifyOrderNode = {
    id: string;
    name: string;
    cancelledAt: string | null;
    displayFulfillmentStatus: string | null;
    customer: { firstName: string | null; email: string | null } | null;
    lineItems: {
      nodes: Array<{
        quantity: number;
        variant: { id: string } | null;
        originalUnitPriceSet: { shopMoney: { amount: string } } | null;
      }>;
    };
  };
  ```

- [ ] **Step 2: Add `customer { firstName email }` to the orders GraphQL query**

  In `fetchOrders`, find the `query` template literal (lines 129–148). Add the `customer` field after `displayFulfillmentStatus`:

  **Before:**
  ```typescript
  const query = `
    query Orders($cursor: String) {
      orders(first: 50, after: $cursor, reverse: true, sortKey: UPDATED_AT) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          name
          cancelledAt
          displayFulfillmentStatus
          lineItems(first: 100) {
            nodes {
              quantity
              originalUnitPriceSet { shopMoney { amount } }
              variant { id }
            }
          }
        }
      }
    }
  `;
  ```

  **After:**
  ```typescript
  const query = `
    query Orders($cursor: String) {
      orders(first: 50, after: $cursor, reverse: true, sortKey: UPDATED_AT) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          name
          cancelledAt
          displayFulfillmentStatus
          customer { firstName email }
          lineItems(first: 100) {
            nodes {
              quantity
              originalUnitPriceSet { shopMoney { amount } }
              variant { id }
            }
          }
        }
      }
    }
  `;
  ```

  > **Note:** Fetching `customer` fields requires the `read_customers` Shopify API scope. Check `shopify.app.toml` (or `shopify.app.unlisted.toml`) to confirm `read_customers` is in the `scopes` list. If it isn't, add it and re-install the app on the dev store.

- [ ] **Step 3: Populate `customer_email` and `customer_first_name` in `orderRows`**

  Find the `orderRows` mapping (lines 236–241):

  **Before:**
  ```typescript
  const orderRows = orders.map((order) => ({
    tenant_id: tenantId,
    shopify_order_id: order.id,
    order_number: order.name,
    status: mapOrderStatus(order),
  }));
  ```

  **After:**
  ```typescript
  const orderRows = orders.map((order) => ({
    tenant_id: tenantId,
    shopify_order_id: order.id,
    order_number: order.name,
    status: mapOrderStatus(order),
    customer_email: order.customer?.email?.toLowerCase() ?? null,
    customer_first_name: order.customer?.firstName ?? null,
  }));
  ```

- [ ] **Step 4: Type-check**

  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 5: Commit**

  ```bash
  git add src/lib/shopify/sync.ts
  git commit -m "feat(sync): fetch and store customer email + first name on order upsert"
  ```

---

## Task 4: GDPR redact — null `customer_first_name` (TDD)

**Files:**
- Modify: `src/lib/shopify/gdpr.test.ts` (seed data + new assertion)
- Modify: `src/lib/shopify/gdpr.ts` (`handleCustomersRedact`)

- [ ] **Step 1: Add `customer_first_name` to the test seed data**

  In `gdpr.test.ts`, find the `makeAdmin()` function. Update the `orders` seed to include `customer_first_name`:

  **Before:**
  ```typescript
  fake.seed("orders", [
    { id: "ord_1", tenant_id: "tenant_1", shopify_order_id: "1001", customer_email: "alice@example.com" },
    { id: "ord_2", tenant_id: "tenant_1", shopify_order_id: "1002", customer_email: "bob@example.com" },
    { id: "ord_3", tenant_id: "tenant_1", shopify_order_id: null, customer_email: "manual@example.com" },
  ]);
  ```

  **After:**
  ```typescript
  fake.seed("orders", [
    { id: "ord_1", tenant_id: "tenant_1", shopify_order_id: "1001", customer_email: "alice@example.com", customer_first_name: "Alice" },
    { id: "ord_2", tenant_id: "tenant_1", shopify_order_id: "1002", customer_email: "bob@example.com", customer_first_name: "Bob" },
    { id: "ord_3", tenant_id: "tenant_1", shopify_order_id: null, customer_email: "manual@example.com", customer_first_name: null },
  ]);
  ```

- [ ] **Step 2: Add the failing assertion to `handleCustomersRedact` test**

  Find the `handleCustomersRedact` describe block. Add a `customer_first_name` assertion after the existing `customer_email` checks:

  **Before:**
  ```typescript
  const ord1 = admin.tables.get("orders")!.rows.find((r) => r.id === "ord_1");
  expect(ord1!.customer_email).toBeNull();
  const ord2 = admin.tables.get("orders")!.rows.find((r) => r.id === "ord_2");
  expect(ord2!.customer_email).toBe("bob@example.com");
  ```

  **After:**
  ```typescript
  const ord1 = admin.tables.get("orders")!.rows.find((r) => r.id === "ord_1");
  expect(ord1!.customer_email).toBeNull();
  expect(ord1!.customer_first_name).toBeNull();
  const ord2 = admin.tables.get("orders")!.rows.find((r) => r.id === "ord_2");
  expect(ord2!.customer_email).toBe("bob@example.com");
  expect(ord2!.customer_first_name).toBe("Bob");
  ```

- [ ] **Step 3: Run the test — confirm it fails**

  ```bash
  npx vitest run src/lib/shopify/gdpr.test.ts
  ```
  Expected: the `handleCustomersRedact` test fails with something like:
  ```
  AssertionError: expected "Alice" to be null
  ```

- [ ] **Step 4: Update `handleCustomersRedact` in `gdpr.ts`**

  Find the `.update()` call inside `handleCustomersRedact` (around line 153):

  **Before:**
  ```typescript
  const { data: ordersUpdated } = await admin
    .from("orders")
    .update({ customer_email: null })
    .eq("tenant_id", tenantId)
    .eq("customer_email", customerEmail)
    .select("id");
  ```

  **After:**
  ```typescript
  const { data: ordersUpdated } = await admin
    .from("orders")
    .update({ customer_email: null, customer_first_name: null })
    .eq("tenant_id", tenantId)
    .eq("customer_email", customerEmail)
    .select("id");
  ```

- [ ] **Step 5: Run the test — confirm it passes**

  ```bash
  npx vitest run src/lib/shopify/gdpr.test.ts
  ```
  Expected: all tests pass (3 describe blocks, all green).

- [ ] **Step 6: Run the full test suite**

  ```bash
  npm test
  ```
  Expected: all tests pass.

- [ ] **Step 7: Commit**

  ```bash
  git add src/lib/shopify/gdpr.test.ts src/lib/shopify/gdpr.ts
  git commit -m "fix(gdpr): null customer_first_name in customers/redact handler"
  ```

---

## Task 5: Notification engine — wire `customer_first_name`

**Files:**
- Modify: `src/lib/notifications/notification-engine.ts` (lines 30–31 and line 79)

- [ ] **Step 1: Add `customer_first_name` to the Supabase select**

  In `notification-engine.ts`, find the `supabase.from("job_routing_step").select(...)` call (lines 24–36). The orders join currently selects `id, order_number, customer_email`. Add `customer_first_name`:

  **Before:**
  ```typescript
  order_line:order_line_id (
    orders:order_id ( id, order_number, customer_email ),
    variant:variant_id ( title, product:product_id ( title ) )
  )
  ```

  **After:**
  ```typescript
  order_line:order_line_id (
    orders:order_id ( id, order_number, customer_email, customer_first_name ),
    variant:variant_id ( title, product:product_id ( title ) )
  )
  ```

- [ ] **Step 2: Replace the hardcoded empty string**

  Find the `vars` object (lines 75–80). Replace the hardcoded `customer_first_name: ""`:

  **Before:**
  ```typescript
  const vars: Record<string, string> = {
    product_name: product?.title ?? variant?.title ?? "your product",
    order_number: order?.order_number ?? "",
    department_name: step.operation_name,
    customer_first_name: "",
  };
  ```

  **After:**
  ```typescript
  const vars: Record<string, string> = {
    product_name: product?.title ?? variant?.title ?? "your product",
    order_number: order?.order_number ?? "",
    department_name: step.operation_name,
    customer_first_name: order?.customer_first_name ?? "",
  };
  ```

  The `order` variable is already typed as `any` (line 45: `const order = ol?.orders as any`), so no additional type change is needed. If `customer_first_name` is null in the DB (e.g., order predates the sync update), the template renders a blank string — same as before, but now correctly resolved rather than hardcoded.

- [ ] **Step 3: Type-check**

  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add src/lib/notifications/notification-engine.ts
  git commit -m "fix(notifications): populate customer_first_name from order data"
  ```

---

## Task 6: Product detail page — display `last_synced_at`

**Files:**
- Modify: `src/app/app/products/[productId]/page.tsx` (type, query, header meta — lines 13–20, ~93, ~310–318)

- [ ] **Step 1: Add `last_synced_at` to the `ProductRecord` type**

  Find the `ProductRecord` type (lines 13–20):

  **Before:**
  ```typescript
  type ProductRecord = {
    id: string;
    title: string;
    shopify_id: string;
    created_at: string | null;
    image_url: string | null;
    description: string | null;
  };
  ```

  **After:**
  ```typescript
  type ProductRecord = {
    id: string;
    title: string;
    shopify_id: string;
    created_at: string | null;
    last_synced_at: string | null;
    image_url: string | null;
    description: string | null;
  };
  ```

- [ ] **Step 2: Add `last_synced_at` to the Supabase select**

  Find the `.select(...)` call that fetches the product (around line 93):

  **Before:**
  ```typescript
  .select("id,title,shopify_id,created_at,image_url,description")
  ```

  **After:**
  ```typescript
  .select("id,title,shopify_id,created_at,last_synced_at,image_url,description")
  ```

- [ ] **Step 3: Update the header meta logic**

  Find the `// Header meta` comment and the two lines that follow (around line 309):

  **Before:**
  ```typescript
  // Header meta
  const lastSync = product.created_at;
  ```

  **After:**
  ```typescript
  // Header meta
  const lastSync = product.last_synced_at ?? product.created_at;
  const syncLabel = product.last_synced_at ? "Last sync" : "Added";
  ```

- [ ] **Step 4: Update the `PageHeader` description**

  Find the `<PageHeader … description={…} />` JSX (around line 316). The description contains the hardcoded `"Last sync"` string:

  **Before:**
  ```typescript
  description={`Shopify ID: ${product.shopify_id} · ${variants.length} variant${variants.length === 1 ? "" : "s"} · Last sync ${timeAgo(lastSync)}`}
  ```

  **After:**
  ```typescript
  description={`Shopify ID: ${product.shopify_id} · ${variants.length} variant${variants.length === 1 ? "" : "s"} · ${syncLabel} ${timeAgo(lastSync)}`}
  ```

- [ ] **Step 5: Type-check**

  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 6: Commit**

  ```bash
  git add src/app/app/products/[productId]/page.tsx
  git commit -m "fix(products): show last_synced_at in product detail header (A1)"
  ```

---

## Task 7: Products list — add `<h1>` via `PageHeader`

**Files:**
- Modify: `src/app/app/products/page.tsx` (import + header block, lines 1–4 and ~288–299)

- [ ] **Step 1: Add the `PageHeader` import**

  Find the existing imports at the top of `src/app/app/products/page.tsx`:

  **Before:**
  ```typescript
  import Image from "next/image";
  import Link from "next/link";
  import { getServerTenantContext } from "@/lib/tenant/context";
  import styles from "./products.module.css";
  ```

  **After:**
  ```typescript
  import Image from "next/image";
  import Link from "next/link";
  import { getServerTenantContext } from "@/lib/tenant/context";
  import styles from "./products.module.css";
  import PageHeader from "@/app/app/_ui/page-header";
  ```

- [ ] **Step 2: Replace the custom header block with `PageHeader`**

  Find the custom `<div className={styles.header}>` block (around line 288):

  **Before:**
  ```tsx
  <div className={styles.header}>
    <div>
      <p>
        {filteredProducts.length} of {products.length} Products
      </p>
    </div>
    <form method="post" action="/api/shopify/sync">
      <button type="submit" className={styles.importButton}>
        Import Products
      </button>
    </form>
  </div>
  ```

  **After:**
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

  `PageHeader` renders `title` as an `<h1>` (see `src/app/app/_ui/page-header.tsx`). The `actions` prop accepts any `ReactNode` so the form passes through unchanged.

- [ ] **Step 3: Type-check**

  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 4: Run the full test suite**

  ```bash
  npm test
  ```
  Expected: all tests pass.

- [ ] **Step 5: Commit**

  ```bash
  git add src/app/app/products/page.tsx
  git commit -m "fix(products): add h1 heading to products list page via PageHeader (B1)"
  ```

---

## Verification checklist

After all tasks are complete, manually verify in the running app:

- [ ] **A1:** Trigger a Shopify sync. Open a product detail page. The header description should show "Last sync X ago" with a recent timestamp. A manually-created product (source = 'manual') should show "Added X ago" instead.
- [ ] **A2:** Open a notification trigger for a variant. Send a test notification to an order that has been re-synced. The received email should include the customer's first name, not a blank.
- [ ] **B1:** Open `/app/products`. Inspect the DOM — the page should contain exactly one `<h1>Products</h1>` element. Screen-reader navigation (or browser a11y tools) should announce "Products, heading level 1".
