# Orders & Order Detail Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the orders list and order detail pages to make allocation status transparent, show BOM + component breakdown per order line, and add automatic financial planning to the Shopify sync.

**Architecture:** Extract a shared `getWeekStart()` helper; add a `generate_job_financial_plan` loop to `syncShopifyStoreData` after the existing allocation loop; create `getOrderLineStatus()` to batch-fetch BOM + component + stock data per order line; rewrite the orders list to show badge-based allocation status; fully redesign the order detail to remove the planning sidebar and show BOM/component/labor in a clear hierarchy per line.

**Tech Stack:** Next.js 15 App Router (server components), Supabase JS client, Vitest, CSS Modules.

---

## File Structure

| File | Action | Purpose |
|---|---|---|
| `src/lib/dates.ts` | Create | `getWeekStart()` — shared Monday-of-week helper |
| `src/lib/dates.test.ts` | Create | Unit tests for `getWeekStart` |
| `src/lib/orders/order-line-status.ts` | Create | `getOrderLineStatus()`, `deriveAllocationState()`, shared types |
| `src/lib/orders/order-line-status.test.ts` | Create | Unit tests for `deriveAllocationState` |
| `src/lib/shopify/sync.ts` | Modify | Add financial planning loop after allocation; import `getWeekStart` |
| `src/app/app/orders/actions.ts` | Modify | Import `getWeekStart` from `@/lib/dates`; remove local definition |
| `src/app/app/orders/page.tsx` | Modify | BOM-badge query; remove action buttons; add View link |
| `src/app/app/orders/orders.module.css` | Modify | Add badge + view-link styles; remove unused metric-cell styles |
| `src/app/app/orders/[orderId]/page.tsx` | Modify | Full redesign — BOM section, collapsed labor, remove planning sidebar |
| `src/app/app/orders/[orderId]/page.module.css` | Modify | Remove sidebar styles; add component table, no-bom card, disclosure styles |

---

### Task 0: Extract `getWeekStart` to shared module

**Goal:** Consolidate the three copies of the "get Monday of current week" helper into one importable function.

**Files:**
- Create: `src/lib/dates.ts`
- Create: `src/lib/dates.test.ts`
- Modify: `src/app/app/orders/actions.ts` (remove local `getWeekStart`, add import)
- Modify: `src/app/app/orders/[orderId]/page.tsx` (remove `getDefaultWeekStart`, add import)

**Acceptance Criteria:**
- [ ] `src/lib/dates.ts` exports `getWeekStart(): string`
- [ ] All three tests pass
- [ ] `actions.ts` and `page.tsx` import from `@/lib/dates` — no local copy remains

**Verify:** `npm test -- src/lib/dates.test.ts` → 3 tests pass

**Steps:**

- [ ] **Step 1: Write failing tests**

Create `src/lib/dates.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { getWeekStart } from "./dates";

describe("getWeekStart", () => {
  it("returns a YYYY-MM-DD formatted string", () => {
    expect(getWeekStart()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returned date is always a Monday (getDay() === 1)", () => {
    const result = getWeekStart();
    const [y, m, d] = result.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    expect(date.getDay()).toBe(1);
  });

  it("returned date is never more than 6 days before today", () => {
    const result = getWeekStart();
    const [y, m, d] = result.split("-").map(Number);
    const monday = new Date(y, m - 1, d);
    const now = new Date();
    const diffMs = now.getTime() - monday.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    expect(diffDays).toBeGreaterThanOrEqual(0);
    expect(diffDays).toBeLessThan(7);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
npm test -- src/lib/dates.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/dates.ts`**

```typescript
export function getWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```
npm test -- src/lib/dates.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Update `src/app/app/orders/actions.ts`**

At the top of the file, add the import and remove the local function:

```typescript
// Add at top (after existing imports):
import { getWeekStart } from "@/lib/dates";
```

Remove the existing local `getWeekStart` function (currently lines 86–94):

```typescript
// DELETE this block entirely:
function getWeekStart() {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}
```

- [ ] **Step 6: Update `src/app/app/orders/[orderId]/page.tsx`**

Add import and remove local `getDefaultWeekStart`:

```typescript
// Add at top (after existing imports):
import { getWeekStart } from "@/lib/dates";
```

Remove the existing local `getDefaultWeekStart` function (currently lines 129–137) and replace any call to `getDefaultWeekStart()` with `getWeekStart()`.

The one call site in the file is:
```typescript
// OLD:
const selectedWeek = query.week ?? getDefaultWeekStart();
// NEW:
const selectedWeek = query.week ?? getWeekStart();
```

- [ ] **Step 7: Commit**

```
git add src/lib/dates.ts src/lib/dates.test.ts src/app/app/orders/actions.ts src/app/app/orders/[orderId]/page.tsx
git commit -m "refactor: extract getWeekStart to src/lib/dates"
```

---

### Task 1: Add financial planning to Shopify sync

**Goal:** After the existing allocation loop in `syncShopifyStoreData`, call `generate_job_financial_plan` for each line of each synced order.

**Files:**
- Modify: `src/lib/shopify/sync.ts`

**Acceptance Criteria:**
- [ ] `SyncResult` has a `planRuns: number` field
- [ ] After a manual sync, `job_cost_snapshot` rows exist for order lines that have an active BOM
- [ ] Lines with no active BOM are skipped silently
- [ ] `planRuns` count appears in the activity log metadata

**Verify:** Manually sync a Shopify order whose variant has an active BOM → query `job_cost_snapshot` in Supabase — row exists with non-zero `planned_total_cost`.

**Steps:**

- [ ] **Step 1: Extend `SyncResult` type**

In `src/lib/shopify/sync.ts`, update the type at the top of the file:

```typescript
type SyncResult = {
  products: number;
  variants: number;
  orders: number;
  orderLines: number;
  allocations: number;
  planRuns: number;         // add this line
};
```

- [ ] **Step 2: Add import for `getWeekStart`**

```typescript
import { getWeekStart } from "@/lib/dates";
```

- [ ] **Step 3: Add financial planning loop after the allocation loop**

Find the existing allocation loop (currently lines 300–309):

```typescript
let allocationRuns = 0;
const orderLocalIds = Array.from(new Set(orderLineRows.map((row) => row.order_id)));
for (const localOrderId of orderLocalIds) {
  try {
    await reconcileOrderAllocations(admin, tenantId, localOrderId);
    allocationRuns += 1;
  } catch {
    continue;
  }
}
```

Add the planning loop immediately after it:

```typescript
let planRuns = 0;
const weekStart = getWeekStart();
for (const localOrderId of orderLocalIds) {
  const { data: planLines } = await admin
    .from("order_line")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("order_id", localOrderId);

  for (const line of planLines ?? []) {
    try {
      await admin.rpc("generate_job_financial_plan", {
        p_order_line_id: line.id,
        p_start_week: weekStart,
      });
      planRuns += 1;
    } catch {
      continue;
    }
  }
}
```

- [ ] **Step 4: Update the activity log insert to include `planRuns`**

Find the activity log insert (currently around line 311) and add `plan_runs`:

```typescript
const { error: activityError } = await admin.from("activity_log").insert({
  tenant_id: tenantId,
  actor_id: null,
  event: "SHOPIFY_SYNC_COMPLETED",
  metadata: {
    shop_domain: shopDomain,
    products: products.length,
    variants: variantRows.length,
    orders: orderRows.length,
    order_lines: orderLineRows.length,
    allocation_runs: allocationRuns,
    plan_runs: planRuns,           // add this line
  },
});
```

- [ ] **Step 5: Update the return statement**

```typescript
return {
  products: products.length,
  variants: variantRows.length,
  orders: orderRows.length,
  orderLines: orderLineRows.length,
  allocations: allocationRuns,
  planRuns,                        // add this line
};
```

- [ ] **Step 6: Commit**

```
git add src/lib/shopify/sync.ts
git commit -m "feat(sync): auto-generate financial plans after allocation on sync"
```

---

### Task 2: Build `getOrderLineStatus()` helper

**Goal:** Create a batched DB helper that returns BOM, component, stock availability, and allocation state for a list of order lines.

**Files:**
- Create: `src/lib/orders/order-line-status.ts`
- Create: `src/lib/orders/order-line-status.test.ts`

**Acceptance Criteria:**
- [ ] `deriveAllocationState(null, ...)` returns `"no-bom"`
- [ ] `deriveAllocationState({ id: "x" }, 0, ...)` returns `"empty-bom"`
- [ ] `deriveAllocationState({ id: "x" }, 3, ...)` returns `"allocated"`
- [ ] All 4 tests pass

**Verify:** `npm test -- src/lib/orders/order-line-status.test.ts` → 4 tests pass

**Steps:**

- [ ] **Step 1: Write failing tests**

Create `src/lib/orders/order-line-status.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { deriveAllocationState } from "./order-line-status";

describe("deriveAllocationState", () => {
  it("returns 'no-bom' when bom is null", () => {
    expect(deriveAllocationState(null, 0, 0)).toBe("no-bom");
  });

  it("returns 'empty-bom' when bom exists but has no components", () => {
    expect(deriveAllocationState({ id: "bom-1" }, 0, 0)).toBe("empty-bom");
  });

  it("returns 'allocated' when bom has components (regardless of allocatedQty)", () => {
    expect(deriveAllocationState({ id: "bom-1" }, 3, 9)).toBe("allocated");
  });

  it("returns 'allocated' even when allocatedQty is 0 — state is based on BOM, not allocation rows", () => {
    expect(deriveAllocationState({ id: "bom-1" }, 2, 0)).toBe("allocated");
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
npm test -- src/lib/orders/order-line-status.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/orders/order-line-status.ts`**

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";

export type ComponentStatus = {
  componentId: string;
  name: string;
  requiredQty: number;
  availableQty: number;
  isShort: boolean;
};

export type OrderLineStatus = {
  lineId: string;
  bom: { id: string; version: number } | null;
  components: ComponentStatus[];
  allocatedQty: number;
  allocationState: "allocated" | "no-bom" | "empty-bom";
};

export function deriveAllocationState(
  bom: { id: string } | null,
  componentCount: number,
  _allocatedQty: number
): "allocated" | "no-bom" | "empty-bom" {
  if (!bom) return "no-bom";
  if (componentCount === 0) return "empty-bom";
  return "allocated";
}

export async function getOrderLineStatus(
  supabase: SupabaseClient,
  tenantId: string,
  lines: Array<{ id: string; variant_id: string; quantity: number }>
): Promise<Map<string, OrderLineStatus>> {
  const result = new Map<string, OrderLineStatus>();
  if (lines.length === 0) return result;

  const variantIds = [...new Set(lines.map((l) => l.variant_id))];

  const { data: boms } = await supabase
    .from("product_bom")
    .select("id,version,variant_id")
    .eq("tenant_id", tenantId)
    .in("variant_id", variantIds)
    .eq("is_active", true);

  const bomByVariant = new Map(
    (boms ?? []).map((b) => [
      b.variant_id as string,
      b as { id: string; version: number; variant_id: string },
    ])
  );

  const bomIds = (boms ?? []).map((b) => (b as { id: string }).id);

  const { data: bomComponentRows } = bomIds.length > 0
    ? await supabase
        .from("product_bom_component")
        .select("product_bom_id,component_id,quantity")
        .in("product_bom_id", bomIds)
    : { data: [] as Array<{ product_bom_id: string; component_id: string; quantity: number }> };

  const componentsByBom = new Map<string, Array<{ component_id: string; quantity: number }>>();
  for (const row of bomComponentRows ?? []) {
    const r = row as { product_bom_id: string; component_id: string; quantity: number };
    const existing = componentsByBom.get(r.product_bom_id) ?? [];
    existing.push({ component_id: r.component_id, quantity: Number(r.quantity) });
    componentsByBom.set(r.product_bom_id, existing);
  }

  const componentIds = [
    ...new Set(
      (bomComponentRows ?? []).map((r) => (r as { component_id: string }).component_id)
    ),
  ];

  const [{ data: componentRows }, { data: balanceRows }, { data: allocationRows }] =
    await Promise.all([
      componentIds.length > 0
        ? supabase.from("component").select("id,name").in("id", componentIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
      componentIds.length > 0
        ? supabase
            .from("inventory_balance")
            .select("component_id,on_hand,reserved")
            .in("component_id", componentIds)
        : Promise.resolve({
            data: [] as Array<{ component_id: string; on_hand: number; reserved: number }>,
          }),
      supabase
        .from("order_component_allocation")
        .select("order_line_id,quantity")
        .in("order_line_id", lines.map((l) => l.id)),
    ]);

  const nameById = new Map(
    (componentRows ?? []).map((c) => [
      (c as { id: string; name: string }).id,
      (c as { id: string; name: string }).name,
    ])
  );
  const balanceByComponent = new Map(
    (balanceRows ?? []).map((b) => {
      const r = b as { component_id: string; on_hand: number; reserved: number };
      return [
        r.component_id,
        { onHand: Number(r.on_hand ?? 0), reserved: Number(r.reserved ?? 0) },
      ];
    })
  );
  const allocatedByLine = new Map<string, number>();
  for (const row of allocationRows ?? []) {
    const r = row as { order_line_id: string; quantity: number };
    allocatedByLine.set(
      r.order_line_id,
      (allocatedByLine.get(r.order_line_id) ?? 0) + Number(r.quantity ?? 0)
    );
  }

  for (const line of lines) {
    const bom = bomByVariant.get(line.variant_id) ?? null;
    const bomComponents = bom ? (componentsByBom.get(bom.id) ?? []) : [];
    const allocatedQty = allocatedByLine.get(line.id) ?? 0;
    const allocationState = deriveAllocationState(bom, bomComponents.length, allocatedQty);

    const components: ComponentStatus[] = bomComponents.map((bc) => {
      const requiredQty = Number(bc.quantity) * Number(line.quantity);
      const bal = balanceByComponent.get(bc.component_id);
      const availableQty = (bal?.onHand ?? 0) - (bal?.reserved ?? 0);
      return {
        componentId: bc.component_id,
        name: nameById.get(bc.component_id) ?? bc.component_id,
        requiredQty,
        availableQty,
        isShort: availableQty < requiredQty,
      };
    });

    result.set(line.id, {
      lineId: line.id,
      bom: bom ? { id: bom.id, version: bom.version } : null,
      components,
      allocatedQty,
      allocationState,
    });
  }

  return result;
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```
npm test -- src/lib/orders/order-line-status.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```
git add src/lib/orders/order-line-status.ts src/lib/orders/order-line-status.test.ts
git commit -m "feat(orders): add getOrderLineStatus helper with BOM + component + stock data"
```

---

### Task 3: Orders list page — allocation badge and cleanup

**Goal:** Replace the allocation metric column and action buttons with a clear allocation status badge; make the list read-only.

**Files:**
- Modify: `src/app/app/orders/page.tsx`
- Modify: `src/app/app/orders/orders.module.css`

**Acceptance Criteria:**
- [ ] No "Run allocation" form appears on any order row
- [ ] No "Generate plans" button in the page header
- [ ] Each order row shows one of: ✓ Allocated / ⚠ N lines need BOM / ⚠ No BOMs set up / —
- [ ] Each row has a "View →" link to the order detail page
- [ ] Page loads without errors

**Verify:** Open `/app/orders` — badges render, no action buttons visible.

**Steps:**

- [ ] **Step 1: Replace the data queries in `src/app/app/orders/page.tsx`**

Replace the entire `Promise.all` block starting on line 70 with:

```typescript
const { data, error } = await supabase
  .from("orders")
  .select("id,shopify_order_id,order_number,status,created_at")
  .order("created_at", { ascending: false })
  .limit(12);

const orderIds = ((data ?? []) as OrderRow[]).map((o) => o.id);

const { data: orderLineData } = await (
  orderIds.length > 0
    ? supabase
        .from("order_line")
        .select("id,order_id,variant_id")
        .in("order_id", orderIds)
    : Promise.resolve({ data: [] as Array<{ id: string; order_id: string; variant_id: string }> })
);

const variantIds = [
  ...new Set((orderLineData ?? []).map((l) => (l as { variant_id: string }).variant_id)),
];

const { data: activeBomData } = await (
  variantIds.length > 0
    ? supabase
        .from("product_bom")
        .select("id,variant_id")
        .eq("is_active", true)
        .in("variant_id", variantIds)
    : Promise.resolve({ data: [] as Array<{ id: string; variant_id: string }> })
);
```

- [ ] **Step 2: Add badge derivation helpers (after the queries, before the return)**

Remove the existing `allocationByOrder`, `marginByOrder`, and `laborByOrder` reduce blocks. Replace with:

```typescript
type OrderLineRef = { order_id: string; variant_id: string };

const activeBomVariants = new Set(
  (activeBomData ?? []).map((b) => (b as { variant_id: string }).variant_id)
);

const linesByOrder = ((orderLineData ?? []) as OrderLineRef[]).reduce<
  Record<string, OrderLineRef[]>
>((acc, line) => {
  const bucket = acc[line.order_id] ?? [];
  bucket.push(line);
  acc[line.order_id] = bucket;
  return acc;
}, {});

type BadgeState = "allocated" | "partial" | "no-boms" | "no-lines" | "done";

function getOrderBadgeState(order: OrderRow, lines: OrderLineRef[]): BadgeState {
  const status = order.status.toLowerCase();
  if (status === "fulfilled" || status === "cancelled") return "done";
  if (lines.length === 0) return "no-lines";
  const withBom = lines.filter((l) => activeBomVariants.has(l.variant_id));
  if (withBom.length === lines.length) return "allocated";
  if (withBom.length === 0) return "no-boms";
  return "partial";
}
```

- [ ] **Step 3: Remove unused type declarations**

Remove `MarginSnapshotRow`, `LaborPlanRow`, `AllocationSummaryRow` type declarations — they are no longer used.

- [ ] **Step 4: Rewrite the JSX**

Replace the entire `return (...)` block with:

```tsx
return (
  <div className={styles.page}>
    <PageHeader
      eyebrow="Orders"
      title="Order queue"
      description="Orders sync and allocate automatically. Re-run allocation from the order detail if BOMs change."
      actions={
        <form method="post" action="/api/shopify/sync">
          <button className={styles.primary} type="submit">
            Sync orders
          </button>
        </form>
      }
    />

    {params.shopify === "sync-ok" ? (
      <p className={styles.syncMeta}>Last sync imported {params.orders ?? "0"} orders.</p>
    ) : null}

    <ListPanel
      eyebrow="Live queue"
      title="Orders ready for action"
      description="Allocation status updates automatically on every sync. Open an order to re-run or inspect components."
      columns={["Order", "Date", "Status", "Allocation", ""]}
      columnsTemplate="1.1fr 0.8fr 0.7fr 1fr 0.5fr"
    >
      {error ? (
        <EmptyState
          title="Failed to load orders"
          message={`Supabase: ${error.message}. Check supabase/patches/ for any unapplied migrations.`}
        />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          title="No orders yet"
          message="Sync Shopify orders to populate the order queue."
        />
      ) : (
        ((data ?? []) as OrderRow[]).map((row) => {
          const lines = linesByOrder[row.id] ?? [];
          const badge = getOrderBadgeState(row, lines);
          const missingCount = lines.filter((l) => !activeBomVariants.has(l.variant_id)).length;

          return (
            <ListRow
              key={row.id}
              columnsTemplate="1.1fr 0.8fr 0.7fr 1fr 0.5fr"
              className={styles.orderRow}
            >
              <div className={styles.orderIdentity}>
                <Link href={`/app/orders/${row.id}`} className={styles.orderLink}>
                  #{row.order_number ?? row.shopify_order_id ?? row.id.slice(0, 6)}
                </Link>
                <span className={styles.meta}>Shopify {row.shopify_order_id ?? "--"}</span>
              </div>
              <span className={styles.meta}>
                {new Date(row.created_at).toLocaleDateString("en-GB")}
              </span>
              <StatusBadge variant={getStatusVariant(row.status)}>{row.status}</StatusBadge>
              <div>
                {badge === "allocated" && (
                  <StatusBadge variant="success">✓ Allocated</StatusBadge>
                )}
                {badge === "partial" && (
                  <StatusBadge variant="warning">
                    ⚠ {missingCount} line{missingCount === 1 ? "" : "s"} need BOM
                  </StatusBadge>
                )}
                {badge === "no-boms" && (
                  <StatusBadge variant="danger">⚠ No BOMs set up</StatusBadge>
                )}
                {(badge === "done" || badge === "no-lines") && (
                  <span className={styles.meta}>—</span>
                )}
              </div>
              <Link href={`/app/orders/${row.id}`} className={styles.viewLink}>
                View →
              </Link>
            </ListRow>
          );
        })
      )}
    </ListPanel>
  </div>
);
```

- [ ] **Step 5: Remove unused imports from the page**

Remove these imports from the top of `page.tsx` (no longer needed):
```typescript
import { allocateOrder, planOpenOrders } from "./actions";
```

- [ ] **Step 6: Update `orders.module.css`**

Remove `.metricCell` and `.metricCell strong` rules (no longer used).

Add at the end of the file:

```css
.viewLink {
  color: color-mix(in srgb, var(--brand-2) 72%, white);
  text-decoration: none;
  font-size: 0.84rem;
  font-weight: 700;
}
```

- [ ] **Step 7: Commit**

```
git add src/app/app/orders/page.tsx src/app/app/orders/orders.module.css
git commit -m "feat(orders): replace allocation metric with status badge, remove action buttons"
```

---

### Task 4: Order detail page — full redesign

**Goal:** Remove the planning sidebar; add BOM + component + stock section per line; collapse labor by default; keep Re-run allocation and Move week.

**Files:**
- Modify: `src/app/app/orders/[orderId]/page.tsx`
- Modify: `src/app/app/orders/[orderId]/page.module.css`

**Acceptance Criteria:**
- [ ] "Planning controls" sidebar is gone
- [ ] 4 summary cards (Order value, Planned margin, Lines allocated, Labor scheduled) span the full width
- [ ] Each line card shows BOM version link + component table with available badges
- [ ] Lines with no active BOM show an amber "No active BOM" state with "Go to BOM →" link
- [ ] Short-stock components render a red ⚠ badge
- [ ] Labor operations are collapsed by default inside a `<details>` element
- [ ] "Re-run allocation" button in the header redirects back with `?allocated=1`
- [ ] Capacity warnings section still renders when overload exists
- [ ] Page loads without TypeScript errors

**Verify:** Open an order detail page — no sidebar visible; line cards show BOM section; labor is collapsed.

**Steps:**

- [ ] **Step 1: Update imports in `src/app/app/orders/[orderId]/page.tsx`**

Replace the current action imports:

```typescript
// OLD:
import {
  allocateAndPlanOrder,
  allocateOrder,
  planOrder,
  updateJobLaborPlanWeek,
} from "../actions";

// NEW:
import { allocateOrder, updateJobLaborPlanWeek } from "../actions";
import { getOrderLineStatus } from "@/lib/orders/order-line-status";
import { getWeekStart } from "@/lib/dates";
```

- [ ] **Step 2: Replace the `getDefaultWeekStart` usage**

The import added in Task 0 already covers this. Confirm line:
```typescript
const selectedWeek = query.week ?? getWeekStart();
```

- [ ] **Step 3: Replace the data fetching block**

Replace the existing two-stage query block (the `Promise.all` calls) with:

```typescript
const [{ data: order }, { data: orderLines }] = await Promise.all([
  supabase
    .from("orders")
    .select("id,shopify_order_id,order_number,status,created_at")
    .eq("id", orderId)
    .maybeSingle(),
  supabase
    .from("order_line")
    .select(
      "id,quantity,unit_sell_price,line_sell_price,variant_id,variant:variant_id(title,sku,product:product_id(title))"
    )
    .eq("order_id", orderId),
]);

if (!order) notFound();

const typedOrder = order as OrderRecord;
const typedLines = (orderLines ?? []) as OrderLineRecord[];
const lineRefs = typedLines.map((l) => ({
  id: l.id,
  variant_id: (l as unknown as { variant_id: string }).variant_id,
  quantity: l.quantity,
}));

const [
  lineStatusMap,
  { data: plannedSnapshots },
  { data: actualRollups },
  { data: laborPlans },
  { data: utilizationRows },
] = await Promise.all([
  getOrderLineStatus(supabase, /* tenantId */ await getTenantId(supabase), lineRefs),
  supabase
    .from("job_cost_snapshot")
    .select("order_line_id,planned_total_cost,planned_margin,planned_margin_pct")
    .eq("order_id", orderId),
  supabase
    .from("job_cost_actual_rollup")
    .select("order_line_id,actual_total_cost,actual_margin,actual_margin_pct,actual_hours_total")
    .eq("order_id", orderId),
  supabase
    .from("job_labor_plan")
    .select(
      "id,order_line_id,department_id,operation_name,week_start,sequence,planned_total_hours,department:department_id(name,code)"
    )
    .eq("order_id", orderId),
  supabase
    .from("department_utilization_week")
    .select("department_id,week_start,overload_hours,idle_hours,utilization_pct"),
]);
```

Add the `getTenantId` helper at the top of the file (after imports):

```typescript
async function getTenantId(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>
): Promise<string> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .single();
  return profile?.tenant_id ?? "";
}
```

Update `OrderLineRecord` type to include `variant_id`:

```typescript
type OrderLineRecord = {
  id: string;
  quantity: number;
  unit_sell_price: number;
  line_sell_price: number;
  variant_id: string;   // add this field
  variant:
    | { title: string | null; sku: string | null; product: { title: string | null } | { title: string | null }[] | null }
    | { title: string | null; sku: string | null; product: { title: string | null } | { title: string | null }[] | null }[]
    | null;
};
```

- [ ] **Step 4: Update the derived data maps**

Keep `plannedByLine`, `actualByLine`, `laborByLine`, `laborPlansByLine`, `utilizationMap`, `overloadSummary` exactly as-is (same logic, just `allocationByLine` is now removed — it comes from `lineStatusMap`).

Remove the `allocationByLine` reduce block entirely. Remove `allocatedLineCount` derivation and replace with:

```typescript
const allocatedLineCount = typedLines.filter(
  (line) => lineStatusMap.get(line.id)?.allocationState === "allocated"
).length;
```

- [ ] **Step 5: Rewrite the JSX return**

Replace the entire `return (...)` with:

```tsx
return (
  <div className={styles.page}>
    <div className={styles.topRow}>
      <Link href="/app/orders" className={styles.backButton}>
        {"← Back to orders"}
      </Link>
    </div>

    <PageHeader
      eyebrow="Order detail"
      title={`Order #${typedOrder.order_number ?? typedOrder.shopify_order_id ?? typedOrder.id.slice(0, 6)}`}
      description={`Shopify ${typedOrder.shopify_order_id ?? "--"} · Created ${new Date(
        typedOrder.created_at
      ).toLocaleDateString("en-GB")}`}
      actions={
        <div className={styles.headerActions}>
          <StatusBadge variant={statusVariant}>{typedOrder.status}</StatusBadge>
          <form action={allocateOrder}>
            <input type="hidden" name="order_id" value={typedOrder.id} />
            <input type="hidden" name="return_to" value={`/app/orders/${typedOrder.id}`} />
            <input type="hidden" name="idempotency_key" value={crypto.randomUUID()} />
            <button className={styles.secondary} type="submit">
              Re-run allocation
            </button>
          </form>
        </div>
      }
    />

    {query.allocated ? (
      <p className={styles.successMeta}>Allocation updated for this order.</p>
    ) : null}
    {query.planError ? (
      <p className={styles.errorMeta}>Error: {query.planError}</p>
    ) : null}

    <div className={styles.summaryCards}>
      <div className={styles.summaryCard}>
        <span>Order value</span>
        <strong>{formatCurrency(totals.sell)}</strong>
        <p>{typedLines.length} line{typedLines.length === 1 ? "" : "s"} in this order</p>
      </div>
      <div className={styles.summaryCard}>
        <span>Planned margin</span>
        <strong>{formatCurrency(totals.plannedMargin)}</strong>
        <p>{plannedLineCount} line{plannedLineCount === 1 ? "" : "s"} have a cost snapshot</p>
      </div>
      <div className={styles.summaryCard}>
        <span>Lines allocated</span>
        <strong>{allocatedLineCount} / {typedLines.length}</strong>
        {typedLines.length - allocatedLineCount > 0 ? (
          <p>{typedLines.length - allocatedLineCount} need{typedLines.length - allocatedLineCount === 1 ? "s" : ""} a BOM</p>
        ) : (
          <p>All lines allocated</p>
        )}
      </div>
      <div className={styles.summaryCard}>
        <span>Labor scheduled</span>
        <strong>{totals.hours.toFixed(1)} hrs</strong>
        <p>{formatCurrency(totals.actualMargin)} actual margin recorded</p>
      </div>
    </div>

    {overloadSummary.length > 0 ? (
      <section className={styles.warningPanel}>
        <div className={styles.warningHeader}>
          <div>
            <p className={styles.eyebrow}>Capacity risks</p>
            <h2>Department weeks already over capacity</h2>
          </div>
          <StatusBadge variant="danger">
            {overloadSummary.length} conflict{overloadSummary.length === 1 ? "" : "s"}
          </StatusBadge>
        </div>
        <div className={styles.warningList}>
          {overloadSummary.map((warning) => (
            <div key={`${warning.departmentName}-${warning.weekStart}`} className={styles.warningCard}>
              <strong>{warning.departmentName}</strong>
              <p>Week of {warning.weekStart}</p>
              <span>{warning.overloadHours.toFixed(1)} hrs over capacity</span>
              <Link href={`/app/staffing?week=${warning.weekStart}`} className={styles.warningLink}>
                Adjust staffing week
              </Link>
            </div>
          ))}
        </div>
      </section>
    ) : null}

    <section className={styles.linesSection}>
      <div className={styles.sectionHeader}>
        <div>
          <p className={styles.eyebrow}>Order lines</p>
          <h2>Components reserved · BOM · Labor</h2>
        </div>
      </div>

      {typedLines.length === 0 ? (
        <EmptyState
          title="No order lines found"
          message="This order has no synced line items. Trigger a Shopify sync to populate them."
        />
      ) : (
        <div className={styles.lineList}>
          {typedLines.map((line) => {
            const variant = firstRelation(line.variant);
            const product = firstRelation(variant?.product);
            const planned = plannedByLine.get(line.id);
            const plannedHours = laborByLine[line.id] ?? 0;
            const lineLaborPlans = laborPlansByLine[line.id] ?? [];
            const lineStatus = lineStatusMap.get(line.id);
            const allocationState = lineStatus?.allocationState ?? "no-bom";

            return (
              <article
                key={line.id}
                className={`${styles.lineCard} ${allocationState !== "allocated" ? styles.lineCardWarning : ""}`}
              >
                <div className={styles.lineHeader}>
                  <div className={styles.lineIdentity}>
                    <div className={styles.lineHeading}>
                      <h3>{product?.title ?? variant?.title ?? "Variant"}</h3>
                      <StatusBadge variant={allocationState === "allocated" ? "success" : "warning"}>
                        {allocationState === "allocated" ? "✓ Allocated" : "⚠ No active BOM"}
                      </StatusBadge>
                    </div>
                    <p className={styles.meta}>
                      {variant?.sku ?? "No SKU"} · Qty {line.quantity} · {formatCurrency(line.unit_sell_price)} each
                      {lineStatus?.bom ? (
                        <>
                          {" · "}
                          <Link href={`/app/bom`} className={styles.bomLink}>
                            BOM v{lineStatus.bom.version} →
                          </Link>
                        </>
                      ) : null}
                    </p>
                  </div>
                  <div className={styles.lineMargin}>
                    <span>Planned margin</span>
                    <strong>
                      {planned
                        ? `${formatCurrency(planned.planned_margin)} (${planned.planned_margin_pct.toFixed(1)}%)`
                        : "—"}
                    </strong>
                  </div>
                </div>

                {allocationState === "allocated" && lineStatus && lineStatus.components.length > 0 ? (
                  <div className={styles.componentSection}>
                    <p className={styles.componentLabel}>
                      Reserved components — BOM v{lineStatus.bom?.version} × {line.quantity}
                    </p>
                    <div className={styles.componentTable}>
                      {lineStatus.components.map((comp) => (
                        <div key={comp.componentId} className={styles.componentRow}>
                          <span className={styles.componentName}>{comp.name}</span>
                          <span className={styles.componentQty}>{comp.requiredQty.toFixed(2)} units</span>
                          <span className={comp.isShort ? styles.shortBadge : styles.okBadge}>
                            {comp.isShort ? `⚠ ${comp.availableQty.toFixed(2)} avail` : `${comp.availableQty.toFixed(2)} avail`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {allocationState !== "allocated" ? (
                  <div className={styles.noBomCard}>
                    <p>
                      {allocationState === "empty-bom"
                        ? "Allocation skipped — the active BOM has no components. Add components to the BOM and re-run allocation."
                        : "Allocation skipped — create an active BOM for this variant to reserve components and generate a cost plan."}
                    </p>
                    <Link href="/app/bom" className={styles.bomLink}>
                      Go to BOM →
                    </Link>
                  </div>
                ) : null}

                <details className={styles.laborSection}>
                  <summary className={styles.laborToggle}>
                    Labor: {lineLaborPlans.length} operation{lineLaborPlans.length === 1 ? "" : "s"} · {plannedHours.toFixed(1)} hrs
                  </summary>
                  {lineLaborPlans.length === 0 ? (
                    <EmptyState
                      title="No labor operations planned"
                      message="Run planning for this order to place labor by department and week."
                    />
                  ) : (
                    <div className={styles.planList}>
                      {lineLaborPlans.map((plan) => {
                        const department = firstRelation(plan.department);
                        const utilization = utilizationMap.get(`${plan.department_id}:${plan.week_start}`);
                        const overload = Number(utilization?.overload_hours ?? 0);

                        return (
                          <form key={plan.id} action={updateJobLaborPlanWeek} className={styles.planRow}>
                            <input type="hidden" name="plan_id" value={plan.id} />
                            <input type="hidden" name="order_id" value={typedOrder.id} />
                            <input type="hidden" name="return_to" value={`/app/orders/${typedOrder.id}`} />
                            <div className={styles.planIdentity}>
                              <strong>{plan.operation_name}</strong>
                              <p className={styles.meta}>
                                {department?.name ?? "Department"} · Seq {plan.sequence}
                              </p>
                            </div>
                            <div className={styles.planMeta}>
                              <div className={styles.planMetaItem}>
                                <span>Hours</span>
                                <strong>{plan.planned_total_hours.toFixed(1)}</strong>
                              </div>
                              <div className={styles.planMetaItem}>
                                <span>Capacity</span>
                                <strong className={overload > 0 ? styles.capacityDanger : styles.capacitySafe}>
                                  {overload > 0
                                    ? `Over by ${overload.toFixed(1)} hrs`
                                    : `Spare ${Number(utilization?.idle_hours ?? 0).toFixed(1)} hrs`}
                                </strong>
                              </div>
                            </div>
                            <div className={styles.weekField}>
                              <label>
                                <span>Week</span>
                                <input name="week_start" type="date" defaultValue={plan.week_start} />
                              </label>
                              <button className={styles.secondary} type="submit">
                                Move week
                              </button>
                            </div>
                          </form>
                        );
                      })}
                    </div>
                  )}
                </details>
              </article>
            );
          })}
        </div>
      )}
    </section>
  </div>
);
```

- [ ] **Step 6: Rewrite `page.module.css`**

Replace the entire file content:

```css
.page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.topRow {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.backButton {
  color: color-mix(in srgb, var(--brand-2) 72%, white);
  text-decoration: none;
  font-size: 0.84rem;
  font-weight: 700;
}

.meta,
.successMeta,
.errorMeta {
  margin: 0;
  color: var(--ink-muted);
  font-size: 0.9rem;
}

.successMeta { color: var(--ok); }
.errorMeta   { color: var(--danger); }

.headerActions {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

/* Summary cards */
.summaryCards {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.summaryCard {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--surface) 82%, transparent);
  border: 1px solid color-mix(in srgb, var(--stroke) 66%, transparent);
}

.summaryCard span {
  font-size: 0.74rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: var(--ink-faint);
}

.summaryCard strong {
  font-size: clamp(1.15rem, 0.8vw + 1rem, 1.9rem);
  line-height: 1;
  color: var(--ink-strong);
}

.summaryCard p {
  margin: 0;
  color: var(--ink-muted);
}

/* Capacity warnings */
.warningPanel {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 24px;
  border: 1px solid color-mix(in srgb, var(--stroke-strong) 70%, transparent);
  border-radius: 24px;
  background:
    radial-gradient(circle at top left, color-mix(in srgb, var(--danger) 12%, transparent), transparent 48%),
    linear-gradient(180deg, color-mix(in srgb, var(--surface-raised) 92%, transparent), color-mix(in srgb, var(--surface) 94%, transparent));
  box-shadow: 0 18px 38px rgba(5, 8, 15, 0.2);
}

.warningHeader {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.warningHeader h2 { margin: 6px 0 0; color: var(--ink-strong); }

.eyebrow {
  font-size: 0.74rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: var(--ink-faint);
}

.warningList {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.warningCard {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--danger) 10%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--danger) 28%, transparent);
}

.warningCard p, .warningCard span { margin: 0; color: var(--ink-muted); }
.warningLink { color: #ff9472; text-decoration: none; font-weight: 700; }

/* Lines section */
.linesSection {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 24px;
  border: 1px solid color-mix(in srgb, var(--stroke-strong) 70%, transparent);
  border-radius: 24px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--surface-raised) 92%, transparent), color-mix(in srgb, var(--surface) 94%, transparent));
  box-shadow: 0 18px 38px rgba(5, 8, 15, 0.2);
}

.sectionHeader { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.sectionHeader h2 { margin: 6px 0 0; color: var(--ink-strong); }

.lineList {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* Line cards */
.lineCard {
  border: 1px solid color-mix(in srgb, var(--stroke-strong) 70%, transparent);
  border-radius: 18px;
  background: color-mix(in srgb, var(--surface) 82%, transparent);
  overflow: hidden;
}

.lineCardWarning {
  border-color: color-mix(in srgb, var(--warn, #f59e0b) 40%, transparent);
}

.lineHeader {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  padding: 18px 20px 14px;
}

.lineIdentity { display: flex; flex-direction: column; gap: 8px; }

.lineHeading {
  display: flex;
  align-items: center;
  gap: 10px;
}

.lineHeading h3 { margin: 0; color: var(--ink-strong); }

.lineMargin {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: right;
  flex-shrink: 0;
}

.lineMargin span {
  font-size: 0.74rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--ink-faint);
}

.lineMargin strong { color: var(--ink-strong); }

.bomLink {
  color: color-mix(in srgb, var(--brand-2) 72%, white);
  text-decoration: none;
  font-weight: 700;
  font-size: 0.84rem;
}

/* Component table */
.componentSection {
  padding: 10px 20px 14px;
  border-top: 1px solid color-mix(in srgb, var(--stroke) 50%, transparent);
  background: color-mix(in srgb, var(--surface) 40%, transparent);
}

.componentLabel {
  margin: 0 0 10px;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink-faint);
}

.componentTable { display: flex; flex-direction: column; gap: 6px; }

.componentRow {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 16px;
  align-items: center;
  font-size: 0.88rem;
}

.componentName { color: var(--ink-muted); }
.componentQty  { color: var(--ink-strong); font-weight: 600; text-align: right; }

.okBadge, .shortBadge {
  padding: 1px 8px;
  border-radius: 4px;
  font-size: 0.78rem;
  font-weight: 600;
  white-space: nowrap;
}

.okBadge    { background: color-mix(in srgb, var(--ok) 15%, transparent); color: var(--ok); }
.shortBadge { background: color-mix(in srgb, var(--danger) 15%, transparent); color: var(--danger); }

/* No-BOM warning card */
.noBomCard {
  margin: 0 20px 14px;
  padding: 14px 16px;
  border-radius: 12px;
  background: color-mix(in srgb, #f59e0b 8%, transparent);
  border: 1px solid color-mix(in srgb, #f59e0b 30%, transparent);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.noBomCard p { margin: 0; color: var(--ink-muted); font-size: 0.88rem; }

/* Labor disclosure */
.laborSection {
  border-top: 1px solid color-mix(in srgb, var(--stroke) 50%, transparent);
}

.laborToggle {
  padding: 12px 20px;
  font-size: 0.88rem;
  color: var(--ink-muted);
  cursor: pointer;
  list-style: none;
  user-select: none;
}

.laborToggle::-webkit-details-marker { display: none; }

.laborSection[open] .laborToggle { border-bottom: 1px solid color-mix(in srgb, var(--stroke) 50%, transparent); }

.planList { display: flex; flex-direction: column; gap: 14px; padding: 14px 20px; }

.planRow {
  display: grid;
  grid-template-columns: minmax(0, 1.3fr) minmax(220px, 0.9fr) minmax(220px, 0.9fr);
  gap: 14px;
  padding: 14px 16px;
  border: 1px solid color-mix(in srgb, var(--stroke-strong) 70%, transparent);
  border-radius: 14px;
  background: color-mix(in srgb, var(--surface-raised) 72%, transparent);
  box-shadow: 0 18px 38px rgba(5, 8, 15, 0.2);
}

.planIdentity, .planMeta { display: flex; flex-direction: column; gap: 8px; }

.planMeta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.planMetaItem {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface) 84%, transparent);
  border: 1px solid color-mix(in srgb, var(--stroke) 66%, transparent);
}

.planMetaItem span {
  font-size: 0.74rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: var(--ink-faint);
}

.planMetaItem strong { color: var(--ink-strong); }

.capacityDanger { color: #ff9472; }
.capacitySafe   { color: var(--ok); }

.weekField {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 12px;
}

.weekField label { display: flex; flex-direction: column; gap: 8px; }

.weekField span {
  font-size: 0.74rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: var(--ink-faint);
}

.weekField input {
  border: 1px solid color-mix(in srgb, var(--stroke) 78%, transparent);
  border-radius: 14px;
  min-height: 44px;
  padding: 0 14px;
  background: color-mix(in srgb, var(--surface) 84%, transparent);
  color: var(--ink-strong);
  font: inherit;
}

/* Buttons */
.primary, .secondary {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  padding: 0 18px;
  border-radius: 999px;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
}

.primary {
  border: none;
  background: linear-gradient(135deg, color-mix(in srgb, var(--brand-2) 72%, #142131), color-mix(in srgb, var(--brand-1) 88%, #0e1624));
  color: #f8fbff;
}

.secondary {
  border: 1px solid color-mix(in srgb, var(--stroke-strong) 72%, transparent);
  background: color-mix(in srgb, var(--surface-raised) 72%, transparent);
  color: var(--ink-strong);
}

/* Responsive */
@media (max-width: 1180px) {
  .summaryCards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .planRow      { grid-template-columns: 1fr; }
  .componentRow { grid-template-columns: 1fr auto auto; }
}

@media (max-width: 840px) {
  .summaryCards { grid-template-columns: 1fr; }
  .lineHeader   { flex-direction: column; }
  .lineMargin   { text-align: left; }
  .headerActions, .warningHeader, .sectionHeader { flex-direction: column; align-items: flex-start; }
  .planMeta     { grid-template-columns: 1fr; }
}
```

- [ ] **Step 7: Remove unused type declarations and props**

In `page.tsx`, remove the `UtilizationRow` type if no longer used in isolation (it's still used — keep it). Remove the `Props.searchParams.planned` field from the type (the `?planned` query param is no longer set by any action on this page). Keep `?allocated` and `?planError`.

Update `Props`:
```typescript
type Props = {
  params: Promise<{ orderId: string }>;
  searchParams?: Promise<{
    allocated?: string;
    planError?: string;
    week?: string;
  }>;
};
```

- [ ] **Step 8: Commit**

```
git add src/app/app/orders/[orderId]/page.tsx src/app/app/orders/[orderId]/page.module.css
git commit -m "feat(orders): redesign order detail — BOM visibility, collapsed labor, remove planning sidebar"
```
