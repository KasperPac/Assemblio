# Shopify Order Dates + Historical (Stats-Only) Orders — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture real Shopify order dates (placed/processed/modified/shipped), import full order history, and import pre-go-live orders as stats-only (no stock movement / planning) so order analytics are correct.

**Architecture:** Add date + `historical` columns to `orders` and a `stats_only_before` cutoff to `shopify_store`. The sync captures the new dates, classifies orders as historical by date, and runs allocation/planning only for live orders while releasing reservations for historical ones. Stats and the orders list switch to the real dates.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres + RLS), TypeScript, Vitest. Spec: `docs/superpowers/specs/2026-06-04-shopify-order-dates-and-historical-design.md`.

---

### Task 1: Schema — order date/historical columns + store cutoff

**Files:**
- Create: `supabase/patches/shopify_order_dates_historical.sql`
- Modify: `supabase/schema.sql` (orders table ~line 295, shopify_store table ~line 169)

- [ ] **Step 1: Write the patch SQL**

Create `supabase/patches/shopify_order_dates_historical.sql`:

```sql
-- Real Shopify order timestamps + stats-only (historical) classification.
alter table public.orders add column if not exists shopify_created_at timestamptz;
alter table public.orders add column if not exists shopify_processed_at timestamptz;
alter table public.orders add column if not exists shopify_updated_at timestamptz;
alter table public.orders add column if not exists fulfilled_at timestamptz;
alter table public.orders add column if not exists historical boolean not null default false;

-- Orders whose order date is before this are imported for stats only (no stock /
-- planning). Null = nothing is historical.
alter table public.shopify_store add column if not exists stats_only_before date;
```

- [ ] **Step 2: Update `supabase/schema.sql`**

In `create table public.orders (...)` add after `status text not null default 'open',`:

```sql
  shopify_created_at timestamptz,
  shopify_processed_at timestamptz,
  shopify_updated_at timestamptz,
  fulfilled_at timestamptz,
  historical boolean not null default false,
```

In `create table public.shopify_store (...)` add after `app_id text ...`:

```sql
  stats_only_before date,
```

- [ ] **Step 3: Apply to prod via Supabase MCP**

Apply migration `shopify_order_dates_historical` with the patch SQL from Step 1 to project `svhaotzrtfbwmphaacjj`.
Expected: `{"success":true}`. Verify with:
`select column_name from information_schema.columns where table_name='orders' and column_name in ('shopify_processed_at','historical');` → 2 rows.

- [ ] **Step 4: Commit**

```bash
git add supabase/patches/shopify_order_dates_historical.sql supabase/schema.sql
git commit -m "feat(db): order shopify dates + historical flag; store stats_only_before"
```

---

### Task 2: Order-date + historical classification helpers (pure, TDD)

**Files:**
- Create: `src/lib/shopify/order-dates.ts`
- Test: `src/lib/shopify/order-dates.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { resolveOrderDate, isHistoricalOrder } from "./order-dates";

describe("resolveOrderDate", () => {
  it("prefers processedAt over createdAt", () => {
    expect(resolveOrderDate("2024-01-01T00:00:00Z", "2026-01-01T00:00:00Z")).toBe(
      "2024-01-01T00:00:00Z"
    );
  });
  it("falls back to createdAt when processedAt is null", () => {
    expect(resolveOrderDate(null, "2026-01-01T00:00:00Z")).toBe("2026-01-01T00:00:00Z");
  });
  it("returns null when both are null", () => {
    expect(resolveOrderDate(null, null)).toBeNull();
  });
});

describe("isHistoricalOrder", () => {
  it("is false when no cutoff is set", () => {
    expect(isHistoricalOrder("2024-01-01T00:00:00Z", null)).toBe(false);
  });
  it("is true when order date is before the cutoff", () => {
    expect(isHistoricalOrder("2024-06-01T00:00:00Z", "2025-01-01")).toBe(true);
  });
  it("is false when order date is on/after the cutoff", () => {
    expect(isHistoricalOrder("2025-01-01T12:00:00Z", "2025-01-01")).toBe(false);
  });
  it("is false when order date is unknown (null)", () => {
    expect(isHistoricalOrder(null, "2025-01-01")).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/shopify/order-dates.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
/** The canonical order date: Shopify processedAt, falling back to createdAt. */
export function resolveOrderDate(
  processedAt: string | null | undefined,
  createdAt: string | null | undefined
): string | null {
  return processedAt ?? createdAt ?? null;
}

/**
 * True when an order should be imported as stats-only: its order date is strictly
 * before the store's cutoff. Unknown date or no cutoff => not historical.
 */
export function isHistoricalOrder(
  orderDate: string | null,
  statsOnlyBefore: string | null | undefined
): boolean {
  if (!statsOnlyBefore || !orderDate) return false;
  return new Date(orderDate).getTime() < new Date(`${statsOnlyBefore}T00:00:00Z`).getTime();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/shopify/order-dates.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/shopify/order-dates.ts src/lib/shopify/order-dates.test.ts
git commit -m "feat(shopify): order-date + historical classification helpers"
```

---

### Task 3: `releaseOrderAllocations` helper (TDD)

Extract the "delete allocations + reverse reserved" path so the sync can release a
historical order's stock without re-reserving.

**Files:**
- Modify: `src/lib/allocation/reconcile-order.ts`
- Test: `src/lib/allocation/release-order.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it, vi } from "vitest";
import { releaseOrderAllocations } from "./reconcile-order";

// Minimal fake matching the DbClient/DbQuery shape used by reconcile-order.ts.
function fakeClient(allocations: Array<{ id: string; component_id: string; quantity: number }>) {
  const rpcCalls: Array<Record<string, unknown>> = [];
  const deleted: string[][] = [];
  const q: Record<string, unknown> = {};
  const chain = () => q;
  Object.assign(q, {
    select: () => q, eq: () => q, in: (_c: string, ids: string[]) => { deleted.push(ids); return q; },
    delete: () => q, update: () => q, upsert: () => q,
    maybeSingle: async () => ({ data: null, error: null }),
    then: (res: (v: { data: unknown; error: unknown }) => unknown) =>
      Promise.resolve({ data: allocations, error: null }).then(res),
  });
  void chain;
  const client = {
    from: () => q,
    rpc: async (_n: string, args: Record<string, unknown>) => { rpcCalls.push(args); return { data: null, error: null }; },
  };
  return { client, rpcCalls, deleted };
}

describe("releaseOrderAllocations", () => {
  it("deletes allocations and reverses reserved for each component", async () => {
    const { client, rpcCalls, deleted } = fakeClient([
      { id: "a1", component_id: "c1", quantity: 5 },
    ]);
    const released = await releaseOrderAllocations(client as never, "t1", "o1");
    expect(released).toBe(1);
    expect(deleted.length).toBeGreaterThan(0);
    expect(rpcCalls[0]).toMatchObject({ p_delta_reserved: -5, p_component_id: "c1" });
  });

  it("is a no-op when there are no lines", async () => {
    const { client } = fakeClient([]);
    // No order lines => returns 0 without throwing.
    const released = await releaseOrderAllocations(client as never, "t1", "o-none");
    expect(released).toBe(0);
  });
});
```

> Note: the fake returns `allocations` for every query; for the no-op case the order has no lines, so adjust the fake if needed during implementation. Keep the test focused on the release/RPC behavior.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/allocation/release-order.test.ts`
Expected: FAIL — `releaseOrderAllocations` is not exported.

- [ ] **Step 3: Implement by extracting the clear path**

In `src/lib/allocation/reconcile-order.ts`, export a new function that loads the order's
lines and runs the existing `clearLineAllocations` for each (reuse the existing
`clearLineAllocations`, `updateReservedWithMovement`, and default-location lookup):

```typescript
export async function releaseOrderAllocations(
  client: DbClient,
  tenantId: string,
  orderId: string
): Promise<number> {
  const { data: locationData } = await asQuery(client.from("location"))
    .select("id").eq("tenant_id", tenantId).eq("is_default", true).maybeSingle();
  const locationId = (locationData as LocationRow | null)?.id;
  if (!locationId) return 0;

  const { data: lineData } = await asQuery(client.from("order_line"))
    .select("id,variant_id,quantity").eq("tenant_id", tenantId).eq("order_id", orderId);
  const lines = (lineData ?? []) as OrderLineRow[];

  let released = 0;
  for (const line of lines) {
    released += await clearLineAllocations(client, tenantId, orderId, locationId, line.id);
  }
  return released;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/allocation/release-order.test.ts`
Expected: PASS. Also run `npx vitest run src/lib/allocation/` — all green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/allocation/reconcile-order.ts src/lib/allocation/release-order.test.ts
git commit -m "feat(allocation): releaseOrderAllocations to free a historical order's stock"
```

---

### Task 4: Sync — capture dates, full history, historical handling

**Files:**
- Modify: `src/lib/shopify/sync.ts`

- [ ] **Step 1: Extend the `ShopifyOrderNode` type and orders query**

Add fields to `ShopifyOrderNode`:

```typescript
  createdAt: string;
  processedAt: string | null;
  updatedAt: string | null;
  lineItems: {
    nodes: Array<{
      id: string;
      quantity: number;
      variant: { id: string } | null;
      originalUnitPriceSet: { shopMoney: { amount: string } } | null;
    }>;
  };
  fulfillments: Array<{
    createdAt: string;
    fulfillmentLineItems: { nodes: Array<{ lineItem: { id: string } | null }> };
  }>;
```

In the `fetchOrders` GraphQL query `nodes { ... }`, add `createdAt processedAt updatedAt`,
add `id` to `lineItems` nodes, and add:

```graphql
          fulfillments(first: 10) {
            createdAt
            fulfillmentLineItems(first: 100) { nodes { lineItem { id } } }
          }
```

- [ ] **Step 2: Remove the 250 cap**

In `fetchOrders`, delete the line `if (orders.length >= 250) break;` so all orders paginate.

- [ ] **Step 3: Load the cutoff and thread it through**

In `syncShopifyStoreData`, after `const admin = createSupabaseAdminClient();` load the store cutoff:

```typescript
  const { data: storeRow } = await admin
    .from("shopify_store")
    .select("stats_only_before")
    .eq("tenant_id", tenantId)
    .eq("store_domain", shopDomain)
    .maybeSingle();
  const statsOnlyBefore = (storeRow?.stats_only_before as string | null) ?? null;
```

Import the helpers at top: `import { resolveOrderDate, isHistoricalOrder } from "./order-dates";`
and `import { releaseOrderAllocations } from "@/lib/allocation/reconcile-order";`.

- [ ] **Step 4: Write the new date columns + historical flag in `orderRows`**

Replace the `orderRows` map so each row includes:

```typescript
  const orderRows = orders.map((order) => {
    const orderDate = resolveOrderDate(order.processedAt, order.createdAt);
    const fulfilledAt =
      order.fulfillments.length > 0
        ? order.fulfillments
            .map((f) => f.createdAt)
            .sort()[0]
        : null;
    return {
      tenant_id: tenantId,
      shopify_order_id: order.id,
      order_number: order.name,
      status: mapOrderStatus(order),
      customer_email: null,
      customer_first_name: null,
      shopify_created_at: order.createdAt,
      shopify_processed_at: order.processedAt,
      shopify_updated_at: order.updatedAt,
      fulfilled_at: fulfilledAt,
      historical: isHistoricalOrder(orderDate, statsOnlyBefore),
    };
  });
```

- [ ] **Step 5: Real per-line shipped_at from fulfillments**

Replace the `now()`-based `shipped_at` block. Build a variant→ship-date map per order
from `fulfillments[].fulfillmentLineItems.nodes[].lineItem.id` joined to the order's
`lineItems` (`id`→`variant.id`), then when building `order_line` rows set
`shipped_at` from that map. Concretely, inside the `orders.flatMap` that builds
`orderLineRows`, compute a `shippedByVariant: Map<string,string>` for that order:

```typescript
    const lineItemVariant = new Map<string, string>();
    for (const li of order.lineItems.nodes) {
      if (li.variant?.id) lineItemVariant.set(li.id, li.variant.id);
    }
    const shippedByVariant = new Map<string, string>();
    for (const f of order.fulfillments) {
      for (const fli of f.fulfillmentLineItems.nodes) {
        const vId = fli.lineItem ? lineItemVariant.get(fli.lineItem.id) : undefined;
        const localVid = vId ? variantMap.get(vId) : undefined;
        if (!localVid) continue;
        const prev = shippedByVariant.get(localVid);
        if (!prev || f.createdAt < prev) shippedByVariant.set(localVid, f.createdAt);
      }
    }
```

Then in the returned line objects add `shipped_at: shippedByVariant.get(variantId) ?? null`.
Delete the later `fulfilledOrderIds`/`partialOrders` blanket `now()` update entirely.

- [ ] **Step 6: Partition live vs historical for allocation/planning**

Build the partition from `orderRows` (keyed by shopify id) mapped to local ids via `orderMap`:

```typescript
  const historicalShopifyIds = new Set(
    orderRows.filter((r) => r.historical).map((r) => r.shopify_order_id)
  );
  const liveOrderLocalIds = orderLocalIds.filter((localId) => {
    const shopifyId = [...orderMap.entries()].find(([, v]) => v === localId)?.[0];
    return shopifyId ? !historicalShopifyIds.has(shopifyId) : true;
  });
  const historicalLocalIds = orderLocalIds.filter((id) => !liveOrderLocalIds.includes(id));
```

Run `reconcileOrderAllocations` and the `generate_job_financial_plan` loop over
`liveOrderLocalIds` only. After the allocation loop, release historical reservations:

```typescript
  for (const localOrderId of historicalLocalIds) {
    try { await releaseOrderAllocations(admin, tenantId, localOrderId); } catch { continue; }
  }
```

- [ ] **Step 7: Verify build + existing tests**

Run: `npx tsc --noEmit -p tsconfig.json` (expect no new errors) and `npx vitest run src/lib/shopify/`.
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/shopify/sync.ts
git commit -m "feat(shopify): capture order dates, full history, historical stats-only handling"
```

---

### Task 5: Dashboard "Order metrics" chart uses real dates

**Files:**
- Modify: `src/app/app/_dashboard/orders-chart.tsx`

- [ ] **Step 1: Select real dates and bucket by them**

Change the orders select to `"id,status,shopify_processed_at,shopify_created_at,fulfilled_at"`
and the date filter/bucketing to use `o.shopify_processed_at ?? o.shopify_created_at`.
Replace the `created_at` filter on the orders query with a filter on `shopify_processed_at`
(use `.or("shopify_processed_at.gte.<iso>,shopify_created_at.gte.<iso>")` or fetch and
filter in memory by the resolved date). Compute lead time as
`fulfilled_at − resolvedOrderDate` (drop the `updated_at` proxy).

- [ ] **Step 2: Fix revenue join to avoid date filter on order_line**

Fetch `order_line` revenue for the in-range order ids using the existing
`chunk()` helper (`import { chunk } from "@/lib/shopify/chunk";`) rather than filtering
`order_line.created_at`:

```typescript
  const orderIds = (orders ?? []).map((o) => o.id);
  const revenueByOrder = new Map<string, number>();
  for (const batch of chunk(orderIds, 100)) {
    const { data } = await supabase
      .from("order_line").select("order_id,line_sell_price").in("order_id", batch);
    (data ?? []).forEach((l) =>
      revenueByOrder.set(l.order_id, (revenueByOrder.get(l.order_id) ?? 0) + Number(l.line_sell_price ?? 0))
    );
  }
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit -p tsconfig.json` and `npx eslint src/app/app/_dashboard/orders-chart.tsx`.
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/app/_dashboard/orders-chart.tsx
git commit -m "fix(dashboard): order metrics use real Shopify dates"
```

---

### Task 6: Orders list — Historical badge + order date column

**Files:**
- Modify: `src/app/app/orders/page.tsx`

- [ ] **Step 1: Add fields to the query + `OrderRow` type**

Add `historical, shopify_processed_at, shopify_created_at` to the select and to `OrderRow`.

- [ ] **Step 2: Render a badge + the order date**

Import `StatusBadge from "../_ui/status-badge"`. In the Order cell, when
`row.historical` render `<StatusBadge>Historical</StatusBadge>` next to the order number.
Add an "Order date" cell showing `formatDate(new Date(row.shopify_processed_at ?? row.shopify_created_at))`
when present, else `—` (add a header `<th>Order date</th>` and bump the `colSpan` empties from 8 to 9).

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit -p tsconfig.json` and `npx eslint src/app/app/orders/page.tsx`.
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/app/orders/page.tsx
git commit -m "feat(orders): show order date and Historical badge"
```

---

### Task 7: Settings — per-store historical cutoff

**Files:**
- Create: `src/app/app/settings/integrations/actions.ts`
- Modify: `src/app/app/settings/integrations/shopify-manage.tsx`

- [ ] **Step 1: Server action to save the cutoff**

Create `actions.ts` with a `"use server"` action that, for an admin in the tenant,
updates `shopify_store.stats_only_before` for a given `store_id` (tenant-scoped):

```typescript
"use server";
import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";

export async function setStatsOnlyBefore(formData: FormData) {
  const ctx = await getServerTenantContext();
  if (!ctx || (ctx.role !== "admin" && ctx.role !== "super_admin")) return;
  const storeId = String(formData.get("store_id") ?? "");
  const raw = String(formData.get("stats_only_before") ?? "").trim();
  const value = raw === "" ? null : raw; // yyyy-mm-dd or null
  await ctx.supabase
    .from("shopify_store")
    .update({ stats_only_before: value })
    .eq("id", storeId)
    .eq("tenant_id", ctx.tenantId);
  revalidatePath("/app/settings/integrations");
}
```

- [ ] **Step 2: Add the date field to each store row**

In `shopify-manage.tsx`, add `stats_only_before` to the `Store` type and render a small
`<form action={setStatsOnlyBefore}>` per store with a hidden `store_id`, a
`<input type="date" name="stats_only_before" defaultValue={store.stats_only_before ?? ""}>`,
and a Save button. Add `stats_only_before` to the store select in
`src/app/app/settings/integrations/page.tsx` (the `.select(...)` for `shopify_store`).
Add a hint: "Orders placed before this date are imported for stats only. Re-sync after changing."

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit -p tsconfig.json` and `npx eslint src/app/app/settings/integrations/`.
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/app/app/settings/integrations/actions.ts src/app/app/settings/integrations/shopify-manage.tsx src/app/app/settings/integrations/page.tsx
git commit -m "feat(integrations): per-store historical cutoff (stats_only_before)"
```

---

### Task 8: Exclude historical orders from operational planning

**Files:**
- Modify: `src/app/app/planning/(gated)/floor/page.tsx` (and any order query feeding capacity)

- [ ] **Step 1: Audit order reads for operational scope**

Grep for operational order reads: `npx` not needed — use the editor search for
`.from("orders")` in `src/app/app/planning`, `src/app/app/capacity`, `src/app/app/costing`.
For each that drives capacity/planning/stock (not reporting), add `.eq("historical", false)`
to the orders query.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit -p tsconfig.json`. Expected: clean. Manually confirm the floor
view no longer counts historical orders.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "fix(planning): exclude historical orders from operational views"
```

---

### Task 9: End-to-end verification (manual)

- [ ] **Step 1:** Deploy `main`. In integrations, set Fabulous Fabrications' cutoff to the go-live date.
- [ ] **Step 2:** Re-run the sync from the integrations Sync button.
- [ ] **Step 3:** Verify in prod DB:
  - `select count(*) filter (where historical) as hist, count(*) from orders where tenant_id='777e700f-4e28-4dc1-b649-0ab63c335f42';` — historical > 0.
  - Dashboard "Order metrics" spans real months with non-zero lead times.
  - `inventory_balance.reserved` dropped for components previously reserved by historical orders.
  - A live (post-cutoff) order still shows allocations.

---

## Notes for the implementer

- The Supabase admin/server clients are **untyped**; cast row fields (`as string`) as the
  existing sync code does.
- `chunk()` lives at `src/lib/shopify/chunk.ts` — reuse it for any `.in()` over large lists.
- Keep `.upsert(...).select(...)` for id maps (added in PR #6) — do not reintroduce `.in()` selects.
- Historical orders must never reach `reconcileOrderAllocations` or `generate_job_financial_plan`.
