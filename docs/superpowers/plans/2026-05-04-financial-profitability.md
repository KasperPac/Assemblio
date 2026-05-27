# Product Profitability Analytics — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `/app/profitability` page with per-job and per-product margin views, backed by a fixed Shopify sell price sync and a new Postgres view.

**Architecture:** Fix the Shopify GraphQL sync to capture sell price, add a `product_profitability` Postgres view for variant-level aggregation, then build a server-component page that fetches both datasets and passes them to a client-side tabbed UI. No schema migrations — the cost breakdown columns already exist on `job_cost_snapshot` and `job_cost_actual_rollup`.

**Tech Stack:** Next.js 14 App Router (server + client components), Supabase JS client, Vitest, CSS Modules, inline SVG icons.

---

## File Structure

**New files:**
- `supabase/patches/product_profitability_analytics.sql` — Postgres view aggregating margin by variant
- `src/lib/shopify/sync.test.ts` — unit tests for `buildOrderLineRows`
- `src/app/app/profitability/page.tsx` — server component; fetches snapshots, actuals, and product view
- `src/app/app/profitability/profitability-tabs.tsx` — client component; manages active tab and variant filter state
- `src/app/app/profitability/by-job-tab.tsx` — client component; table with expandable cost breakdown rows
- `src/app/app/profitability/by-product-tab.tsx` — client component; aggregated table with click-through
- `src/app/app/profitability/actions.ts` — server action for re-syncing Shopify prices
- `src/app/app/profitability/profitability.module.css` — styles for tabs, badges, breakdown grid, profitability tables

**Modified files:**
- `src/lib/shopify/sync.ts` — extract `buildOrderLineRows` helper; add `discountedUnitPriceSet` to GraphQL query and type; update `orderLineRows` flatMap
- `src/app/app/sidebar-nav.tsx` — add Profitability nav item after Costing in the Planning section

---

### Task 0: Fix Shopify sell price capture

**Goal:** `order_line.unit_sell_price` and `line_sell_price` are populated from Shopify when orders sync.

**Files:**
- Modify: `src/lib/shopify/sync.ts` lines 21–27 (type), 150–154 (GraphQL), 270–291 (flatMap)
- Create: `src/lib/shopify/sync.test.ts`

**Acceptance Criteria:**
- [ ] `buildOrderLineRows` is exported from `sync.ts` as a pure function
- [ ] It maps `discountedUnitPriceSet.shopMoney.amount` → `unit_sell_price` (numeric)
- [ ] It computes `line_sell_price = unit_sell_price × quantity`
- [ ] When multiple line items collapse to the same variant, quantities are summed and the first price seen is kept
- [ ] Null price defaults to 0
- [ ] All 4 tests pass

**Verify:** `npm test -- src/lib/shopify/sync.test.ts` → 4 tests pass

**Steps:**

- [ ] **Step 1: Write failing tests**

Create `src/lib/shopify/sync.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { buildOrderLineRows } from "./sync";

describe("buildOrderLineRows", () => {
  it("maps discounted unit price to unit_sell_price and line_sell_price", () => {
    const variantMap = new Map([["gid://shopify/ProductVariant/1", "local-v1"]]);
    const lineItems = [
      {
        quantity: 3,
        variant: { id: "gid://shopify/ProductVariant/1" },
        discountedUnitPriceSet: { shopMoney: { amount: "50.00" } },
      },
    ];
    const rows = buildOrderLineRows(lineItems, "order-id", variantMap, "tenant-id");
    expect(rows).toEqual([
      {
        tenant_id: "tenant-id",
        order_id: "order-id",
        variant_id: "local-v1",
        quantity: 3,
        unit_sell_price: 50,
        line_sell_price: 150,
      },
    ]);
  });

  it("collapses duplicate variants — sums quantity, keeps first price", () => {
    const variantMap = new Map([["gid://shopify/ProductVariant/1", "local-v1"]]);
    const lineItems = [
      {
        quantity: 2,
        variant: { id: "gid://shopify/ProductVariant/1" },
        discountedUnitPriceSet: { shopMoney: { amount: "40.00" } },
      },
      {
        quantity: 1,
        variant: { id: "gid://shopify/ProductVariant/1" },
        discountedUnitPriceSet: { shopMoney: { amount: "40.00" } },
      },
    ];
    const rows = buildOrderLineRows(lineItems, "order-id", variantMap, "tenant-id");
    expect(rows).toHaveLength(1);
    expect(rows[0].quantity).toBe(3);
    expect(rows[0].unit_sell_price).toBe(40);
    expect(rows[0].line_sell_price).toBe(120);
  });

  it("defaults to 0 when discountedUnitPriceSet is null", () => {
    const variantMap = new Map([["gid://shopify/ProductVariant/1", "local-v1"]]);
    const lineItems = [
      {
        quantity: 1,
        variant: { id: "gid://shopify/ProductVariant/1" },
        discountedUnitPriceSet: null,
      },
    ];
    const rows = buildOrderLineRows(lineItems, "order-id", variantMap, "tenant-id");
    expect(rows[0].unit_sell_price).toBe(0);
    expect(rows[0].line_sell_price).toBe(0);
  });

  it("skips line items whose variant is not in variantMap", () => {
    const variantMap = new Map<string, string>();
    const lineItems = [
      {
        quantity: 5,
        variant: { id: "gid://shopify/ProductVariant/999" },
        discountedUnitPriceSet: { shopMoney: { amount: "10.00" } },
      },
    ];
    const rows = buildOrderLineRows(lineItems, "order-id", variantMap, "tenant-id");
    expect(rows).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests — expect failure**

```bash
npm test -- src/lib/shopify/sync.test.ts
```

Expected: FAIL — `buildOrderLineRows` is not exported

- [ ] **Step 3: Update `ShopifyOrderNode` type in `sync.ts` (line 21–27)**

Replace the existing `ShopifyOrderNode` type:

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
      discountedUnitPriceSet: { shopMoney: { amount: string } } | null;
    }>;
  };
};
```

- [ ] **Step 4: Add `buildOrderLineRows` export just before `syncShopifyStoreData` (line 178)**

Insert this function (and its local type) before the `export async function syncShopifyStoreData` line:

```typescript
type OrderLineRow = {
  tenant_id: string;
  order_id: string;
  variant_id: string;
  quantity: number;
  unit_sell_price: number;
  line_sell_price: number;
};

export function buildOrderLineRows(
  lineItems: ShopifyOrderNode["lineItems"]["nodes"],
  orderId: string,
  variantMap: Map<string, string>,
  tenantId: string
): OrderLineRow[] {
  const variantData = new Map<string, { quantity: number; unitPrice: number }>();
  for (const lineItem of lineItems) {
    const shopifyVariantId = lineItem.variant?.id;
    const localVariantId = shopifyVariantId
      ? variantMap.get(shopifyVariantId)
      : undefined;
    if (!localVariantId) continue;
    const unitPrice = parseFloat(
      lineItem.discountedUnitPriceSet?.shopMoney?.amount ?? "0"
    );
    const existing = variantData.get(localVariantId);
    variantData.set(localVariantId, {
      quantity: (existing?.quantity ?? 0) + lineItem.quantity,
      unitPrice: existing?.unitPrice ?? unitPrice,
    });
  }
  return Array.from(variantData.entries()).map(([variantId, data]) => ({
    tenant_id: tenantId,
    order_id: orderId,
    variant_id: variantId,
    quantity: data.quantity,
    unit_sell_price: data.unitPrice,
    line_sell_price: data.unitPrice * data.quantity,
  }));
}
```

- [ ] **Step 5: Update the GraphQL query in `fetchOrders` (lines 150–154)**

Replace the `lineItems` block inside the `query` template literal:

```graphql
          lineItems(first: 100) {
            nodes {
              quantity
              variant { id }
              discountedUnitPriceSet {
                shopMoney { amount }
              }
            }
          }
```

- [ ] **Step 6: Replace the `orderLineRows` flatMap (lines 270–291) to use the helper**

Replace everything from `const orderLineRows = orders.flatMap(` through the closing `});` on line 291 with:

```typescript
  const orderLineRows = orders.flatMap((order) => {
    const orderId = orderMap.get(order.id);
    if (!orderId) return [];
    return buildOrderLineRows(order.lineItems.nodes, orderId, variantMap, tenantId);
  });
```

- [ ] **Step 7: Run tests — expect all pass**

```bash
npm test -- src/lib/shopify/sync.test.ts
```

Expected: 4 tests pass

- [ ] **Step 8: Commit**

```bash
git add src/lib/shopify/sync.ts src/lib/shopify/sync.test.ts
git commit -m "feat: capture sell price from Shopify line items in order sync"
```

---

### Task 1: product_profitability database view

**Goal:** A Postgres view that aggregates planned and actual margin by variant across all jobs exists in the DB.

**Files:**
- Create: `supabase/patches/product_profitability_analytics.sql`

**Acceptance Criteria:**
- [ ] View `public.product_profitability` exists
- [ ] Has columns: `tenant_id`, `variant_id`, `variant_title`, `product_title`, `job_count`, `total_revenue`, `avg_planned_margin_pct`, `avg_actual_margin_pct`, `total_actual_margin`
- [ ] `security_invoker = true` so RLS from underlying tables applies
- [ ] Applied to local Supabase without error

**Verify:** Apply patch and run `select count(*) from product_profitability;` — returns a number without error.

**Steps:**

- [ ] **Step 1: Create the patch file**

Create `supabase/patches/product_profitability_analytics.sql`:

```sql
create or replace view public.product_profitability
  with (security_invoker = true)
as
select
  ol.tenant_id,
  sv.id                                        as variant_id,
  sv.title                                     as variant_title,
  sp.title                                     as product_title,
  count(jcs.id)::int                           as job_count,
  coalesce(sum(jcs.sell_price), 0)             as total_revenue,
  avg(jcs.planned_margin_pct)                  as avg_planned_margin_pct,
  avg(jcar.actual_margin_pct)                  as avg_actual_margin_pct,
  sum(jcar.actual_margin)                      as total_actual_margin
from public.order_line ol
join public.job_cost_snapshot jcs
  on jcs.order_line_id = ol.id
join public.shopify_variant sv
  on sv.id = ol.variant_id
join public.shopify_product sp
  on sp.id = sv.product_id
left join public.job_cost_actual_rollup jcar
  on jcar.order_line_id = ol.id
group by
  ol.tenant_id,
  sv.id,
  sv.title,
  sp.title;
```

- [ ] **Step 2: Apply to local Supabase**

```bash
psql postgresql://postgres:postgres@localhost:54322/postgres -f supabase/patches/product_profitability_analytics.sql
```

Expected: `CREATE VIEW`

- [ ] **Step 3: Verify the view returns expected shape**

```bash
psql postgresql://postgres:postgres@localhost:54322/postgres -c "select column_name from information_schema.columns where table_name = 'product_profitability' order by ordinal_position;"
```

Expected output includes: `tenant_id`, `variant_id`, `variant_title`, `product_title`, `job_count`, `total_revenue`, `avg_planned_margin_pct`, `avg_actual_margin_pct`, `total_actual_margin`

- [ ] **Step 4: Commit**

```bash
git add supabase/patches/product_profitability_analytics.sql
git commit -m "feat: add product_profitability view for per-variant margin rollup"
```

---

### Task 2: Profitability page shell, nav item, and stub components

**Goal:** Navigating to `/app/profitability` shows a page with By Job and By Product tabs (empty state). Sidebar shows Profitability link in the Planning section.

**Files:**
- Modify: `src/app/app/sidebar-nav.tsx`
- Create: `src/app/app/profitability/page.tsx`
- Create: `src/app/app/profitability/profitability-tabs.tsx`
- Create: `src/app/app/profitability/by-job-tab.tsx`
- Create: `src/app/app/profitability/by-product-tab.tsx`
- Create: `src/app/app/profitability/profitability.module.css`

**Acceptance Criteria:**
- [ ] Profitability link appears in the sidebar under Planning, after Costing
- [ ] `/app/profitability` loads without errors
- [ ] "By Job" and "By Product" tabs are visible and switchable
- [ ] TypeScript compiles without errors

**Verify:** `npx tsc --noEmit` → no output (zero errors)

**Steps:**

- [ ] **Step 1: Add nav item to `sidebar-nav.tsx`**

In `src/app/app/sidebar-nav.tsx`, locate the Costing nav item (around line 138). After the closing `},` of the Costing item (after line 147), insert:

```typescript
      {
        label: "Profitability",
        href: "/app/profitability",
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
            <polyline points="16 7 22 7 22 13" />
          </svg>
        ),
      },
```

- [ ] **Step 2: Create `profitability.module.css`**

Create `src/app/app/profitability/profitability.module.css`:

```css
/* Tab bar */
.tabBar {
  display: flex;
  gap: 4px;
  padding: 4px;
  background: color-mix(in srgb, var(--surface) 82%, transparent);
  border: 1px solid color-mix(in srgb, var(--stroke) 66%, transparent);
  border-radius: 18px;
  width: fit-content;
  margin-bottom: 16px;
}

.tab {
  padding: 8px 20px;
  border-radius: 14px;
  border: none;
  background: transparent;
  color: var(--ink-muted);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.tabActive {
  background: color-mix(in srgb, var(--surface-raised) 96%, transparent);
  color: var(--ink-strong);
  box-shadow: 0 1px 4px rgba(5, 8, 15, 0.18);
}

/* Status badges */
.badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
}

.badgeActual {
  background: rgba(52, 211, 153, 0.15);
  color: #10b981;
}

.badgePlanned {
  background: color-mix(in srgb, var(--surface) 82%, transparent);
  color: var(--ink-muted);
  border: 1px solid color-mix(in srgb, var(--stroke) 66%, transparent);
}

/* Profitability table wrapper */
.profitTable {
  border: 1px solid color-mix(in srgb, var(--stroke-strong) 70%, transparent);
  border-radius: 22px;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--surface-raised) 92%, transparent),
    color-mix(in srgb, var(--surface) 94%, transparent)
  );
  box-shadow: 0 18px 38px rgba(5, 8, 15, 0.2);
  overflow: hidden;
}

/* Job table: 8 columns */
.jobHeader,
.jobRow {
  display: grid;
  grid-template-columns: minmax(60px, 0.7fr) minmax(0, 1.6fr) 0.8fr 0.6fr 0.8fr 0.8fr 0.8fr 100px;
  gap: 10px;
  padding: 12px 20px;
  align-items: center;
}

.jobHeader {
  color: var(--ink-faint);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  border-bottom: 1px solid color-mix(in srgb, var(--stroke) 50%, transparent);
}

.jobRow {
  cursor: pointer;
  border-bottom: 1px solid color-mix(in srgb, var(--stroke) 40%, transparent);
  transition: background 0.1s;
}

.jobRow:last-child {
  border-bottom: none;
}

.jobRow:hover {
  background: color-mix(in srgb, var(--surface) 60%, transparent);
}

/* Expandable cost breakdown */
.breakdown {
  grid-column: 1 / -1;
  padding: 16px 20px 20px;
  background: color-mix(in srgb, var(--surface) 60%, transparent);
  border-top: 1px solid color-mix(in srgb, var(--stroke) 40%, transparent);
  font-size: 0.88rem;
}

.breakdownGrid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) repeat(2, 110px);
  gap: 6px 12px;
  max-width: 400px;
}

.breakdownLabel {
  color: var(--ink-faint);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-weight: 700;
}

.breakdownDivider {
  grid-column: 1 / -1;
  height: 1px;
  background: color-mix(in srgb, var(--stroke) 50%, transparent);
  margin: 4px 0;
}

.asteriskNote {
  margin-top: 10px;
  font-size: 0.8rem;
  color: var(--ink-muted);
}

/* Product table: 5 columns */
.productHeader,
.productRow {
  display: grid;
  grid-template-columns: minmax(0, 2fr) 0.6fr 1fr 1fr 1fr;
  gap: 10px;
  padding: 12px 20px;
  align-items: center;
}

.productHeader {
  color: var(--ink-faint);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  border-bottom: 1px solid color-mix(in srgb, var(--stroke) 50%, transparent);
}

.productRow {
  cursor: pointer;
  border-bottom: 1px solid color-mix(in srgb, var(--stroke) 40%, transparent);
  transition: background 0.1s;
}

.productRow:last-child {
  border-bottom: none;
}

.productRow:hover {
  background: color-mix(in srgb, var(--surface) 60%, transparent);
}

.emptyState {
  padding: 32px 20px;
  color: var(--ink-muted);
  text-align: center;
  font-size: 0.95rem;
}

@media (max-width: 900px) {
  .jobHeader,
  .jobRow,
  .productHeader,
  .productRow {
    grid-template-columns: 1fr;
  }

  .jobHeader,
  .productHeader {
    display: none;
  }
}
```

- [ ] **Step 3: Create `by-job-tab.tsx` stub**

Create `src/app/app/profitability/by-job-tab.tsx`:

```typescript
"use client";

export type JobRow = {
  id: string;
  order_line_id: string;
  variant_id: string;
  order_number: string;
  product_title: string;
  variant_title: string;
  quantity: number;
  sell_price: number;
  planned_material_cost: number;
  planned_labor_cost: number;
  planned_overhead_cost: number;
  planned_total_cost: number;
  planned_margin: number;
  planned_margin_pct: number;
  actual_material_cost: number | null;
  actual_labor_cost: number | null;
  actual_overhead_cost: number | null;
  actual_total_cost: number | null;
  actual_margin: number | null;
  actual_margin_pct: number | null;
};

type Props = {
  jobs: JobRow[];
  variantFilter: string | null;
};

export default function ByJobTab({ jobs, variantFilter }: Props) {
  const filtered = variantFilter
    ? jobs.filter((j) => j.variant_id === variantFilter)
    : jobs;
  if (filtered.length === 0) {
    return (
      <p style={{ color: "var(--ink-muted)", padding: "24px 0" }}>
        No jobs with cost snapshots yet. Generate financial plans from the
        Costing page first.
      </p>
    );
  }
  return (
    <p style={{ color: "var(--ink-muted)" }}>
      {filtered.length} job{filtered.length !== 1 ? "s" : ""} — full
      table implemented in Task 3.
    </p>
  );
}
```

- [ ] **Step 4: Create `by-product-tab.tsx` stub**

Create `src/app/app/profitability/by-product-tab.tsx`:

```typescript
"use client";

export type ProductRow = {
  tenant_id: string;
  variant_id: string;
  variant_title: string | null;
  product_title: string | null;
  job_count: number;
  total_revenue: number | null;
  avg_planned_margin_pct: number | null;
  avg_actual_margin_pct: number | null;
  total_actual_margin: number | null;
};

type Props = {
  products: ProductRow[];
  onVariantClick: (variantId: string) => void;
};

export default function ByProductTab({ products, onVariantClick }: Props) {
  void onVariantClick; // used in Task 4
  if (products.length === 0) {
    return (
      <p style={{ color: "var(--ink-muted)", padding: "24px 0" }}>
        No product profitability data yet.
      </p>
    );
  }
  return (
    <p style={{ color: "var(--ink-muted)" }}>
      {products.length} product{products.length !== 1 ? "s" : ""} — full
      table implemented in Task 4.
    </p>
  );
}
```

- [ ] **Step 5: Create `profitability-tabs.tsx`**

Create `src/app/app/profitability/profitability-tabs.tsx`:

```typescript
"use client";

import { useState } from "react";
import styles from "./profitability.module.css";
import ByJobTab, { type JobRow } from "./by-job-tab";
import ByProductTab, { type ProductRow } from "./by-product-tab";

type Props = {
  jobs: JobRow[];
  products: ProductRow[];
};

const TABS = ["By Job", "By Product"] as const;
type Tab = (typeof TABS)[number];

export default function ProfitabilityTabs({ jobs, products }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("By Job");
  const [variantFilter, setVariantFilter] = useState<string | null>(null);

  function handleProductClick(variantId: string) {
    setVariantFilter(variantId);
    setActiveTab("By Job");
  }

  return (
    <div>
      <div className={styles.tabBar}>
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ""}`}
            onClick={() => {
              setActiveTab(tab);
              if (tab === "By Product") setVariantFilter(null);
            }}
          >
            {tab}
          </button>
        ))}
      </div>
      {activeTab === "By Job" && (
        <ByJobTab jobs={jobs} variantFilter={variantFilter} />
      )}
      {activeTab === "By Product" && (
        <ByProductTab products={products} onVariantClick={handleProductClick} />
      )}
    </div>
  );
}
```

- [ ] **Step 6: Create `page.tsx` skeleton**

Create `src/app/app/profitability/page.tsx`:

```typescript
import styles from "../planning.module.css";
import ProfitabilityTabs from "./profitability-tabs";
import type { JobRow } from "./by-job-tab";
import type { ProductRow } from "./by-product-tab";

export default async function ProfitabilityPage() {
  const jobs: JobRow[] = [];
  const products: ProductRow[] = [];

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Financial Analytics</span>
          <h1>Profitability</h1>
          <p>Job and product-level margin tracking.</p>
        </div>
      </div>
      <ProfitabilityTabs jobs={jobs} products={products} />
    </div>
  );
}
```

- [ ] **Step 7: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no output

- [ ] **Step 8: Commit**

```bash
git add src/app/app/sidebar-nav.tsx src/app/app/profitability/
git commit -m "feat: add /app/profitability page shell and nav item"
```

---

### Task 3: By Job tab — full table with cost breakdown

**Goal:** The By Job tab shows every order line that has a cost snapshot, with correct margin data, status badges, and an inline cost breakdown on row expansion.

**Files:**
- Modify: `src/app/app/profitability/page.tsx` — add data fetching
- Modify: `src/app/app/profitability/by-job-tab.tsx` — replace stub with full table

**Acceptance Criteria:**
- [ ] Table displays all rows with Order #, Product, Variant, Qty, Sell Price, Cost, Margin $, Margin %, Status
- [ ] Green "Actual" badge when `actual_total_cost > 0`; grey "Planned" badge otherwise
- [ ] Clicking a row toggles an inline breakdown showing Materials / Labor / Overhead in Planned and (if Actual) Actual columns
- [ ] Asterisk note on Actual Materials column: "Actual material tracking coming soon"
- [ ] Default sort: lowest margin % first
- [ ] Variant filter from By Product tab works correctly

**Verify:** `npx tsc --noEmit` → no output

**Steps:**

- [ ] **Step 1: Replace `page.tsx` with full data-fetching version**

Replace `src/app/app/profitability/page.tsx` entirely:

```typescript
import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "../planning.module.css";
import ProfitabilityTabs from "./profitability-tabs";
import { resyncOrderPrices } from "./actions";
import type { JobRow } from "./by-job-tab";
import type { ProductRow } from "./by-product-tab";

type SnapshotQueryRow = {
  id: string;
  order_line_id: string | null;
  sell_price: number;
  planned_material_cost: number;
  planned_labor_cost: number;
  planned_admin_cost: number;
  planned_electricity_cost: number;
  planned_gas_cost: number;
  planned_overhead_cost: number;
  planned_total_cost: number;
  planned_margin: number;
  planned_margin_pct: number;
  order_line:
    | {
        id: string;
        quantity: number;
        variant_id: string;
        order: { order_number: string | null } | { order_number: string | null }[] | null;
        variant:
          | {
              title: string | null;
              product: { title: string | null } | { title: string | null }[] | null;
            }
          | {
              title: string | null;
              product: { title: string | null } | { title: string | null }[] | null;
            }[]
          | null;
      }
    | {
        id: string;
        quantity: number;
        variant_id: string;
        order: { order_number: string | null } | { order_number: string | null }[] | null;
        variant:
          | {
              title: string | null;
              product: { title: string | null } | { title: string | null }[] | null;
            }
          | {
              title: string | null;
              product: { title: string | null } | { title: string | null }[] | null;
            }[]
          | null;
      }[]
    | null;
};

type ActualQueryRow = {
  order_line_id: string;
  actual_material_cost: number;
  actual_labor_cost: number;
  actual_admin_cost: number;
  actual_electricity_cost: number;
  actual_gas_cost: number;
  actual_overhead_cost: number;
  actual_total_cost: number;
  actual_margin: number;
  actual_margin_pct: number;
};

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function ProfitabilityPage() {
  const supabase = await createSupabaseServerClient();

  const [{ data: snapshots }, { data: actuals }, { data: products }] =
    await Promise.all([
      supabase
        .from("job_cost_snapshot")
        .select(
          `id, order_line_id, sell_price,
           planned_material_cost, planned_labor_cost,
           planned_admin_cost, planned_electricity_cost,
           planned_gas_cost, planned_overhead_cost,
           planned_total_cost, planned_margin, planned_margin_pct,
           order_line:order_line_id(
             id, quantity, variant_id,
             order:order_id(order_number),
             variant:variant_id(title, product:product_id(title))
           )`
        )
        .order("planned_margin_pct", { ascending: true }),
      supabase
        .from("job_cost_actual_rollup")
        .select(
          `order_line_id,
           actual_material_cost, actual_labor_cost,
           actual_admin_cost, actual_electricity_cost,
           actual_gas_cost, actual_overhead_cost,
           actual_total_cost, actual_margin, actual_margin_pct`
        ),
      supabase
        .from("product_profitability")
        .select("*")
        .order("avg_planned_margin_pct", { ascending: true }),
    ]);

  const actualMap = new Map(
    ((actuals ?? []) as ActualQueryRow[]).map((a) => [a.order_line_id, a])
  );

  const jobs: JobRow[] = ((snapshots ?? []) as SnapshotQueryRow[]).flatMap(
    (snap) => {
      const orderLine = firstRelation(snap.order_line);
      if (!orderLine) return [];
      const order = firstRelation(orderLine.order);
      const variant = firstRelation(orderLine.variant);
      const product = variant ? firstRelation(variant.product) : null;
      const actual = snap.order_line_id
        ? actualMap.get(snap.order_line_id)
        : null;
      const plannedOverhead =
        (snap.planned_admin_cost ?? 0) +
        (snap.planned_electricity_cost ?? 0) +
        (snap.planned_gas_cost ?? 0) +
        (snap.planned_overhead_cost ?? 0);
      const actualOverhead =
        actual !== null && actual !== undefined
          ? (actual.actual_admin_cost ?? 0) +
            (actual.actual_electricity_cost ?? 0) +
            (actual.actual_gas_cost ?? 0) +
            (actual.actual_overhead_cost ?? 0)
          : null;
      return [
        {
          id: snap.id,
          order_line_id: snap.order_line_id ?? "",
          variant_id: orderLine.variant_id,
          order_number: order?.order_number ?? "—",
          product_title: product?.title ?? "—",
          variant_title: variant?.title ?? "—",
          quantity: orderLine.quantity,
          sell_price: snap.sell_price,
          planned_material_cost: snap.planned_material_cost,
          planned_labor_cost: snap.planned_labor_cost,
          planned_overhead_cost: plannedOverhead,
          planned_total_cost: snap.planned_total_cost,
          planned_margin: snap.planned_margin,
          planned_margin_pct: snap.planned_margin_pct,
          actual_material_cost: actual?.actual_material_cost ?? null,
          actual_labor_cost: actual?.actual_labor_cost ?? null,
          actual_overhead_cost: actualOverhead,
          actual_total_cost: actual?.actual_total_cost ?? null,
          actual_margin: actual?.actual_margin ?? null,
          actual_margin_pct: actual?.actual_margin_pct ?? null,
        } satisfies JobRow,
      ];
    }
  );

  const productRows = (products ?? []) as ProductRow[];

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>Financial Analytics</span>
          <h1>Profitability</h1>
          <p>Job and product-level margin tracking.</p>
        </div>
        <form action={resyncOrderPrices}>
          <button className={styles.secondary} type="submit">
            Re-sync prices from Shopify
          </button>
        </form>
      </div>
      <ProfitabilityTabs jobs={jobs} products={productRows} />
    </div>
  );
}
```

Note: `actions.ts` is created in Task 5. For now, create a placeholder so TypeScript doesn't fail:

Create `src/app/app/profitability/actions.ts` with just:

```typescript
"use server";

export async function resyncOrderPrices() {
  // Implemented in Task 5
}
```

- [ ] **Step 2: Replace `by-job-tab.tsx` with full implementation**

Replace `src/app/app/profitability/by-job-tab.tsx` entirely:

```typescript
"use client";

import { useState } from "react";
import styles from "./profitability.module.css";

export type JobRow = {
  id: string;
  order_line_id: string;
  variant_id: string;
  order_number: string;
  product_title: string;
  variant_title: string;
  quantity: number;
  sell_price: number;
  planned_material_cost: number;
  planned_labor_cost: number;
  planned_overhead_cost: number;
  planned_total_cost: number;
  planned_margin: number;
  planned_margin_pct: number;
  actual_material_cost: number | null;
  actual_labor_cost: number | null;
  actual_overhead_cost: number | null;
  actual_total_cost: number | null;
  actual_margin: number | null;
  actual_margin_pct: number | null;
};

type Props = {
  jobs: JobRow[];
  variantFilter: string | null;
};

function fmt(value: number) {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value);
}

function fmtPct(value: number | null) {
  if (value === null) return "—";
  return `${value.toFixed(1)}%`;
}

function isActual(job: JobRow) {
  return job.actual_total_cost !== null && job.actual_total_cost > 0;
}

export default function ByJobTab({ jobs, variantFilter }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = variantFilter
    ? jobs.filter((j) => j.variant_id === variantFilter)
    : jobs;

  if (filtered.length === 0) {
    return (
      <div className={styles.profitTable}>
        <p className={styles.emptyState}>
          No jobs with cost snapshots yet. Generate financial plans from the
          Costing page first.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.profitTable}>
      <div className={styles.jobHeader}>
        <span>Order #</span>
        <span>Product / Variant</span>
        <span>Qty</span>
        <span>Sell Price</span>
        <span>Cost</span>
        <span>Margin $</span>
        <span>Margin %</span>
        <span>Status</span>
      </div>
      {filtered.map((job) => {
        const actual = isActual(job);
        const cost = actual ? job.actual_total_cost! : job.planned_total_cost;
        const margin = actual ? job.actual_margin! : job.planned_margin;
        const marginPct = actual ? job.actual_margin_pct! : job.planned_margin_pct;
        const isExpanded = expandedId === job.id;

        return (
          <div key={job.id}>
            <div
              className={styles.jobRow}
              onClick={() => setExpandedId(isExpanded ? null : job.id)}
            >
              <span>{job.order_number}</span>
              <span>
                <strong>{job.product_title}</strong>
                {job.variant_title && job.variant_title !== "—" && (
                  <span
                    style={{
                      display: "block",
                      fontSize: "0.84rem",
                      color: "var(--ink-muted)",
                    }}
                  >
                    {job.variant_title}
                  </span>
                )}
              </span>
              <span>{job.quantity}</span>
              <span>{fmt(job.sell_price)}</span>
              <span>{fmt(cost)}</span>
              <span
                style={{
                  color: margin < 0 ? "#ff9472" : "var(--ink-strong)",
                }}
              >
                {fmt(margin)}
              </span>
              <span
                style={{
                  color: marginPct < 0 ? "#ff9472" : "var(--ink-strong)",
                }}
              >
                {fmtPct(marginPct)}
              </span>
              <span>
                <span
                  className={`${styles.badge} ${
                    actual ? styles.badgeActual : styles.badgePlanned
                  }`}
                >
                  {actual ? "Actual" : "Planned"}
                </span>
              </span>
            </div>

            {isExpanded && (
              <div className={styles.breakdown}>
                <div className={styles.breakdownGrid}>
                  <span className={styles.breakdownLabel}></span>
                  <span className={styles.breakdownLabel}>Planned</span>
                  {actual && (
                    <span className={styles.breakdownLabel}>Actual</span>
                  )}

                  <span>Materials</span>
                  <span>{fmt(job.planned_material_cost)}</span>
                  {actual && (
                    <span>
                      {fmt(job.actual_material_cost!)}
                      <sup title="Actual material tracking coming soon">*</sup>
                    </span>
                  )}

                  <span>Labor</span>
                  <span>{fmt(job.planned_labor_cost)}</span>
                  {actual && <span>{fmt(job.actual_labor_cost!)}</span>}

                  <span>Overhead</span>
                  <span>{fmt(job.planned_overhead_cost)}</span>
                  {actual && <span>{fmt(job.actual_overhead_cost!)}</span>}

                  <div className={styles.breakdownDivider} />

                  <span>Total cost</span>
                  <span>{fmt(job.planned_total_cost)}</span>
                  {actual && <span>{fmt(job.actual_total_cost!)}</span>}

                  <span>Sell price</span>
                  <span>{fmt(job.sell_price)}</span>
                  {actual && <span>{fmt(job.sell_price)}</span>}

                  <span>
                    <strong>Margin</strong>
                  </span>
                  <span>
                    <strong>
                      {fmt(job.planned_margin)} ({fmtPct(job.planned_margin_pct)})
                    </strong>
                  </span>
                  {actual && (
                    <span>
                      <strong>
                        {fmt(job.actual_margin!)} ({fmtPct(job.actual_margin_pct)})
                      </strong>
                    </span>
                  )}
                </div>
                {actual && (
                  <p className={styles.asteriskNote}>
                    * Actual material cost equals planned for now — actual
                    material usage tracking coming soon.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no output

- [ ] **Step 4: Commit**

```bash
git add src/app/app/profitability/page.tsx src/app/app/profitability/by-job-tab.tsx src/app/app/profitability/actions.ts
git commit -m "feat: implement By Job profitability table with cost breakdown"
```

---

### Task 4: By Product tab — aggregated table with click-through

**Goal:** The By Product tab shows one row per variant with aggregated margin data. Clicking a row switches to By Job filtered to that variant.

**Files:**
- Modify: `src/app/app/profitability/by-product-tab.tsx` — replace stub with full table

**Acceptance Criteria:**
- [ ] Table shows Product, Variant, Jobs, Total Revenue, Avg Margin %, Total Margin $
- [ ] Avg Margin % shows actual if available, else planned (actual takes priority)
- [ ] Clicking a row calls `onVariantClick(variantId)` which switches tab and filters By Job
- [ ] Rows with negative margin % are highlighted in warning colour
- [ ] TypeScript compiles without errors

**Verify:** `npx tsc --noEmit` → no output

**Steps:**

- [ ] **Step 1: Replace `by-product-tab.tsx` with full implementation**

Replace `src/app/app/profitability/by-product-tab.tsx` entirely:

```typescript
"use client";

import styles from "./profitability.module.css";

export type ProductRow = {
  tenant_id: string;
  variant_id: string;
  variant_title: string | null;
  product_title: string | null;
  job_count: number;
  total_revenue: number | null;
  avg_planned_margin_pct: number | null;
  avg_actual_margin_pct: number | null;
  total_actual_margin: number | null;
};

type Props = {
  products: ProductRow[];
  onVariantClick: (variantId: string) => void;
};

function fmt(value: number | null) {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value);
}

function fmtPct(value: number | null) {
  if (value === null) return "—";
  return `${value.toFixed(1)}%`;
}

export default function ByProductTab({ products, onVariantClick }: Props) {
  if (products.length === 0) {
    return (
      <div className={styles.profitTable}>
        <p className={styles.emptyState}>
          No product profitability data yet. Ensure orders are synced and
          financial plans are generated from the Costing page.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.profitTable}>
      <div className={styles.productHeader}>
        <span>Product / Variant</span>
        <span>Jobs</span>
        <span>Total Revenue</span>
        <span>Avg Margin %</span>
        <span>Total Margin $</span>
      </div>
      {products.map((row) => {
        const displayPct =
          row.avg_actual_margin_pct ?? row.avg_planned_margin_pct;
        const isNegative = displayPct !== null && displayPct < 0;
        return (
          <div
            key={row.variant_id}
            className={styles.productRow}
            onClick={() => onVariantClick(row.variant_id)}
          >
            <span>
              <strong>{row.product_title ?? "—"}</strong>
              {row.variant_title && (
                <span
                  style={{
                    display: "block",
                    fontSize: "0.84rem",
                    color: "var(--ink-muted)",
                  }}
                >
                  {row.variant_title}
                </span>
              )}
            </span>
            <span>{row.job_count}</span>
            <span>{fmt(row.total_revenue)}</span>
            <span style={{ color: isNegative ? "#ff9472" : "var(--ink-strong)" }}>
              {fmtPct(displayPct)}
              {row.avg_actual_margin_pct === null && displayPct !== null && (
                <span
                  style={{
                    fontSize: "0.72rem",
                    color: "var(--ink-faint)",
                    marginLeft: 4,
                  }}
                >
                  planned
                </span>
              )}
            </span>
            <span style={{ color: isNegative ? "#ff9472" : "var(--ink-strong)" }}>
              {fmt(row.total_actual_margin)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no output

- [ ] **Step 3: Commit**

```bash
git add src/app/app/profitability/by-product-tab.tsx
git commit -m "feat: implement By Product profitability table with variant click-through"
```

---

### Task 5: Re-sync prices server action

**Goal:** Clicking "Re-sync prices from Shopify" on the Profitability page triggers a Shopify sync that patches `unit_sell_price` and `line_sell_price` on existing order lines.

**Files:**
- Modify: `src/app/app/profitability/actions.ts` — implement `resyncOrderPrices`

**Acceptance Criteria:**
- [ ] `resyncOrderPrices` calls `syncShopifyStoreData` with the tenant's Shopify credentials
- [ ] After sync completes the page reloads (redirect back to `/app/profitability`)
- [ ] TypeScript compiles without errors

**Verify:** `npx tsc --noEmit` → no output; manual test: click button → Shopify sync runs → order_line prices updated

**Steps:**

- [ ] **Step 1: Find how existing code calls `syncShopifyStoreData`**

Look at `src/app/api/shopify/webhooks/route.ts`. It calls `syncShopifyStoreData(tenantId, shopDomain, accessToken)` after resolving the Shopify session. Follow the exact same pattern to get `tenantId`, `shopDomain`, and `accessToken` — these come from the authenticated Supabase session and a Shopify sessions/tokens table (look for a `shopify_session` or similar table in the DB, or a helper function that retrieves the store credentials).

- [ ] **Step 2: Replace `actions.ts` with full implementation**

Replace `src/app/app/profitability/actions.ts` using the same credential-resolution pattern found in Step 1. The structure will be:

```typescript
"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { syncShopifyStoreData } from "@/lib/shopify/sync";

export async function resyncOrderPrices() {
  const supabase = await createSupabaseServerClient();

  // Resolve the current tenant's Shopify credentials.
  // Look at src/app/api/shopify/webhooks/route.ts for the exact pattern —
  // it resolves tenantId, shopDomain, and accessToken from the session.
  // Mirror that exact logic here.
  const { data: session } = await supabase.auth.getUser();
  if (!session.user) redirect("/app/profitability?error=unauthenticated");

  // [follow the webhook route pattern to get tenantId, shopDomain, accessToken]
  // Example shape (exact query depends on your session table):
  // const { data: store } = await supabase
  //   .from("shopify_store")
  //   .select("shop_domain, access_token, tenant_id")
  //   .eq("tenant_id", resolvedTenantId)
  //   .single();

  // await syncShopifyStoreData(store.tenant_id, store.shop_domain, store.access_token);

  redirect("/app/profitability?synced=1");
}
```

Fill in the credential lookup by reading `src/app/api/shopify/webhooks/route.ts` and following the same pattern. Do not invent a new credential lookup mechanism.

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no output

- [ ] **Step 4: Manual end-to-end test**

1. Ensure local Supabase is running with seed data that has orders
2. Start the dev server: `npm run dev`
3. Navigate to `/app/profitability`
4. Click "Re-sync prices from Shopify"
5. Check Supabase: `select unit_sell_price, line_sell_price from order_line limit 5;`
6. Verify prices are non-zero and match Shopify

- [ ] **Step 5: Commit**

```bash
git add src/app/app/profitability/actions.ts
git commit -m "feat: add resyncOrderPrices action to patch sell prices from Shopify"
```
