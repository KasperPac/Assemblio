# Waiting Orders Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the floor page's flex-wrapped "Waiting orders" panel with a collapsible left rail that groups lines by order, surfaces order date and customer, supports per-line and per-order Urgent/Normal/Low priority, and carries priority forward onto the board after start.

**Architecture:** Add a `priority smallint` column on `order_line`. The floor page server component groups unstarted lines by `order_id`, sorts orders by effective priority then date, and renders a new `WaitingRail` client component made of `OrderCard` → `OrderLineRow` with shared `PriorityPill` / `PriorityFlag` primitives. Priority writes go through three server actions; when `startJob` inserts routing steps it copies the line's priority into `job_routing_step.priority` (replacing the current `sequence * 10` use of that column). The shopfloor query is updated to order by `priority desc, sequence asc` so urgent jobs surface first while sequence still breaks ties.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres + RLS), CSS Modules, TypeScript, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-13-waiting-orders-redesign.md`

---

## File Structure

**New files**

- `supabase/patches/order_line_priority.sql` — adds the column + index.
- `src/app/app/planning/(gated)/floor/waiting-rail.tsx` — collapsible shell + responsive fallback.
- `src/app/app/planning/(gated)/floor/order-card.tsx` — one card per order, owns optimistic priority state.
- `src/app/app/planning/(gated)/floor/order-line-row.tsx` — single line row with per-line flag + Start.
- `src/app/app/planning/(gated)/floor/priority-pill.tsx` — order-level pill with dropdown.
- `src/app/app/planning/(gated)/floor/priority-flag.tsx` — line-level flag toggle.
- `src/lib/planning/priority.ts` — pure helpers (label/value mapping, effective priority, sort comparator, age class).
- `src/lib/planning/priority.test.ts` — vitest unit tests for the helpers.

**Modified files**

- `supabase/schema.sql` — mirror the column + index from the patch (keep schema.sql canonical).
- `src/app/app/planning/(gated)/floor/page.tsx` — extend query, group by order, sort, pass to `WaitingRail`.
- `src/app/app/planning/(gated)/floor/actions.ts` — add `setOrderLinePriority` and `setOrderPriority`; change `startJob` to write `order_line.priority` instead of `sequence * 10`.
- `src/app/app/planning/(gated)/floor/floor.module.css` — grid layout, rail styles, age-colour rules.
- `src/app/app/planning/(gated)/floor/job-card.tsx` — small red "Urgent" ribbon when `priority >= 2`. (Type already carries `priority`? No — must add it.)
- `src/app/app/planning/(gated)/shopfloor/page.tsx` — order by `priority desc, sequence asc` (was `priority asc` only).

**Removed files**

- `src/app/app/planning/(gated)/floor/unstarted-panel.tsx` — replaced by `WaitingRail`.

---

## Task 1: DB migration — add `priority` to `order_line`

**Files:**
- Create: `supabase/patches/order_line_priority.sql`
- Modify: `supabase/schema.sql` (column + index in the `order_line` table block)

- [ ] **Step 1: Write the patch SQL**

Create `supabase/patches/order_line_priority.sql`:

```sql
-- Per-line business priority used by the floor "Waiting orders" rail and
-- copied onto job_routing_step when a job is started.
-- Convention: 2 = Urgent, 0 = Normal (default), -1 = Low.

alter table public.order_line
  add column if not exists priority smallint not null default 0;

create index if not exists idx_order_line_tenant_priority
  on public.order_line (tenant_id, priority desc, created_at);
```

- [ ] **Step 2: Apply the patch to the local Supabase**

Run (via the Supabase MCP `apply_migration` tool or `psql` against the local dev DB; do not change remote without user approval):

```
apply_migration name="order_line_priority" query=<contents of the patch>
```

Expected: success message; no errors.

- [ ] **Step 3: Mirror the change into `supabase/schema.sql`**

In `supabase/schema.sql`, locate the `create table public.order_line (...)` block (around line 297). Add `priority smallint not null default 0,` after the `line_sell_price` column, before `created_at`. Immediately after the existing `unique (tenant_id, order_id, variant_id)` line and the closing `);`, append:

```sql
create index if not exists idx_order_line_tenant_priority
  on public.order_line (tenant_id, priority desc, created_at);
```

- [ ] **Step 4: Regenerate TypeScript types**

Run via the Supabase MCP tool: `generate_typescript_types`. Update the project's generated types file with the result.

- [ ] **Step 5: Commit**

```
git add supabase/patches/order_line_priority.sql supabase/schema.sql <generated-types-file>
git commit -m "feat(planning): add order_line.priority column and index"
```

---

## Task 2: Priority helpers + tests

**Files:**
- Create: `src/lib/planning/priority.ts`
- Test: `src/lib/planning/priority.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/planning/priority.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  PRIORITY,
  PriorityValue,
  effectivePriority,
  comparePriorityThenDate,
  priorityLabel,
  ageClass,
} from "./priority";

describe("priority helpers", () => {
  it("maps numeric values to labels", () => {
    expect(priorityLabel(PRIORITY.URGENT)).toBe("Urgent");
    expect(priorityLabel(PRIORITY.NORMAL)).toBe("Normal");
    expect(priorityLabel(PRIORITY.LOW)).toBe("Low");
  });

  it("effectivePriority returns the max across lines", () => {
    expect(
      effectivePriority([
        { priority: PRIORITY.NORMAL },
        { priority: PRIORITY.URGENT },
        { priority: PRIORITY.LOW },
      ])
    ).toBe(PRIORITY.URGENT);
  });

  it("effectivePriority defaults to Normal when empty", () => {
    expect(effectivePriority([])).toBe(PRIORITY.NORMAL);
  });

  it("comparePriorityThenDate sorts urgent above normal", () => {
    const a = { priority: PRIORITY.URGENT as PriorityValue, date: "2026-05-10" };
    const b = { priority: PRIORITY.NORMAL as PriorityValue, date: "2026-05-01" };
    expect(comparePriorityThenDate(a, b)).toBeLessThan(0);
  });

  it("comparePriorityThenDate breaks ties by oldest date first", () => {
    const a = { priority: PRIORITY.NORMAL as PriorityValue, date: "2026-05-10" };
    const b = { priority: PRIORITY.NORMAL as PriorityValue, date: "2026-05-01" };
    expect(comparePriorityThenDate(a, b)).toBeGreaterThan(0);
  });

  it("ageClass returns 'fresh' under 7 days", () => {
    const today = new Date("2026-05-13T12:00:00Z");
    const date = new Date("2026-05-10T12:00:00Z").toISOString();
    expect(ageClass(date, today)).toBe("fresh");
  });

  it("ageClass returns 'amber' between 7 and 14 days", () => {
    const today = new Date("2026-05-20T12:00:00Z");
    const date = new Date("2026-05-10T12:00:00Z").toISOString();
    expect(ageClass(date, today)).toBe("amber");
  });

  it("ageClass returns 'red' at 14 days or more", () => {
    const today = new Date("2026-05-30T12:00:00Z");
    const date = new Date("2026-05-10T12:00:00Z").toISOString();
    expect(ageClass(date, today)).toBe("red");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/planning/priority.test.ts`
Expected: FAIL — `Cannot find module './priority'`.

- [ ] **Step 3: Implement the helpers**

Create `src/lib/planning/priority.ts`:

```ts
export const PRIORITY = {
  LOW: -1,
  NORMAL: 0,
  URGENT: 2,
} as const;

export type PriorityValue = typeof PRIORITY[keyof typeof PRIORITY];

export function priorityLabel(value: number): "Urgent" | "Normal" | "Low" {
  if (value >= PRIORITY.URGENT) return "Urgent";
  if (value <= PRIORITY.LOW) return "Low";
  return "Normal";
}

export function effectivePriority(
  lines: ReadonlyArray<{ priority: number }>
): PriorityValue {
  if (lines.length === 0) return PRIORITY.NORMAL;
  let max = lines[0].priority;
  for (const line of lines) if (line.priority > max) max = line.priority;
  // Clamp into the known enum
  if (max >= PRIORITY.URGENT) return PRIORITY.URGENT;
  if (max <= PRIORITY.LOW) return PRIORITY.LOW;
  return PRIORITY.NORMAL;
}

export function comparePriorityThenDate(
  a: { priority: PriorityValue; date: string },
  b: { priority: PriorityValue; date: string }
): number {
  if (a.priority !== b.priority) return b.priority - a.priority;
  return a.date.localeCompare(b.date);
}

export type AgeClass = "fresh" | "amber" | "red";

export function ageClass(iso: string, now: Date = new Date()): AgeClass {
  const orderTime = new Date(iso).getTime();
  const days = (now.getTime() - orderTime) / (1000 * 60 * 60 * 24);
  if (days >= 14) return "red";
  if (days >= 7) return "amber";
  return "fresh";
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/planning/priority.test.ts`
Expected: PASS — all 7 tests.

- [ ] **Step 5: Commit**

```
git add src/lib/planning/priority.ts src/lib/planning/priority.test.ts
git commit -m "feat(planning): add priority helpers (label, effective, sort, age)"
```

---

## Task 3: Server actions — `setOrderLinePriority` and `setOrderPriority`

**Files:**
- Modify: `src/app/app/planning/(gated)/floor/actions.ts`

- [ ] **Step 1: Add the two new actions at the bottom of `actions.ts`**

Append below the existing `completeStep` function:

```ts
export async function setOrderLinePriority(orderLineId: string, priority: number) {
  if (![-1, 0, 2].includes(priority)) return;

  const ctx = await getServerTenantContext();
  if (!ctx) return;
  const { supabase, tenantId } = ctx;

  const { error } = await supabase
    .from("order_line")
    .update({ priority })
    .eq("id", orderLineId)
    .eq("tenant_id", tenantId);

  if (error) throw new Error(error.message);

  revalidatePath("/app/planning/floor");
}

export async function setOrderPriority(orderId: string, priority: number) {
  if (![-1, 0, 2].includes(priority)) return;

  const ctx = await getServerTenantContext();
  if (!ctx) return;
  const { supabase, tenantId } = ctx;

  const { error } = await supabase
    .from("order_line")
    .update({ priority })
    .eq("order_id", orderId)
    .eq("tenant_id", tenantId);

  if (error) throw new Error(error.message);

  revalidatePath("/app/planning/floor");
}
```

- [ ] **Step 2: Update `startJob` to copy `order_line.priority`**

In `src/app/app/planning/(gated)/floor/actions.ts`, change the order-line select to include `priority`:

```ts
  const { data: orderLine } = await supabase
    .from("order_line")
    .select(
      "id, quantity, order_id, priority, variant:variant_id(id, product_bom(id, is_active, product_bom_labor(*)))"
    )
    .eq("id", orderLineId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
```

Then change the routing-step row builder so `priority` is the order line's priority, not `sequence * 10`:

```ts
  const rows = scheduled.map((s) => ({
    tenant_id: tenantId,
    order_line_id: orderLineId,
    department_id: s.departmentId,
    bom_labor_id: s.bomLaborId,
    sequence: s.sequence,
    blocked_by: s.blockedBy,
    operation_name: s.operationName,
    status: s.initialStatus as "queued" | "blocked",
    scheduled_start: s.scheduledStart.toISOString(),
    scheduled_end: s.scheduledEnd.toISOString(),
    priority: Number(orderLine.priority ?? 0),
  }));
```

- [ ] **Step 3: Manual sanity check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```
git add src/app/app/planning/(gated)/floor/actions.ts
git commit -m "feat(planning): priority server actions + propagate priority to routing steps"
```

---

## Task 4: Update shopfloor ordering to honour business priority

**Files:**
- Modify: `src/app/app/planning/(gated)/shopfloor/page.tsx` (the `.order("priority", { ascending: true })` line)

Context: previously `job_routing_step.priority` was overwritten with `sequence * 10` and ordered ascending. Now it holds the order line's business priority (`-1` / `0` / `2`). Within a routing chain, lower `sequence` should still come first.

- [ ] **Step 1: Replace the single `.order(...)` call with two**

Find the existing line in `shopfloor/page.tsx`:

```ts
      .order("priority", { ascending: true }),
```

Replace with:

```ts
      .order("priority", { ascending: false })
      .order("sequence", { ascending: true }),
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```
git add src/app/app/planning/(gated)/shopfloor/page.tsx
git commit -m "fix(planning): shopfloor orders by priority desc, sequence asc"
```

---

## Task 5: Floor page query — add fields, group by order, sort

**Files:**
- Modify: `src/app/app/planning/(gated)/floor/page.tsx`

- [ ] **Step 1: Extend the unstarted query**

In `floor/page.tsx`, change the `unstartedQuery` select to include `priority`, `created_at`, `order_id`, and `customer_email`:

```ts
  let unstartedQuery = supabase
    .from("order_line")
    .select(`
      id, quantity, priority, created_at, order_id,
      orders:order_id ( order_number, customer_email, created_at ),
      variant:variant_id ( title, product:product_id ( title ) )
    `)
    .eq("tenant_id", tenantId)
    .limit(50);
```

- [ ] **Step 2: Replace the `UnstartedLine[]` map with order grouping**

Above the `// 1. Parallel-fetch departments…` comment, replace the existing `unstartedLines` block with:

```ts
  type UnstartedLineDTO = {
    id: string;
    quantity: number;
    productTitle: string;
    priority: number;
  };

  type UnstartedOrderDTO = {
    orderId: string;
    orderNumber: string;
    customerEmail: string | null;
    orderDate: string;
    effectivePriority: -1 | 0 | 2;
    lines: UnstartedLineDTO[];
  };

  const byOrder = new Map<string, UnstartedOrderDTO>();
  for (const row of unstartedRaw ?? []) {
    const variant = (row as any).variant;
    const order = (row as any).orders;
    const orderId = (row as any).order_id as string;

    if (!byOrder.has(orderId)) {
      byOrder.set(orderId, {
        orderId,
        orderNumber: order?.order_number ?? "—",
        customerEmail: order?.customer_email ?? null,
        orderDate: order?.created_at ?? (row as any).created_at,
        effectivePriority: 0,
        lines: [],
      });
    }

    const bucket = byOrder.get(orderId)!;
    bucket.lines.push({
      id: row.id as string,
      quantity: Number(row.quantity),
      productTitle: variant?.product?.title ?? variant?.title ?? "Unknown product",
      priority: Number((row as any).priority ?? 0),
    });
  }

  // Compute effective priority per order, then sort orders.
  const unstartedOrders: UnstartedOrderDTO[] = Array.from(byOrder.values()).map((o) => {
    const max = o.lines.reduce((m, l) => (l.priority > m ? l.priority : m), 0);
    const effective: -1 | 0 | 2 = max >= 2 ? 2 : max <= -1 ? -1 : 0;
    return { ...o, effectivePriority: effective };
  });

  unstartedOrders.sort((a, b) => {
    if (a.effectivePriority !== b.effectivePriority) {
      return b.effectivePriority - a.effectivePriority;
    }
    return a.orderDate.localeCompare(b.orderDate);
  });
```

- [ ] **Step 3: Update the import and JSX**

Replace these two lines near the top of `floor/page.tsx`:

```ts
import { UnstartedPanel, type UnstartedLine } from "./unstarted-panel";
```

with:

```ts
import { WaitingRail, type UnstartedOrder } from "./waiting-rail";
```

(`UnstartedOrder` will be exported by the new component in Task 6.)

In the JSX at the bottom, replace:

```tsx
      {unstartedLines.length > 0 && (
        <UnstartedPanel lines={unstartedLines} />
      )}
      <FloorBoard columns={columns} drawerSteps={drawerSteps} />
```

with:

```tsx
      <div className={styles.layout}>
        <WaitingRail orders={unstartedOrders as UnstartedOrder[]} />
        <div className={styles.boardWrap}>
          <FloorBoard columns={columns} drawerSteps={drawerSteps} />
        </div>
      </div>
```

(The rail handles its own empty state — no more conditional render.)

- [ ] **Step 4: Pass the started-line priority through to the board (for the ribbon)**

Inside the `cardSteps` map in `floor/page.tsx`, the existing select already pulls everything for `JobCardData`. We need to also surface each step's `priority`. Update the routing-step select to include `priority`:

```ts
    supabase
      .from("job_routing_step")
      .select(
        `id,sequence,blocked_by,status,operation_name,scheduled_start,department_id,order_line_id,priority,
         order_line:order_line_id(
           variant:variant_id(title,product:product_id(title)),
           orders:order_id(order_number,customer_email,created_at)
         )`
      )
      .eq("tenant_id", tenantId)
      .in("status", ["active", "queued", "blocked"]),
```

And in the `cardSteps` map, add `priority: Number(s.priority ?? 0),` to the returned object.

Also extend the `StepRow` type at the top of the file: add `priority: number;` after `department_id`.

- [ ] **Step 5: TypeScript sanity check**

Run: `npx tsc --noEmit`
Expected: errors only about the missing `WaitingRail` module (it doesn't exist yet) and `JobCardData.priority`. These are fixed in Task 6 and Task 8 respectively. No other errors.

- [ ] **Step 6: Commit**

```
git add src/app/app/planning/(gated)/floor/page.tsx
git commit -m "feat(planning): group unstarted lines by order with effective priority sort"
```

---

## Task 6: WaitingRail component (collapsible shell)

**Files:**
- Create: `src/app/app/planning/(gated)/floor/waiting-rail.tsx`

- [ ] **Step 1: Create the component file**

```tsx
"use client";

import { useState } from "react";
import styles from "./floor.module.css";
import { OrderCard } from "./order-card";

export type UnstartedLine = {
  id: string;
  quantity: number;
  productTitle: string;
  priority: number;
};

export type UnstartedOrder = {
  orderId: string;
  orderNumber: string;
  customerEmail: string | null;
  orderDate: string;
  effectivePriority: -1 | 0 | 2;
  lines: UnstartedLine[];
};

type Props = {
  orders: UnstartedOrder[];
};

export function WaitingRail({ orders }: Props) {
  const [open, setOpen] = useState(true);

  const total = orders.length;

  return (
    <aside
      className={[styles.rail, open ? styles.railOpen : styles.railCollapsed]
        .filter(Boolean)
        .join(" ")}
      aria-label="Waiting orders"
    >
      <button
        type="button"
        className={styles.railToggle}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className={styles.railTitle}>Waiting orders</span>
        <span className={styles.railCount}>{total}</span>
        <span className={styles.railChevron} aria-hidden>
          {open ? "‹" : "›"}
        </span>
      </button>

      {open && (
        <div className={styles.railBody}>
          {total === 0 ? (
            <div className={styles.railEmpty}>All orders are in progress</div>
          ) : (
            orders.map((order) => <OrderCard key={order.orderId} order={order} />)
          )}
        </div>
      )}
    </aside>
  );
}
```

- [ ] **Step 2: Commit**

```
git add src/app/app/planning/(gated)/floor/waiting-rail.tsx
git commit -m "feat(planning): WaitingRail collapsible shell"
```

---

## Task 7: PriorityPill + PriorityFlag primitives

**Files:**
- Create: `src/app/app/planning/(gated)/floor/priority-pill.tsx`
- Create: `src/app/app/planning/(gated)/floor/priority-flag.tsx`

- [ ] **Step 1: Create PriorityPill**

```tsx
"use client";

import { useState, useRef, useEffect } from "react";
import styles from "./floor.module.css";
import { PRIORITY, priorityLabel, type PriorityValue } from "@/lib/planning/priority";

type Props = {
  value: PriorityValue;
  onChange: (next: PriorityValue) => void;
};

export function PriorityPill({ value, onChange }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  return (
    <div className={styles.priorityPillWrap} ref={ref}>
      <button
        type="button"
        className={styles.priorityPill}
        data-priority={priorityLabel(value).toLowerCase()}
        onClick={() => setMenuOpen((v) => !v)}
      >
        {priorityLabel(value)} <span aria-hidden>▾</span>
      </button>
      {menuOpen && (
        <ul className={styles.priorityMenu} role="menu">
          {(
            [
              { v: PRIORITY.URGENT, label: "Set all to Urgent" },
              { v: PRIORITY.NORMAL, label: "Set all to Normal" },
              { v: PRIORITY.LOW, label: "Set all to Low" },
            ] as { v: PriorityValue; label: string }[]
          ).map((item) => (
            <li key={item.v}>
              <button
                type="button"
                className={styles.priorityMenuItem}
                onClick={() => {
                  setMenuOpen(false);
                  onChange(item.v);
                }}
              >
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create PriorityFlag**

```tsx
"use client";

import styles from "./floor.module.css";
import { PRIORITY, type PriorityValue } from "@/lib/planning/priority";

type Props = {
  value: PriorityValue;
  onChange: (next: PriorityValue) => void;
};

// Click cycles: Normal → Urgent → Low → Normal
function next(value: PriorityValue): PriorityValue {
  if (value === PRIORITY.NORMAL) return PRIORITY.URGENT;
  if (value === PRIORITY.URGENT) return PRIORITY.LOW;
  return PRIORITY.NORMAL;
}

export function PriorityFlag({ value, onChange }: Props) {
  const label =
    value === PRIORITY.URGENT ? "Urgent" : value === PRIORITY.LOW ? "Low" : "Normal";
  return (
    <button
      type="button"
      className={styles.priorityFlag}
      data-priority={label.toLowerCase()}
      onClick={() => onChange(next(value))}
      title={`Priority: ${label} (click to change)`}
      aria-label={`Priority ${label}`}
    >
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
        <path
          d="M3 1v12M3 2h7l-1.5 2L10 6H3"
          fill="currentColor"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
```

- [ ] **Step 3: Commit**

```
git add src/app/app/planning/(gated)/floor/priority-pill.tsx src/app/app/planning/(gated)/floor/priority-flag.tsx
git commit -m "feat(planning): PriorityPill and PriorityFlag primitives"
```

---

## Task 8: OrderCard + OrderLineRow

**Files:**
- Create: `src/app/app/planning/(gated)/floor/order-card.tsx`
- Create: `src/app/app/planning/(gated)/floor/order-line-row.tsx`

- [ ] **Step 1: Create OrderLineRow**

```tsx
"use client";

import { useTransition, useState } from "react";
import styles from "./floor.module.css";
import { PRIORITY, type PriorityValue } from "@/lib/planning/priority";
import { setOrderLinePriority } from "./actions";
import { PriorityFlag } from "./priority-flag";
import { StartJobModal } from "./start-job-modal";

type Props = {
  line: {
    id: string;
    quantity: number;
    productTitle: string;
    priority: PriorityValue;
  };
  orderNumber: string;
  onLinePriorityChange: (lineId: string, next: PriorityValue) => void;
};

export function OrderLineRow({ line, orderNumber, onLinePriorityChange }: Props) {
  const [, startTransition] = useTransition();
  const [modalOpen, setModalOpen] = useState(false);

  const update = (next: PriorityValue) => {
    onLinePriorityChange(line.id, next);
    startTransition(() => {
      setOrderLinePriority(line.id, next).catch(() => {
        // Optimistic — revert to old value if server rejects.
        onLinePriorityChange(line.id, line.priority);
      });
    });
  };

  return (
    <>
      <div className={styles.orderLineRow}>
        <span className={styles.orderLineProduct}>{line.productTitle}</span>
        <span className={styles.orderLineQty}>Qty {line.quantity}</span>
        <PriorityFlag value={line.priority} onChange={update} />
        <button
          type="button"
          className={styles.startButton}
          onClick={() => setModalOpen(true)}
        >
          Start
        </button>
      </div>
      {modalOpen && (
        <StartJobModal
          orderLineId={line.id}
          orderNumber={orderNumber}
          productTitle={line.productTitle}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}
```

- [ ] **Step 2: Create OrderCard**

```tsx
"use client";

import { useState, useTransition } from "react";
import styles from "./floor.module.css";
import {
  PRIORITY,
  ageClass,
  effectivePriority,
  priorityLabel,
  type PriorityValue,
} from "@/lib/planning/priority";
import { PriorityPill } from "./priority-pill";
import { OrderLineRow } from "./order-line-row";
import { setOrderPriority } from "./actions";
import type { UnstartedOrder } from "./waiting-rail";

type Props = {
  order: UnstartedOrder;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

function relative(iso: string, now: Date = new Date()): string {
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86400000);
  if (days < 1) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

export function OrderCard({ order }: Props) {
  const [lines, setLines] = useState(
    order.lines.map((l) => ({ ...l, priority: l.priority as PriorityValue }))
  );
  const [, startTransition] = useTransition();

  const effective = effectivePriority(lines);
  const ageBand = ageClass(order.orderDate);

  const setLinePriority = (lineId: string, next: PriorityValue) => {
    setLines((ls) => ls.map((l) => (l.id === lineId ? { ...l, priority: next } : l)));
  };

  const setAll = (next: PriorityValue) => {
    const previous = lines;
    setLines((ls) => ls.map((l) => ({ ...l, priority: next })));
    startTransition(() => {
      setOrderPriority(order.orderId, next).catch(() => setLines(previous));
    });
  };

  return (
    <div
      className={styles.orderCard}
      data-priority={priorityLabel(effective).toLowerCase()}
      data-age={ageBand}
    >
      <header className={styles.orderCardHeader}>
        <div className={styles.orderCardTitleRow}>
          <span className={styles.orderCardNumber}>#{order.orderNumber}</span>
          <span className={styles.orderCardDate} data-age={ageBand}>
            {formatDate(order.orderDate)} · {relative(order.orderDate)}
          </span>
          <PriorityPill value={effective} onChange={setAll} />
        </div>
        {order.customerEmail && (
          <div className={styles.orderCardCustomer}>{order.customerEmail}</div>
        )}
      </header>
      <ul className={styles.orderCardLines}>
        {lines.map((line) => (
          <li key={line.id}>
            <OrderLineRow
              line={line}
              orderNumber={order.orderNumber}
              onLinePriorityChange={setLinePriority}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 3: TypeScript sanity check**

Run: `npx tsc --noEmit`
Expected: no errors. (Task 5's missing `WaitingRail` import now resolves.)

- [ ] **Step 4: Commit**

```
git add src/app/app/planning/(gated)/floor/order-card.tsx src/app/app/planning/(gated)/floor/order-line-row.tsx
git commit -m "feat(planning): OrderCard and OrderLineRow"
```

---

## Task 9: Job card ribbon for urgent steps on the board

**Files:**
- Modify: `src/app/app/planning/(gated)/floor/job-card.tsx`

- [ ] **Step 1: Extend `JobCardData` with priority**

Find the `JobCardData` type in `job-card.tsx` and add `priority: number;` after `scheduledStart`.

- [ ] **Step 2: Render the ribbon when priority is Urgent**

Inside the returned `<div>` of `JobCard`, immediately after the opening `<div className={...}>`, add:

```tsx
      {step.priority >= 2 && <span className={styles.urgentRibbon}>Urgent</span>}
```

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors. (Task 5 already populates `priority` on the data passed in.)

- [ ] **Step 4: Commit**

```
git add src/app/app/planning/(gated)/floor/job-card.tsx
git commit -m "feat(planning): urgent ribbon on board job cards"
```

---

## Task 10: CSS — layout, rail, card, pill, flag, ribbon, ageing

**Files:**
- Modify: `src/app/app/planning/(gated)/floor/floor.module.css`

- [ ] **Step 1: Replace the `.page` rule and add a layout grid**

Replace the existing `.page` rule at the top of the file with:

```css
.page { display: flex; flex-direction: column; gap: 16px; height: 100%; }

.layout {
  display: grid;
  grid-template-columns: 360px 1fr;
  gap: 16px;
  flex: 1;
  min-height: 0;
}

.boardWrap { min-width: 0; display: flex; flex-direction: column; }

@media (max-width: 1280px) {
  .layout { grid-template-columns: 1fr; }
}
```

- [ ] **Step 2: Append rail styles at the end of the file**

```css
/* ── Waiting rail ─────────────────────────────────────────── */
.rail {
  border: 1px solid var(--stroke-card);
  border-radius: var(--radius-xl);
  background: var(--bg-card);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  height: 100%;
}
.railOpen { width: 100%; }
.railCollapsed { width: 100%; }

.railToggle {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border: none;
  border-bottom: 1px solid var(--stroke);
  background: var(--bg-card-alt);
  color: var(--ink-strong);
  font-weight: 600;
  font-size: 0.9rem;
  cursor: pointer;
  width: 100%;
}
.railTitle { flex: 1; text-align: left; }
.railCount {
  font-size: 0.72rem;
  background: var(--bg-card);
  border: 1px solid var(--stroke-card);
  padding: 2px 8px;
  border-radius: 999px;
  color: var(--ink-muted);
}
.railChevron { color: var(--ink-faint); font-size: 1rem; }

.railBody {
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  flex: 1;
}
.railEmpty {
  padding: 24px 16px;
  text-align: center;
  font-size: 0.85rem;
  color: var(--ink-muted);
}

/* ── Order card ───────────────────────────────────────────── */
.orderCard {
  border: 1px solid var(--stroke-card);
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}
.orderCard::before {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: 4px;
  background: var(--stroke);
}
.orderCard[data-priority="urgent"]::before { background: var(--danger, #d4452f); }
.orderCard[data-priority="low"]::before    { background: var(--ink-faint); }

.orderCardHeader {
  padding: 12px 14px 8px 18px;
  border-bottom: 1px solid var(--stroke);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.orderCardTitleRow {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.orderCardNumber { font-weight: 700; font-size: 0.95rem; color: var(--ink-strong); }
.orderCardDate {
  font-size: 0.78rem;
  color: var(--ink-muted);
  flex: 1;
}
.orderCardDate[data-age="amber"] { color: var(--warn, #b6760a); }
.orderCardDate[data-age="red"]   { color: var(--danger, #d4452f); font-weight: 600; }
.orderCardCustomer { font-size: 0.78rem; color: var(--ink-faint); }

.orderCardLines {
  list-style: none;
  margin: 0;
  padding: 4px 14px 10px 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.orderLineRow {
  display: grid;
  grid-template-columns: 1fr auto auto auto;
  gap: 10px;
  align-items: center;
  padding: 6px 0;
}
.orderLineProduct { font-size: 0.85rem; color: var(--ink-strong); min-width: 0; }
.orderLineQty { font-size: 0.78rem; color: var(--ink-muted); }

.startButton {
  padding: 5px 12px;
  border-radius: 999px;
  border: none;
  background: linear-gradient(135deg,
    color-mix(in srgb, var(--brand-2) 72%, #142131),
    color-mix(in srgb, var(--brand-1) 88%, #0e1624));
  color: #f8fbff;
  font-weight: 600;
  font-size: 0.78rem;
  cursor: pointer;
}

/* ── Priority pill + flag ─────────────────────────────────── */
.priorityPillWrap { position: relative; }
.priorityPill {
  border: 1px solid var(--stroke-card);
  background: var(--bg-card);
  color: var(--ink-muted);
  border-radius: 999px;
  padding: 3px 10px;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
}
.priorityPill[data-priority="urgent"] {
  background: var(--danger-dim, color-mix(in srgb, var(--danger, #d4452f) 18%, transparent));
  color: var(--danger, #d4452f);
  border-color: transparent;
}
.priorityPill[data-priority="low"] {
  background: var(--surface-1);
  color: var(--ink-faint);
}
.priorityMenu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  list-style: none;
  margin: 0;
  padding: 4px;
  background: var(--bg-card);
  border: 1px solid var(--stroke-card);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  z-index: 5;
  min-width: 160px;
}
.priorityMenuItem {
  width: 100%;
  text-align: left;
  border: none;
  background: transparent;
  padding: 6px 10px;
  font-size: 0.82rem;
  color: var(--ink-strong);
  cursor: pointer;
  border-radius: var(--radius-sm);
}
.priorityMenuItem:hover { background: var(--surface-1); }

.priorityFlag {
  border: none;
  background: transparent;
  cursor: pointer;
  color: var(--ink-faint);
  padding: 2px;
  display: inline-flex;
  align-items: center;
  border-radius: var(--radius-sm);
}
.priorityFlag:hover { background: var(--surface-1); color: var(--ink-strong); }
.priorityFlag[data-priority="urgent"] { color: var(--danger, #d4452f); }
.priorityFlag[data-priority="low"]    { color: var(--ink-faint); opacity: 0.6; }

/* ── Urgent ribbon on job cards ───────────────────────────── */
.urgentRibbon {
  display: inline-block;
  background: var(--danger, #d4452f);
  color: #fff;
  font-size: 0.62rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding: 2px 6px;
  border-radius: 4px;
  text-transform: uppercase;
  margin-bottom: 6px;
}
```

- [ ] **Step 2: Commit**

```
git add src/app/app/planning/(gated)/floor/floor.module.css
git commit -m "style(planning): layout grid, waiting rail, order card, priority controls"
```

---

## Task 11: Delete the old panel

**Files:**
- Remove: `src/app/app/planning/(gated)/floor/unstarted-panel.tsx`

- [ ] **Step 1: Confirm no remaining imports**

Search for the old name (read-only sanity):

```
grep -nR "unstarted-panel" src/
```

Expected: zero hits. (The new `floor/page.tsx` imports from `./waiting-rail` already.)

- [ ] **Step 2: Delete the file**

```
git rm src/app/app/planning/(gated)/floor/unstarted-panel.tsx
```

- [ ] **Step 3: TypeScript check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```
git commit -m "chore(planning): remove old UnstartedPanel"
```

---

## Task 12: Verification

- [ ] **Step 1: Run the unit tests**

Run: `npx vitest run`
Expected: all green, including `priority.test.ts` (7 new tests) and the pre-existing planning tests.

- [ ] **Step 2: Start the dev server**

Run: `npm run dev`
Open: `http://localhost:3000/app/planning/floor`

- [ ] **Step 3: Manually verify the golden paths**

Check each:
- Rail visible on the left at ≥1280 px, top section at <1280 px.
- An order with multiple unstarted lines shows them grouped under one card.
- Clicking the order-level pill bulk-updates the lines; refresh persists the value.
- Clicking a line's flag cycles Normal → Urgent → Low → Normal; refresh persists.
- Sort: an order with one Urgent line floats above all Normal orders.
- Order date shows absolute + relative; an order >7 days appears amber, >14 days red.
- Starting an Urgent line shows the red "Urgent" ribbon on the board job card.
- Empty rail shows "All orders are in progress".
- Shopfloor (`/app/planning/shopfloor`): an urgent step appears above non-urgent steps in the same department; within a single chain, lower sequence still wins.

- [ ] **Step 4: Commit verification notes (optional)**

No commit needed unless changes were required during verification.

---

## Self-Review (already performed by plan author)

- Spec coverage:
  - Collapsible rail / responsive fallback: Task 6 + Task 10 grid + media query.
  - Order grouping with effective priority: Task 5 (server group) + Task 8 (client).
  - Per-line and bulk priority controls: Task 3 (actions) + Task 7 + Task 8.
  - Date + age signals: Task 2 (`ageClass`) + Task 8 (render) + Task 10 (colours).
  - Sort by priority then oldest date: Task 5 (server) + Task 2 helpers (covered by tests).
  - DB column + index: Task 1.
  - Priority propagation to routing steps: Task 3 Step 2.
  - Shopfloor honours new priority semantics: Task 4.
  - Board ribbon for urgent: Task 9 + Task 10.
  - Removal of old panel: Task 11.
- Placeholder scan: no TBDs, no "handle error appropriately" stubs — every step contains code or an exact command.
- Type consistency: `PriorityValue` from `@/lib/planning/priority` flows through pill, flag, row, card; `UnstartedOrder` defined in `waiting-rail.tsx`, imported by `order-card.tsx` and by `page.tsx`.
- One known design hazard worth flagging at execution time: `job_routing_step.priority` semantics change in Task 3. Task 4 updates the shopfloor query to match. No other code reads `priority` (verified via grep at plan-writing time).
