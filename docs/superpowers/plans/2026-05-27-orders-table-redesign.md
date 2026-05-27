# Orders Table Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the orders list and detail UI with a Katana-style pipeline view (Components / Production / Delivery pills) and add per-source delivery targets so overdue orders are visible at a glance.

**Architecture:** Inline server-side aggregator. A `getOrdersPipelineRollup` helper composes three sibling derivations (components, production, delivery) plus a target-ship-date computation. All derivations are pure TypeScript with unit tests; only the composer hits Supabase. UI is server components consuming the rollup shape.

**Tech Stack:** Next.js 15 App Router · Supabase (Postgres + RLS) · TypeScript · CSS Modules · Vitest. Design tokens from `C:\dev\manuva-tokens\Manuva Design System\colors_and_type.css`.

**Spec:** `docs/superpowers/specs/2026-05-27-orders-table-redesign-design.md` (commit `16513eb0`)

---

## Conventions used in this plan

- All file paths are relative to repo root `C:\dev\assemblio`.
- All Supabase calls use `SupabaseClient` from `@supabase/supabase-js`.
- Server data fetching uses the project pattern: page-level helpers like `getOrderLineStatus`. No SWR / TanStack Query on the server.
- CSS Modules. Each `.tsx` either imports its sibling `.module.css` or reuses `orders.module.css`.
- Pills/badges use the existing `StatusBadge` component at `src/app/app/_ui/status-badge.tsx` (variants: `default | success | warning | danger | info`).
- Test runner: `npx vitest run <path>` (one-off) or `npx vitest <path>` (watch).
- Type checking: `npx tsc --noEmit`.
- Tenant context on server pages: `await getServerTenantContext()` from `@/lib/tenant/context`.
- Existing PO status values in use: `open`, `draft`, `received`, `cancelled`. "In-flight POs" = `status not in ('received','cancelled')`.

---

## Phase 1 — Schema migrations

Migrations are individual `.sql` files in `supabase/patches/`. They are applied by the user via Supabase MCP `apply_migration` or by piping into `psql`. Do NOT auto-apply; surface the SQL for the user to apply.

### Task 1: Add `orders.source` column

**Files:**
- Create: `supabase/patches/2026-05-27-orders-source.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/patches/2026-05-27-orders-source.sql
alter table public.orders
  add column if not exists source text not null default 'shopify'
  check (source in ('shopify', 'manual'));

-- Backfill: orders without a shopify_order_id are manual
update public.orders
  set source = 'manual'
  where shopify_order_id is null
    and source = 'shopify';
```

- [ ] **Step 2: Surface for application**

Print the file path and tell the user: "Apply this patch via Supabase MCP `apply_migration` (name: `orders_source_column`) or `psql -f` it. Do not advance until applied."

- [ ] **Step 3: Verify (after user confirms applied)**

Use Supabase MCP `list_tables` or `execute_sql`:

```sql
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'orders' and column_name = 'source';
```

Expected: one row with `data_type = text`, `column_default = 'shopify'::text`.

- [ ] **Step 4: Commit**

```bash
git add supabase/patches/2026-05-27-orders-source.sql
git commit -m "feat(orders): add source column"
```

---

### Task 2: Add `orders.target_ship_date` column

**Files:**
- Create: `supabase/patches/2026-05-27-orders-target-ship-date.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/patches/2026-05-27-orders-target-ship-date.sql
alter table public.orders
  add column if not exists target_ship_date timestamptz;
```

(Backfill happens in Task 4 after `order_source_sla` exists.)

- [ ] **Step 2: Surface for application + verify**

Apply via MCP `apply_migration` (name: `orders_target_ship_date_column`). Verify:

```sql
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'orders' and column_name = 'target_ship_date';
```

Expected: one row.

- [ ] **Step 3: Commit**

```bash
git add supabase/patches/2026-05-27-orders-target-ship-date.sql
git commit -m "feat(orders): add target_ship_date column"
```

---

### Task 3: Create `order_source_sla` table

**Files:**
- Create: `supabase/patches/2026-05-27-order-source-sla.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/patches/2026-05-27-order-source-sla.sql
create table if not exists public.order_source_sla (
  tenant_id uuid not null references public.tenant(id) on delete cascade,
  source text not null check (source in ('shopify', 'manual')),
  lead_time_days integer not null default 7 check (lead_time_days >= 0),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, source)
);

alter table public.order_source_sla enable row level security;

create policy "tenant_isolation_select" on public.order_source_sla
  for select using ((tenant_id = public.current_tenant_id()) or public.is_super_admin());
create policy "tenant_isolation_insert" on public.order_source_sla
  for insert with check ((tenant_id = public.current_tenant_id()) or public.is_super_admin());
create policy "tenant_isolation_update" on public.order_source_sla
  for update using ((tenant_id = public.current_tenant_id()) or public.is_super_admin())
  with check ((tenant_id = public.current_tenant_id()) or public.is_super_admin());
create policy "tenant_isolation_delete" on public.order_source_sla
  for delete using ((tenant_id = public.current_tenant_id()) or public.is_super_admin());

-- Seed defaults for every existing tenant
insert into public.order_source_sla (tenant_id, source, lead_time_days)
  select id, 'shopify', 7 from public.tenant
  on conflict (tenant_id, source) do nothing;
insert into public.order_source_sla (tenant_id, source, lead_time_days)
  select id, 'manual', 10 from public.tenant
  on conflict (tenant_id, source) do nothing;
```

- [ ] **Step 2: Surface for application + verify**

Apply via MCP `apply_migration` (name: `order_source_sla_table`). Verify:

```sql
select tenant_id, source, lead_time_days from public.order_source_sla limit 10;
```

Expected: at least 2 rows per tenant (`shopify` and `manual`).

- [ ] **Step 3: Commit**

```bash
git add supabase/patches/2026-05-27-order-source-sla.sql
git commit -m "feat(orders): add order_source_sla config table"
```

---

### Task 4: Backfill `target_ship_date` for existing orders

**Files:**
- Create: `supabase/patches/2026-05-27-orders-target-ship-date-backfill.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/patches/2026-05-27-orders-target-ship-date-backfill.sql
update public.orders o
  set target_ship_date = o.created_at + (sla.lead_time_days || ' days')::interval
  from public.order_source_sla sla
  where sla.tenant_id = o.tenant_id
    and sla.source = o.source
    and o.target_ship_date is null;
```

- [ ] **Step 2: Surface for application + verify**

Apply via MCP. Verify:

```sql
select count(*) from public.orders where target_ship_date is null;
```

Expected: 0 (assuming every tenant has both SLA rows seeded by Task 3).

- [ ] **Step 3: Commit**

```bash
git add supabase/patches/2026-05-27-orders-target-ship-date-backfill.sql
git commit -m "feat(orders): backfill target_ship_date from source SLA"
```

---

### Task 5: Add `order_line.shipped_at` + indexes

**Files:**
- Create: `supabase/patches/2026-05-27-order-line-shipped-at-and-indexes.sql`

- [ ] **Step 1: Write the migration**

```sql
-- supabase/patches/2026-05-27-order-line-shipped-at-and-indexes.sql
alter table public.order_line
  add column if not exists shipped_at timestamptz;

create index if not exists orders_tenant_target_ship_idx
  on public.orders (tenant_id, target_ship_date);
create index if not exists orders_tenant_source_idx
  on public.orders (tenant_id, source);
create index if not exists order_line_order_id_shipped_at_idx
  on public.order_line (order_id, shipped_at);
```

- [ ] **Step 2: Surface for application + verify**

Apply via MCP. Verify:

```sql
select indexname from pg_indexes
where schemaname = 'public'
  and tablename in ('orders', 'order_line')
  and indexname in ('orders_tenant_target_ship_idx', 'orders_tenant_source_idx', 'order_line_order_id_shipped_at_idx');
```

Expected: 3 rows.

- [ ] **Step 3: Commit**

```bash
git add supabase/patches/2026-05-27-order-line-shipped-at-and-indexes.sql
git commit -m "feat(orders): add order_line.shipped_at + pipeline indexes"
```

---

## Phase 2 — Pure derivation helpers (TDD)

Each helper is pure TypeScript that takes plain data and returns a derived state. No Supabase access. Tests come first.

### Task 6: `target-ship.ts` — compute target ship date

**Files:**
- Create: `src/lib/orders/target-ship.ts`
- Create: `src/lib/orders/target-ship.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/orders/target-ship.test.ts
import { describe, expect, it } from "vitest";
import { computeTargetShipDate, isOverdue } from "./target-ship";

describe("computeTargetShipDate", () => {
  it("adds lead-time days to created_at", () => {
    const createdAt = new Date("2026-05-27T10:00:00Z");
    expect(computeTargetShipDate(createdAt, 7)?.toISOString()).toBe(
      "2026-06-03T10:00:00.000Z"
    );
  });

  it("returns null when leadTimeDays is null", () => {
    expect(computeTargetShipDate(new Date("2026-05-27T10:00:00Z"), null)).toBeNull();
  });

  it("returns null when createdAt is null", () => {
    expect(computeTargetShipDate(null, 7)).toBeNull();
  });
});

describe("isOverdue", () => {
  const now = new Date("2026-05-27T10:00:00Z");

  it("returns false when target is null", () => {
    expect(isOverdue(null, "not-shipped", now)).toBe(false);
  });

  it("returns false when target is in the future", () => {
    expect(isOverdue(new Date("2026-06-03T10:00:00Z"), "not-shipped", now)).toBe(false);
  });

  it("returns true when target is past and not shipped", () => {
    expect(isOverdue(new Date("2026-05-20T10:00:00Z"), "not-shipped", now)).toBe(true);
  });

  it("returns false when target is past but already shipped", () => {
    expect(isOverdue(new Date("2026-05-20T10:00:00Z"), "shipped", now)).toBe(false);
  });

  it("returns true when partially shipped and past target", () => {
    expect(isOverdue(new Date("2026-05-20T10:00:00Z"), "partially-shipped", now)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/orders/target-ship.test.ts`
Expected: FAIL with module-not-found / cannot resolve `./target-ship`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/orders/target-ship.ts
export type DeliveryState =
  | "not-shipped"
  | "partially-shipped"
  | "shipped"
  | "n-a";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function computeTargetShipDate(
  createdAt: Date | null,
  leadTimeDays: number | null
): Date | null {
  if (!createdAt || leadTimeDays === null) return null;
  return new Date(createdAt.getTime() + leadTimeDays * MS_PER_DAY);
}

export function isOverdue(
  targetShipDate: Date | null,
  deliveryState: DeliveryState,
  now: Date = new Date()
): boolean {
  if (!targetShipDate) return false;
  if (deliveryState === "shipped") return false;
  return targetShipDate.getTime() < now.getTime();
}

export function daysLate(targetShipDate: Date, now: Date = new Date()): number {
  const diffMs = now.getTime() - targetShipDate.getTime();
  return Math.max(0, Math.floor(diffMs / MS_PER_DAY));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/orders/target-ship.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/orders/target-ship.ts src/lib/orders/target-ship.test.ts
git commit -m "feat(orders): target ship date helpers"
```

---

### Task 7: `production-state.ts` — derive ProductionState

**Files:**
- Create: `src/lib/orders/production-state.ts`
- Create: `src/lib/orders/production-state.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/orders/production-state.test.ts
import { describe, expect, it } from "vitest";
import { deriveProductionState } from "./production-state";

describe("deriveProductionState", () => {
  it("returns 'cancelled' when order status is cancelled (supersedes)", () => {
    expect(
      deriveProductionState({
        orderStatus: "cancelled",
        snapshots: [{ status: "completed" }],
        hasAnyActualTime: true,
      })
    ).toBe("cancelled");
  });

  it("returns 'not-started' when no snapshots exist", () => {
    expect(
      deriveProductionState({
        orderStatus: "open",
        snapshots: [],
        hasAnyActualTime: false,
      })
    ).toBe("not-started");
  });

  it("returns 'not-started' when snapshots exist but zero actual time", () => {
    expect(
      deriveProductionState({
        orderStatus: "open",
        snapshots: [{ status: "planned" }, { status: "planned" }],
        hasAnyActualTime: false,
      })
    ).toBe("not-started");
  });

  it("returns 'in-progress' when actual time exists but not all completed", () => {
    expect(
      deriveProductionState({
        orderStatus: "open",
        snapshots: [{ status: "completed" }, { status: "planned" }],
        hasAnyActualTime: true,
      })
    ).toBe("in-progress");
  });

  it("returns 'done' when all snapshots are completed", () => {
    expect(
      deriveProductionState({
        orderStatus: "open",
        snapshots: [{ status: "completed" }, { status: "completed" }],
        hasAnyActualTime: true,
      })
    ).toBe("done");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/orders/production-state.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/orders/production-state.ts
export type ProductionState = "not-started" | "in-progress" | "done" | "cancelled";

export type ProductionInput = {
  orderStatus: string;
  snapshots: Array<{ status: string }>;
  hasAnyActualTime: boolean;
};

export function deriveProductionState(input: ProductionInput): ProductionState {
  if (input.orderStatus === "cancelled") return "cancelled";
  if (input.snapshots.length === 0) return "not-started";
  if (!input.hasAnyActualTime) return "not-started";
  const allCompleted = input.snapshots.every((s) => s.status === "completed");
  return allCompleted ? "done" : "in-progress";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/orders/production-state.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/orders/production-state.ts src/lib/orders/production-state.test.ts
git commit -m "feat(orders): derive production state from snapshots + actuals"
```

---

### Task 8: `delivery-state.ts` — derive DeliveryState

**Files:**
- Create: `src/lib/orders/delivery-state.ts`
- Create: `src/lib/orders/delivery-state.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/orders/delivery-state.test.ts
import { describe, expect, it } from "vitest";
import { deriveDeliveryState } from "./delivery-state";

describe("deriveDeliveryState", () => {
  it("returns 'n-a' when there are no lines", () => {
    expect(deriveDeliveryState([])).toBe("n-a");
  });

  it("returns 'not-shipped' when no line has shipped_at", () => {
    expect(
      deriveDeliveryState([{ shippedAt: null }, { shippedAt: null }])
    ).toBe("not-shipped");
  });

  it("returns 'partially-shipped' when some lines have shipped_at", () => {
    expect(
      deriveDeliveryState([
        { shippedAt: new Date("2026-05-26") },
        { shippedAt: null },
      ])
    ).toBe("partially-shipped");
  });

  it("returns 'shipped' when every line has shipped_at", () => {
    expect(
      deriveDeliveryState([
        { shippedAt: new Date("2026-05-26") },
        { shippedAt: new Date("2026-05-27") },
      ])
    ).toBe("shipped");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/orders/delivery-state.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/orders/delivery-state.ts
import type { DeliveryState } from "./target-ship";
export type { DeliveryState } from "./target-ship";

export type DeliveryLineInput = {
  shippedAt: Date | null;
};

export function deriveDeliveryState(lines: DeliveryLineInput[]): DeliveryState {
  if (lines.length === 0) return "n-a";
  const shippedCount = lines.filter((l) => l.shippedAt !== null).length;
  if (shippedCount === 0) return "not-shipped";
  if (shippedCount === lines.length) return "shipped";
  return "partially-shipped";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/orders/delivery-state.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/orders/delivery-state.ts src/lib/orders/delivery-state.test.ts
git commit -m "feat(orders): derive delivery state from shipped_at"
```

---

### Task 9: `components-state.ts` — aggregate ComponentsState from line statuses

**Files:**
- Create: `src/lib/orders/components-state.ts`
- Create: `src/lib/orders/components-state.test.ts`

This is the most rule-heavy derivation. Cover every case from spec §5.1.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/orders/components-state.test.ts
import { describe, expect, it } from "vitest";
import { deriveComponentsState } from "./components-state";

type Line = {
  bom: { id: string } | null;
  componentCount: number;
  shortComponents: Array<{ componentId: string; earliestEta: Date | null }>;
};

describe("deriveComponentsState", () => {
  it("returns { kind: 'empty' } for zero lines", () => {
    expect(deriveComponentsState([])).toEqual({ kind: "empty" });
  });

  it("returns 'bom-needed' when any line has no BOM", () => {
    const lines: Line[] = [
      { bom: { id: "b1" }, componentCount: 3, shortComponents: [] },
      { bom: null, componentCount: 0, shortComponents: [] },
    ];
    expect(deriveComponentsState(lines)).toEqual({ kind: "bom-needed" });
  });

  it("returns 'bom-needed' when any line has BOM with zero components", () => {
    const lines: Line[] = [
      { bom: { id: "b1" }, componentCount: 0, shortComponents: [] },
    ];
    expect(deriveComponentsState(lines)).toEqual({ kind: "bom-needed" });
  });

  it("returns 'in-stock' when every line is covered (no short components)", () => {
    const lines: Line[] = [
      { bom: { id: "b1" }, componentCount: 5, shortComponents: [] },
      { bom: { id: "b2" }, componentCount: 3, shortComponents: [] },
    ];
    expect(deriveComponentsState(lines)).toEqual({ kind: "in-stock" });
  });

  it("returns 'partial' when some lines ready and others short, with earliest ETA", () => {
    const lines: Line[] = [
      { bom: { id: "b1" }, componentCount: 5, shortComponents: [] },
      {
        bom: { id: "b2" },
        componentCount: 3,
        shortComponents: [
          { componentId: "c1", earliestEta: new Date("2026-06-10") },
          { componentId: "c2", earliestEta: new Date("2026-06-02") },
        ],
      },
    ];
    expect(deriveComponentsState(lines)).toEqual({
      kind: "partial",
      readyLines: 1,
      totalLines: 2,
      earliestEta: new Date("2026-06-02"),
    });
  });

  it("returns 'partial' with null ETA when no short component has an ETA", () => {
    const lines: Line[] = [
      { bom: { id: "b1" }, componentCount: 5, shortComponents: [] },
      {
        bom: { id: "b2" },
        componentCount: 3,
        shortComponents: [{ componentId: "c1", earliestEta: null }],
      },
    ];
    expect(deriveComponentsState(lines)).toEqual({
      kind: "partial",
      readyLines: 1,
      totalLines: 2,
      earliestEta: null,
    });
  });

  it("returns 'awaiting' when no line is fully covered and at least one ETA exists", () => {
    const lines: Line[] = [
      {
        bom: { id: "b1" },
        componentCount: 2,
        shortComponents: [
          { componentId: "c1", earliestEta: new Date("2026-06-10") },
        ],
      },
      {
        bom: { id: "b2" },
        componentCount: 1,
        shortComponents: [
          { componentId: "c2", earliestEta: new Date("2026-06-05") },
        ],
      },
    ];
    expect(deriveComponentsState(lines)).toEqual({
      kind: "awaiting",
      earliestEta: new Date("2026-06-05"),
    });
  });

  it("returns 'no-eta' when no line is fully covered and no short component has an ETA", () => {
    const lines: Line[] = [
      {
        bom: { id: "b1" },
        componentCount: 1,
        shortComponents: [{ componentId: "c1", earliestEta: null }],
      },
    ];
    expect(deriveComponentsState(lines)).toEqual({ kind: "no-eta" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/orders/components-state.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/orders/components-state.ts
export type ComponentsState =
  | { kind: "empty" }
  | { kind: "in-stock" }
  | {
      kind: "partial";
      readyLines: number;
      totalLines: number;
      earliestEta: Date | null;
    }
  | { kind: "awaiting"; earliestEta: Date }
  | { kind: "no-eta" }
  | { kind: "bom-needed" };

export type ComponentsLineInput = {
  bom: { id: string } | null;
  componentCount: number;
  shortComponents: Array<{ componentId: string; earliestEta: Date | null }>;
};

function earliest(dates: Array<Date | null>): Date | null {
  const nonNull = dates.filter((d): d is Date => d !== null);
  if (nonNull.length === 0) return null;
  return nonNull.reduce((a, b) => (a.getTime() < b.getTime() ? a : b));
}

export function deriveComponentsState(
  lines: ComponentsLineInput[]
): ComponentsState {
  if (lines.length === 0) return { kind: "empty" };

  const anyMissingBom = lines.some(
    (l) => l.bom === null || l.componentCount === 0
  );
  if (anyMissingBom) return { kind: "bom-needed" };

  const readyLines = lines.filter((l) => l.shortComponents.length === 0).length;
  const totalLines = lines.length;

  if (readyLines === totalLines) return { kind: "in-stock" };

  const shortEtas: Array<Date | null> = lines.flatMap((l) =>
    l.shortComponents.map((c) => c.earliestEta)
  );
  const earliestEta = earliest(shortEtas);

  if (readyLines > 0) {
    return { kind: "partial", readyLines, totalLines, earliestEta };
  }

  if (earliestEta) {
    return { kind: "awaiting", earliestEta };
  }
  return { kind: "no-eta" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/orders/components-state.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/orders/components-state.ts src/lib/orders/components-state.test.ts
git commit -m "feat(orders): derive components state with earliest PO ETA"
```

---

### Task 10: Extend `order-line-status.ts` with short-component PO ETA

The existing helper at `src/lib/orders/order-line-status.ts` already calculates which components are short per line. We extend it to return the earliest open-PO `expected_date` per short component so `deriveComponentsState` can roll up ETAs.

**Files:**
- Modify: `src/lib/orders/order-line-status.ts`
- Modify: `src/lib/orders/order-line-status.test.ts` (add test for the new field)

- [ ] **Step 1: Add a failing test for the new field**

Append to `src/lib/orders/order-line-status.test.ts`:

```ts
// (existing imports stay)
import { describe, expect, it } from "vitest";

// Add new describe block at the bottom:
describe("ComponentStatus shape", () => {
  it("includes earliestPoEta field on the type", () => {
    // Compile-time check: this assignment must type-check.
    // (Runtime no-op — purely guards the type contract.)
    const _check: import("./order-line-status").ComponentStatus = {
      componentId: "c1",
      name: "Bolt",
      requiredQty: 10,
      availableQty: 4,
      isShort: true,
      costPerUnit: 0.5,
      earliestPoEta: new Date("2026-06-02"),
    };
    expect(_check.earliestPoEta).toBeInstanceOf(Date);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/orders/order-line-status.test.ts`
Expected: FAIL with TypeScript error "earliestPoEta does not exist on type ComponentStatus".

- [ ] **Step 3: Modify the implementation**

In `src/lib/orders/order-line-status.ts`:

1. Add `earliestPoEta: Date | null` to the `ComponentStatus` type.
2. Add a Supabase query that fetches `earliest_eta` per short component, in the same `Promise.all` batch:

Find the existing block (around line 106):

```ts
const [{ data: componentRows }, { data: balanceRows }, { data: allocationRows }] =
  await Promise.all([
    // ... existing 3 queries
  ]);
```

Replace it with a 4-query batch that also looks up PO ETAs:

```ts
const [
  { data: componentRows },
  { data: balanceRows },
  { data: allocationRows },
  { data: poEtaRows },
] = await Promise.all([
  componentIds.length > 0
    ? supabase.from("component").select("id,name,cost_per_unit").in("id", componentIds)
    : Promise.resolve({ data: [] as Array<{ id: string; name: string; cost_per_unit: number }> }),
  componentIds.length > 0
    ? (() => {
        let q = supabase
          .from("inventory_balance")
          .select("component_id,on_hand,reserved")
          .in("component_id", componentIds);
        if (defaultLocationId) q = q.eq("location_id", defaultLocationId);
        return q;
      })()
    : Promise.resolve({
        data: [] as Array<{ component_id: string; on_hand: number; reserved: number }>,
      }),
  supabase
    .from("order_component_allocation")
    .select("order_line_id,quantity")
    .in(
      "order_line_id",
      lines.map((l) => l.id)
    ),
  componentIds.length > 0
    ? supabase
        .from("purchase_order_line")
        .select(
          "component_id, purchase_order:purchase_order_id(status, expected_date)"
        )
        .eq("tenant_id", tenantId)
        .in("component_id", componentIds)
    : Promise.resolve({
        data: [] as Array<{
          component_id: string;
          purchase_order: { status: string; expected_date: string | null } | null;
        }>,
      }),
]);
```

After the existing `balanceByComponent` Map, add:

```ts
const earliestEtaByComponent = new Map<string, Date>();
for (const row of poEtaRows ?? []) {
  const r = row as {
    component_id: string;
    purchase_order:
      | { status: string; expected_date: string | null }
      | Array<{ status: string; expected_date: string | null }>
      | null;
  };
  const po = Array.isArray(r.purchase_order) ? r.purchase_order[0] : r.purchase_order;
  if (!po) continue;
  if (po.status === "received" || po.status === "cancelled") continue;
  if (!po.expected_date) continue;
  const eta = new Date(po.expected_date);
  const existing = earliestEtaByComponent.get(r.component_id);
  if (!existing || eta.getTime() < existing.getTime()) {
    earliestEtaByComponent.set(r.component_id, eta);
  }
}
```

In the `components` mapping (around line 176), populate the new field:

```ts
const components: ComponentStatus[] = bomComponents.map((bc) => {
  const requiredQty = Number(bc.quantity) * Number(line.quantity);
  const bal = balanceByComponent.get(bc.component_id);
  const availableQty = (bal?.onHand ?? 0) - (bal?.reserved ?? 0);
  const comp = nameById.get(bc.component_id);
  const isShort = availableQty < requiredQty;
  return {
    componentId: bc.component_id,
    name: comp?.name ?? bc.component_id,
    requiredQty,
    availableQty,
    isShort,
    costPerUnit: comp?.costPerUnit ?? 0,
    earliestPoEta: isShort ? (earliestEtaByComponent.get(bc.component_id) ?? null) : null,
  };
});
```

- [ ] **Step 4: Run test + typecheck to verify it passes**

Run: `npx vitest run src/lib/orders/order-line-status.test.ts`
Expected: PASS (5 tests including the new one).
Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/orders/order-line-status.ts src/lib/orders/order-line-status.test.ts
git commit -m "feat(orders): include earliest open-PO ETA on ComponentStatus"
```

---

## Phase 3 — Pipeline rollup composer

### Task 11: `pipeline-rollup.ts` — the composer

**Files:**
- Create: `src/lib/orders/pipeline-rollup.ts`
- Create: `src/lib/orders/pipeline-rollup.test.ts`

This is the one helper that hits Supabase. It composes all the pure derivations from Phase 2.

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/orders/pipeline-rollup.test.ts
import { describe, expect, it, vi } from "vitest";
import { rollupOrderPipeline } from "./pipeline-rollup";

describe("rollupOrderPipeline (pure composition)", () => {
  it("composes in-stock components + not-started production + not-shipped delivery", () => {
    const rollup = rollupOrderPipeline({
      orderId: "o1",
      orderStatus: "open",
      targetShipDate: new Date("2026-06-03"),
      lines: [
        {
          bom: { id: "b1" },
          componentCount: 3,
          shortComponents: [],
          shippedAt: null,
        },
      ],
      snapshots: [],
      hasAnyActualTime: false,
      now: new Date("2026-05-27"),
    });

    expect(rollup.components).toEqual({ kind: "in-stock" });
    expect(rollup.production).toBe("not-started");
    expect(rollup.delivery).toBe("not-shipped");
    expect(rollup.isOverdue).toBe(false);
  });

  it("flags overdue when target is past and not shipped", () => {
    const rollup = rollupOrderPipeline({
      orderId: "o2",
      orderStatus: "open",
      targetShipDate: new Date("2026-05-20"),
      lines: [
        { bom: { id: "b1" }, componentCount: 2, shortComponents: [], shippedAt: null },
      ],
      snapshots: [],
      hasAnyActualTime: false,
      now: new Date("2026-05-27"),
    });

    expect(rollup.isOverdue).toBe(true);
  });

  it("marks cancelled production when order is cancelled", () => {
    const rollup = rollupOrderPipeline({
      orderId: "o3",
      orderStatus: "cancelled",
      targetShipDate: null,
      lines: [
        { bom: { id: "b1" }, componentCount: 2, shortComponents: [], shippedAt: null },
      ],
      snapshots: [{ status: "completed" }],
      hasAnyActualTime: true,
      now: new Date("2026-05-27"),
    });

    expect(rollup.production).toBe("cancelled");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/orders/pipeline-rollup.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/orders/pipeline-rollup.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deriveComponentsState,
  type ComponentsState,
  type ComponentsLineInput,
} from "./components-state";
import {
  deriveProductionState,
  type ProductionState,
} from "./production-state";
import {
  deriveDeliveryState,
  type DeliveryState,
  type DeliveryLineInput,
} from "./delivery-state";
import { isOverdue } from "./target-ship";
import { getOrderLineStatus } from "./order-line-status";

export type OrderPipelineRollup = {
  orderId: string;
  components: ComponentsState;
  production: ProductionState;
  delivery: DeliveryState;
  targetShipDate: Date | null;
  isOverdue: boolean;
};

// Pure composer — used directly by tests with synthetic data.
export function rollupOrderPipeline(input: {
  orderId: string;
  orderStatus: string;
  targetShipDate: Date | null;
  lines: Array<ComponentsLineInput & DeliveryLineInput>;
  snapshots: Array<{ status: string }>;
  hasAnyActualTime: boolean;
  now?: Date;
}): OrderPipelineRollup {
  const components = deriveComponentsState(
    input.lines.map((l) => ({
      bom: l.bom,
      componentCount: l.componentCount,
      shortComponents: l.shortComponents,
    }))
  );
  const production = deriveProductionState({
    orderStatus: input.orderStatus,
    snapshots: input.snapshots,
    hasAnyActualTime: input.hasAnyActualTime,
  });
  const delivery = deriveDeliveryState(
    input.lines.map((l) => ({ shippedAt: l.shippedAt }))
  );
  const overdue = isOverdue(input.targetShipDate, delivery, input.now);

  return {
    orderId: input.orderId,
    components,
    production,
    delivery,
    targetShipDate: input.targetShipDate,
    isOverdue: overdue,
  };
}

type OrderRow = {
  id: string;
  status: string;
  target_ship_date: string | null;
};

type OrderLineRow = {
  id: string;
  order_id: string;
  variant_id: string;
  quantity: number;
  shipped_at: string | null;
};

export async function getOrdersPipelineRollup(
  supabase: SupabaseClient,
  tenantId: string,
  orders: OrderRow[]
): Promise<Map<string, OrderPipelineRollup>> {
  const result = new Map<string, OrderPipelineRollup>();
  if (orders.length === 0) return result;
  const orderIds = orders.map((o) => o.id);

  const [{ data: lineRows }, { data: snapshotRows }, { data: actualRows }] =
    await Promise.all([
      supabase
        .from("order_line")
        .select("id, order_id, variant_id, quantity, shipped_at")
        .in("order_id", orderIds),
      supabase
        .from("job_cost_snapshot")
        .select("order_id, snapshot_status")
        .eq("tenant_id", tenantId)
        .in("order_id", orderIds),
      supabase
        .from("job_actual_time_entry")
        .select("order_id")
        .eq("tenant_id", tenantId)
        .in("order_id", orderIds)
        .limit(1000),
    ]);

  const lines = (lineRows ?? []) as OrderLineRow[];
  const linesByOrder = new Map<string, OrderLineRow[]>();
  for (const row of lines) {
    const bucket = linesByOrder.get(row.order_id) ?? [];
    bucket.push(row);
    linesByOrder.set(row.order_id, bucket);
  }

  const snapshotsByOrder = new Map<string, Array<{ status: string }>>();
  for (const row of (snapshotRows ?? []) as Array<{
    order_id: string;
    snapshot_status: string;
  }>) {
    const bucket = snapshotsByOrder.get(row.order_id) ?? [];
    bucket.push({ status: row.snapshot_status });
    snapshotsByOrder.set(row.order_id, bucket);
  }

  const ordersWithActuals = new Set(
    ((actualRows ?? []) as Array<{ order_id: string }>).map((r) => r.order_id)
  );

  const allLineStatuses = await getOrderLineStatus(
    supabase,
    tenantId,
    lines.map((l) => ({ id: l.id, variant_id: l.variant_id, quantity: l.quantity }))
  );

  const now = new Date();

  for (const order of orders) {
    const orderLines = linesByOrder.get(order.id) ?? [];
    const composedLines = orderLines.map((line) => {
      const status = allLineStatuses.get(line.id);
      const shortComponents =
        status?.components
          .filter((c) => c.isShort)
          .map((c) => ({
            componentId: c.componentId,
            earliestEta: c.earliestPoEta,
          })) ?? [];
      return {
        bom: status?.bom ? { id: status.bom.id } : null,
        componentCount: status?.components.length ?? 0,
        shortComponents,
        shippedAt: line.shipped_at ? new Date(line.shipped_at) : null,
      };
    });

    const rollup = rollupOrderPipeline({
      orderId: order.id,
      orderStatus: order.status,
      targetShipDate: order.target_ship_date
        ? new Date(order.target_ship_date)
        : null,
      lines: composedLines,
      snapshots: snapshotsByOrder.get(order.id) ?? [],
      hasAnyActualTime: ordersWithActuals.has(order.id),
      now,
    });

    result.set(order.id, rollup);
  }

  return result;
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `npx vitest run src/lib/orders/pipeline-rollup.test.ts`
Expected: PASS (3 tests).
Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/orders/pipeline-rollup.ts src/lib/orders/pipeline-rollup.test.ts
git commit -m "feat(orders): pipeline rollup composer (components + production + delivery)"
```

---

## Phase 4 — Pipeline pill UI component

### Task 12: `pipeline-pills.tsx` — render the three pills

**Files:**
- Create: `src/app/app/orders/_components/pipeline-pills.tsx`
- Create: `src/app/app/orders/_components/pipeline-pills.module.css`

- [ ] **Step 1: Write the component**

```tsx
// src/app/app/orders/_components/pipeline-pills.tsx
import StatusBadge from "../../_ui/status-badge";
import type {
  ComponentsState,
} from "@/lib/orders/components-state";
import type { ProductionState } from "@/lib/orders/production-state";
import type { DeliveryState } from "@/lib/orders/delivery-state";
import styles from "./pipeline-pills.module.css";

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export function ComponentsPill({ state }: { state: ComponentsState }) {
  switch (state.kind) {
    case "empty":
      return <span className={styles.dash}>—</span>;
    case "in-stock":
      return <StatusBadge variant="success">In stock</StatusBadge>;
    case "partial": {
      const label = state.earliestEta
        ? `${state.readyLines} of ${state.totalLines} ready · ${formatDate(state.earliestEta)}`
        : `${state.readyLines} of ${state.totalLines} ready`;
      return <StatusBadge variant="warning">{label}</StatusBadge>;
    }
    case "awaiting":
      return (
        <StatusBadge variant="danger">
          Expected {formatDate(state.earliestEta)}
        </StatusBadge>
      );
    case "no-eta":
      return <StatusBadge variant="danger">No ETA</StatusBadge>;
    case "bom-needed":
      return <StatusBadge variant="danger">BOM needed</StatusBadge>;
  }
}

export function ProductionPill({ state }: { state: ProductionState }) {
  switch (state) {
    case "not-started":
      return <StatusBadge>Not started</StatusBadge>;
    case "in-progress":
      return <StatusBadge variant="info">In progress</StatusBadge>;
    case "done":
      return <StatusBadge variant="success">Done</StatusBadge>;
    case "cancelled":
      return <StatusBadge>Cancelled</StatusBadge>;
  }
}

export function DeliveryPill({ state }: { state: DeliveryState }) {
  switch (state) {
    case "n-a":
      return <span className={styles.dash}>—</span>;
    case "not-shipped":
      return <StatusBadge>Not shipped</StatusBadge>;
    case "partially-shipped":
      return <StatusBadge variant="warning">Partially shipped</StatusBadge>;
    case "shipped":
      return <StatusBadge variant="success">Shipped</StatusBadge>;
  }
}
```

```css
/* src/app/app/orders/_components/pipeline-pills.module.css */
.dash {
  color: var(--ink-muted);
  font-size: 13px;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/app/orders/_components/
git commit -m "feat(orders): pipeline pill components"
```

---

## Phase 5 — List page rewrite

### Task 13: List page columns + tabs

**Files:**
- Modify: `src/app/app/orders/page.tsx` (full rewrite)
- Modify: `src/app/app/orders/orders.module.css` (add overdue/source-chip styles)

Tab state is driven by `?tab=` URL search param. Default tab: `open`.

- [ ] **Step 1: Rewrite `page.tsx`**

Replace the file content with:

```tsx
// src/app/app/orders/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import styles from "./orders.module.css";
import { getServerTenantContext } from "@/lib/tenant/context";
import PageHeader from "../_ui/page-header";
import EmptyState from "../_ui/empty-state";
import ListPanel, { ListRow } from "../_ui/list-panel";
import { getOrdersPipelineRollup } from "@/lib/orders/pipeline-rollup";
import { daysLate } from "@/lib/orders/target-ship";
import {
  ComponentsPill,
  ProductionPill,
  DeliveryPill,
} from "./_components/pipeline-pills";

type TabKey = "open" | "in-production" | "ready-to-ship" | "done" | "all";

const TAB_LABELS: Record<TabKey, string> = {
  open: "Open",
  "in-production": "In production",
  "ready-to-ship": "Ready to ship",
  done: "Done",
  all: "All",
};

function parseTab(value: string | undefined): TabKey {
  if (
    value === "open" ||
    value === "in-production" ||
    value === "ready-to-ship" ||
    value === "done" ||
    value === "all"
  ) {
    return value;
  }
  return "open";
}

type OrderRow = {
  id: string;
  order_number: string | null;
  customer_email: string | null;
  status: string;
  source: string;
  target_ship_date: string | null;
  created_at: string;
};

type OrderLineRef = { order_id: string; line_sell_price: number };

type Props = {
  searchParams?: Promise<{
    tab?: string;
    shopify?: string;
    orders?: string;
    sync_error?: string;
  }>;
};

function formatDate(d: Date): string {
  const now = new Date();
  const opts: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  };
  return d.toLocaleDateString("en-AU", opts);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(value);
}

function customerLabel(email: string | null): string {
  if (!email) return "—";
  const at = email.indexOf("@");
  return at > 0 ? email.slice(0, at) : email;
}

function sourceChipText(source: string): string {
  return source === "shopify" ? "Shopify" : "B2B";
}

export default async function OrdersPage({ searchParams }: Props) {
  const context = await getServerTenantContext();
  if (!context) redirect("/auth/login");
  const { supabase, tenantId } = context;
  const params = (await searchParams) ?? {};
  const activeTab = parseTab(params.tab);

  const { data: orderData, error } = await supabase
    .from("orders")
    .select(
      "id, order_number, customer_email, status, source, target_ship_date, created_at"
    )
    .eq("tenant_id", tenantId)
    .order("target_ship_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(200);

  const allOrders = ((orderData ?? []) as OrderRow[]).filter(
    (o) => o.status !== "cancelled"
  );

  const { data: orderLineData } = await (allOrders.length > 0
    ? supabase
        .from("order_line")
        .select("order_id, line_sell_price")
        .in(
          "order_id",
          allOrders.map((o) => o.id)
        )
    : Promise.resolve({ data: [] as OrderLineRef[] }));

  const totalByOrder = ((orderLineData ?? []) as OrderLineRef[]).reduce<
    Record<string, number>
  >((acc, line) => {
    acc[line.order_id] = (acc[line.order_id] ?? 0) + Number(line.line_sell_price ?? 0);
    return acc;
  }, {});

  const rollups = await getOrdersPipelineRollup(supabase, tenantId, allOrders);

  function matchesTab(orderId: string, tab: TabKey): boolean {
    const r = rollups.get(orderId);
    if (!r) return false;
    if (tab === "all") return true;
    if (tab === "done") return r.delivery === "shipped";
    if (tab === "in-production") return r.production === "in-progress";
    if (tab === "ready-to-ship")
      return r.production === "done" && r.delivery !== "shipped";
    // open
    return r.production !== "done" || r.delivery !== "shipped";
  }

  const counts: Record<TabKey, number> = {
    open: 0,
    "in-production": 0,
    "ready-to-ship": 0,
    done: 0,
    all: allOrders.length,
  };
  for (const o of allOrders) {
    if (matchesTab(o.id, "open")) counts.open++;
    if (matchesTab(o.id, "in-production")) counts["in-production"]++;
    if (matchesTab(o.id, "ready-to-ship")) counts["ready-to-ship"]++;
    if (matchesTab(o.id, "done")) counts.done++;
  }

  const visibleOrders = allOrders.filter((o) => matchesTab(o.id, activeTab));
  const now = new Date();
  const columnsTemplate =
    "1.1fr 0.9fr 0.9fr 0.6fr 0.9fr 0.8fr 0.8fr 0.4fr";

  return (
    <div className={styles.page}>
      <PageHeader
        description="Pipeline view: component readiness, production state, and delivery state per order."
        actions={
          <form method="post" action="/api/shopify/sync?return_to=/app/orders">
            <button className={styles.primary} type="submit">
              Sync orders
            </button>
          </form>
        }
      />

      {params.shopify === "sync-ok" ? (
        <p className={styles.syncMeta}>
          Sync complete — {params.orders ?? "0"} orders imported.
        </p>
      ) : params.shopify === "sync-failed" ? (
        <p className={styles.syncError}>{params.sync_error ?? "Sync failed."}</p>
      ) : null}

      <nav className={styles.tabBar} aria-label="Orders filter">
        {(Object.keys(TAB_LABELS) as TabKey[]).map((tab) => (
          <Link
            key={tab}
            href={`/app/orders?tab=${tab}`}
            className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ""}`}
          >
            {TAB_LABELS[tab]}{" "}
            <span className={styles.tabCount}>{counts[tab]}</span>
          </Link>
        ))}
      </nav>

      <ListPanel
        eyebrow="Pipeline"
        title={TAB_LABELS[activeTab]}
        columns={[
          "Order",
          "Customer",
          "Target ship",
          "Total",
          "Components",
          "Production",
          "Delivery",
          "",
        ]}
        columnsTemplate={columnsTemplate}
      >
        {error ? (
          <EmptyState
            title="Failed to load orders"
            message={`Supabase: ${error.message}.`}
          />
        ) : visibleOrders.length === 0 ? (
          <EmptyState
            title="No orders in this view"
            message="Try a different tab or sync orders to populate the queue."
          />
        ) : (
          visibleOrders.map((row) => {
            const rollup = rollups.get(row.id);
            const orderTotal = totalByOrder[row.id] ?? 0;
            const target = rollup?.targetShipDate ?? null;
            const overdue = rollup?.isOverdue ?? false;
            const lateDays = overdue && target ? daysLate(target, now) : 0;

            return (
              <ListRow
                key={row.id}
                columnsTemplate={columnsTemplate}
                className={styles.orderRow}
              >
                <Link href={`/app/orders/${row.id}`} className={styles.orderLink}>
                  {row.order_number ?? row.id.slice(0, 8)}
                </Link>
                <span className={styles.meta}>
                  {customerLabel(row.customer_email)}{" "}
                  <span className={styles.sourceChip}>
                    ({sourceChipText(row.source)})
                  </span>
                </span>
                <span
                  className={overdue ? styles.overdue : styles.meta}
                >
                  {target ? formatDate(target) : "—"}
                  {overdue ? ` · ${lateDays}d late` : ""}
                </span>
                <span className={styles.meta}>
                  {orderTotal > 0 ? formatCurrency(orderTotal) : "—"}
                </span>
                {rollup ? (
                  <ComponentsPill state={rollup.components} />
                ) : (
                  <span className={styles.meta}>—</span>
                )}
                {rollup ? (
                  <ProductionPill state={rollup.production} />
                ) : (
                  <span className={styles.meta}>—</span>
                )}
                {rollup ? (
                  <DeliveryPill state={rollup.delivery} />
                ) : (
                  <span className={styles.meta}>—</span>
                )}
                <Link
                  href={`/app/orders/${row.id}`}
                  className={styles.viewLink}
                >
                  View →
                </Link>
              </ListRow>
            );
          })
        )}
      </ListPanel>
    </div>
  );
}
```

- [ ] **Step 2: Add CSS for the new bits**

Append to `src/app/app/orders/orders.module.css`:

```css
.tabBar {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--border-subtle);
  margin: 16px 0 12px;
}
.tab {
  padding: 10px 16px;
  color: var(--ink-muted);
  font-size: 13px;
  font-weight: 500;
  border-bottom: 2px solid transparent;
  text-decoration: none;
}
.tab:hover { color: var(--ink-strong); }
.tabActive {
  color: var(--ink-strong);
  border-bottom-color: var(--brand-1);
}
.tabCount {
  display: inline-block;
  background: var(--bg-muted);
  color: var(--ink-muted);
  padding: 1px 7px;
  border-radius: 10px;
  font-size: 11px;
  margin-left: 4px;
}
.sourceChip {
  color: var(--ink-muted);
  font-size: 11px;
}
.overdue {
  color: var(--state-danger);
  font-weight: 600;
  font-size: 13px;
}
```

(If any of these CSS custom properties don't exist in `colors_and_type.css`, substitute the closest existing token — e.g., `--state-danger` ↔ `--danger` ↔ `--brand-danger`. Verify against the design system file referenced in `CLAUDE.md` before applying.)

- [ ] **Step 3: Verify locally**

Start dev server: `npm run dev` (or whichever script the project uses — check `package.json` scripts). Open `http://localhost:3000/app/orders`. Log in. Confirm:
- Tabs render with counts.
- Each row shows the 3 pills with correct colors.
- An overdue order shows red target-ship text with "Nd late".
- Empty tabs show the empty state.

- [ ] **Step 4: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/app/app/orders/page.tsx src/app/app/orders/orders.module.css
git commit -m "feat(orders): redesigned list with pipeline pills and tabs"
```

---

## Phase 6 — SLA settings page

### Task 14: SLA settings form

**Files:**
- Create: `src/app/app/settings/orders/page.tsx`
- Create: `src/app/app/settings/orders/sla-form.tsx`
- Create: `src/app/app/settings/orders/actions.ts`
- Create: `src/app/app/settings/orders/sla-form.module.css`

- [ ] **Step 1: Write the server action**

```ts
// src/app/app/settings/orders/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";

export async function updateOrderSourceSla(formData: FormData) {
  const shopify = Number(formData.get("shopify_days") ?? 7);
  const manual = Number(formData.get("manual_days") ?? 10);
  if (!Number.isFinite(shopify) || shopify < 0) return;
  if (!Number.isFinite(manual) || manual < 0) return;

  const context = await getServerTenantContext();
  if (!context) return;
  const { supabase, tenantId } = context;

  await supabase
    .from("order_source_sla")
    .upsert(
      [
        { tenant_id: tenantId, source: "shopify", lead_time_days: shopify },
        { tenant_id: tenantId, source: "manual", lead_time_days: manual },
      ],
      { onConflict: "tenant_id,source" }
    );

  revalidatePath("/app/settings/orders");
}
```

- [ ] **Step 2: Write the form (client component)**

```tsx
// src/app/app/settings/orders/sla-form.tsx
"use client";

import styles from "./sla-form.module.css";
import { updateOrderSourceSla } from "./actions";

type Props = {
  shopifyDays: number;
  manualDays: number;
};

export default function SlaForm({ shopifyDays, manualDays }: Props) {
  return (
    <form action={updateOrderSourceSla} className={styles.form}>
      <div className={styles.row}>
        <label htmlFor="shopify_days">Shopify orders lead time (days)</label>
        <input
          id="shopify_days"
          name="shopify_days"
          type="number"
          min={0}
          defaultValue={shopifyDays}
          className={styles.input}
        />
      </div>
      <div className={styles.row}>
        <label htmlFor="manual_days">Manual orders lead time (days)</label>
        <input
          id="manual_days"
          name="manual_days"
          type="number"
          min={0}
          defaultValue={manualDays}
          className={styles.input}
        />
      </div>
      <button type="submit" className={styles.submit}>
        Save
      </button>
      <p className={styles.meta}>
        Changes apply to <strong>new</strong> orders. Existing orders keep their
        target ship date.
      </p>
    </form>
  );
}
```

- [ ] **Step 3: Write the server page**

```tsx
// src/app/app/settings/orders/page.tsx
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import PageHeader from "../../_ui/page-header";
import SlaForm from "./sla-form";

type SlaRow = { source: string; lead_time_days: number };

export default async function OrdersSettingsPage() {
  const context = await getServerTenantContext();
  if (!context) redirect("/auth/login");
  const { supabase, tenantId } = context;

  const { data } = await supabase
    .from("order_source_sla")
    .select("source, lead_time_days")
    .eq("tenant_id", tenantId);

  const rows = (data ?? []) as SlaRow[];
  const shopifyDays =
    rows.find((r) => r.source === "shopify")?.lead_time_days ?? 7;
  const manualDays =
    rows.find((r) => r.source === "manual")?.lead_time_days ?? 10;

  return (
    <div>
      <PageHeader description="Configure default delivery targets per order source." />
      <SlaForm shopifyDays={shopifyDays} manualDays={manualDays} />
    </div>
  );
}
```

- [ ] **Step 4: Write the CSS**

```css
/* src/app/app/settings/orders/sla-form.module.css */
.form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 480px;
  margin-top: 16px;
}
.row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.row label {
  font-size: 12px;
  color: var(--ink-muted);
}
.input {
  padding: 8px 10px;
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  color: var(--ink-strong);
  font-size: 14px;
  width: 120px;
}
.submit {
  align-self: flex-start;
  background: var(--brand-1);
  color: var(--ink-on-brand);
  border: none;
  padding: 8px 18px;
  border-radius: 6px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 4px;
}
.meta {
  color: var(--ink-muted);
  font-size: 12px;
  margin-top: 4px;
}
```

(Same caveat about token names — substitute closest if any of these don't exist.)

- [ ] **Step 5: Verify locally + commit**

Open `http://localhost:3000/app/settings/orders`. Confirm form loads with the seeded defaults (7 / 10). Change a value, save, reload — values persist.

Run: `npx tsc --noEmit`

```bash
git add src/app/app/settings/orders/
git commit -m "feat(orders): SLA settings page for delivery targets"
```

---

## Phase 7 — Detail page redesign

### Task 15: Detail page — persistent header with pills

**Files:**
- Modify: `src/app/app/orders/[orderId]/page.tsx` (replace existing header section)
- Modify: `src/app/app/orders/[orderId]/page.module.css` (add header styles)

The existing detail page has a lot of code — the goal in this task is to:

1. Compute the same rollup as the list page (one order).
2. Replace the existing header block with the new header containing the 3 pills.
3. Keep the existing per-line table for now (it will be replaced by the Sales Items tab in Task 16).

- [ ] **Step 1: Add data fetching for the rollup**

Near the top of the page component (after the existing order fetch), add:

```tsx
import { getOrdersPipelineRollup } from "@/lib/orders/pipeline-rollup";
import {
  ComponentsPill,
  ProductionPill,
  DeliveryPill,
} from "../_components/pipeline-pills";
import { daysLate } from "@/lib/orders/target-ship";

// inside the component, after the order is loaded:
const rollupMap = await getOrdersPipelineRollup(supabase, tenantId, [
  {
    id: order.id,
    status: order.status,
    target_ship_date: (order as { target_ship_date?: string | null }).target_ship_date ?? null,
  },
]);
const rollup = rollupMap.get(order.id);
```

(Also update the `OrderRecord` type to include `target_ship_date: string | null` and `source: string`. Add those to the `.select(...)` for the order fetch.)

- [ ] **Step 2: Replace the header block**

Find the existing `<PageHeader ... />` usage and the bits that show order number, date, and status. Replace with:

```tsx
<div className={styles.detailHeader}>
  <div className={styles.headRow}>
    <div className={styles.headCell}>
      <div className={styles.headLabel}>Order</div>
      <h1 className={styles.headTitle}>
        {order.order_number ?? order.id.slice(0, 8)}
      </h1>
      <div className={styles.headSub}>
        Created {new Date(order.created_at).toLocaleDateString("en-AU")} ·{" "}
        {order.customer_email ?? "—"} ·{" "}
        {order.source === "shopify" ? "Shopify" : "B2B"}
      </div>
    </div>
    <div className={styles.headCell}>
      <div className={styles.headLabel}>Target ship</div>
      <div
        className={
          rollup?.isOverdue ? styles.headValueOverdue : styles.headValue
        }
      >
        {rollup?.targetShipDate
          ? rollup.targetShipDate.toLocaleDateString("en-AU", {
              day: "numeric",
              month: "short",
            })
          : "—"}
        {rollup?.isOverdue && rollup.targetShipDate
          ? ` · ${daysLate(rollup.targetShipDate)}d late`
          : ""}
      </div>
    </div>
    <div className={styles.headCell}>
      <div className={styles.headLabel}>Total</div>
      <div className={styles.headValue}>
        {/* keep existing total computation */}
      </div>
    </div>
    <div className={styles.headCell}>
      <div className={styles.headLabel}>Lines</div>
      <div className={styles.headValue}>{lines.length}</div>
    </div>
  </div>
  <div className={styles.pillsRow}>
    <div className={styles.pillStage}>
      <div className={styles.stageLabel}>Components</div>
      {rollup ? <ComponentsPill state={rollup.components} /> : "—"}
    </div>
    <div className={styles.pillStage}>
      <div className={styles.stageLabel}>Production</div>
      {rollup ? <ProductionPill state={rollup.production} /> : "—"}
    </div>
    <div className={styles.pillStage}>
      <div className={styles.stageLabel}>Delivery</div>
      {rollup ? <DeliveryPill state={rollup.delivery} /> : "—"}
    </div>
  </div>
</div>
```

- [ ] **Step 3: Add CSS**

Append to `src/app/app/orders/[orderId]/page.module.css`:

```css
.detailHeader {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  padding: 16px 20px;
  margin-bottom: 14px;
}
.headRow {
  display: grid;
  grid-template-columns: 1.5fr 1fr 1fr 1fr;
  gap: 24px;
  align-items: start;
}
.headCell { }
.headLabel {
  color: var(--ink-muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 4px;
}
.headTitle {
  margin: 0;
  font-size: 22px;
  color: var(--ink-strong);
}
.headSub {
  color: var(--ink-muted);
  font-size: 13px;
  margin-top: 4px;
}
.headValue {
  color: var(--ink-strong);
  font-size: 14px;
  font-weight: 500;
}
.headValueOverdue {
  color: var(--state-danger);
  font-size: 14px;
  font-weight: 600;
}
.pillsRow {
  display: flex;
  gap: 24px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
}
.pillStage { flex: 1; }
.stageLabel {
  color: var(--ink-muted);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 6px;
}
```

- [ ] **Step 4: Verify locally + commit**

Open any order detail page. Confirm header shows the new layout with all three pills. Existing lines table remains below (unchanged in this task).

```bash
git add src/app/app/orders/[orderId]/page.tsx src/app/app/orders/[orderId]/page.module.css
git commit -m "feat(orders): detail page header with pipeline pills"
```

---

### Task 16: Detail page — tabs scaffolding + Sales Items tab

**Files:**
- Modify: `src/app/app/orders/[orderId]/page.tsx` (add tabs nav + sales-items panel)
- Create: `src/app/app/orders/[orderId]/_tabs/sales-items-tab.tsx`
- Create: `src/app/app/orders/[orderId]/_tabs/tabs.module.css`

Tabs use `?tab=` URL state, like the list page.

- [ ] **Step 1: Add tab parsing helper**

In `[orderId]/page.tsx`, add near the top:

```ts
type DetailTab = "sales-items" | "production" | "delivery";

function parseDetailTab(value: string | undefined): DetailTab {
  if (value === "production" || value === "delivery") return value;
  return "sales-items";
}
```

Update `Props` and the `searchParams` await to read `tab`:

```ts
type Props = {
  params: Promise<{ orderId: string }>;
  searchParams?: Promise<{
    tab?: string;
    allocated?: string;
    planError?: string;
  }>;
};

// inside the component:
const sp = (await searchParams) ?? {};
const activeTab = parseDetailTab(sp.tab);
```

- [ ] **Step 2: Create the Sales Items tab component**

```tsx
// src/app/app/orders/[orderId]/_tabs/sales-items-tab.tsx
import type { OrderLineStatus } from "@/lib/orders/order-line-status";
import StatusBadge from "../../../_ui/status-badge";
import styles from "./tabs.module.css";

type LineRow = {
  id: string;
  quantity: number;
  unit_sell_price: number;
  line_sell_price: number;
  variant_title: string | null;
  variant_sku: string | null;
};

type Props = {
  lines: LineRow[];
  statuses: Map<string, OrderLineStatus>;
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function lineComponentsPill(status: OrderLineStatus | undefined) {
  if (!status) return <span className={styles.dash}>—</span>;
  if (status.allocationState === "no-bom") {
    return <StatusBadge variant="danger">BOM needed</StatusBadge>;
  }
  if (status.allocationState === "empty-bom") {
    return <StatusBadge variant="danger">Empty BOM</StatusBadge>;
  }
  const shorts = status.components.filter((c) => c.isShort);
  if (shorts.length === 0) {
    return <StatusBadge variant="success">In stock</StatusBadge>;
  }
  const earliest = shorts
    .map((c) => c.earliestPoEta)
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  return (
    <StatusBadge variant="warning">
      Short{earliest ? ` · expected ${formatDate(earliest)}` : ""}
    </StatusBadge>
  );
}

export default function SalesItemsTab({ lines, statuses }: Props) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Item</th>
          <th>Qty</th>
          <th>Unit price</th>
          <th>Total</th>
          <th>Components</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((line) => {
          const status = statuses.get(line.id);
          const shorts = status?.components.filter((c) => c.isShort) ?? [];
          return (
            <tr key={line.id}>
              <td>
                <div className={styles.itemName}>
                  {line.variant_title ?? "—"}
                </div>
                <div className={styles.itemMeta}>
                  {line.variant_sku ? `SKU ${line.variant_sku}` : ""}
                  {status?.bom ? ` · BOM v${status.bom.version}` : ""}
                </div>
              </td>
              <td>{line.quantity}</td>
              <td>{formatCurrency(Number(line.unit_sell_price))}</td>
              <td>{formatCurrency(Number(line.line_sell_price))}</td>
              <td>
                {lineComponentsPill(status)}
                {shorts.length > 0 ? (
                  <ul className={styles.shortList}>
                    {shorts.map((c) => (
                      <li key={c.componentId}>
                        {c.name}: need {c.requiredQty}, have {c.availableQty}
                        {c.earliestPoEta
                          ? ` · PO due ${formatDate(c.earliestPoEta)}`
                          : " · no PO"}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 3: Tabs CSS**

```css
/* src/app/app/orders/[orderId]/_tabs/tabs.module.css */
.tabBar {
  display: flex;
  border-bottom: 1px solid var(--border-subtle);
  margin-bottom: 0;
  background: var(--bg-card);
  padding: 0 16px;
  border: 1px solid var(--border-subtle);
  border-bottom: none;
  border-top-left-radius: 10px;
  border-top-right-radius: 10px;
}
.tab {
  padding: 12px 18px;
  color: var(--ink-muted);
  font-size: 13px;
  font-weight: 500;
  border-bottom: 2px solid transparent;
  text-decoration: none;
}
.tab:hover { color: var(--ink-strong); }
.tabActive {
  color: var(--ink-strong);
  border-bottom-color: var(--brand-1);
}
.panel {
  background: var(--bg-card);
  border: 1px solid var(--border-subtle);
  border-top: none;
  padding: 16px;
  border-bottom-left-radius: 10px;
  border-bottom-right-radius: 10px;
}
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}
.table th {
  text-align: left;
  padding: 8px;
  color: var(--ink-muted);
  font-weight: 500;
  border-bottom: 1px solid var(--border-subtle);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.table td {
  padding: 12px 8px;
  border-bottom: 1px solid var(--border-subtle);
  vertical-align: top;
}
.itemName {
  color: var(--ink-strong);
  font-weight: 500;
}
.itemMeta {
  color: var(--ink-muted);
  font-size: 11px;
  margin-top: 2px;
}
.shortList {
  margin: 6px 0 0;
  padding-left: 18px;
  color: var(--ink-muted);
  font-size: 11px;
}
.dash { color: var(--ink-muted); }
```

- [ ] **Step 4: Wire tabs into the page**

Below the detail header in `page.tsx`, add:

```tsx
<nav className={tabStyles.tabBar} aria-label="Order detail tabs">
  <Link
    href={`?tab=sales-items`}
    className={`${tabStyles.tab} ${activeTab === "sales-items" ? tabStyles.tabActive : ""}`}
  >
    Sales items
  </Link>
  <Link
    href={`?tab=production`}
    className={`${tabStyles.tab} ${activeTab === "production" ? tabStyles.tabActive : ""}`}
  >
    Production
  </Link>
  <Link
    href={`?tab=delivery`}
    className={`${tabStyles.tab} ${activeTab === "delivery" ? tabStyles.tabActive : ""}`}
  >
    Delivery
  </Link>
</nav>

<div className={tabStyles.panel}>
  {activeTab === "sales-items" ? (
    <SalesItemsTab lines={lineRows} statuses={lineStatuses} />
  ) : activeTab === "production" ? (
    <ProductionTab /* props in Task 17 */ />
  ) : (
    <DeliveryTab /* props in Task 18 */ />
  )}
</div>
```

Add the import: `import tabStyles from "./_tabs/tabs.module.css";`
For this task, stub the Production and Delivery tabs with placeholder `<p>Coming next task</p>` components, OR conditionally render only the sales-items panel and show "Coming soon" for the other two. Implement the stubs in this task; replace in Tasks 17 and 18.

Build `lineRows` from the existing variant-relation data:

```ts
const lineRows: LineRow[] = lines.map((line) => {
  const variant = firstRelation(line.variant);
  return {
    id: line.id,
    quantity: Number(line.quantity),
    unit_sell_price: Number(line.unit_sell_price),
    line_sell_price: Number(line.line_sell_price),
    variant_title: variant?.title ?? null,
    variant_sku: variant?.sku ?? null,
  };
});
```

Remove the OLD per-line table that lived in the previous detail page (now replaced by the Sales Items tab).

- [ ] **Step 5: Verify + commit**

Open any order. Click tabs. Sales items tab shows the per-line table with the new pill + short-component breakdown. Production and Delivery tabs show stub content.

```bash
git add src/app/app/orders/[orderId]/
git commit -m "feat(orders): detail page tabs + sales items tab"
```

---

### Task 17: Detail page — Production tab

**Files:**
- Create: `src/app/app/orders/[orderId]/_tabs/production-tab.tsx`
- Modify: `src/app/app/orders/[orderId]/page.tsx` (replace stub)

The existing detail page already loads `job_labor_plan` rows. We render them grouped by line.

- [ ] **Step 1: Write the tab component**

```tsx
// src/app/app/orders/[orderId]/_tabs/production-tab.tsx
import StatusBadge from "../../../_ui/status-badge";
import styles from "./tabs.module.css";

type LaborRow = {
  id: string;
  line_label: string;
  department_name: string;
  operation_name: string;
  planned_hours: number;
  actual_hours: number;
  status: string;
};

type Props = {
  rows: LaborRow[];
};

function statusBadge(status: string) {
  if (status === "completed") return <StatusBadge variant="success">Completed</StatusBadge>;
  if (status === "in_progress") return <StatusBadge variant="info">In progress</StatusBadge>;
  return <StatusBadge>Planned</StatusBadge>;
}

export default function ProductionTab({ rows }: Props) {
  if (rows.length === 0) {
    return <p className={styles.dash}>No production plan yet for this order.</p>;
  }
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Line</th>
          <th>Department</th>
          <th>Operation</th>
          <th>Planned hrs</th>
          <th>Actual hrs</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.id}>
            <td>{row.line_label}</td>
            <td>{row.department_name}</td>
            <td>{row.operation_name}</td>
            <td>{row.planned_hours.toFixed(1)}</td>
            <td>{row.actual_hours.toFixed(1)}</td>
            <td>{statusBadge(row.status)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 2: Build the rows in `page.tsx`**

The existing page already fetches `job_labor_plan` data (`LaborPlanRow[]`). Add a fetch for actual time per labor plan id:

```ts
const { data: actualTimeRows } = await supabase
  .from("job_actual_time_entry")
  .select("job_labor_plan_id, hours")
  .eq("tenant_id", tenantId)
  .eq("order_id", order.id);

const actualHoursByPlan = new Map<string, number>();
for (const r of (actualTimeRows ?? []) as Array<{
  job_labor_plan_id: string | null;
  hours: number;
}>) {
  if (!r.job_labor_plan_id) continue;
  actualHoursByPlan.set(
    r.job_labor_plan_id,
    (actualHoursByPlan.get(r.job_labor_plan_id) ?? 0) + Number(r.hours)
  );
}

const lineLabelById = new Map(
  lineRows.map((l) => [l.id, l.variant_title ?? l.id.slice(0, 8)])
);

const productionRows = (laborPlanRows ?? []).map((plan) => {
  const dept = firstRelation(plan.department);
  return {
    id: plan.id,
    line_label: lineLabelById.get(plan.order_line_id) ?? plan.order_line_id.slice(0, 8),
    department_name: dept?.name ?? dept?.code ?? "—",
    operation_name: plan.operation_name,
    planned_hours: Number(plan.planned_total_hours),
    actual_hours: actualHoursByPlan.get(plan.id) ?? 0,
    status: plan.status,
  };
});
```

(Where `laborPlanRows` is the existing labor-plan fetch — confirm the variable name during implementation by reading the current `page.tsx`.)

Replace the Production tab stub with:

```tsx
<ProductionTab rows={productionRows} />
```

- [ ] **Step 3: Verify + commit**

Open an order that already has labor plans. Click Production tab. Confirm rows render with department, operation, hours, status badge. Open an order without plans — confirm the "No production plan yet" message.

```bash
git add src/app/app/orders/[orderId]/
git commit -m "feat(orders): detail page production tab"
```

---

### Task 18: Detail page — Delivery tab + mark-shipped action

**Files:**
- Create: `src/app/app/orders/[orderId]/_tabs/delivery-tab.tsx`
- Create: `src/app/app/orders/[orderId]/mark-shipped-action.ts`
- Modify: `src/app/app/orders/[orderId]/page.tsx` (replace stub, fetch shipped_at)

- [ ] **Step 1: Write the server action**

```ts
// src/app/app/orders/[orderId]/mark-shipped-action.ts
"use server";

import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";

export async function markLineShipped(formData: FormData) {
  const orderLineId = formData.get("order_line_id")?.toString();
  const orderId = formData.get("order_id")?.toString();
  if (!orderLineId || !orderId) return;

  const context = await getServerTenantContext();
  if (!context) return;
  const { supabase, tenantId } = context;

  await supabase
    .from("order_line")
    .update({ shipped_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", orderLineId)
    .is("shipped_at", null);

  await supabase.from("activity_log").insert({
    tenant_id: tenantId,
    event: "order_line_marked_shipped",
    metadata: { order_id: orderId, order_line_id: orderLineId },
  });

  revalidatePath(`/app/orders/${orderId}`);
  revalidatePath("/app/orders");
}
```

- [ ] **Step 2: Write the tab component**

```tsx
// src/app/app/orders/[orderId]/_tabs/delivery-tab.tsx
import StatusBadge from "../../../_ui/status-badge";
import styles from "./tabs.module.css";
import { markLineShipped } from "../mark-shipped-action";

type LineDelivery = {
  id: string;
  label: string;
  quantity: number;
  shippedAt: Date | null;
};

type Props = {
  orderId: string;
  orderSource: string;
  lines: LineDelivery[];
};

function formatDateTime(d: Date): string {
  return d.toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function DeliveryTab({ orderId, orderSource, lines }: Props) {
  return (
    <>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Line</th>
            <th>Qty</th>
            <th>Status</th>
            <th>Shipped at</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => (
            <tr key={line.id}>
              <td>{line.label}</td>
              <td>{line.quantity}</td>
              <td>
                {line.shippedAt ? (
                  <StatusBadge variant="success">Shipped</StatusBadge>
                ) : (
                  <StatusBadge>Not shipped</StatusBadge>
                )}
              </td>
              <td>{line.shippedAt ? formatDateTime(line.shippedAt) : "—"}</td>
              <td>
                {!line.shippedAt ? (
                  <form action={markLineShipped}>
                    <input type="hidden" name="order_id" value={orderId} />
                    <input
                      type="hidden"
                      name="order_line_id"
                      value={line.id}
                    />
                    <button type="submit" className={styles.markBtn}>
                      Mark shipped
                    </button>
                  </form>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {orderSource === "shopify" ? (
        <p className={styles.dash} style={{ marginTop: 12 }}>
          For Shopify orders, status auto-flips on next sync when fulfillment lands.
          Manual "Mark shipped" remains available as an override.
        </p>
      ) : null}
    </>
  );
}
```

Add the `.markBtn` rule to `tabs.module.css`:

```css
.markBtn {
  background: var(--brand-1);
  color: var(--ink-on-brand);
  border: none;
  padding: 4px 12px;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
```

- [ ] **Step 3: Wire into `page.tsx`**

Update the lines fetch to include `shipped_at`. Build `deliveryLines`:

```ts
// Update the order_line select to include shipped_at:
.select("id, quantity, unit_sell_price, line_sell_price, variant_id, shipped_at, variant(...)")

// Build the delivery view:
const deliveryLines = lineRows.map((l) => {
  const raw = lines.find((x) => x.id === l.id) as
    | { shipped_at?: string | null }
    | undefined;
  return {
    id: l.id,
    label: l.variant_title ?? l.id.slice(0, 8),
    quantity: l.quantity,
    shippedAt: raw?.shipped_at ? new Date(raw.shipped_at) : null,
  };
});
```

Replace the Delivery tab stub with:

```tsx
<DeliveryTab orderId={order.id} orderSource={order.source} lines={deliveryLines} />
```

- [ ] **Step 4: Verify + commit**

Open an order. Click Delivery tab. Mark a line shipped — page should reload showing "Shipped" pill and the shipped_at timestamp. Order list page should reflect "Partially shipped" or "Shipped" on the row.

```bash
git add src/app/app/orders/[orderId]/
git commit -m "feat(orders): detail page delivery tab + mark-shipped action"
```

---

## Phase 8 — Shopify sync integration

### Task 19: Set `source='shopify'` on import + flip `shipped_at` from fulfillment

**Files:**
- Modify: `src/lib/shopify/sync.ts`

The current sync builds `orderRows` with `tenant_id, shopify_order_id, order_number, status`. The schema default for `source` is `'shopify'`, so existing inserts already get the right source. We need to:

1. Add `displayFulfillmentStatus` to the order GraphQL fragment if not already there (it is — confirmed at line 28).
2. When `displayFulfillmentStatus === 'FULFILLED'`, set `shipped_at = now()` on all lines of that order (only those still null, to avoid clobbering manual overrides re-running).
3. When `displayFulfillmentStatus === 'PARTIALLY_FULFILLED'`, leave individual line handling out for v1 (the per-line Shopify fulfillment mapping requires additional GraphQL fields and is deferred). Log a warning so we know it happened.

- [ ] **Step 1: Extend the order upsert path**

After the existing `orderRows` upsert and `orderMap` fetch (around line 258 in the current file), add:

```ts
const fulfilledOrderIds: string[] = [];
const partialOrders: string[] = [];
for (const order of orders) {
  const localId = orderMap.get(order.id);
  if (!localId) continue;
  const status = (order.displayFulfillmentStatus ?? "").toUpperCase();
  if (status === "FULFILLED") fulfilledOrderIds.push(localId);
  else if (status === "PARTIALLY_FULFILLED") partialOrders.push(localId);
}

if (fulfilledOrderIds.length > 0) {
  const nowIso = new Date().toISOString();
  await admin
    .from("order_line")
    .update({ shipped_at: nowIso })
    .eq("tenant_id", tenantId)
    .in("order_id", fulfilledOrderIds)
    .is("shipped_at", null);
}

if (partialOrders.length > 0) {
  console.warn(
    "[shopify-sync] partial fulfillment encountered for orders; per-line mark-shipped deferred to v2",
    partialOrders
  );
}
```

(Place this block AFTER the `order_line` upsert at line ~292 so the lines exist before the update runs.)

- [ ] **Step 2: Verify locally**

Trigger a sync against a Shopify dev store with one fulfilled and one unfulfilled order. After sync:
- The fulfilled order's lines should have `shipped_at` set in DB.
- The orders list should show that order in the "Done" tab.
- The unfulfilled order should remain in "Open".

- [ ] **Step 3: Commit**

```bash
git add src/lib/shopify/sync.ts
git commit -m "feat(orders): set shipped_at on Shopify fulfillment sync"
```

---

## Phase 9 — Final verification + cleanup

### Task 20: Full test + typecheck + manual smoke

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: PASS. New tests (target-ship, production-state, delivery-state, components-state, pipeline-rollup, extended order-line-status) all green. Pre-existing failures in `allocation/engine.test.ts` and `inventory/invariants.test.ts` remain deferred per project memory and are NOT required to pass.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint (if configured)**

Run: `npm run lint` (skip if no lint script).
Expected: no errors.

- [ ] **Step 4: Manual smoke**

Walk through:
1. `/app/orders` — all 5 tabs render with counts. Each tab shows correct rows. Pills render. Overdue rows highlighted.
2. `/app/orders?tab=open` — click an order. Detail header shows pills. Three tabs work.
3. Sales items tab — per-line short-component breakdown renders.
4. Production tab — labor plan rows render OR empty state message.
5. Delivery tab — click "Mark shipped" → page reloads with Shipped pill + timestamp. Going back to list shows Partially shipped or Shipped.
6. `/app/settings/orders` — edit shopify lead time to 14, save, create a new manual order (or sync from Shopify), confirm new order's target_ship_date reflects the new SLA.

- [ ] **Step 5: Commit any cleanup**

If smoke-testing surfaces small fixes, commit them as a final cleanup:

```bash
git add -A
git commit -m "fix(orders): cleanup after smoke test"
```

---

## Out of scope (deferred — DO NOT add to this plan)

- Customer table + per-customer SLA.
- Drag-rank persistence (`sort_rank` column).
- Production progress percentage suffix.
- `order_line.packed_at` and Partially packed / Packed pills.
- Quotes tab.
- Per-line Shopify partial-fulfillment mapping (logged-only in v1).
- Mobile layout adjustments.
