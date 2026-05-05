# Components Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the components list and detail pages to make stock checking faster and BOM traceability clearer.

**Architecture:** Server component pages fetch data and pass it to client components. The list page adds an `available` column (on-hand minus reserved from `inventory_balance`) and a Low Stock filter tab via URL search params. The detail page reduces the Overview from 8 cards to 4, adds a recent receipts mini-table, and upgrades BOM Usage to a proper table with links.

**Tech Stack:** Next.js 15 App Router, Supabase, CSS Modules, Vitest

---

## File Map

| File | Change |
|------|--------|
| `src/app/app/components/helpers.ts` | Create — pure `getStockStatus` helper + tests |
| `src/app/app/components/helpers.test.ts` | Create — unit tests |
| `src/app/app/components/page.tsx` | Modify — add `reserved` to query, available column, stock dots, Low Stock tab |
| `src/app/app/components/components.module.css` | Modify — add dot, row tint, tab styles |
| `src/app/app/components/[componentId]/page.tsx` | Modify — reduce stats to 4, add recent receipts query, pass receipt rows to DetailTabs |
| `src/app/app/components/[componentId]/detail-tabs.tsx` | Modify — render 4 stat cards, recent receipts table in Overview; BOM Usage as proper table with links |
| `src/app/app/components/[componentId]/component-detail.module.css` | Modify — add bomTable styles, recent receipts styles |

---

### Task 0: Stock status helper

**Goal:** Extract and test the pure `getStockStatus` function that drives dots, row tints, and the detail badge.

**Files:**
- Create: `src/app/app/components/helpers.ts`
- Create: `src/app/app/components/helpers.test.ts`

**Acceptance Criteria:**
- [ ] `getStockStatus` returns `'critical'` when available is 0 or below
- [ ] `getStockStatus` returns `'low'` when available is between 1 and reorderPoint (exclusive)
- [ ] `getStockStatus` returns `'ok'` when available >= reorderPoint or reorderPoint is 0
- [ ] All cases pass with Vitest

**Verify:** `npx vitest run src/app/app/components/helpers.test.ts --pool threads --maxWorkers 1` → all tests pass

**Steps:**

- [ ] **Step 1: Write the failing test**

Create `src/app/app/components/helpers.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { getStockStatus } from "./helpers";

describe("getStockStatus", () => {
  it("returns critical when available is 0", () => {
    expect(getStockStatus(0, 10)).toBe("critical");
  });

  it("returns critical when available is negative", () => {
    expect(getStockStatus(-2, 10)).toBe("critical");
  });

  it("returns low when available is positive but below reorder point", () => {
    expect(getStockStatus(5, 10)).toBe("low");
  });

  it("returns ok when available equals reorder point", () => {
    expect(getStockStatus(10, 10)).toBe("ok");
  });

  it("returns ok when available exceeds reorder point", () => {
    expect(getStockStatus(50, 10)).toBe("ok");
  });

  it("returns ok when reorder point is 0 and available is positive", () => {
    expect(getStockStatus(5, 0)).toBe("ok");
  });

  it("returns critical when reorder point is 0 and available is 0", () => {
    expect(getStockStatus(0, 0)).toBe("critical");
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npx vitest run src/app/app/components/helpers.test.ts --pool threads --maxWorkers 1`
Expected: FAIL with "Cannot find module './helpers'"

- [ ] **Step 3: Implement the helper**

Create `src/app/app/components/helpers.ts`:

```typescript
export type StockStatus = "ok" | "low" | "critical";

export function getStockStatus(available: number, reorderPoint: number): StockStatus {
  if (available <= 0) return "critical";
  if (reorderPoint > 0 && available < reorderPoint) return "low";
  return "ok";
}
```

- [ ] **Step 4: Confirm tests pass**

Run: `npx vitest run src/app/app/components/helpers.test.ts --pool threads --maxWorkers 1`
Expected: 7 tests pass, 0 failures

- [ ] **Step 5: Commit**

```bash
git add src/app/app/components/helpers.ts src/app/app/components/helpers.test.ts
git commit -m "feat(components): add getStockStatus helper with tests"
```

---

### Task 1: List page — available column, stock status, and Low Stock tab

**Goal:** Replace the `in_prod` column with `available`, add per-row stock status dots and tints, and add a Low Stock filter tab.

**Files:**
- Modify: `src/app/app/components/page.tsx`
- Modify: `src/app/app/components/components.module.css`

**Acceptance Criteria:**
- [ ] List shows On-hand and Available columns instead of On-hand and In-prod
- [ ] Each row has a coloured dot: green (ok), amber (low), red (critical)
- [ ] Low rows have a subtle amber background; critical rows have a subtle red background
- [ ] "Low Stock" tab shows count badge with number of low/critical components
- [ ] Selecting Low Stock tab filters the list to only low/critical rows (via URL param)
- [ ] All filter tab changes are server-side (URL search param `filter=lowstock`)

**Verify:** Start dev server and open `/app/components` — confirm columns, dots, and filter tabs render correctly.

**Steps:**

- [ ] **Step 1: Update the balance query and add `filter` param support**

Open `src/app/app/components/page.tsx`. Update the `Props` type and query:

```typescript
import { getStockStatus } from "./helpers";
import type { StockStatus } from "./helpers";

type BalanceRow = {
  component_id: string;
  on_hand: number;
  in_prod: number;
  reserved: number;
};

type Props = {
  searchParams?: Promise<{
    q?: string;
    filter?: string;
  }>;
};
```

In the page function, update params extraction and balance query:

```typescript
const params = (await searchParams) ?? {};
const q = (params.q ?? "").trim().toLowerCase();
const filterLowStock = params.filter === "lowstock";

// Update the balance select to include reserved:
supabase.from("inventory_balance").select("component_id,on_hand,in_prod,reserved"),
```

- [ ] **Step 2: Compute available and status per component**

After building `balanceMap`, add the derived values and compute the low stock count:

```typescript
const balanceMap = (balances ?? []).reduce<Record<string, BalanceRow>>((acc, row) => {
  acc[row.component_id] = row;
  return acc;
}, {});

const allComponents = (components ?? []) as ComponentRow[];

const withStatus = allComponents.map((c) => {
  const balance = balanceMap[c.id];
  const onHand = balance?.on_hand ?? 0;
  const reserved = balance?.reserved ?? 0;
  const available = onHand - reserved;
  const status = getStockStatus(available, c.reorder_point ?? 0);
  return { ...c, onHand, available, status };
});

const lowStockCount = withStatus.filter((c) => c.status !== "ok").length;

const filtered = withStatus.filter((c) => {
  const matchesSearch =
    q.length === 0 ||
    c.name.toLowerCase().includes(q) ||
    (c.sku ?? "").toLowerCase().includes(q);
  const matchesFilter = !filterLowStock || c.status !== "ok";
  return matchesSearch && matchesFilter;
});
```

- [ ] **Step 3: Update the JSX — filter tabs and table columns**

Replace the `<form>` and `<ListPanel>` section:

```tsx
return (
  <div className={styles.page}>
    <PageHeader
      eyebrow="Components"
      title="Component catalog"
      description={`${filtered.length} of ${allComponents.length} components in the current catalog.`}
      actions={<ComponentCreateForm action={createComponent} lookups={lookups} />}
    />

    <div className={styles.toolbar}>
      <div className={styles.tabs}>
        <a
          href="/app/components"
          className={!filterLowStock ? styles.tabActive : styles.tab}
        >
          All <span className={styles.tabCount}>{allComponents.length}</span>
        </a>
        <a
          href="/app/components?filter=lowstock"
          className={filterLowStock ? styles.tabActive : styles.tab}
        >
          Low Stock{" "}
          {lowStockCount > 0 && (
            <span className={styles.tabBadge}>{lowStockCount}</span>
          )}
        </a>
      </div>
      <form className={styles.search} method="get">
        {filterLowStock && <input type="hidden" name="filter" value="lowstock" />}
        <input
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Search by name or SKU"
          aria-label="Search by name or SKU"
        />
      </form>
    </div>

    <ListPanel
      eyebrow="Catalog"
      title="Stocked components"
      description="Open a component to inspect balances, movement history, and BOM usage."
      columns={["Component", "SKU", "On hand", "Available", "Reorder"]}
      columnsTemplate="1.6fr 1fr 0.8fr 0.8fr 0.8fr"
    >
      {error ? (
        <EmptyState
          title="Failed to load components"
          message="The component catalog could not be loaded from Supabase."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={filterLowStock ? "No low stock components" : q.length > 0 ? "No matching components" : "No components yet"}
          message={
            filterLowStock
              ? "All components have sufficient available stock."
              : q.length > 0
              ? "Try a broader search term or clear the filter."
              : "Create a component to start tracking stocked parts."
          }
        />
      ) : (
        filtered.map((component) => (
          <Link
            key={component.id}
            href={`/app/components/${component.id}`}
            className={`${styles.rowLink} ${
              component.status === "critical"
                ? styles.rowCritical
                : component.status === "low"
                ? styles.rowLow
                : ""
            }`}
          >
            <ListRow
              columnsTemplate="1.6fr 1fr 0.8fr 0.8fr 0.8fr"
              className={styles.row}
            >
              <strong className={styles.nameCell}>
                <span
                  className={`${styles.dot} ${
                    component.status === "critical"
                      ? styles.dotCritical
                      : component.status === "low"
                      ? styles.dotLow
                      : styles.dotOk
                  }`}
                />
                {component.name}
              </strong>
              <span className={styles.meta}>{component.sku ?? "--"}</span>
              <span>{component.onHand}</span>
              <span className={component.status !== "ok" ? styles.availableLow : ""}>
                {component.available}
              </span>
              <span className={styles.meta}>{component.reorder_point ?? 0}</span>
            </ListRow>
          </Link>
        ))
      )}
    </ListPanel>
  </div>
);
```

- [ ] **Step 4: Add CSS**

Add to `src/app/app/components/components.module.css`:

```css
/* ── Toolbar with tabs + search ─── */

.toolbar {
  display: flex;
  gap: 12px;
  align-items: center;
}

.tabs {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.tab,
.tabActive {
  padding: 7px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}

.tab {
  color: var(--ink-muted);
  background: transparent;
}

.tab:hover {
  background: rgba(255, 255, 255, 0.04);
  color: var(--ink-strong);
}

.tabActive {
  background: var(--brand-dim);
  color: var(--brand-1);
}

.tabCount {
  color: var(--ink-faint);
  font-weight: 400;
  font-size: 12px;
}

.tabBadge {
  background: rgba(239, 68, 68, 0.18);
  color: var(--danger);
  border-radius: 10px;
  padding: 1px 7px;
  font-size: 11px;
  font-weight: 700;
}

.search {
  flex: 1;
}

/* ── Stock status indicators ─── */

.nameCell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dotOk { background: var(--ok); }
.dotLow { background: var(--warning); }
.dotCritical { background: var(--danger); }

.rowLow {
  background: rgba(245, 158, 11, 0.06);
}

.rowCritical {
  background: rgba(239, 68, 68, 0.06);
}

.availableLow {
  color: var(--danger);
  font-weight: 600;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/app/components/page.tsx src/app/app/components/components.module.css
git commit -m "feat(components): add available column, stock status dots, and Low Stock filter tab"
```

---

### Task 2: Detail page — tighten Overview to 4 stat cards and add recent receipts

**Goal:** Reduce the Overview from 8 cards to 4 focused ones (On Hand, Available, In Production, Reorder Point), add a recent receipts mini-table, and show a stock status badge in the sidebar.

**Files:**
- Modify: `src/app/app/components/[componentId]/page.tsx`
- Modify: `src/app/app/components/[componentId]/detail-tabs.tsx`
- Modify: `src/app/app/components/[componentId]/component-detail.module.css`

**Acceptance Criteria:**
- [ ] Overview tab shows exactly 4 stat cards
- [ ] Available card has coloured border when low or critical
- [ ] Reorder Point card sub-text shows delta when below threshold
- [ ] Recent receipts mini-table shows up to 5 most recent deliveries of this component
- [ ] Sidebar alarm banner reflects critical/low/ok status (not just `belowLowStock`)

**Verify:** Start dev server, open a component detail page, confirm Overview tab shows 4 cards and recent receipts table.

**Steps:**

- [ ] **Step 1: Add recent receipts query and import helpers in page.tsx**

In `src/app/app/components/[componentId]/page.tsx`, add the import and a new query:

```typescript
import { getStockStatus } from "../helpers";

// In the parallel Promise.all, add:
supabase
  .from("delivery_receipt_line")
  .select("quantity_delivered, delivery_receipt:delivery_receipt_id(received_at, supplier_reference, supplier_name_override, supplier:supplier_id(name))")
  .eq("component_id", componentId)
  .order("id", { ascending: false })
  .limit(5),
```

Full updated `Promise.all`:

```typescript
const [
  { data: balances },
  { data: movements },
  { data: bomUsage },
  { data: recentReceiptLines },
] = await Promise.all([
  supabase
    .from("inventory_balance")
    .select("on_hand,in_prod,reserved,location:location_id(name)")
    .eq("component_id", componentId),
  supabase
    .from("inventory_movement")
    .select("id,delta_on_hand,delta_in_prod,reason,reference_type,created_at")
    .eq("component_id", componentId)
    .order("created_at", { ascending: false })
    .limit(50),
  supabase
    .from("product_bom_component")
    .select("quantity,product_bom_id,product_bom:product_bom_id(version,is_active,variant:variant_id(title,product:product_id(title)))")
    .eq("component_id", componentId),
  supabase
    .from("delivery_receipt_line")
    .select("quantity_delivered,delivery_receipt:delivery_receipt_id(received_at,supplier_reference,supplier_name_override,supplier:supplier_id(name))")
    .eq("component_id", componentId)
    .order("id", { ascending: false })
    .limit(5),
]);
```

- [ ] **Step 2: Build the 4-card stats array and recent receipts rows**

Replace the `stats` array construction and add `recentReceipts`:

```typescript
const status = getStockStatus(available, c.reorder_point);

const stats = [
  {
    label: "On Hand",
    value: String(totalOnHand),
    color: "default" as const,
  },
  {
    label: "Available",
    value: String(available),
    color: available <= 0 ? "red" as const : belowReorder ? "orange" as const : "green" as const,
    highlight: status !== "ok",
    subText: totalReserved > 0 ? `${totalReserved} committed to production` : undefined,
  },
  {
    label: "In Production",
    value: String(totalInProd),
    color: "default" as const,
    subText: "Committed to open orders",
  },
  {
    label: "Reorder Point",
    value: String(c.reorder_point),
    color: "default" as const,
    subText: belowReorder ? `Below threshold by ${c.reorder_point - available}` : undefined,
    subTextDanger: belowReorder,
  },
];

type ReceiptLineRaw = {
  quantity_delivered: number;
  delivery_receipt: {
    received_at: string;
    supplier_reference: string;
    supplier_name_override: string | null;
    supplier: { name: string } | Array<{ name: string }> | null;
  } | Array<{
    received_at: string;
    supplier_reference: string;
    supplier_name_override: string | null;
    supplier: { name: string } | Array<{ name: string }> | null;
  }> | null;
};

const recentReceipts = ((recentReceiptLines ?? []) as ReceiptLineRaw[]).map((line) => {
  const dr = Array.isArray(line.delivery_receipt)
    ? line.delivery_receipt[0]
    : line.delivery_receipt;
  const supplier = dr?.supplier
    ? Array.isArray(dr.supplier) ? dr.supplier[0]?.name : dr.supplier?.name
    : null;
  return {
    date: dr?.received_at
      ? new Date(dr.received_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
      : "--",
    supplierName: supplier ?? dr?.supplier_name_override ?? "--",
    reference: dr?.supplier_reference ?? "--",
    qty: line.quantity_delivered,
  };
});
```

- [ ] **Step 3: Update the sidebar alarm banner and pass recentReceipts to DetailTabs**

In `page.tsx`, replace the `belowLowStock` alarm banner with a `status`-aware one, and update the `DetailTabs` call:

```tsx
{/* Replace the old belowLowStock alarm banner with: */}
{status !== "ok" && (
  <div className={styles.alarmBanner}>
    {status === "critical"
      ? `Critical — no available stock (${totalReserved} committed to production)`
      : `Low stock — ${available} available, reorder point is ${c.reorder_point}`}
  </div>
)}
```

And in the return, pass `recentReceipts` (do NOT pass `status` — it's used directly in page.tsx):
```tsx
<DetailTabs
  stats={stats}
  movements={movementRows}
  bomUsage={bomRows}
  recentReceipts={recentReceipts}
/>
```

- [ ] **Step 4: Update DetailTabs types and Overview rendering**

In `src/app/app/components/[componentId]/detail-tabs.tsx`:

```typescript
"use client";

import { useState } from "react";
import styles from "./component-detail.module.css";

type StatCard = {
  label: string;
  value: string;
  color?: "default" | "green" | "red" | "orange" | "blue";
  highlight?: boolean;
  subText?: string;
  subTextDanger?: boolean;
};

type MovementRow = {
  id: string;
  date: string;
  deltaOnHand: number;
  deltaInProd: number;
  reason: string;
  refType: string;
};

type BomRow = {
  bomId: string;
  product: string;
  variant: string;
  version: number;
  quantity: number;
  active: boolean;
};

type ReceiptRow = {
  date: string;
  supplierName: string;
  reference: string;
  qty: number;
};

type Props = {
  stats: StatCard[];
  movements: MovementRow[];
  bomUsage: BomRow[];
  recentReceipts: ReceiptRow[];
};

const tabs = ["Overview", "Movements", "BOM Usage"] as const;
type Tab = (typeof tabs)[number];

export default function DetailTabs({ stats, movements, bomUsage, recentReceipts }: Props) {
  const [active, setActive] = useState<Tab>("Overview");

  return (
    <div className={styles.tabsContainer}>
      <div className={styles.tabBar}>
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            className={`${styles.tab} ${active === tab ? styles.tabActive : ""}`}
            onClick={() => setActive(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {active === "Overview" && (
        <div className={styles.overviewContent}>
          <div className={styles.statsGrid}>
            {stats.map((s) => (
              <div
                key={s.label}
                className={`${styles.statCard} ${s.highlight ? styles.statCardHighlight : ""}`}
              >
                <span className={styles.statLabel}>{s.label}</span>
                <span
                  className={`${styles.statValue} ${
                    s.color === "green" ? styles.statGreen
                    : s.color === "red" ? styles.statRed
                    : s.color === "orange" ? styles.statOrange
                    : s.color === "blue" ? styles.statBlue
                    : ""
                  }`}
                >
                  {s.value}
                </span>
                {s.subText && (
                  <span className={`${styles.statSub} ${s.subTextDanger ? styles.statSubDanger : ""}`}>
                    {s.subText}
                  </span>
                )}
              </div>
            ))}
          </div>

          {recentReceipts.length > 0 && (
            <div className={styles.recentReceipts}>
              <div className={styles.recentTitle}>Recent receipts</div>
              <div className={styles.miniTable}>
                <div className={`${styles.miniHeader} ${styles.receiptCols}`}>
                  <span>Date</span>
                  <span>Supplier</span>
                  <span>Docket</span>
                  <span>Qty received</span>
                </div>
                {recentReceipts.map((r, i) => (
                  <div key={i} className={`${styles.miniRow} ${styles.receiptCols}`}>
                    <span>{r.date}</span>
                    <span>{r.supplierName}</span>
                    <span className={styles.refCell}>{r.reference}</span>
                    <span className={styles.positive}>+{r.qty}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {active === "Movements" && (
        /* unchanged — keep existing movements rendering */
        <div className={styles.tabContent}>
          {movements.length === 0 ? (
            <p className={styles.empty}>No inventory movements recorded.</p>
          ) : (
            <div className={styles.miniTable}>
              <div className={`${styles.miniHeader} ${styles.movementCols}`}>
                <span>Date</span>
                <span>On Hand</span>
                <span>In Prod</span>
                <span>Reason</span>
                <span>Ref</span>
              </div>
              {movements.map((m) => (
                <div key={m.id} className={`${styles.miniRow} ${styles.movementCols}`}>
                  <span>{m.date}</span>
                  <span className={m.deltaOnHand > 0 ? styles.positive : m.deltaOnHand < 0 ? styles.negative : ""}>
                    {m.deltaOnHand > 0 ? "+" : ""}{m.deltaOnHand}
                  </span>
                  <span className={m.deltaInProd > 0 ? styles.positive : m.deltaInProd < 0 ? styles.negative : ""}>
                    {m.deltaInProd > 0 ? "+" : ""}{m.deltaInProd}
                  </span>
                  <span>{m.reason}</span>
                  <span className={styles.refCell}>{m.refType}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {active === "BOM Usage" && (
        /* BOM Usage rendering is updated in Task 3 */
        <div className={styles.tabContent}>
          {bomUsage.length === 0 ? (
            <p className={styles.empty}>Not used in any BOMs.</p>
          ) : (
            <div className={styles.miniTable}>
              <div className={`${styles.miniHeader} ${styles.bomCols}`}>
                <span>Product</span>
                <span>Variant</span>
                <span>Version</span>
                <span>Qty</span>
                <span>Status</span>
              </div>
              {bomUsage.map((row, i) => (
                <div key={i} className={`${styles.miniRow} ${styles.bomCols}`}>
                  <span>{row.product}</span>
                  <span>{row.variant}</span>
                  <span>v{row.version}</span>
                  <span>{row.quantity}</span>
                  <span>
                    <span className={row.active ? styles.badge : styles.badgeMuted}>
                      {row.active ? "Active" : "Draft"}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Add CSS for Overview layout, stat subtext, and recent receipts**

Add to `src/app/app/components/[componentId]/component-detail.module.css`:

```css
/* ── Overview layout ──────────────── */

.overviewContent {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.statCardHighlight {
  border-color: var(--danger);
  background: rgba(239, 68, 68, 0.06);
}

.statSub {
  font-size: 11px;
  color: var(--ink-faint);
  text-align: center;
  line-height: 1.4;
}

.statSubDanger {
  color: var(--danger);
  font-weight: 600;
}

/* ── Recent receipts ──────────────── */

.recentReceipts {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.recentTitle {
  font-size: 13px;
  font-weight: 700;
  color: var(--ink-strong);
}

.receiptCols {
  grid-template-columns: 1.1fr 1.4fr 1fr 0.8fr;
  min-width: 400px;
}
```

Also update `.statsGrid` from `grid-template-columns: 1fr 1fr` to keep 2-column but now with 4 cards (2×2 grid — no change needed).

- [ ] **Step 6: Update bomRows mapping in page.tsx to include bomId**

```typescript
const bomRows = typedBomUsage.map((row) => {
  const bom = unwrap(row.product_bom);
  const variant = bom ? unwrap(bom.variant) : null;
  const product = variant ? unwrap(variant.product) : null;
  return {
    bomId: row.product_bom_id as string,
    product: product?.title ?? "--",
    variant: variant?.title ?? "--",
    version: bom?.version ?? 0,
    quantity: row.quantity,
    active: bom?.is_active ?? false,
  };
});
```

- [ ] **Step 7: Commit**

```bash
git add src/app/app/components/[componentId]/page.tsx src/app/app/components/[componentId]/detail-tabs.tsx src/app/app/components/[componentId]/component-detail.module.css
git commit -m "feat(components): tighten Overview to 4 stat cards, add recent receipts"
```

---

### Task 3: BOM Usage — proper table with links

**Goal:** Replace the grid-row BOM Usage layout with a proper table, an intro line, and clickable BOM names linking to the BOM list page.

**Files:**
- Modify: `src/app/app/components/[componentId]/detail-tabs.tsx`
- Modify: `src/app/app/components/[componentId]/component-detail.module.css`

**Acceptance Criteria:**
- [ ] BOM Usage tab shows intro line: "This component is specified in N bills of material."
- [ ] BOM names render as `<a>` links to `/app/bom` (no BOM detail page exists yet)
- [ ] Active BOMs show a green "Active" badge; draft BOMs show a grey "Draft" badge
- [ ] Empty state renders when bomUsage is empty

**Verify:** Start dev server, open a component with BOM usage, confirm intro line, table layout, and clickable BOM names.

**Steps:**

- [ ] **Step 1: Replace BOM Usage section in detail-tabs.tsx**

Replace the `{active === "BOM Usage" && ...}` block:

```tsx
{active === "BOM Usage" && (
  <div className={styles.tabContent}>
    {bomUsage.length === 0 ? (
      <p className={styles.empty}>Not used in any BOMs.</p>
    ) : (
      <>
        <p className={styles.bomIntro}>
          This component is specified in{" "}
          <strong>{bomUsage.length} bill{bomUsage.length !== 1 ? "s" : ""} of material</strong>.
          Any product using these BOMs requires it to manufacture.
        </p>
        <div className={styles.miniTable}>
          <div className={`${styles.miniHeader} ${styles.bomTableCols}`}>
            <span>BOM / Product</span>
            <span>Qty per unit</span>
            <span>Status</span>
          </div>
          {bomUsage.map((row, i) => (
            <div key={i} className={`${styles.miniRow} ${styles.bomTableCols}`}>
              <span>
                <a href="/app/bom" className={styles.bomLink}>
                  {row.product}
                  {row.variant && row.variant !== "--" ? ` — ${row.variant}` : ""}
                </a>
                {row.version > 0 && (
                  <span className={styles.bomVersion}>v{row.version}</span>
                )}
              </span>
              <span className={styles.bomQty}>{row.quantity}</span>
              <span>
                <span className={row.active ? styles.badge : styles.badgeMuted}>
                  {row.active ? "Active" : "Draft"}
                </span>
              </span>
            </div>
          ))}
        </div>
      </>
    )}
  </div>
)}
```

- [ ] **Step 2: Add BOM table CSS**

Add to `component-detail.module.css`:

```css
/* ── BOM Usage table ──────────────── */

.bomTableCols {
  grid-template-columns: 2fr 0.8fr 0.7fr;
  min-width: 360px;
}

.bomIntro {
  font-size: 13px;
  color: var(--ink-muted);
  line-height: 1.5;
}

.bomIntro strong {
  color: var(--ink-strong);
}

.bomLink {
  color: var(--brand-1);
  text-decoration: none;
  font-weight: 600;
  font-size: 13px;
}

.bomLink:hover {
  text-decoration: underline;
}

.bomVersion {
  margin-left: 6px;
  font-size: 11px;
  color: var(--ink-faint);
}

.bomQty {
  display: inline-block;
  background: var(--brand-dim);
  color: var(--brand-1);
  border-radius: 6px;
  padding: 2px 10px;
  font-size: 12px;
  font-weight: 700;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/app/components/[componentId]/detail-tabs.tsx src/app/app/components/[componentId]/component-detail.module.css
git commit -m "feat(components): BOM Usage as table with links and intro line"
```

---

### Task 4: Sidebar — swap action buttons and add stock value

**Goal:** Replace the "Open Inventory" + "Review Purchasing" buttons with a "Receive stock" quick link, add stock value to the metadata grid, and remove the action hint paragraph.

**Files:**
- Modify: `src/app/app/components/[componentId]/page.tsx`
- Modify: `src/app/app/components/[componentId]/component-detail.module.css`

**Acceptance Criteria:**
- [ ] Sidebar shows "Receive stock" button linking to `/app/goods-inwards/new`
- [ ] "Review Purchasing" button and action hint paragraph removed
- [ ] Metadata grid includes stock value (on hand × cost per unit) formatted as currency

**Verify:** Start dev server, open component detail, confirm sidebar has Receive stock button and no purchasing hint.

**Steps:**

- [ ] **Step 1: Update the sidebar in page.tsx**

In the `<aside className={styles.infoCard}>` section, replace the `metaGrid`, `cardActions`, and `actionHint`:

```tsx
<div className={styles.metaGrid}>
  <div>
    <dt>Unit of Measure</dt>
    <dd>{c.unit ?? "ea"}</dd>
  </div>
  <div>
    <dt>Location</dt>
    <dd>{locationName}</dd>
  </div>
  <div>
    <dt>On Hand</dt>
    <dd className={styles.metaBold}>{totalOnHand}</dd>
  </div>
  <div>
    <dt>Reorder Point</dt>
    <dd>{c.reorder_point}</dd>
  </div>
  <div>
    <dt>Unit Cost</dt>
    <dd>
      {c.cost_per_unit.toLocaleString("en-AU", {
        style: "currency",
        currency: "AUD",
      })}
    </dd>
  </div>
  <div>
    <dt>Stock Value</dt>
    <dd>
      {totalValue.toLocaleString("en-AU", {
        style: "currency",
        currency: "AUD",
        maximumFractionDigits: 0,
      })}
    </dd>
  </div>
  <div>
    <dt>Primary Supplier</dt>
    <dd>{supplierName ?? "None"}</dd>
  </div>
  <div>
    <dt>Group</dt>
    <dd>{groupName ?? "None"}</dd>
  </div>
</div>

<div className={styles.cardActions}>
  <Link href="/app/goods-inwards/new" className={styles.btnSecondary}>
    Receive stock
  </Link>
</div>
```

Note: currency changed from `en-US` / `USD` to `en-AU` / `AUD` to match the AU/NZ context of the app.

- [ ] **Step 2: Commit**

```bash
git add src/app/app/components/[componentId]/page.tsx
git commit -m "feat(components): swap sidebar actions to Receive stock, add stock value"
```
