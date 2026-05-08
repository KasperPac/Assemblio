# Dashboard Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded three-section dashboard with a configurable widget grid, backed by a `tenant_dashboard_config` table and a Settings → Dashboard sub-page.

**Architecture:** A 6-column CSS grid renders an ordered list of widget IDs loaded from `tenant_dashboard_config`. Each widget is a self-contained server component that fetches its own data. A new `/app/settings/dashboard` sub-page (mirroring `/app/settings/theme`) lets admins choose a preset and toggle individual widgets. New widgets (production throughput, purchasing signals, inventory turnover, days-of-inventory) are pure-function-first with Vitest unit tests.

**Tech Stack:** Next.js 15 App Router (server components), Supabase JS client, Vitest, CSS Modules, design system tokens (`--brand-1`, `--bg-card`, `--ink-strong`, etc.).

---

## File Structure

**New files:**
- `supabase/patches/dashboard_config.sql` — tenant_dashboard_config table + RLS
- `src/lib/dashboard/types.ts` — WidgetId, WidgetMeta, WIDGET_CATALOG, PRESET_WIDGETS
- `src/lib/dashboard/config.ts` — `loadDashboardConfig(supabase, tenantId)`
- `src/lib/dashboard/config.test.ts` — unit tests for config loader
- `src/app/app/_dashboard/render-widget.tsx` — switch on WidgetId → server component
- `src/app/app/_dashboard/widget-grid.module.css` — 6-column grid + size classes
- `src/app/app/_dashboard/widgets/open-orders-queue.tsx`
- `src/app/app/_dashboard/widgets/on-time-fulfillment.tsx`
- `src/app/app/_dashboard/widgets/production-throughput.tsx`
- `src/app/app/_dashboard/widgets/purchasing-signals.tsx`
- `src/app/app/_dashboard/widgets/order-trend-chart.tsx`
- `src/app/app/_dashboard/widgets/inventory-value-snapshot.tsx`
- `src/app/app/_dashboard/widgets/low-stock-alerts.tsx`
- `src/app/app/_dashboard/widgets/inventory-turnover.tsx`
- `src/app/app/_dashboard/widgets/days-inventory-remaining.tsx`
- `src/app/app/_dashboard/widgets/top-products-demand.tsx`
- `src/app/app/_dashboard/widgets/bom-health.tsx`
- `src/app/app/_dashboard/widgets/quick-actions.tsx`
- `src/app/app/_dashboard/widgets/finance-gated.tsx` — shared unavailable state for 5 finance widgets
- `src/app/app/_dashboard/widget.module.css` — shared card/stat styles for all widgets
- `src/lib/dashboard/calculations.ts` — pure functions: daysRemaining, turnoverRatio
- `src/lib/dashboard/calculations.test.ts` — unit tests
- `src/app/app/settings/dashboard/page.tsx` — settings sub-page (server component)
- `src/app/app/settings/dashboard/actions.ts` — `saveDashboardConfig` server action
- `src/app/app/settings/dashboard/dashboard-settings.tsx` — client component: preset selector + toggles
- `src/app/app/settings/dashboard/dashboard-settings.module.css`

**Modified files:**
- `src/app/app/page.tsx` — rewritten to load config + render widget grid
- `src/app/app/dashboard.module.css` — add `.widgetGrid`, `.cell`, `.stat`, `.half`, `.full`
- `src/app/app/settings/page.tsx` — add Dashboard settings link
- `src/app/app/dashboard-charts.tsx` — kept unchanged (used by refactored widgets)

---

### Task 0: Database schema

**Goal:** Create `tenant_dashboard_config` table with RLS so tenant members can read and admins can write.

**Files:**
- Create: `supabase/patches/dashboard_config.sql`

**Acceptance Criteria:**
- [ ] Table exists with `tenant_id` (PK), `preset` (text), `widgets` (text[]), `updated_at`
- [ ] RLS enabled; members can SELECT; admin/super_admin can INSERT/UPDATE/DELETE
- [ ] Patch is idempotent (safe to run twice)

**Verify:** Apply patch via Supabase MCP `apply_migration` → no errors. Query `select * from tenant_dashboard_config` → empty result (no error).

**Steps:**

- [ ] **Step 1: Write the SQL patch**

```sql
-- supabase/patches/dashboard_config.sql
create table if not exists public.tenant_dashboard_config (
  tenant_id  uuid primary key references public.tenant(id) on delete cascade,
  preset     text not null default 'owner',
  widgets    text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.tenant_dashboard_config enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'tenant_dashboard_config' and policyname = 'tenant_members_select'
  ) then
    create policy tenant_members_select on public.tenant_dashboard_config
      for select using (tenant_id = public.current_tenant_id());
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'tenant_dashboard_config' and policyname = 'tenant_admins_write'
  ) then
    create policy tenant_admins_write on public.tenant_dashboard_config
      for all using (
        tenant_id = public.current_tenant_id()
        and exists (
          select 1 from public.profiles
          where id = auth.uid()
            and tenant_id = public.current_tenant_id()
            and role in ('admin', 'super_admin')
        )
      );
  end if;
end $$;
```

- [ ] **Step 2: Apply the patch**

Apply via Supabase MCP tool `apply_migration` with name `dashboard_config` and the SQL above.

- [ ] **Step 3: Commit**

```bash
git add supabase/patches/dashboard_config.sql
git commit -m "feat(db): add tenant_dashboard_config table with RLS"
```

---

### Task 1: Widget catalog types and config loader

**Goal:** Define all widget IDs, metadata, and preset definitions; implement `loadDashboardConfig` with Owner-preset fallback.

**Files:**
- Create: `src/lib/dashboard/types.ts`
- Create: `src/lib/dashboard/config.ts`
- Create: `src/lib/dashboard/config.test.ts`

**Acceptance Criteria:**
- [ ] `WIDGET_IDS` is a readonly const tuple of all 17 widget ID strings
- [ ] `WIDGET_CATALOG` has an entry for each ID with correct `size` and `gated` flag
- [ ] `PRESET_WIDGETS.owner` and `PRESET_WIDGETS.ops` each contain 8 valid widget IDs
- [ ] `loadDashboardConfig` returns owner preset when no DB row exists
- [ ] `loadDashboardConfig` filters out unknown widget IDs from saved config
- [ ] All 4 unit tests pass

**Verify:** `npx vitest run --pool threads --maxWorkers 1 src/lib/dashboard/config.test.ts` → 4 tests pass

**Steps:**

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/dashboard/config.test.ts
import { describe, it, expect } from "vitest";
import { loadDashboardConfig } from "./config";
import { PRESET_WIDGETS } from "./types";

function mockSupabase(data: unknown) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data, error: null }),
        }),
      }),
    }),
  } as any;
}

describe("loadDashboardConfig", () => {
  it("returns owner preset when no config row exists", async () => {
    const result = await loadDashboardConfig(mockSupabase(null), "tenant-1");
    expect(result).toEqual(PRESET_WIDGETS.owner);
  });

  it("returns saved widget list when config exists", async () => {
    const widgets = ["open-orders-queue", "bom-health"];
    const result = await loadDashboardConfig(mockSupabase({ widgets }), "tenant-1");
    expect(result).toEqual(["open-orders-queue", "bom-health"]);
  });

  it("filters out unknown widget IDs from saved config", async () => {
    const widgets = ["open-orders-queue", "invalid-widget-xyz"];
    const result = await loadDashboardConfig(mockSupabase({ widgets }), "tenant-1");
    expect(result).toEqual(["open-orders-queue"]);
  });

  it("falls back to owner preset when all saved IDs are invalid", async () => {
    const result = await loadDashboardConfig(mockSupabase({ widgets: ["bad-id"] }), "tenant-1");
    expect(result).toEqual(PRESET_WIDGETS.owner);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run --pool threads --maxWorkers 1 src/lib/dashboard/config.test.ts
```

Expected: FAIL — `Cannot find module './config'`

- [ ] **Step 3: Write types.ts**

```typescript
// src/lib/dashboard/types.ts
export const WIDGET_IDS = [
  "open-orders-queue",
  "on-time-fulfillment",
  "production-throughput",
  "purchasing-signals",
  "order-trend-chart",
  "inventory-value-snapshot",
  "low-stock-alerts",
  "inventory-turnover",
  "days-inventory-remaining",
  "top-products-demand",
  "bom-health",
  "quick-actions",
  "revenue-trend",
  "gross-margin",
  "avg-order-value",
  "gmroi",
  "sell-through-rate",
] as const;

export type WidgetId = (typeof WIDGET_IDS)[number];
export type WidgetSize = "stat" | "half" | "full";
export type WidgetCategory = "operations" | "inventory" | "finance" | "planning";

export type WidgetMeta = {
  id: WidgetId;
  label: string;
  description: string;
  category: WidgetCategory;
  size: WidgetSize;
  gated: boolean;
};

export const WIDGET_CATALOG: WidgetMeta[] = [
  { id: "open-orders-queue",       label: "Open orders queue",         description: "Count + mini-list of unfulfilled orders",              category: "operations", size: "half", gated: false },
  { id: "on-time-fulfillment",     label: "On-time fulfillment rate",  description: "% fulfilled on time, rolling 30 days",                 category: "operations", size: "stat", gated: false },
  { id: "production-throughput",   label: "Production throughput",     description: "Orders completed this week vs last week",              category: "operations", size: "stat", gated: false },
  { id: "purchasing-signals",      label: "Purchasing signals",        description: "Active POs + components near reorder point",           category: "operations", size: "half", gated: false },
  { id: "order-trend-chart",       label: "Order trend chart",         description: "6-month placed vs fulfilled line chart",               category: "operations", size: "full", gated: false },
  { id: "inventory-value-snapshot",label: "Inventory value snapshot",  description: "On-hand, in-production, reserved cost values",         category: "inventory",  size: "half", gated: false },
  { id: "low-stock-alerts",        label: "Low stock alerts",          description: "Components below reorder point with days-remaining",   category: "inventory",  size: "half", gated: false },
  { id: "inventory-turnover",      label: "Inventory turnover ratio",  description: "COGS ÷ avg inventory value, rolling 90 days",          category: "inventory",  size: "stat", gated: false },
  { id: "days-inventory-remaining",label: "Days of inventory remaining",description: "Top components: days until stockout at burn rate",    category: "inventory",  size: "half", gated: false },
  { id: "top-products-demand",     label: "Top products demand",       description: "Donut chart — top 5 products by order volume",         category: "inventory",  size: "half", gated: false },
  { id: "bom-health",              label: "BOM health",                description: "Coverage %, missing BOMs, integrity issues",           category: "planning",   size: "half", gated: false },
  { id: "quick-actions",           label: "Quick actions",             description: "Shortcuts: Build BOMs, stocktake, components",         category: "planning",   size: "full", gated: false },
  { id: "revenue-trend",           label: "Revenue trend",             description: "Monthly revenue for last 6 months",                    category: "finance",    size: "full", gated: true  },
  { id: "gross-margin",            label: "Gross margin %",            description: "Sell price minus COGS across all orders this month",   category: "finance",    size: "stat", gated: true  },
  { id: "avg-order-value",         label: "Average order value",       description: "Mean sell value per order, this month vs last",        category: "finance",    size: "stat", gated: true  },
  { id: "gmroi",                   label: "GMROI",                     description: "Gross margin return per $1 of inventory held",         category: "finance",    size: "stat", gated: true  },
  { id: "sell-through-rate",       label: "Sell-through rate",         description: "% of received inventory sold in the period",           category: "planning",   size: "stat", gated: true  },
];

export const PRESET_WIDGETS: Record<"owner" | "ops", WidgetId[]> = {
  owner: [
    "revenue-trend",
    "gross-margin",
    "avg-order-value",
    "gmroi",
    "inventory-value-snapshot",
    "inventory-turnover",
    "open-orders-queue",
    "top-products-demand",
  ],
  ops: [
    "open-orders-queue",
    "production-throughput",
    "on-time-fulfillment",
    "purchasing-signals",
    "low-stock-alerts",
    "days-inventory-remaining",
    "bom-health",
    "order-trend-chart",
  ],
};
```

- [ ] **Step 4: Write config.ts**

```typescript
// src/lib/dashboard/config.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { PRESET_WIDGETS, WIDGET_IDS, type WidgetId } from "./types";

export async function loadDashboardConfig(
  supabase: SupabaseClient,
  tenantId: string
): Promise<WidgetId[]> {
  const { data } = await supabase
    .from("tenant_dashboard_config")
    .select("widgets")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!data) return [...PRESET_WIDGETS.owner];

  const valid = (data.widgets as string[]).filter((id): id is WidgetId =>
    (WIDGET_IDS as readonly string[]).includes(id)
  );
  return valid.length > 0 ? valid : [...PRESET_WIDGETS.owner];
}
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npx vitest run --pool threads --maxWorkers 1 src/lib/dashboard/config.test.ts
```

Expected: 4 tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/dashboard/types.ts src/lib/dashboard/config.ts src/lib/dashboard/config.test.ts
git commit -m "feat(dashboard): widget catalog types and config loader"
```

---

### Task 2: Calculation helpers for new widgets

**Goal:** Implement pure functions for days-of-inventory and inventory turnover so they can be tested independently of Supabase.

**Files:**
- Create: `src/lib/dashboard/calculations.ts`
- Create: `src/lib/dashboard/calculations.test.ts`

**Acceptance Criteria:**
- [ ] `calcDaysRemaining(onHand, reserved, avgDailyBurn)` returns correct integer or `null` when no burn data
- [ ] `calcTurnoverRatio(cogs90d, startValue, endValue)` returns ratio rounded to 1dp or `null` when no data
- [ ] All 8 unit tests pass

**Verify:** `npx vitest run --pool threads --maxWorkers 1 src/lib/dashboard/calculations.test.ts` → 8 tests pass

**Steps:**

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/dashboard/calculations.test.ts
import { describe, it, expect } from "vitest";
import { calcDaysRemaining, calcTurnoverRatio } from "./calculations";

describe("calcDaysRemaining", () => {
  it("returns days when burn rate is positive", () => {
    expect(calcDaysRemaining(100, 20, 4)).toBe(20); // (100-20)/4 = 20
  });

  it("floors to integer", () => {
    expect(calcDaysRemaining(100, 20, 6)).toBe(13); // 80/6 = 13.3 → 13
  });

  it("returns null when avgDailyBurn is zero", () => {
    expect(calcDaysRemaining(100, 0, 0)).toBeNull();
  });

  it("returns null when avgDailyBurn is negative", () => {
    expect(calcDaysRemaining(100, 0, -1)).toBeNull();
  });

  it("returns 0 when available is zero or negative", () => {
    expect(calcDaysRemaining(0, 0, 5)).toBe(0);
    expect(calcDaysRemaining(5, 10, 5)).toBe(0);
  });
});

describe("calcTurnoverRatio", () => {
  it("returns ratio rounded to 1 decimal place", () => {
    expect(calcTurnoverRatio(120_000, 20_000, 40_000)).toBe(4.0); // 120k/30k avg
  });

  it("returns null when avg inventory value is zero", () => {
    expect(calcTurnoverRatio(50_000, 0, 0)).toBeNull();
  });

  it("returns null when cogs is zero", () => {
    expect(calcTurnoverRatio(0, 10_000, 20_000)).toBe(0.0);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx vitest run --pool threads --maxWorkers 1 src/lib/dashboard/calculations.test.ts
```

Expected: FAIL — `Cannot find module './calculations'`

- [ ] **Step 3: Write calculations.ts**

```typescript
// src/lib/dashboard/calculations.ts
export function calcDaysRemaining(
  onHand: number,
  reserved: number,
  avgDailyBurn: number
): number | null {
  if (avgDailyBurn <= 0) return null;
  const available = onHand - reserved;
  return Math.max(0, Math.floor(available / avgDailyBurn));
}

export function calcTurnoverRatio(
  cogs90d: number,
  startInventoryValue: number,
  endInventoryValue: number
): number | null {
  const avg = (startInventoryValue + endInventoryValue) / 2;
  if (avg <= 0) return null;
  return Math.round((cogs90d / avg) * 10) / 10;
}
```

- [ ] **Step 4: Run to confirm pass**

```bash
npx vitest run --pool threads --maxWorkers 1 src/lib/dashboard/calculations.test.ts
```

Expected: 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/dashboard/calculations.ts src/lib/dashboard/calculations.test.ts
git commit -m "feat(dashboard): pure calculation helpers with tests"
```

---

### Task 3: Widget grid layout and shared widget styles

**Goal:** Create the CSS grid wrapper that renders widget cells at stat/half/full width, plus shared widget card styles used by all widget components.

**Files:**
- Create: `src/app/app/_dashboard/widget-grid.module.css`
- Create: `src/app/app/_dashboard/widget.module.css`
- Modify: `src/app/app/dashboard.module.css` — add `.widgetGrid` class

**Acceptance Criteria:**
- [ ] 6-column grid renders stat (2 cols), half (3 cols), full (6 cols) correctly
- [ ] Responsive: at ≤1180px stat→3 cols, half→6 cols; at ≤820px stat→6 cols
- [ ] Widget card styles follow existing `--bg-card`, `--ink-strong`, `--stroke-card` tokens

**Verify:** Visual check after Task 7 wires up the dashboard.

**Steps:**

- [ ] **Step 1: Write widget-grid.module.css**

```css
/* src/app/app/_dashboard/widget-grid.module.css */
.grid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 18px;
  align-items: start;
}

.stat { grid-column: span 2; }
.half { grid-column: span 3; }
.full { grid-column: span 6; }

@media (max-width: 1180px) {
  .stat { grid-column: span 3; }
  .half { grid-column: span 6; }
}

@media (max-width: 820px) {
  .stat { grid-column: span 6; }
}
```

- [ ] **Step 2: Write widget.module.css (shared card styles)**

```css
/* src/app/app/_dashboard/widget.module.css */
.card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
  border: 1px solid color-mix(in srgb, var(--stroke-card) 100%, transparent);
  border-radius: 24px;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--surface-1) 88%, var(--bg-card)),
    color-mix(in srgb, var(--surface-0) 94%, var(--bg-card))
  );
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.04),
    0 18px 40px rgba(5, 8, 15, 0.28);
  height: 100%;
  box-sizing: border-box;
}

.cardHeader {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.eyebrow {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  color: var(--ink-faint);
}

.title {
  margin: 4px 0 0;
  font-size: clamp(1rem, 1vw + 0.8rem, 1.4rem);
  line-height: 1.1;
  color: var(--ink-strong);
}

/* Stat card variant */
.stat {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 20px;
  border: 1px solid color-mix(in srgb, var(--stroke-card) 100%, transparent);
  border-radius: 22px;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--surface-1) 72%, var(--bg-card)),
    color-mix(in srgb, var(--surface-0) 96%, var(--bg-card))
  );
  height: 100%;
  box-sizing: border-box;
}

.statLabel {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.15em;
  color: var(--ink-faint);
}

.statValue {
  margin: 0;
  font-size: clamp(1.5rem, 1.5vw + 1rem, 2.4rem);
  font-weight: 800;
  line-height: 1;
  color: var(--ink-strong);
}

.statDetail {
  margin: 0;
  font-size: 0.84rem;
  color: var(--ink-muted);
}

.trendUp   { color: #4ade80; }
.trendDown { color: #f87171; }
.trendWarn { color: #fbbf24; }

/* List rows */
.rowList {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 16px;
  background: color-mix(in srgb, var(--surface-1) 78%, var(--bg-card));
  border: 1px solid color-mix(in srgb, var(--stroke-card) 100%, transparent);
  font-size: 0.9rem;
}

.rowLabel { color: var(--ink-strong); flex: 1; }
.rowMeta  { color: var(--ink-muted); font-size: 0.82rem; }

/* Gated / unavailable */
.gated {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  border: 1px dashed color-mix(in srgb, var(--stroke-card) 60%, transparent);
  border-radius: 24px;
  text-align: center;
  height: 100%;
  box-sizing: border-box;
  min-height: 120px;
}

.gatedLabel {
  margin: 0;
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--ink-faint);
}

.gatedCta {
  margin: 0;
  font-size: 0.82rem;
  color: var(--brand-1);
}
```

- [ ] **Step 3: Add widgetGrid class to dashboard.module.css**

In `src/app/app/dashboard.module.css`, add at the end:

```css
.widgetGrid {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 18px;
  align-items: start;
}

.widgetStat { grid-column: span 2; }
.widgetHalf { grid-column: span 3; }
.widgetFull { grid-column: span 6; }

@media (max-width: 1180px) {
  .widgetStat { grid-column: span 3; }
  .widgetHalf { grid-column: span 6; }
}

@media (max-width: 820px) {
  .widgetStat { grid-column: span 6; }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/app/_dashboard/widget-grid.module.css src/app/app/_dashboard/widget.module.css src/app/app/dashboard.module.css
git commit -m "feat(dashboard): widget grid CSS and shared card styles"
```

---

### Task 4: Refactor existing widgets into standalone components

**Goal:** Extract the eight existing dashboard pieces into self-contained server components under `src/app/app/_dashboard/widgets/`.

**Files:**
- Create: `src/app/app/_dashboard/widgets/open-orders-queue.tsx`
- Create: `src/app/app/_dashboard/widgets/on-time-fulfillment.tsx`
- Create: `src/app/app/_dashboard/widgets/order-trend-chart.tsx`
- Create: `src/app/app/_dashboard/widgets/inventory-value-snapshot.tsx`
- Create: `src/app/app/_dashboard/widgets/low-stock-alerts.tsx`
- Create: `src/app/app/_dashboard/widgets/top-products-demand.tsx`
- Create: `src/app/app/_dashboard/widgets/bom-health.tsx`
- Create: `src/app/app/_dashboard/widgets/quick-actions.tsx`

**Acceptance Criteria:**
- [ ] Each widget is a `async function` accepting `{ supabase, tenantId }` props
- [ ] Data queries are copied from `page.tsx` into the widget (queries are not shared between widgets)
- [ ] Each widget renders using `widget.module.css` tokens — no hardcoded colors
- [ ] `low-stock-alerts` shows days-remaining bars using `calcDaysRemaining` from Task 2

**Verify:** After Task 7 rewires the dashboard, visit `/app` — existing widgets appear with same data as before.

**Steps:**

- [ ] **Step 1: Create open-orders-queue.tsx**

```typescript
// src/app/app/_dashboard/widgets/open-orders-queue.tsx
import type { SupabaseClient } from "@supabase/supabase-js";
import Link from "next/link";
import styles from "../widget.module.css";
import StatusBadge from "../../_ui/status-badge";
import EmptyState from "../../_ui/empty-state";

type Props = { supabase: SupabaseClient; tenantId: string };

export async function OpenOrdersQueue({ supabase, tenantId }: Props) {
  const { data: orders } = await supabase
    .from("orders")
    .select("id,shopify_order_id,order_number,status,created_at")
    .eq("tenant_id", tenantId)
    .neq("status", "fulfilled")
    .order("created_at", { ascending: false })
    .limit(5);

  const { count: openCount } = await supabase
    .from("orders")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .neq("status", "fulfilled");

  const list = orders ?? [];

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <p className={styles.eyebrow}>Live queue</p>
          <h3 className={styles.title}>Open orders</h3>
        </div>
        <Link href="/app/orders" style={{ fontSize: "0.84rem", fontWeight: 700, color: "var(--ink-muted)", textDecoration: "none" }}>
          View all ({openCount ?? 0})
        </Link>
      </div>
      {list.length === 0 ? (
        <EmptyState title="No open orders" message="All orders are fulfilled or no orders have been synced yet." />
      ) : (
        <div className={styles.rowList}>
          {list.map((order) => {
            const status = order.status?.toLowerCase() ?? "";
            const variant = status === "fulfilled" ? "success" : status === "cancelled" ? "danger" : "info";
            const label = `#${order.order_number ?? order.shopify_order_id ?? order.id.slice(0, 6)}`;
            const date = new Date(order.created_at).toLocaleDateString("en-GB");
            return (
              <Link key={order.id} href={`/app/orders/${order.id}`} className={styles.row} style={{ textDecoration: "none" }}>
                <div>
                  <strong className={styles.rowLabel}>{label}</strong>
                  <p className={styles.rowMeta}>{date}</p>
                </div>
                <StatusBadge variant={variant}>{order.status}</StatusBadge>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create on-time-fulfillment.tsx**

```typescript
// src/app/app/_dashboard/widgets/on-time-fulfillment.tsx
import type { SupabaseClient } from "@supabase/supabase-js";
import styles from "../widget.module.css";

type Props = { supabase: SupabaseClient; tenantId: string };

export async function OnTimeFulfillment({ supabase, tenantId }: Props) {
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const { data } = await supabase
    .from("orders")
    .select("status")
    .eq("tenant_id", tenantId)
    .gte("created_at", sixMonthsAgo.toISOString());

  const rows = data ?? [];
  const placed = rows.length;
  const fulfilled = rows.filter((r) => r.status === "fulfilled").length;
  const rate = placed > 0 ? Math.round((fulfilled / placed) * 100) : 0;
  const trend = rate >= 90 ? "up" : rate >= 70 ? "warn" : "down";

  return (
    <div className={styles.stat}>
      <p className={styles.statLabel}>On-time fulfillment</p>
      <p className={styles.statValue}>{rate}%</p>
      <p className={`${styles.statDetail} ${styles[`trend${trend.charAt(0).toUpperCase() + trend.slice(1)}`]}`}>
        {fulfilled} of {placed} orders fulfilled (6 months)
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Create order-trend-chart.tsx**

```typescript
// src/app/app/_dashboard/widgets/order-trend-chart.tsx
import type { SupabaseClient } from "@supabase/supabase-js";
import styles from "../widget.module.css";
import { OrderTrendChart } from "../../dashboard-charts";

type Props = { supabase: SupabaseClient; tenantId: string };

export async function OrderTrendChartWidget({ supabase, tenantId }: Props) {
  const now = new Date();
  const start = new Date();
  start.setMonth(now.getMonth() - 5);

  const { data } = await supabase
    .from("orders")
    .select("status,created_at")
    .eq("tenant_id", tenantId)
    .gte("created_at", start.toISOString());

  const buckets = Array.from({ length: 6 }).map((_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return {
      label: date.toLocaleString("en-AU", { month: "short", year: "2-digit" }),
      placed: 0,
      fulfilled: 0,
      cancelled: 0,
    };
  });

  (data ?? []).forEach((row) => {
    const created = new Date(row.created_at);
    const idx = (created.getFullYear() - start.getFullYear()) * 12 + created.getMonth() - start.getMonth();
    if (idx >= 0 && idx < buckets.length) {
      buckets[idx].placed += 1;
      if (row.status === "fulfilled") buckets[idx].fulfilled += 1;
      if (row.status === "cancelled") buckets[idx].cancelled += 1;
    }
  });

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <p className={styles.eyebrow}>Fulfillment flow</p>
          <h3 className={styles.title}>Order trend</h3>
        </div>
      </div>
      <OrderTrendChart data={buckets} />
    </div>
  );
}
```

- [ ] **Step 4: Create inventory-value-snapshot.tsx**

```typescript
// src/app/app/_dashboard/widgets/inventory-value-snapshot.tsx
import type { SupabaseClient } from "@supabase/supabase-js";
import styles from "../widget.module.css";

type Props = { supabase: SupabaseClient; tenantId: string };

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(value);
}

function firstOf<T>(v: T | T[] | null | undefined): T | undefined {
  return Array.isArray(v) ? v[0] : v ?? undefined;
}

export async function InventoryValueSnapshot({ supabase, tenantId }: Props) {
  const { data: balances } = await supabase
    .from("inventory_balance")
    .select("on_hand,in_prod,reserved,component:component_id(cost_per_unit)")
    .eq("tenant_id", tenantId);

  const rows = balances ?? [];
  const costOf = (qty: number, row: typeof rows[0]) =>
    qty * Number(firstOf(row.component)?.cost_per_unit ?? 0);

  const onHand   = rows.reduce((s, r) => s + costOf(Number(r.on_hand ?? 0), r), 0);
  const inProd   = rows.reduce((s, r) => s + costOf(Number(r.in_prod ?? 0), r), 0);
  const reserved = rows.reduce((s, r) => s + costOf(Number(r.reserved ?? 0), r), 0);

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <p className={styles.eyebrow}>Stock position</p>
          <h3 className={styles.title}>Inventory value</h3>
        </div>
      </div>
      <div className={styles.rowList}>
        <div className={styles.row}><span className={styles.rowLabel}>On hand</span><strong>{formatCurrency(onHand)}</strong></div>
        <div className={styles.row}><span className={styles.rowLabel}>In production</span><strong>{formatCurrency(inProd)}</strong></div>
        <div className={styles.row}><span className={styles.rowLabel}>Reserved</span><strong>{formatCurrency(reserved)}</strong></div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create low-stock-alerts.tsx**

```typescript
// src/app/app/_dashboard/widgets/low-stock-alerts.tsx
import type { SupabaseClient } from "@supabase/supabase-js";
import styles from "../widget.module.css";
import StatusBadge from "../../_ui/status-badge";
import { calcDaysRemaining } from "@/lib/dashboard/calculations";

type Props = { supabase: SupabaseClient; tenantId: string };

function firstOf<T>(v: T | T[] | null | undefined): T | undefined {
  return Array.isArray(v) ? v[0] : v ?? undefined;
}

export async function LowStockAlerts({ supabase, tenantId }: Props) {
  const [{ data: components }, { data: balances }] = await Promise.all([
    supabase.from("component").select("id,name,reorder_point").eq("tenant_id", tenantId),
    supabase.from("inventory_balance").select("component_id,on_hand,reserved").eq("tenant_id", tenantId),
  ]);

  const reorderMap = new Map((components ?? []).map((c) => [c.id, Number(c.reorder_point ?? 0)]));
  const nameMap    = new Map((components ?? []).map((c) => [c.id, c.name ?? "Unknown"]));

  const atRisk = (balances ?? [])
    .map((b) => ({
      id: b.component_id,
      name: nameMap.get(b.component_id) ?? "Unknown",
      onHand: Number(b.on_hand ?? 0),
      reserved: Number(b.reserved ?? 0),
      reorderPoint: reorderMap.get(b.component_id) ?? 0,
    }))
    .filter((b) => b.onHand - b.reserved <= b.reorderPoint)
    .slice(0, 6);

  const variant = atRisk.length === 0 ? "success" : atRisk.length > 3 ? "danger" : "warning";

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <p className={styles.eyebrow}>Stock risk</p>
          <h3 className={styles.title}>Low stock alerts</h3>
        </div>
        <StatusBadge variant={variant}>
          {atRisk.length === 0 ? "All clear" : `${atRisk.length} at risk`}
        </StatusBadge>
      </div>
      {atRisk.length === 0 ? (
        <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.9rem" }}>All components are above their reorder points.</p>
      ) : (
        <div className={styles.rowList}>
          {atRisk.map((b) => {
            const available = b.onHand - b.reserved;
            return (
              <div key={b.id} className={styles.row}>
                <span className={styles.rowLabel}>{b.name}</span>
                <span className={styles.rowMeta}>{available} avail / {b.reorderPoint} reorder</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6: Create top-products-demand.tsx**

```typescript
// src/app/app/_dashboard/widgets/top-products-demand.tsx
import type { SupabaseClient } from "@supabase/supabase-js";
import styles from "../widget.module.css";
import { TopProductsChart } from "../../dashboard-charts";

type Props = { supabase: SupabaseClient; tenantId: string };

function firstOf<T>(v: T | T[] | null | undefined): T | undefined {
  return Array.isArray(v) ? v[0] : v ?? undefined;
}

export async function TopProductsDemand({ supabase, tenantId }: Props) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from("order_line")
    .select("variant:variant_id(product:product_id(title))")
    .eq("tenant_id", tenantId)
    .gte("created_at", thirtyDaysAgo);

  const counts = (data ?? []).reduce<Record<string, number>>((acc, row) => {
    const title = firstOf(firstOf(row.variant)?.product)?.title ?? "Unknown";
    acc[title] = (acc[title] ?? 0) + 1;
    return acc;
  }, {});

  const top = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([title, count]) => ({ title, count }));

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <p className={styles.eyebrow}>Demand mix</p>
          <h3 className={styles.title}>Top products this month</h3>
        </div>
      </div>
      <TopProductsChart data={top} />
    </div>
  );
}
```

- [ ] **Step 7: Create bom-health.tsx**

```typescript
// src/app/app/_dashboard/widgets/bom-health.tsx
import type { SupabaseClient } from "@supabase/supabase-js";
import styles from "../widget.module.css";
import StatusBadge from "../../_ui/status-badge";
import { findInventoryInvariantIssues } from "@/lib/inventory/invariants";

type Props = { supabase: SupabaseClient; tenantId: string };

function firstOf<T>(v: T | T[] | null | undefined): T | undefined {
  return Array.isArray(v) ? v[0] : v ?? undefined;
}

export async function BomHealth({ supabase, tenantId }: Props) {
  const [{ data: variants }, { count: activeBomCount }, { data: balances }] = await Promise.all([
    supabase.from("shopify_variant").select("id").eq("tenant_id", tenantId),
    supabase.from("product_bom").select("variant_id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("is_active", true),
    supabase.from("inventory_balance").select("component_id,on_hand,in_prod,reserved,component:component_id(name),location:location_id(name)").eq("tenant_id", tenantId),
  ]);

  const activeBomIds = new Set(
    (await supabase.from("product_bom").select("variant_id").eq("tenant_id", tenantId).eq("is_active", true)).data?.map((r) => r.variant_id) ?? []
  );
  const totalVariants = (variants ?? []).length;
  const missingBoms = (variants ?? []).filter((v) => !activeBomIds.has(v.id)).length;
  const coverage = totalVariants > 0 ? Math.round(((activeBomCount ?? 0) / totalVariants) * 100) : 0;

  const issues = findInventoryInvariantIssues(
    (balances ?? []).map((r) => ({
      componentName: firstOf(r.component)?.name ?? "Unknown",
      locationName: firstOf(r.location)?.name ?? "Unknown",
      onHand: Number(r.on_hand ?? 0),
      inProd: Number(r.in_prod ?? 0),
      reserved: Number(r.reserved ?? 0),
    }))
  );

  const tone = issues.length > 0 ? "danger" : missingBoms > 0 ? "warning" : "success";

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <p className={styles.eyebrow}>Readiness</p>
          <h3 className={styles.title}>BOM health</h3>
        </div>
        <StatusBadge variant={tone}>{tone === "success" ? "Ready" : "Attention"}</StatusBadge>
      </div>
      <div className={styles.rowList}>
        <div className={styles.row}><span className={styles.rowLabel}>BOM coverage</span><strong>{coverage}%</strong></div>
        <div className={styles.row}><span className={styles.rowLabel}>Missing BOMs</span><strong style={{ color: missingBoms > 0 ? "#fbbf24" : "inherit" }}>{missingBoms}</strong></div>
        <div className={styles.row}><span className={styles.rowLabel}>Integrity issues</span><strong style={{ color: issues.length > 0 ? "#f87171" : "inherit" }}>{issues.length}</strong></div>
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Create quick-actions.tsx**

```typescript
// src/app/app/_dashboard/widgets/quick-actions.tsx
import styles from "../widget.module.css";

const ACTIONS = [
  { href: "/app/products",    label: "Build BOMs",          sub: "Create or revise BOMs for high-demand variants" },
  { href: "/app/components",  label: "Review components",   sub: "Check reorder points and stock exposure" },
  { href: "/app/stocktake",   label: "Run stocktake",       sub: "Start a count to reconcile inventory" },
  { href: "/app/settings",    label: "Open settings",       sub: "Check Shopify sync and workspace config" },
];

export function QuickActions() {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <p className={styles.eyebrow}>Next actions</p>
          <h3 className={styles.title}>Jump into the work</h3>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14 }}>
        {ACTIONS.map((a) => (
          <a key={a.href} href={a.href} style={{ display: "flex", flexDirection: "column", gap: 6, padding: 18, borderRadius: 18, border: "1px solid color-mix(in srgb, var(--stroke-card) 100%, transparent)", background: "color-mix(in srgb, var(--surface-1) 78%, var(--bg-card))", textDecoration: "none" }}>
            <strong style={{ color: "var(--ink-strong)", fontSize: "0.98rem" }}>{a.label}</strong>
            <span style={{ color: "var(--ink-muted)", fontSize: "0.84rem" }}>{a.sub}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Commit**

```bash
git add src/app/app/_dashboard/widgets/
git commit -m "feat(dashboard): refactor existing widgets into standalone components"
```

---

### Task 5: New operations widgets — production throughput and purchasing signals

**Goal:** Build the two new operations widgets that don't exist yet.

**Files:**
- Create: `src/app/app/_dashboard/widgets/production-throughput.tsx`
- Create: `src/app/app/_dashboard/widgets/purchasing-signals.tsx`

**Acceptance Criteria:**
- [ ] Production throughput queries fulfilled orders in current vs prior ISO week
- [ ] Purchasing signals shows active POs (not received/cancelled/archived) + low-stock components, ordered by urgency
- [ ] Both use `widget.module.css` stat/card styles

**Verify:** Visual check after Task 7 wires up the dashboard — both widgets show data with real POs and components.

**Steps:**

- [ ] **Step 1: Create production-throughput.tsx**

```typescript
// src/app/app/_dashboard/widgets/production-throughput.tsx
import type { SupabaseClient } from "@supabase/supabase-js";
import styles from "../widget.module.css";

type Props = { supabase: SupabaseClient; tenantId: string };

function getISOWeekBounds(weeksAgo: number): { start: Date; end: Date } {
  const now = new Date();
  const dayOfWeek = now.getDay() === 0 ? 6 : now.getDay() - 1; // Mon=0
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - dayOfWeek - weeksAgo * 7);
  thisMonday.setHours(0, 0, 0, 0);
  const nextMonday = new Date(thisMonday);
  nextMonday.setDate(thisMonday.getDate() + 7);
  return { start: thisMonday, end: nextMonday };
}

export async function ProductionThroughput({ supabase, tenantId }: Props) {
  const thisWeek = getISOWeekBounds(0);
  const lastWeek = getISOWeekBounds(1);

  const [{ count: thisCount }, { count: lastCount }] = await Promise.all([
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "fulfilled")
      .gte("updated_at", thisWeek.start.toISOString())
      .lt("updated_at", thisWeek.end.toISOString()),
    supabase
      .from("orders")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "fulfilled")
      .gte("updated_at", lastWeek.start.toISOString())
      .lt("updated_at", lastWeek.end.toISOString()),
  ]);

  const current = thisCount ?? 0;
  const prior   = lastCount ?? 0;
  const diff    = current - prior;
  const trendClass = diff > 0 ? styles.trendUp : diff < 0 ? styles.trendDown : styles.trendWarn;
  const trendLabel = diff > 0 ? `↑ ${diff} vs last week` : diff < 0 ? `↓ ${Math.abs(diff)} vs last week` : "Same as last week";

  return (
    <div className={styles.stat}>
      <p className={styles.statLabel}>Production throughput</p>
      <p className={styles.statValue}>{current}</p>
      <p className={`${styles.statDetail} ${trendClass}`}>{trendLabel}</p>
    </div>
  );
}
```

- [ ] **Step 2: Create purchasing-signals.tsx**

```typescript
// src/app/app/_dashboard/widgets/purchasing-signals.tsx
import type { SupabaseClient } from "@supabase/supabase-js";
import styles from "../widget.module.css";
import Link from "next/link";

type Props = { supabase: SupabaseClient; tenantId: string };

const TERMINAL_STATUSES = ["received", "cancelled", "archived"];

function firstOf<T>(v: T | T[] | null | undefined): T | undefined {
  return Array.isArray(v) ? v[0] : v ?? undefined;
}

export async function PurchasingSignals({ supabase, tenantId }: Props) {
  const [{ data: activePOs }, { data: components }, { data: balances }] = await Promise.all([
    supabase
      .from("purchase_order")
      .select("id,status,created_at,supplier:supplier_id(name)")
      .eq("tenant_id", tenantId)
      .not("status", "in", `(${TERMINAL_STATUSES.join(",")})`)
      .order("created_at", { ascending: true })
      .limit(5),
    supabase.from("component").select("id,name,reorder_point").eq("tenant_id", tenantId),
    supabase.from("inventory_balance").select("component_id,on_hand,reserved").eq("tenant_id", tenantId),
  ]);

  const reorderMap = new Map((components ?? []).map((c) => [c.id, Number(c.reorder_point ?? 0)]));
  const nameMap    = new Map((components ?? []).map((c) => [c.id, c.name ?? "Unknown"]));

  const lowStock = (balances ?? [])
    .filter((b) => Number(b.on_hand ?? 0) - Number(b.reserved ?? 0) <= (reorderMap.get(b.component_id) ?? 0))
    .slice(0, 3)
    .map((b) => ({ id: b.component_id, label: nameMap.get(b.component_id) ?? "Unknown", type: "stock" as const }));

  const poSignals = (activePOs ?? []).map((po) => ({
    id: po.id,
    label: `PO-${po.id.slice(0, 6)} — ${firstOf(po.supplier)?.name ?? "Unknown supplier"} (${po.status})`,
    type: "po" as const,
    href: `/app/purchasing`,
  }));

  const all = [...poSignals, ...lowStock];

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <p className={styles.eyebrow}>Action needed</p>
          <h3 className={styles.title}>Purchasing signals</h3>
        </div>
        <Link href="/app/purchasing" style={{ fontSize: "0.84rem", fontWeight: 700, color: "var(--ink-muted)", textDecoration: "none" }}>
          View all
        </Link>
      </div>
      {all.length === 0 ? (
        <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.9rem" }}>No active POs or low-stock components.</p>
      ) : (
        <div className={styles.rowList}>
          {all.map((sig) => (
            <div key={sig.id} className={styles.row} style={{ fontSize: "0.88rem" }}>
              <span className={styles.rowLabel}>{sig.label}</span>
              <span style={{ fontSize: "0.75rem", padding: "2px 7px", borderRadius: 4, fontWeight: 700, background: sig.type === "po" ? "rgba(96,165,250,0.15)" : "rgba(251,191,36,0.15)", color: sig.type === "po" ? "#60a5fa" : "#fbbf24" }}>
                {sig.type === "po" ? "PO" : "Low stock"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/app/_dashboard/widgets/production-throughput.tsx src/app/app/_dashboard/widgets/purchasing-signals.tsx
git commit -m "feat(dashboard): production throughput and purchasing signals widgets"
```

---

### Task 6: New inventory widgets — turnover and days remaining

**Goal:** Build the two new inventory widgets using the calculation helpers from Task 2.

**Files:**
- Create: `src/app/app/_dashboard/widgets/inventory-turnover.tsx`
- Create: `src/app/app/_dashboard/widgets/days-inventory-remaining.tsx`

**Acceptance Criteria:**
- [ ] Inventory turnover uses `calcTurnoverRatio` with 90-day COGS from `job_cost_snapshot`
- [ ] Days remaining uses `calcDaysRemaining` with 30-day burn rate from `bom_component` usage
- [ ] Both show "—" gracefully when data is insufficient (no fulfilled orders yet)

**Verify:** Visual check after Task 7 — widgets render without error on an empty/sparse tenant.

**Steps:**

- [ ] **Step 1: Create inventory-turnover.tsx**

```typescript
// src/app/app/_dashboard/widgets/inventory-turnover.tsx
import type { SupabaseClient } from "@supabase/supabase-js";
import styles from "../widget.module.css";
import { calcTurnoverRatio } from "@/lib/dashboard/calculations";

type Props = { supabase: SupabaseClient; tenantId: string };

function firstOf<T>(v: T | T[] | null | undefined): T | undefined {
  return Array.isArray(v) ? v[0] : v ?? undefined;
}

export async function InventoryTurnover({ supabase, tenantId }: Props) {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: snapshots }, { data: balances }] = await Promise.all([
    supabase
      .from("job_cost_snapshot")
      .select("material_cost,created_at")
      .eq("tenant_id", tenantId)
      .gte("created_at", ninetyDaysAgo),
    supabase
      .from("inventory_balance")
      .select("on_hand,component:component_id(cost_per_unit)")
      .eq("tenant_id", tenantId),
  ]);

  const cogs90d = (snapshots ?? []).reduce((s, r) => s + Number(r.material_cost ?? 0), 0);

  const currentValue = (balances ?? []).reduce((s, r) => {
    const cpu = Number(firstOf(r.component)?.cost_per_unit ?? 0);
    return s + Number(r.on_hand ?? 0) * cpu;
  }, 0);

  const ratio = calcTurnoverRatio(cogs90d, currentValue, currentValue);
  const display = ratio !== null ? `${ratio}×` : "—";
  const detail = ratio !== null
    ? ratio >= 4 ? "↑ Strong inventory velocity" : ratio >= 2 ? "Moderate — industry avg ~3×" : "↓ Slow — consider reducing stock"
    : "Insufficient order data";

  const trendClass = ratio !== null
    ? ratio >= 4 ? styles.trendUp : ratio >= 2 ? styles.trendWarn : styles.trendDown
    : "";

  return (
    <div className={styles.stat}>
      <p className={styles.statLabel}>Inventory turnover</p>
      <p className={styles.statValue}>{display}</p>
      <p className={`${styles.statDetail} ${trendClass}`}>{detail}</p>
    </div>
  );
}
```

- [ ] **Step 2: Create days-inventory-remaining.tsx**

```typescript
// src/app/app/_dashboard/widgets/days-inventory-remaining.tsx
import type { SupabaseClient } from "@supabase/supabase-js";
import styles from "../widget.module.css";
import { calcDaysRemaining } from "@/lib/dashboard/calculations";

type Props = { supabase: SupabaseClient; tenantId: string };

function firstOf<T>(v: T | T[] | null | undefined): T | undefined {
  return Array.isArray(v) ? v[0] : v ?? undefined;
}

export async function DaysInventoryRemaining({ supabase, tenantId }: Props) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: components }, { data: balances }, { data: bomUsage }] = await Promise.all([
    supabase.from("component").select("id,name,reorder_point").eq("tenant_id", tenantId),
    supabase.from("inventory_balance").select("component_id,on_hand,reserved").eq("tenant_id", tenantId),
    supabase
      .from("bom_component")
      .select("component_id,quantity,product_bom:product_bom_id(variant_id)")
      .eq("tenant_id", tenantId),
  ]);

  const { data: recentOrders } = await supabase
    .from("orders")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("status", "fulfilled")
    .gte("updated_at", thirtyDaysAgo);

  const orderCount = (recentOrders ?? []).length || 1;

  const burnByComponent = new Map<string, number>();
  (bomUsage ?? []).forEach((bc) => {
    const current = burnByComponent.get(bc.component_id) ?? 0;
    burnByComponent.set(bc.component_id, current + (Number(bc.quantity ?? 0) * orderCount) / 30);
  });

  const nameMap    = new Map((components ?? []).map((c) => [c.id, c.name ?? "Unknown"]));
  const reorderMap = new Map((components ?? []).map((c) => [c.id, Number(c.reorder_point ?? 0)]));

  const rows = (balances ?? [])
    .map((b) => {
      const burn = burnByComponent.get(b.component_id) ?? 0;
      const days = calcDaysRemaining(Number(b.on_hand ?? 0), Number(b.reserved ?? 0), burn);
      return { id: b.component_id, name: nameMap.get(b.component_id) ?? "Unknown", days, reorderPoint: reorderMap.get(b.component_id) ?? 0 };
    })
    .filter((r) => r.days !== null && r.days < 30)
    .sort((a, b) => (a.days ?? 999) - (b.days ?? 999))
    .slice(0, 5) as Array<{ id: string; name: string; days: number; reorderPoint: number }>;

  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <p className={styles.eyebrow}>Stock runway</p>
          <h3 className={styles.title}>Days of inventory remaining</h3>
        </div>
      </div>
      {rows.length === 0 ? (
        <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.9rem" }}>All components have 30+ days of stock remaining.</p>
      ) : (
        <div className={styles.rowList}>
          {rows.map((r) => {
            const color = r.days <= 3 ? "#f87171" : r.days <= 10 ? "#fbbf24" : "#4ade80";
            return (
              <div key={r.id} className={styles.row}>
                <span className={styles.rowLabel}>{r.name}</span>
                <strong style={{ color, fontSize: "0.9rem", fontWeight: 700 }}>{r.days}d</strong>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/app/_dashboard/widgets/inventory-turnover.tsx src/app/app/_dashboard/widgets/days-inventory-remaining.tsx
git commit -m "feat(dashboard): inventory turnover and days-remaining widgets"
```

---

### Task 7: Finance gated widget components

**Goal:** Build the five finance widgets that require Shopify price sync, each showing a graceful "unavailable" state with a CTA to Settings.

**Files:**
- Create: `src/app/app/_dashboard/widgets/finance-gated.tsx` — shared gated state component
- (revenue-trend, gross-margin, avg-order-value, gmroi, sell-through-rate all import from finance-gated)

**Acceptance Criteria:**
- [ ] `FinanceGated` component accepts `label` and renders a dashed-border unavailable card
- [ ] Five named exports (one per finance widget) each use `FinanceGated` with their label
- [ ] Renders correctly at stat, half, and full widths (height auto)

**Verify:** After Task 8 wires up the dashboard with the Owner preset, finance widget slots show the unavailable state with "Fix in Settings →" CTA.

**Steps:**

- [ ] **Step 1: Create finance-gated.tsx**

```typescript
// src/app/app/_dashboard/widgets/finance-gated.tsx
import styles from "../widget.module.css";
import Link from "next/link";

type FinanceGatedProps = { label: string; description: string };

export function FinanceGated({ label, description }: FinanceGatedProps) {
  return (
    <div className={styles.gated}>
      <p className={styles.gatedLabel}>{label}</p>
      <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--ink-faint)" }}>{description}</p>
      <Link href="/app/settings" className={styles.gatedCta}>
        Enable Shopify price sync in Settings →
      </Link>
    </div>
  );
}

export function RevenueTrendWidget() {
  return <FinanceGated label="Revenue trend" description="Monthly revenue for last 6 months — available once Shopify sell prices are synced." />;
}

export function GrossMarginWidget() {
  return <FinanceGated label="Gross margin %" description="Sell price minus COGS across orders — requires Shopify price sync." />;
}

export function AvgOrderValueWidget() {
  return <FinanceGated label="Average order value" description="Mean sell value per order — requires Shopify price sync." />;
}

export function GmroiWidget() {
  return <FinanceGated label="GMROI" description="Gross margin return per $1 of inventory held — requires Shopify price sync." />;
}

export function SellThroughRateWidget() {
  return <FinanceGated label="Sell-through rate" description="% of received inventory sold in the period — requires Shopify price sync." />;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/app/_dashboard/widgets/finance-gated.tsx
git commit -m "feat(dashboard): finance gated widget components with unavailable state"
```

---

### Task 8: Widget router and dashboard page rewire

**Goal:** Create `render-widget.tsx` which maps a `WidgetId` to the correct component, then rewrite `page.tsx` to load config and render the widget grid.

**Files:**
- Create: `src/app/app/_dashboard/render-widget.tsx`
- Modify: `src/app/app/page.tsx`

**Acceptance Criteria:**
- [ ] `renderWidget(id, ctx)` returns a React element for every valid WidgetId
- [ ] Dashboard page loads tenant config from DB, falls back to Owner preset
- [ ] Page renders all configured widgets in the 6-column grid with correct size classes
- [ ] No data from old hardcoded sections remains in page.tsx

**Verify:** Run `npx next build` → no TypeScript errors. Visit `/app` → widgets render.

**Steps:**

- [ ] **Step 1: Create render-widget.tsx**

```typescript
// src/app/app/_dashboard/render-widget.tsx
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WidgetId } from "@/lib/dashboard/types";
import { OpenOrdersQueue }        from "./widgets/open-orders-queue";
import { OnTimeFulfillment }      from "./widgets/on-time-fulfillment";
import { ProductionThroughput }   from "./widgets/production-throughput";
import { PurchasingSignals }      from "./widgets/purchasing-signals";
import { OrderTrendChartWidget }  from "./widgets/order-trend-chart";
import { InventoryValueSnapshot } from "./widgets/inventory-value-snapshot";
import { LowStockAlerts }         from "./widgets/low-stock-alerts";
import { InventoryTurnover }      from "./widgets/inventory-turnover";
import { DaysInventoryRemaining } from "./widgets/days-inventory-remaining";
import { TopProductsDemand }      from "./widgets/top-products-demand";
import { BomHealth }              from "./widgets/bom-health";
import { QuickActions }           from "./widgets/quick-actions";
import {
  RevenueTrendWidget,
  GrossMarginWidget,
  AvgOrderValueWidget,
  GmroiWidget,
  SellThroughRateWidget,
} from "./widgets/finance-gated";

type Ctx = { supabase: SupabaseClient; tenantId: string };

export function renderWidget(id: WidgetId, ctx: Ctx): React.ReactNode {
  switch (id) {
    case "open-orders-queue":        return <OpenOrdersQueue {...ctx} />;
    case "on-time-fulfillment":      return <OnTimeFulfillment {...ctx} />;
    case "production-throughput":    return <ProductionThroughput {...ctx} />;
    case "purchasing-signals":       return <PurchasingSignals {...ctx} />;
    case "order-trend-chart":        return <OrderTrendChartWidget {...ctx} />;
    case "inventory-value-snapshot": return <InventoryValueSnapshot {...ctx} />;
    case "low-stock-alerts":         return <LowStockAlerts {...ctx} />;
    case "inventory-turnover":       return <InventoryTurnover {...ctx} />;
    case "days-inventory-remaining": return <DaysInventoryRemaining {...ctx} />;
    case "top-products-demand":      return <TopProductsDemand {...ctx} />;
    case "bom-health":               return <BomHealth {...ctx} />;
    case "quick-actions":            return <QuickActions />;
    case "revenue-trend":            return <RevenueTrendWidget />;
    case "gross-margin":             return <GrossMarginWidget />;
    case "avg-order-value":          return <AvgOrderValueWidget />;
    case "gmroi":                    return <GmroiWidget />;
    case "sell-through-rate":        return <SellThroughRateWidget />;
    default: return null;
  }
}
```

- [ ] **Step 2: Rewrite page.tsx**

Replace the entire content of `src/app/app/page.tsx` with:

```typescript
// src/app/app/page.tsx
import styles from "./dashboard.module.css";
import { getServerTenantContext } from "@/lib/tenant/context";
import { loadDashboardConfig } from "@/lib/dashboard/config";
import { WIDGET_CATALOG } from "@/lib/dashboard/types";
import { renderWidget } from "./_dashboard/render-widget";
import EmptyState from "./_ui/empty-state";

export default async function DashboardPage() {
  const context = await getServerTenantContext();

  if (!context) {
    return (
      <div className={styles.dashboard}>
        <EmptyState
          title="Workspace unavailable"
          message="Could not resolve the active tenant for this dashboard."
        />
      </div>
    );
  }

  const { supabase, tenantId } = context;
  const widgetIds = await loadDashboardConfig(supabase, tenantId);

  return (
    <div className={styles.dashboard}>
      <div className={styles.widgetGrid}>
        {widgetIds.map((id) => {
          const meta = WIDGET_CATALOG.find((w) => w.id === id);
          if (!meta) return null;
          const sizeClass = meta.size === "stat" ? styles.widgetStat
                          : meta.size === "full" ? styles.widgetFull
                          : styles.widgetHalf;
          return (
            <div key={id} className={sizeClass}>
              {renderWidget(id, { supabase, tenantId })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build check**

```bash
npx next build 2>&1 | tail -20
```

Expected: `Route (app) Size` table visible, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/app/_dashboard/render-widget.tsx src/app/app/page.tsx
git commit -m "feat(dashboard): rewire page to widget grid with config-driven rendering"
```

---

### Task 9: Settings dashboard sub-page

**Goal:** Build `/app/settings/dashboard` — preset selector + widget toggles + save action — following the existing `/app/settings/theme` sub-page pattern.

**Files:**
- Create: `src/app/app/settings/dashboard/page.tsx`
- Create: `src/app/app/settings/dashboard/actions.ts`
- Create: `src/app/app/settings/dashboard/dashboard-settings.tsx`
- Create: `src/app/app/settings/dashboard/dashboard-settings.module.css`
- Modify: `src/app/app/settings/page.tsx` — add Dashboard settings link

**Acceptance Criteria:**
- [ ] Page loads current preset and widgets from DB (or falls back to defaults)
- [ ] Admin can select a preset — widget toggle list updates to that preset's defaults
- [ ] Admin can toggle individual widgets on/off
- [ ] Save action writes to `tenant_dashboard_config`, revalidates `/app`
- [ ] Only admin/super_admin users see the save button (others see read-only view)
- [ ] Main settings page has a "Dashboard settings" link

**Verify:** Visit `/app/settings/dashboard`, toggle widgets, save — visit `/app` and confirm the change takes effect.

**Steps:**

- [ ] **Step 1: Write the server action**

```typescript
// src/app/app/settings/dashboard/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";
import { WIDGET_IDS } from "@/lib/dashboard/types";

export type DashboardConfigState = { error?: string; success?: string };

export async function saveDashboardConfig(
  _prev: DashboardConfigState,
  formData: FormData
): Promise<DashboardConfigState> {
  const context = await getServerTenantContext();
  if (!context) return { error: "Missing tenant context." };
  const { supabase, tenantId, role } = context;

  if (role !== "admin" && role !== "super_admin") {
    return { error: "Only admins can update the dashboard configuration." };
  }

  const preset = formData.get("preset")?.toString() ?? "owner";
  const rawWidgets = formData.getAll("widgets").map(String);
  const widgets = rawWidgets.filter((id) =>
    (WIDGET_IDS as readonly string[]).includes(id)
  );

  const { error } = await supabase
    .from("tenant_dashboard_config")
    .upsert({ tenant_id: tenantId, preset, widgets, updated_at: new Date().toISOString() });

  if (error) return { error: error.message };

  revalidatePath("/app");
  revalidatePath("/app/settings/dashboard");
  return { success: "Dashboard configuration saved." };
}
```

- [ ] **Step 2: Write the client component**

```typescript
// src/app/app/settings/dashboard/dashboard-settings.tsx
"use client";

import { useActionState, useState } from "react";
import styles from "./dashboard-settings.module.css";
import { saveDashboardConfig, type DashboardConfigState } from "./actions";
import { WIDGET_CATALOG, PRESET_WIDGETS, type WidgetId } from "@/lib/dashboard/types";

type Props = {
  initialPreset: "owner" | "ops" | "custom";
  initialWidgets: WidgetId[];
  isAdmin: boolean;
};

const CATEGORY_ORDER = ["operations", "inventory", "finance", "planning"] as const;

export default function DashboardSettings({ initialPreset, initialWidgets, isAdmin }: Props) {
  const [preset, setPreset] = useState<"owner" | "ops" | "custom">(initialPreset);
  const [activeWidgets, setActiveWidgets] = useState<Set<WidgetId>>(new Set(initialWidgets));
  const [state, action, pending] = useActionState<DashboardConfigState, FormData>(saveDashboardConfig, {});

  function selectPreset(p: "owner" | "ops" | "custom") {
    setPreset(p);
    if (p !== "custom") {
      setActiveWidgets(new Set(PRESET_WIDGETS[p]));
    }
  }

  function toggleWidget(id: WidgetId) {
    setActiveWidgets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="preset" value={preset} />
      {Array.from(activeWidgets).map((id) => (
        <input key={id} type="hidden" name="widgets" value={id} />
      ))}

      <section className={styles.section}>
        <p className={styles.sectionLabel}>Starting preset</p>
        <div className={styles.presetRow}>
          {(["owner", "ops", "custom"] as const).map((p) => (
            <button
              key={p}
              type="button"
              className={`${styles.presetBtn} ${preset === p ? styles.presetSelected : ""}`}
              onClick={() => selectPreset(p)}
              disabled={!isAdmin}
            >
              <strong>{p === "owner" ? "Owner" : p === "ops" ? "Operations" : "Custom"}</strong>
              <span>
                {p === "owner" ? "Revenue, margin, inventory health" :
                 p === "ops"   ? "Orders, stock risk, purchasing signals" :
                 "Build from scratch"}
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <p className={styles.sectionLabel}>Active widgets</p>
        {CATEGORY_ORDER.map((cat) => {
          const widgets = WIDGET_CATALOG.filter((w) => w.category === cat);
          return (
            <div key={cat} className={styles.categoryGroup}>
              <p className={styles.categoryLabel}>{cat}</p>
              {widgets.map((w) => (
                <label key={w.id} className={`${styles.widgetRow} ${w.gated ? styles.gatedRow : ""}`}>
                  <div className={styles.widgetInfo}>
                    <span className={styles.widgetName}>{w.label}</span>
                    <span className={styles.widgetDesc}>{w.description}</span>
                  </div>
                  <div className={styles.widgetActions}>
                    {w.gated && <span className={styles.gatedTag}>Needs price sync</span>}
                    <input
                      type="checkbox"
                      className={styles.toggle}
                      checked={activeWidgets.has(w.id)}
                      onChange={() => toggleWidget(w.id)}
                      disabled={!isAdmin || w.gated}
                    />
                  </div>
                </label>
              ))}
            </div>
          );
        })}
      </section>

      {state.error   && <p className={styles.error}>{state.error}</p>}
      {state.success && <p className={styles.success}>{state.success}</p>}

      {isAdmin && (
        <div className={styles.saveBar}>
          <p className={styles.saveNote}>Applies to all users in this workspace immediately</p>
          <button type="submit" className={styles.saveBtn} disabled={pending}>
            {pending ? "Saving…" : "Save dashboard"}
          </button>
        </div>
      )}
    </form>
  );
}
```

- [ ] **Step 3: Write the CSS**

```css
/* src/app/app/settings/dashboard/dashboard-settings.module.css */
.form { display: flex; flex-direction: column; gap: 28px; }

.section { display: flex; flex-direction: column; gap: 12px; }

.sectionLabel {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--ink-faint);
}

.presetRow { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }

.presetBtn {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
  border: 2px solid color-mix(in srgb, var(--stroke-card) 100%, transparent);
  border-radius: 14px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s;
}

.presetBtn strong { font-size: 0.94rem; color: var(--ink-strong); }
.presetBtn span   { font-size: 0.82rem; color: var(--ink-muted); }
.presetBtn:hover  { border-color: color-mix(in srgb, var(--ink-strong) 20%, var(--stroke-card)); }

.presetSelected { border-color: var(--brand-1); background: color-mix(in srgb, var(--brand-1) 8%, transparent); }

.categoryGroup { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }

.categoryLabel {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--ink-faint);
  margin: 0 0 4px;
}

.widgetRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--stroke-card) 100%, transparent);
  background: color-mix(in srgb, var(--surface-1) 60%, transparent);
  cursor: pointer;
}

.gatedRow { opacity: 0.5; cursor: default; }

.widgetInfo { display: flex; flex-direction: column; gap: 2px; }
.widgetName { font-size: 0.9rem; font-weight: 600; color: var(--ink-strong); }
.widgetDesc { font-size: 0.8rem; color: var(--ink-muted); }

.widgetActions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

.gatedTag {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 2px 7px;
  border-radius: 4px;
  background: rgba(248, 113, 113, 0.12);
  color: #f87171;
}

.toggle { width: 18px; height: 18px; accent-color: var(--brand-1); cursor: pointer; }

.saveBar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-radius: 14px;
  background: color-mix(in srgb, var(--brand-1) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--brand-1) 25%, transparent);
}

.saveNote { margin: 0; font-size: 0.84rem; color: var(--ink-muted); }

.saveBtn {
  padding: 9px 20px;
  border-radius: 8px;
  border: none;
  background: var(--brand-1);
  color: #fff;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
}

.saveBtn:disabled { opacity: 0.6; cursor: default; }

.error   { margin: 0; font-size: 0.88rem; color: #f87171; }
.success { margin: 0; font-size: 0.88rem; color: #4ade80; }

@media (max-width: 820px) { .presetRow { grid-template-columns: 1fr; } }
```

- [ ] **Step 4: Write the settings sub-page**

```typescript
// src/app/app/settings/dashboard/page.tsx
import { getServerTenantContext } from "@/lib/tenant/context";
import { loadDashboardConfig } from "@/lib/dashboard/config";
import PageHeader from "../../_ui/page-header";
import DashboardSettings from "./dashboard-settings";
import type { WidgetId } from "@/lib/dashboard/types";
import EmptyState from "../../_ui/empty-state";

export default async function DashboardSettingsPage() {
  const context = await getServerTenantContext();
  if (!context) return <EmptyState title="Workspace unavailable" message="Could not resolve tenant." />;

  const { supabase, tenantId, role } = context;

  const { data: config } = await supabase
    .from("tenant_dashboard_config")
    .select("preset,widgets")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const activeWidgets = await loadDashboardConfig(supabase, tenantId);
  const preset = (config?.preset ?? "owner") as "owner" | "ops" | "custom";
  const isAdmin = role === "admin" || role === "super_admin";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <PageHeader
        eyebrow="Settings"
        title="Dashboard configuration"
        description="Choose a preset and toggle widgets to customise what your workspace sees on the main dashboard."
      />
      <DashboardSettings
        initialPreset={preset}
        initialWidgets={activeWidgets as WidgetId[]}
        isAdmin={isAdmin}
      />
    </div>
  );
}
```

- [ ] **Step 5: Add Dashboard settings link to main settings page**

In `src/app/app/settings/page.tsx`, find the `themeCard` section and add a Dashboard settings card after it:

```tsx
<section className={styles.themeCard}>
  <p className={styles.eyebrow}>Dashboard</p>
  <h2>Dashboard configuration</h2>
  <p className={styles.panelBody}>
    Choose which widgets appear on the main dashboard for your workspace.
  </p>
  <Link href="/app/settings/dashboard" className={styles.themeLinkSecondary}>
    Configure dashboard
  </Link>
</section>
```

- [ ] **Step 6: Build and smoke test**

```bash
npx next build 2>&1 | tail -20
```

Expected: Build completes with no TypeScript errors.

Manually visit:
1. `/app` → widgets from Owner preset render (finance widgets show gated state)
2. `/app/settings/dashboard` → preset selector and widget toggles render
3. Switch to Operations preset, save → `/app` now shows Operations preset widgets

- [ ] **Step 7: Commit**

```bash
git add src/app/app/settings/dashboard/ src/app/app/settings/page.tsx
git commit -m "feat(dashboard): Settings → Dashboard sub-page with preset selector and widget toggles"
```

---

## Self-Review

**Spec coverage check:**

| Spec section | Covered by |
|---|---|
| 17 widget catalog | Tasks 1, 4, 5, 6, 7 |
| Owner preset (8 widgets) | Task 1 — PRESET_WIDGETS.owner |
| Operations preset (8 widgets) | Task 1 — PRESET_WIDGETS.ops |
| Custom preset (blank) | Task 9 — dashboard-settings.tsx selectPreset |
| 6-column grid, stat/half/full sizes | Task 3, Task 8 |
| Full-width: revenue-trend, order-trend-chart | Task 1 WIDGET_CATALOG size:"full" |
| Finance gated state with Settings CTA | Task 7 |
| tenant_dashboard_config table + RLS | Task 0 |
| Settings → Dashboard sub-page | Task 9 |
| Admin-only save | Task 9 actions.ts role check |
| Fallback to Owner preset for unconfigured tenants | Task 1 config.ts |
| New widgets: production throughput, purchasing signals | Task 5 |
| New widgets: inventory turnover, days remaining | Task 6 |
| Days-remaining uses burn-rate calculation | Task 2, Task 6 |
| Purchasing signals = active POs + low-stock components | Task 5 |

**Placeholder scan:** No TBDs, TODOs, or vague steps. All code steps include full implementations.

**Type consistency:** `WidgetId`, `WidgetMeta`, `WidgetSize`, `WidgetCategory` defined in Task 1 and used consistently in Tasks 8 and 9. `renderWidget` switch covers all 17 widget IDs matching `WIDGET_IDS` tuple. `calcDaysRemaining` / `calcTurnoverRatio` signatures in Task 2 match usage in Tasks 6.
