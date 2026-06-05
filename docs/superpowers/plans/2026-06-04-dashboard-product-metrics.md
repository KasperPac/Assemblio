# Dashboard Product/Sales Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add product/sales metrics to the dashboard — most popular product, highest-profit product, revenue, average order value, gross margin %, and units sold (last 30 days).

**Architecture:** A Postgres RPC aggregates per-product units/revenue/material-cost/profit over the window; the page derives the KPIs and top-N lists via a tested pure helper, reusing the existing `list_orders` RPC for the window order count (AOV denominator). New KPI chips + a "Top products" card render the results.

**Tech Stack:** Next.js 15 App Router (Server Component), Supabase Postgres (RPC + RLS), TypeScript, Vitest. Spec: `docs/superpowers/specs/2026-06-04-dashboard-product-metrics-design.md`.

---

### Task 1: `dashboard_product_sales` RPC

**Files:**
- Create: `supabase/patches/dashboard_product_sales_rpc.sql`

> The controller applies this to prod via Supabase MCP and smoke-tests it. The implementer ONLY writes the file and commits — do NOT run DB commands.

- [ ] **Step 1: Write the RPC SQL**

Create `supabase/patches/dashboard_product_sales_rpc.sql` with EXACTLY:

```sql
-- Per-product sales + material cost over a date window (by real order date,
-- historical orders included). SECURITY INVOKER so caller RLS applies.
create or replace function public.dashboard_product_sales(
  p_tenant_id uuid,
  p_from date,
  p_to date
)
returns table (
  product_id uuid,
  title text,
  units numeric,
  revenue numeric,
  material_cost numeric,
  profit numeric,
  has_bom boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with variant_cost as (
    select pb.variant_id, sum(pbc.quantity * c.cost_per_unit) as unit_cost
    from public.product_bom pb
    join public.product_bom_component pbc on pbc.product_bom_id = pb.id
    join public.component c on c.id = pbc.component_id
    where pb.tenant_id = p_tenant_id and pb.is_active
    group by pb.variant_id
  )
  select
    v.product_id,
    p.title,
    sum(ol.quantity) as units,
    sum(ol.line_sell_price) as revenue,
    sum(ol.quantity * coalesce(vc.unit_cost, 0)) as material_cost,
    sum(ol.line_sell_price) - sum(ol.quantity * coalesce(vc.unit_cost, 0)) as profit,
    bool_or(vc.unit_cost is not null) as has_bom
  from public.order_line ol
  join public.orders o on o.id = ol.order_id
  join public.product_variant v on v.id = ol.variant_id
  join public.product p on p.id = v.product_id
  left join variant_cost vc on vc.variant_id = v.id
  where ol.tenant_id = p_tenant_id
    and o.tenant_id = p_tenant_id
    and coalesce(o.shopify_processed_at, o.shopify_created_at) >= p_from
    and coalesce(o.shopify_processed_at, o.shopify_created_at) < (p_to + 1)
  group by v.product_id, p.title
  order by revenue desc;
$$;
```

- [ ] **Step 2: Commit**

```bash
git add supabase/patches/dashboard_product_sales_rpc.sql
git commit -m "feat(db): dashboard_product_sales RPC — per-product sales + material cost"
```

---

### Task 2: `deriveDashboardSalesMetrics` helper (pure, TDD)

**Files:**
- Create: `src/lib/dashboard/sales-metrics.ts`
- Test: `src/lib/dashboard/sales-metrics.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, expect, it } from "vitest";
import { deriveDashboardSalesMetrics, type ProductSalesRow } from "./sales-metrics";

const rows: ProductSalesRow[] = [
  { product_id: "a", title: "Widget A", units: 10, revenue: 1000, material_cost: 400, profit: 600, has_bom: true },
  { product_id: "b", title: "Widget B", units: 50, revenue: 500, material_cost: 0, profit: 500, has_bom: false },
  { product_id: "c", title: "Widget C", units: 5, revenue: 2000, material_cost: 1200, profit: 800, has_bom: true },
];

describe("deriveDashboardSalesMetrics", () => {
  it("computes totals, AOV, and gross margin %", () => {
    const m = deriveDashboardSalesMetrics(rows, 20);
    expect(m.totalRevenue).toBe(3500);
    expect(m.totalUnits).toBe(65);
    expect(m.totalMaterialCost).toBe(1600);
    expect(m.avgOrderValue).toBe(175); // 3500 / 20
    expect(m.grossMarginPct).toBeCloseTo(54.2857, 3); // (3500-1600)/3500*100
  });

  it("ranks most popular by units (desc) and highest profit by profit (desc), top 3", () => {
    const m = deriveDashboardSalesMetrics(rows, 20);
    expect(m.mostPopular.map((r) => r.product_id)).toEqual(["b", "a", "c"]);
    expect(m.highestProfit.map((r) => r.product_id)).toEqual(["c", "a", "b"]);
  });

  it("guards divide-by-zero for AOV and margin", () => {
    const m = deriveDashboardSalesMetrics([], 0);
    expect(m.totalRevenue).toBe(0);
    expect(m.avgOrderValue).toBe(0);
    expect(m.grossMarginPct).toBe(0);
    expect(m.mostPopular).toEqual([]);
    expect(m.highestProfit).toEqual([]);
  });

  it("caps each list at 3", () => {
    const many: ProductSalesRow[] = Array.from({ length: 5 }, (_, i) => ({
      product_id: String(i), title: `P${i}`, units: i, revenue: i * 100,
      material_cost: 0, profit: i * 100, has_bom: true,
    }));
    const m = deriveDashboardSalesMetrics(many, 5);
    expect(m.mostPopular).toHaveLength(3);
    expect(m.highestProfit).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/dashboard/sales-metrics.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
export type ProductSalesRow = {
  product_id: string;
  title: string;
  units: number;
  revenue: number;
  material_cost: number;
  profit: number;
  has_bom: boolean;
};

export type DashboardSalesMetrics = {
  totalRevenue: number;
  totalUnits: number;
  totalMaterialCost: number;
  avgOrderValue: number;
  grossMarginPct: number;
  mostPopular: ProductSalesRow[];
  highestProfit: ProductSalesRow[];
};

const TOP_N = 3;

export function deriveDashboardSalesMetrics(
  rows: ProductSalesRow[],
  orderCount: number
): DashboardSalesMetrics {
  const totalRevenue = rows.reduce((s, r) => s + Number(r.revenue ?? 0), 0);
  const totalUnits = rows.reduce((s, r) => s + Number(r.units ?? 0), 0);
  const totalMaterialCost = rows.reduce((s, r) => s + Number(r.material_cost ?? 0), 0);

  const avgOrderValue = orderCount > 0 ? totalRevenue / orderCount : 0;
  const grossMarginPct =
    totalRevenue > 0 ? ((totalRevenue - totalMaterialCost) / totalRevenue) * 100 : 0;

  const mostPopular = [...rows]
    .sort((a, b) => Number(b.units) - Number(a.units))
    .slice(0, TOP_N);
  const highestProfit = [...rows]
    .sort((a, b) => Number(b.profit) - Number(a.profit))
    .slice(0, TOP_N);

  return {
    totalRevenue,
    totalUnits,
    totalMaterialCost,
    avgOrderValue,
    grossMarginPct,
    mostPopular,
    highestProfit,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/dashboard/sales-metrics.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard/sales-metrics.ts src/lib/dashboard/sales-metrics.test.ts
git commit -m "feat(dashboard): deriveDashboardSalesMetrics — KPIs + top product lists"
```

---

### Task 3: Wire metrics into the dashboard page

**Files:**
- Modify: `src/app/app/page.tsx`
- Modify: `src/app/app/dashboard.module.css`

- [ ] **Step 1: Fetch the data**

In `src/app/app/page.tsx`, after the existing `const tenantId = _tenantId!;` line, add the window + two RPC calls (place near the other date setup). Use these exact additions:

```tsx
  const todayDate = new Date();
  const toDate = todayDate.toISOString().slice(0, 10);
  const fromDate = new Date(todayDate.getTime() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  const [{ data: productSalesRows }, { data: windowOrders }] = await Promise.all([
    supabase.rpc("dashboard_product_sales", {
      p_tenant_id: tenantId,
      p_from: fromDate,
      p_to: toDate,
    }),
    // Reuse list_orders purely for the window order count (AOV denominator).
    supabase.rpc("list_orders", {
      p_tenant_id: tenantId,
      p_date_from: fromDate,
      p_date_to: toDate,
      p_limit: 1,
      p_offset: 0,
    }),
  ]);

  const windowOrderCount = Number(
    (windowOrders as Array<{ total_count: number }> | null)?.[0]?.total_count ?? 0
  );
  const salesMetrics = deriveDashboardSalesMetrics(
    (productSalesRows ?? []) as ProductSalesRow[],
    windowOrderCount
  );
```

Add imports at the top of the file:

```tsx
import { deriveDashboardSalesMetrics, type ProductSalesRow } from "@/lib/dashboard/sales-metrics";
```

- [ ] **Step 2: Add KPI chips**

Inside the existing `<div className={styles.kpiRow}>…</div>`, append three more chips after the "Open orders" chip (reuse the existing chip markup/classes):

```tsx
        <div className={styles.kpiChip}>
          <span className={styles.kpiLabel}>Revenue (30d)</span>
          <span className={styles.kpiValue}>{formatCurrency(salesMetrics.totalRevenue)}</span>
          <span className={styles.kpiSub}>{salesMetrics.totalUnits} units sold</span>
        </div>
        <div className={styles.kpiChip}>
          <span className={styles.kpiLabel}>Avg order value</span>
          <span className={styles.kpiValue}>{formatCurrency(salesMetrics.avgOrderValue)}</span>
          <span className={styles.kpiSub}>Last 30 days</span>
        </div>
        <div className={styles.kpiChip}>
          <span className={styles.kpiLabel}>Gross margin</span>
          <span className={styles.kpiValue}>{Math.round(salesMetrics.grossMarginPct)}%</span>
          <span className={styles.kpiSub}>Over materials</span>
        </div>
```

- [ ] **Step 3: Add the "Top products" card**

After the closing `</div>` of `styles.bottomRow`, add a new row with the top-products card:

```tsx
      <div className={styles.bottomRow}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div>
              <p className={styles.eyebrow}>Last 30 days</p>
              <h3 className={styles.cardTitle}>Top products</h3>
            </div>
            <Link href="/app/products" className={styles.viewAll}>View all</Link>
          </div>
          {salesMetrics.mostPopular.length === 0 ? (
            <p className={styles.emptyMsg}>No sales in the last 30 days.</p>
          ) : (
            <div className={styles.topProductsGrid}>
              <div className={styles.topProductsCol}>
                <p className={styles.topProductsHeading}>Most popular</p>
                {salesMetrics.mostPopular.map((p) => (
                  <Link key={p.product_id} href={`/app/products/${p.product_id}`} className={styles.topProductRow}>
                    <span className={styles.topProductName}>{p.title}</span>
                    <span className={styles.topProductVal}>{p.units} sold</span>
                  </Link>
                ))}
              </div>
              <div className={styles.topProductsCol}>
                <p className={styles.topProductsHeading}>Highest profit</p>
                {salesMetrics.highestProfit.map((p) => (
                  <Link key={p.product_id} href={`/app/products/${p.product_id}`} className={styles.topProductRow}>
                    <span className={styles.topProductName}>
                      {p.title}
                      {!p.has_bom && <span className={styles.noBomTag}> no BOM</span>}
                    </span>
                    <span className={styles.topProductVal}>{formatCurrency(p.profit)}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
```

- [ ] **Step 4: Add CSS**

Append to `src/app/app/dashboard.module.css` (tokens only, no hex; match existing classes in the file):

```css
.topProductsGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.topProductsCol { display: flex; flex-direction: column; gap: 4px; }
.topProductsHeading {
  font-size: var(--fs-xs);
  font-weight: var(--fw-semibold);
  text-transform: uppercase;
  letter-spacing: var(--ls-caps);
  color: var(--ink-muted);
  margin: 0 0 4px;
}
.topProductRow {
  display: flex; justify-content: space-between; gap: 8px;
  padding: 6px 8px; border-radius: var(--radius-lg);
  text-decoration: none; color: var(--ink-strong); font-size: var(--fs-sm);
}
.topProductRow:hover { background: var(--surface-hover); }
.topProductName { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.topProductVal { color: var(--ink-muted); white-space: nowrap; }
.noBomTag { color: var(--ink-faint); font-size: var(--fs-xs); }
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit -p tsconfig.json` (no new errors outside worktrees) and
`npx eslint src/app/app/page.tsx`. Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/app/app/page.tsx src/app/app/dashboard.module.css
git commit -m "feat(dashboard): revenue/AOV/margin KPIs + top products card"
```

---

### Task 4: End-to-end verification (manual, post-deploy)

- [ ] **Step 1:** Controller applies the RPC to prod and smoke-tests:
  `select * from dashboard_product_sales('<tenant>', current_date - 30, current_date) order by revenue desc limit 5;` — spot-check units/revenue/profit/has_bom; confirm a known product's numbers look right.
- [ ] **Step 2:** After deploy, load `/app` and verify the three new KPI chips populate and the "Top products" card shows Most popular (by units) and Highest profit (by profit), with "no BOM" tags where applicable.

---

## Notes for the implementer

- Supabase clients are **untyped**; cast RPC rows as shown.
- The window passes inclusive dates (`p_from`, `p_to`); the RPC uses `< (p_to + 1)` for the exclusive upper bound.
- `list_orders` (existing RPC) returns `total_count` via `count(*) over()`; calling it with `p_limit: 1` and the date range yields the window order count (historical included by default) without a new RPC.
- `formatCurrency` already exists in `page.tsx`. Reuse it; do not add a second one.
- Follow `dashboard.module.css` patterns; no hardcoded hex.
- `.bottomRow` is a 2-column grid. The Top-products card placed in a new `.bottomRow`
  will occupy one column. Check the rendered result: if a half-width card looks
  unbalanced, give the new card `grid-column: 1 / -1` (full width) via an added class,
  or pair it with the most-popular/highest-profit split already filling the width.
  Match the existing dashboard's visual rhythm — implementer's judgment.
