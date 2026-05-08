# Planning Module — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Planning Module as a gated paid add-on — floor board with department queues, shop floor app for operators, dependency-aware job routing, and B2C customer notifications triggered at production milestones.

**Architecture:** Next.js 15 App Router with a route group (`(gated)`) that checks `tenant.has_planning_module` before serving any planning page. Server components fetch and pass data; client components handle interactivity. Core business logic (scheduling algorithm, unlock cascade, notification dispatch) lives in `src/lib/planning/` as pure, testable functions.

**Tech Stack:** Next.js 15, Supabase (Postgres + RLS), TypeScript, CSS Modules, Resend (transactional email), @dnd-kit/sortable (queue drag-reorder), Jest + ts-jest (unit tests for logic layer).

**Phases:** Tasks 1–7 deliver a working floor board and shop floor app. Tasks 8–10 add customer notifications and product configuration UI. The Gantt/Schedule tab is Phase 2 — create a separate plan after the floor board is stable.

---

### Task 1: Database schema

**Goal:** Add all new columns and tables required by the planning module.

**Files:**
- Create: `supabase/patches/planning_module_schema.sql`

**Acceptance Criteria:**
- [ ] `tenant.has_planning_module` column exists, defaults to false
- [ ] `orders.customer_email` column exists, nullable
- [ ] `product_bom_labor.blocked_by` column exists as `integer[]`, defaults to `{}`
- [ ] `job_routing_step` table exists with RLS enabled
- [ ] `product_notification_trigger` table exists with RLS enabled
- [ ] `notification_log` table exists with RLS enabled
- [ ] All new tables have `current_tenant_id()` RLS policies matching existing pattern

**Verify:** Apply patch to local Supabase with `npx supabase db push` or paste into Supabase SQL editor. Confirm tables appear in Table Editor with no errors.

**Steps:**

- [ ] **Step 1: Create the patch file**

Create `supabase/patches/planning_module_schema.sql`:

```sql
-- ============================================================
-- Planning Module Schema
-- ============================================================

-- 1. Tenant module flag
alter table public.tenant
  add column if not exists has_planning_module boolean not null default false;

-- 2. Customer email on orders (populated by Shopify sync)
alter table public.orders
  add column if not exists customer_email text;

-- 3. Routing dependency array on BOM labor operations
--    blocked_by stores sequence integers that must be 'complete'
--    before this step transitions from 'blocked' → 'queued'
alter table public.product_bom_labor
  add column if not exists blocked_by integer[] not null default '{}';

-- 4. Job routing step — live tracking record per order-line per routing stage
create table if not exists public.job_routing_step (
  id                uuid        primary key default gen_random_uuid(),
  tenant_id         uuid        not null references public.tenant(id),
  order_line_id     uuid        not null references public.order_line(id) on delete cascade,
  department_id     uuid        not null references public.department(id),
  bom_labor_id      uuid        references public.product_bom_labor(id),
  sequence          integer     not null,
  blocked_by        integer[]   not null default '{}',
  operation_name    text        not null,
  status            text        not null default 'blocked'
                                check (status in ('blocked','queued','active','complete','skipped')),
  scheduled_start   timestamptz,
  scheduled_end     timestamptz,
  actual_start      timestamptz,
  actual_end        timestamptz,
  started_by        uuid        references auth.users(id),
  completed_by      uuid        references auth.users(id),
  priority          integer     not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists jrs_tenant_idx       on public.job_routing_step(tenant_id);
create index if not exists jrs_order_line_idx   on public.job_routing_step(order_line_id);
create index if not exists jrs_department_idx   on public.job_routing_step(department_id);
create index if not exists jrs_status_idx       on public.job_routing_step(status);

alter table public.job_routing_step enable row level security;

create policy "Tenant isolation" on public.job_routing_step
  using  (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

-- 5. Product notification trigger — per-BOM per-sequence notification config
create table if not exists public.product_notification_trigger (
  id               uuid     primary key default gen_random_uuid(),
  tenant_id        uuid     not null references public.tenant(id),
  product_bom_id   uuid     not null references public.product_bom(id) on delete cascade,
  routing_sequence integer  not null,
  message_template text     not null,
  channel          text     not null default 'email'
                            check (channel in ('email')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (tenant_id, product_bom_id, routing_sequence)
);

alter table public.product_notification_trigger enable row level security;

create policy "Tenant isolation" on public.product_notification_trigger
  using  (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

-- 6. Notification log — audit trail of every sent notification
create table if not exists public.notification_log (
  id              uuid     primary key default gen_random_uuid(),
  tenant_id       uuid     not null references public.tenant(id),
  order_id        uuid     not null references public.orders(id),
  order_line_id   uuid     not null references public.order_line(id),
  trigger_id      uuid     references public.product_notification_trigger(id),
  channel         text     not null,
  recipient       text     not null,
  sent_at         timestamptz not null default now(),
  delivery_status text     not null default 'sent'
                           check (delivery_status in ('sent','delivered','failed')),
  created_at      timestamptz not null default now()
);

create index if not exists notif_log_order_idx  on public.notification_log(order_id);
create index if not exists notif_log_tenant_idx on public.notification_log(tenant_id);

alter table public.notification_log enable row level security;

create policy "Tenant isolation" on public.notification_log
  using  (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());
```

- [ ] **Step 2: Apply to local Supabase**

```bash
# If using Supabase CLI local dev:
npx supabase db push

# Or paste the SQL directly into the Supabase dashboard SQL editor
# and confirm no errors appear.
```

- [ ] **Step 3: Commit**

```bash
git add supabase/patches/planning_module_schema.sql
git commit -m "feat(planning): add planning module schema — routing steps, notifications, module gate"
```

---

### Task 2: Module gating — layout, upgrade page, sidebar nav, route meta

**Goal:** Gate the planning module behind `tenant.has_planning_module`; show a locked upgrade page for tenants without access; surface the Planning link in the sidebar only when enabled.

**Files:**
- Create: `src/app/app/planning/upgrade/page.tsx`
- Create: `src/app/app/planning/upgrade/upgrade.module.css`
- Create: `src/app/app/planning/(gated)/layout.tsx`
- Create: `src/app/app/planning/(gated)/page.tsx`
- Modify: `src/app/app/layout.tsx`
- Modify: `src/app/app/sidebar-nav.tsx`
- Modify: `src/app/app/route-meta.ts`

**Acceptance Criteria:**
- [ ] Visiting `/app/planning` with `has_planning_module = false` redirects to `/app/planning/upgrade`
- [ ] Upgrade page renders without error and shows a CTA
- [ ] Visiting `/app/planning` with `has_planning_module = true` passes through to the floor board
- [ ] Sidebar shows "Production Planning" link only when module is enabled

**Verify:** `npx tsc --noEmit` → 0 errors. Test by toggling `has_planning_module` on your tenant row in Supabase.

**Steps:**

- [ ] **Step 1: Create upgrade page**

`src/app/app/planning/upgrade/page.tsx`:
```tsx
import styles from "./upgrade.module.css";

export default function PlanningUpgradePage() {
  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <span className={styles.badge}>Add-on</span>
        <h1>Production Planning</h1>
        <p className={styles.subtitle}>
          Schedule jobs across departments, manage queues, and send customers
          real-time production updates — all from one place.
        </p>
        <ul className={styles.features}>
          <li>Department queue boards</li>
          <li>Shop floor app for operators</li>
          <li>Auto &amp; manual job scheduling</li>
          <li>B2C customer notifications at each production milestone</li>
        </ul>
        <p className={styles.cta}>Contact us to enable Production Planning for your workspace.</p>
        <a href="mailto:support@manuva.app" className={styles.button}>
          Get in touch
        </a>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create upgrade page styles**

`src/app/app/planning/upgrade/upgrade.module.css`:
```css
.page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  padding: 40px 24px;
}
.card {
  max-width: 480px;
  width: 100%;
  border: 1px solid color-mix(in srgb, var(--stroke-strong) 70%, transparent);
  border-radius: 22px;
  background: linear-gradient(180deg,
    color-mix(in srgb, var(--surface-raised) 92%, transparent),
    color-mix(in srgb, var(--surface) 94%, transparent));
  box-shadow: 0 18px 38px rgba(5, 8, 15, 0.2);
  padding: 40px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.badge {
  display: inline-flex;
  align-items: center;
  padding: 5px 12px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--brand-2) 16%, transparent);
  color: color-mix(in srgb, var(--brand-2) 72%, white);
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  width: fit-content;
}
.card h1 { margin: 0; font-size: 1.8rem; color: var(--ink-strong); }
.subtitle { margin: 0; color: var(--ink-muted); line-height: 1.6; }
.features {
  margin: 0;
  padding-left: 20px;
  color: var(--ink-muted);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cta { margin: 0; color: var(--ink-faint); font-size: 0.88rem; }
.button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  padding: 0 24px;
  border-radius: 999px;
  background: linear-gradient(135deg,
    color-mix(in srgb, var(--brand-2) 72%, #142131),
    color-mix(in srgb, var(--brand-1) 88%, #0e1624));
  color: #f8fbff;
  font-size: 0.9rem;
  font-weight: 700;
  text-decoration: none;
  width: fit-content;
}
```

- [ ] **Step 3: Create gated layout**

`src/app/app/planning/(gated)/layout.tsx`:
```tsx
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";

export default async function PlanningGatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/login");

  const { supabase, tenantId } = ctx;
  const { data: tenant } = await supabase
    .from("tenant")
    .select("has_planning_module")
    .eq("id", tenantId)
    .single();

  if (!tenant?.has_planning_module) {
    redirect("/app/planning/upgrade");
  }

  return <>{children}</>;
}
```

- [ ] **Step 4: Create gated index page (redirect to floor board)**

`src/app/app/planning/(gated)/page.tsx`:
```tsx
import { redirect } from "next/navigation";
export default function PlanningIndexPage() {
  redirect("/app/planning/floor");
}
```

- [ ] **Step 5: Add planning routes to route-meta.ts**

Open `src/app/app/route-meta.ts`. In the `ROUTES` array, add before the closing bracket:
```typescript
  {
    prefix: "/app/planning/upgrade",
    title: "Production Planning",
    subtitle: "Upgrade your workspace to access Production Planning.",
    crumbs: ["Planning"],
  },
  {
    prefix: "/app/planning/floor",
    title: "Floor Board",
    subtitle: "Live department queues and job status.",
    crumbs: ["Planning", "Floor Board"],
  },
  {
    prefix: "/app/planning/shopfloor",
    title: "Shop Floor",
    subtitle: "Operator queue for your department.",
    crumbs: ["Planning", "Shop Floor"],
  },
  {
    prefix: "/app/planning",
    title: "Production Planning",
    subtitle: "Schedule jobs and manage production across departments.",
    crumbs: ["Planning"],
  },
```

- [ ] **Step 6: Update layout.tsx to fetch module flags**

Open `src/app/app/layout.tsx`. Find where `SidebarNav` is rendered (currently `<SidebarNav />`). Update the layout to fetch `has_planning_module` and pass it:

```tsx
// In the layout, after the existing profile query, add:
const { data: tenantRow } = await supabase
  .from("tenant")
  .select("has_planning_module")
  .eq("id", profile?.tenant_id ?? "")
  .maybeSingle();

const hasPlanning = tenantRow?.has_planning_module ?? false;
```

Then update the render:
```tsx
<SidebarNav hasPlanning={hasPlanning} />
```

- [ ] **Step 7: Update sidebar-nav.tsx to conditionally show Planning**

Open `src/app/app/sidebar-nav.tsx`. Change the component signature to accept the prop:
```tsx
export default function SidebarNav({ hasPlanning = false }: { hasPlanning?: boolean }) {
```

In the nav sections, find the "Planning" section and add the Production Planning item conditionally. Add this item to the Planning section items array:
```tsx
...(hasPlanning
  ? [
      {
        label: "Production Planning",
        href: "/app/planning/floor",
        icon: (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="3" width="14" height="2" rx="1" fill="currentColor" opacity=".4"/>
            <rect x="1" y="7" width="9" height="2" rx="1" fill="currentColor" opacity=".7"/>
            <rect x="1" y="11" width="12" height="2" rx="1" fill="currentColor"/>
          </svg>
        ),
      },
    ]
  : []),
```

- [ ] **Step 8: Commit**

```bash
git add src/app/app/planning/ src/app/app/layout.tsx src/app/app/sidebar-nav.tsx src/app/app/route-meta.ts
git commit -m "feat(planning): module gating — route group, upgrade page, sidebar nav"
```

---

### Task 3: Planning types and scheduling algorithm

**Goal:** Define shared TypeScript types and implement the greedy auto-scheduling algorithm as a pure, tested function.

**Files:**
- Create: `src/lib/planning/types.ts`
- Create: `src/lib/planning/scheduling.ts`
- Create: `src/lib/planning/__tests__/scheduling.test.ts`
- Create: `jest.config.ts`

**Acceptance Criteria:**
- [ ] `scheduleJob()` returns correct start/end times respecting `blocked_by` dependencies
- [ ] Steps with no `blocked_by` are scheduled from `startFrom`
- [ ] Steps that depend on another are scheduled after that step's `scheduledEnd`
- [ ] All scheduling tests pass

**Verify:** `npx jest src/lib/planning/__tests__/scheduling.test.ts` → PASS

**Steps:**

- [ ] **Step 1: Install Jest**

```bash
npm install -D jest @types/jest ts-jest
```

- [ ] **Step 2: Create jest.config.ts**

```typescript
import type { Config } from "jest";

const config: Config = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
};

export default config;
```

- [ ] **Step 3: Create shared types**

`src/lib/planning/types.ts`:
```typescript
export type RoutingStepStatus = "blocked" | "queued" | "active" | "complete" | "skipped";

export type BomLaborRow = {
  id: string;
  department_id: string;
  sequence: number;
  blocked_by: number[];
  operation_name: string;
  setup_hours: number;
  run_hours_per_unit: number;
};

export type ScheduledStep = {
  bomLaborId: string;
  departmentId: string;
  sequence: number;
  blockedBy: number[];
  operationName: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  initialStatus: RoutingStepStatus;
};
```

- [ ] **Step 4: Write the failing test**

`src/lib/planning/__tests__/scheduling.test.ts`:
```typescript
import { scheduleJob } from "../scheduling";
import type { BomLaborRow } from "../types";

const base = new Date("2026-05-10T08:00:00Z");

const steps: BomLaborRow[] = [
  {
    id: "a",
    department_id: "dept-weld",
    sequence: 1,
    blocked_by: [],
    operation_name: "Welding",
    setup_hours: 1,
    run_hours_per_unit: 2,
  },
  {
    id: "b",
    department_id: "dept-blast",
    sequence: 2,
    blocked_by: [1],
    operation_name: "Sandblasting",
    setup_hours: 0.5,
    run_hours_per_unit: 1,
  },
  {
    id: "c",
    department_id: "dept-cut",
    sequence: 3,
    blocked_by: [],
    operation_name: "Cutting",
    setup_hours: 0,
    run_hours_per_unit: 1,
  },
];

describe("scheduleJob", () => {
  it("schedules independent steps from startFrom", () => {
    const result = scheduleJob(steps, 2, base);
    const weld = result.find((s) => s.sequence === 1)!;
    const cut = result.find((s) => s.sequence === 3)!;
    expect(weld.scheduledStart).toEqual(base);
    expect(cut.scheduledStart).toEqual(base);
  });

  it("schedules dependent step after its blocker ends", () => {
    const result = scheduleJob(steps, 2, base);
    const weld = result.find((s) => s.sequence === 1)!;
    const blast = result.find((s) => s.sequence === 2)!;
    // weld: setup 1h + run 2h/unit × 2 = 5h total → ends base + 5h
    expect(blast.scheduledStart).toEqual(weld.scheduledEnd);
  });

  it("sets initialStatus=queued for steps with no blocked_by", () => {
    const result = scheduleJob(steps, 2, base);
    expect(result.find((s) => s.sequence === 1)!.initialStatus).toBe("queued");
    expect(result.find((s) => s.sequence === 3)!.initialStatus).toBe("queued");
  });

  it("sets initialStatus=blocked for steps with blocked_by", () => {
    const result = scheduleJob(steps, 2, base);
    expect(result.find((s) => s.sequence === 2)!.initialStatus).toBe("blocked");
  });
});
```

- [ ] **Step 5: Run test to confirm it fails**

```bash
npx jest src/lib/planning/__tests__/scheduling.test.ts
```
Expected: FAIL — `Cannot find module '../scheduling'`

- [ ] **Step 6: Implement scheduling.ts**

`src/lib/planning/scheduling.ts`:
```typescript
import type { BomLaborRow, ScheduledStep } from "./types";

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

/**
 * Greedy earliest-available scheduling.
 * Returns ScheduledStep[] sorted by sequence.
 * Steps with empty blocked_by are initialStatus='queued'.
 * Steps with non-empty blocked_by are initialStatus='blocked' — they
 * transition to 'queued' when their blockers complete (handled by unlock-cascade).
 */
export function scheduleJob(
  laborSteps: BomLaborRow[],
  quantity: number,
  startFrom: Date
): ScheduledStep[] {
  // Map sequence → scheduledEnd so dependents can look up their earliest start
  const completionBySeq = new Map<number, Date>();
  const sorted = [...laborSteps].sort((a, b) => a.sequence - b.sequence);

  return sorted.map((step) => {
    let earliestStart = startFrom;
    for (const seq of step.blocked_by) {
      const blockerEnd = completionBySeq.get(seq);
      if (blockerEnd && blockerEnd > earliestStart) {
        earliestStart = blockerEnd;
      }
    }

    const durationHours =
      step.setup_hours + step.run_hours_per_unit * quantity;
    const scheduledEnd = addHours(earliestStart, durationHours);
    completionBySeq.set(step.sequence, scheduledEnd);

    return {
      bomLaborId: step.id,
      departmentId: step.department_id,
      sequence: step.sequence,
      blockedBy: step.blocked_by,
      operationName: step.operation_name,
      scheduledStart: earliestStart,
      scheduledEnd,
      initialStatus: step.blocked_by.length === 0 ? "queued" : "blocked",
    };
  });
}
```

- [ ] **Step 7: Run test to confirm it passes**

```bash
npx jest src/lib/planning/__tests__/scheduling.test.ts
```
Expected: PASS — 4 tests pass

- [ ] **Step 8: Commit**

```bash
git add jest.config.ts src/lib/planning/
git commit -m "feat(planning): types + scheduling algorithm with tests"
```

---

### Task 4: Floor board — data fetching, department columns, job cards

**Goal:** Render the primary planning view — a server-fetched list of departments each showing their active/queued/blocked routing steps.

**Files:**
- Create: `src/app/app/planning/(gated)/floor/page.tsx`
- Create: `src/app/app/planning/(gated)/floor/floor-board.tsx`
- Create: `src/app/app/planning/(gated)/floor/job-card.tsx`
- Create: `src/app/app/planning/(gated)/floor/floor.module.css`

**Acceptance Criteria:**
- [ ] Page renders a column per active department
- [ ] Each column shows active steps (highlighted) then queued then blocked
- [ ] Blocked steps show a lock icon with which step they're waiting on
- [ ] Clicking a job card opens a detail drawer with order info and routing timeline
- [ ] Page is responsive — columns scroll horizontally on narrow screens

**Verify:** `npx tsc --noEmit` → 0 errors. Manually verify by enabling the module flag and visiting `/app/planning/floor`.

**Steps:**

- [ ] **Step 1: Create floor board CSS**

`src/app/app/planning/(gated)/floor/floor.module.css`:
```css
.page { display: flex; flex-direction: column; gap: 20px; height: 100%; }

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}
.header h1 { margin: 0; font-size: 1.6rem; color: var(--ink-strong); }

.board {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  padding-bottom: 16px;
  flex: 1;
  align-items: flex-start;
}

.column {
  flex-shrink: 0;
  width: 300px;
  border: 1px solid color-mix(in srgb, var(--stroke-strong) 60%, transparent);
  border-radius: 18px;
  background: color-mix(in srgb, var(--surface-raised) 80%, transparent);
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 200px);
}

.columnHeader {
  padding: 14px 16px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--stroke) 50%, transparent);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}
.columnName { font-size: 0.85rem; font-weight: 700; color: var(--ink-strong); }
.columnCount {
  font-size: 0.75rem;
  color: var(--ink-faint);
  background: color-mix(in srgb, var(--stroke) 30%, transparent);
  padding: 2px 8px;
  border-radius: 999px;
}

.columnBody { overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px; }

.card {
  border: 1px solid color-mix(in srgb, var(--stroke) 60%, transparent);
  border-radius: 14px;
  padding: 12px 14px;
  background: var(--bg-card);
  cursor: pointer;
  transition: border-color 0.15s;
}
.card:hover { border-color: color-mix(in srgb, var(--brand-2) 60%, transparent); }

.cardActive {
  border-color: color-mix(in srgb, var(--brand-2) 50%, transparent);
  background: color-mix(in srgb, var(--brand-2) 6%, var(--bg-card));
}
.cardBlocked { opacity: 0.55; }

.cardTop { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
.orderNum { font-size: 0.78rem; font-weight: 700; color: var(--ink-strong); }
.statusPip {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-top: 3px;
}
.statusPip[data-status="active"]  { background: #22c55e; }
.statusPip[data-status="queued"]  { background: color-mix(in srgb, var(--brand-2) 70%, transparent); }
.statusPip[data-status="blocked"] { background: var(--ink-faint); }

.cardOp { font-size: 0.82rem; color: var(--ink-muted); margin-top: 4px; }
.cardCustomer { font-size: 0.75rem; color: var(--ink-faint); margin-top: 6px; }

.lockRow {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-size: 0.72rem;
  color: var(--ink-faint);
}

.emptyCol {
  padding: 20px 14px;
  font-size: 0.82rem;
  color: var(--ink-faint);
  text-align: center;
}

/* Drawer */
.drawerOverlay {
  position: fixed; inset: 0; background: rgba(5,8,15,0.45); z-index: 100;
}
.drawer {
  position: fixed; top: 0; right: 0; bottom: 0; width: 420px;
  background: var(--surface-raised);
  border-left: 1px solid color-mix(in srgb, var(--stroke-strong) 60%, transparent);
  z-index: 101;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.drawerClose {
  position: absolute; top: 16px; right: 16px;
  background: none; border: none; color: var(--ink-faint);
  cursor: pointer; font-size: 1.2rem; line-height: 1;
}
.drawerTitle { font-size: 1.1rem; font-weight: 700; color: var(--ink-strong); }
.drawerMeta { font-size: 0.82rem; color: var(--ink-muted); display: flex; flex-direction: column; gap: 4px; }

.timeline { display: flex; flex-direction: column; gap: 0; margin-top: 8px; }
.timelineStep {
  display: flex; gap: 12px; align-items: flex-start;
  padding-bottom: 16px; position: relative;
}
.timelineStep:not(:last-child)::before {
  content: ''; position: absolute; left: 11px; top: 22px;
  width: 2px; bottom: 0;
  background: color-mix(in srgb, var(--stroke) 50%, transparent);
}
.timelineDot {
  width: 24px; height: 24px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.7rem; font-weight: 700;
}
.timelineDot[data-status="complete"]  { background: #22c55e; color: #fff; }
.timelineDot[data-status="active"]    { background: color-mix(in srgb, var(--brand-2) 80%, transparent); color: #fff; }
.timelineDot[data-status="queued"]    { background: color-mix(in srgb, var(--stroke) 60%, transparent); color: var(--ink-faint); }
.timelineDot[data-status="blocked"]   { background: color-mix(in srgb, var(--stroke) 40%, transparent); color: var(--ink-faint); }
.timelineDot[data-status="skipped"]   { background: var(--ink-faint); color: #fff; }

.timelineContent { flex: 1; }
.timelineOp { font-size: 0.85rem; font-weight: 600; color: var(--ink-strong); }
.timelineDept { font-size: 0.75rem; color: var(--ink-faint); }
.timelineTime { font-size: 0.72rem; color: var(--ink-faint); margin-top: 2px; }
```

- [ ] **Step 2: Create JobCard client component**

`src/app/app/planning/(gated)/floor/job-card.tsx`:
```tsx
"use client";

import styles from "./floor.module.css";

export type JobCardData = {
  id: string;
  orderNumber: string | null;
  customerName: string | null;
  productTitle: string;
  operationName: string;
  status: "blocked" | "queued" | "active";
  blockedBy: number[];
  scheduledStart: string | null;
};

type Props = {
  step: JobCardData;
  onClick: (stepId: string) => void;
};

export function JobCard({ step, onClick }: Props) {
  return (
    <div
      className={[
        styles.card,
        step.status === "active" ? styles.cardActive : "",
        step.status === "blocked" ? styles.cardBlocked : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => onClick(step.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick(step.id)}
    >
      <div className={styles.cardTop}>
        <span className={styles.orderNum}>{step.orderNumber ?? "—"}</span>
        <span className={styles.statusPip} data-status={step.status} />
      </div>
      <div className={styles.cardOp}>{step.operationName}</div>
      <div className={styles.cardOp} style={{ opacity: 0.7 }}>{step.productTitle}</div>
      {step.customerName && (
        <div className={styles.cardCustomer}>{step.customerName}</div>
      )}
      {step.status === "blocked" && step.blockedBy.length > 0 && (
        <div className={styles.lockRow}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
            <path d="M9 5V4a3 3 0 1 0-6 0v1H2v6h8V5H9zm-4-1a1 1 0 1 1 2 0v1H5V4z" opacity=".6"/>
          </svg>
          Waiting: step{step.blockedBy.length > 1 ? "s" : ""} {step.blockedBy.join(", ")}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create FloorBoard client component**

`src/app/app/planning/(gated)/floor/floor-board.tsx`:
```tsx
"use client";

import { useState } from "react";
import styles from "./floor.module.css";
import { JobCard, type JobCardData } from "./job-card";

export type DepartmentColumn = {
  id: string;
  name: string;
  steps: JobCardData[];
};

export type DrawerStep = {
  id: string;
  orderNumber: string | null;
  productTitle: string;
  orderLineParts: {
    id: string;
    sequence: number;
    operationName: string;
    departmentName: string;
    status: string;
    actualStart: string | null;
    actualEnd: string | null;
    scheduledStart: string | null;
    scheduledEnd: string | null;
  }[];
};

type Props = {
  columns: DepartmentColumn[];
  drawerSteps: Record<string, DrawerStep>;
};

export function FloorBoard({ columns, drawerSteps }: Props) {
  const [openStepId, setOpenStepId] = useState<string | null>(null);
  const drawer = openStepId ? drawerSteps[openStepId] : null;

  return (
    <>
      <div className={styles.board}>
        {columns.map((col) => (
          <div key={col.id} className={styles.column}>
            <div className={styles.columnHeader}>
              <span className={styles.columnName}>{col.name}</span>
              <span className={styles.columnCount}>{col.steps.length}</span>
            </div>
            <div className={styles.columnBody}>
              {col.steps.length === 0 ? (
                <div className={styles.emptyCol}>No active jobs</div>
              ) : (
                col.steps
                  .sort((a, b) => {
                    const order = { active: 0, queued: 1, blocked: 2 };
                    return order[a.status] - order[b.status];
                  })
                  .map((step) => (
                    <JobCard
                      key={step.id}
                      step={step}
                      onClick={setOpenStepId}
                    />
                  ))
              )}
            </div>
          </div>
        ))}
      </div>

      {drawer && (
        <>
          <div
            className={styles.drawerOverlay}
            onClick={() => setOpenStepId(null)}
          />
          <div className={styles.drawer}>
            <button
              className={styles.drawerClose}
              onClick={() => setOpenStepId(null)}
            >
              ✕
            </button>
            <div className={styles.drawerTitle}>
              {drawer.orderNumber ?? "Order"} — {drawer.productTitle}
            </div>
            <div className={styles.timeline}>
              {drawer.orderLineParts.map((part) => (
                <div key={part.id} className={styles.timelineStep}>
                  <div
                    className={styles.timelineDot}
                    data-status={part.status}
                  >
                    {part.sequence}
                  </div>
                  <div className={styles.timelineContent}>
                    <div className={styles.timelineOp}>{part.operationName}</div>
                    <div className={styles.timelineDept}>{part.departmentName}</div>
                    {part.actualStart && (
                      <div className={styles.timelineTime}>
                        Started{" "}
                        {new Date(part.actualStart).toLocaleString()}
                        {part.actualEnd &&
                          ` → ${new Date(part.actualEnd).toLocaleString()}`}
                      </div>
                    )}
                    {!part.actualStart && part.scheduledStart && (
                      <div className={styles.timelineTime}>
                        Scheduled{" "}
                        {new Date(part.scheduledStart).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
```

- [ ] **Step 4: Create floor board server page**

`src/app/app/planning/(gated)/floor/page.tsx`:
```tsx
import { getServerTenantContext } from "@/lib/tenant/context";
import { redirect } from "next/navigation";
import styles from "./floor.module.css";
import { FloorBoard, type DepartmentColumn, type DrawerStep } from "./floor-board";
import type { JobCardData } from "./job-card";

export default async function FloorBoardPage() {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/login");
  const { supabase } = ctx;

  // Fetch departments and their active/queued/blocked routing steps
  const [{ data: departments }, { data: routingSteps }] = await Promise.all([
    supabase
      .from("department")
      .select("id,name")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("job_routing_step")
      .select(`
        id, sequence, blocked_by, status, operation_name,
        scheduled_start, scheduled_end, actual_start, actual_end, priority,
        department_id,
        order_line:order_line_id (
          id, quantity, order_id,
          order:order_id ( id, order_number ),
          variant:variant_id (
            id, title,
            product:product_id ( id, title )
          )
        )
      `)
      .in("status", ["active", "queued", "blocked"])
      .order("priority", { ascending: true }),
  ]);

  // Group steps by department
  const stepsByDept = new Map<string, JobCardData[]>();
  const drawerSteps: Record<string, DrawerStep> = {};

  for (const step of routingSteps ?? []) {
    const ol = step.order_line as any;
    const order = ol?.order as any;
    const variant = ol?.variant as any;
    const product = variant?.product as any;

    const card: JobCardData = {
      id: step.id,
      orderNumber: order?.order_number ?? null,
      customerName: null, // populated from orders.customer_email when available
      productTitle: product?.title ?? variant?.title ?? "Product",
      operationName: step.operation_name,
      status: step.status as JobCardData["status"],
      blockedBy: step.blocked_by ?? [],
      scheduledStart: step.scheduled_start,
    };

    if (!stepsByDept.has(step.department_id)) {
      stepsByDept.set(step.department_id, []);
    }
    stepsByDept.get(step.department_id)!.push(card);

    drawerSteps[step.id] = {
      id: step.id,
      orderNumber: order?.order_number ?? null,
      productTitle: product?.title ?? variant?.title ?? "Product",
      orderLineParts: [], // populated below
    };
  }

  // For drawer: fetch all routing steps for order lines that have active jobs
  const activeOrderLineIds = [
    ...new Set((routingSteps ?? []).map((s: any) => s.order_line?.id).filter(Boolean)),
  ] as string[];

  if (activeOrderLineIds.length > 0) {
    const { data: allStepsForDrawer } = await supabase
      .from("job_routing_step")
      .select("id, order_line_id, sequence, operation_name, status, actual_start, actual_end, scheduled_start, scheduled_end, department:department_id(name)")
      .in("order_line_id", activeOrderLineIds)
      .order("sequence");

    // Attach to drawer entries
    for (const step of routingSteps ?? []) {
      const ol = step.order_line as any;
      if (!ol?.id) continue;
      const siblingSteps = (allStepsForDrawer ?? [])
        .filter((s: any) => s.order_line_id === ol.id)
        .map((s: any) => ({
          id: s.id,
          sequence: s.sequence,
          operationName: s.operation_name,
          departmentName: (s.department as any)?.name ?? "—",
          status: s.status,
          actualStart: s.actual_start,
          actualEnd: s.actual_end,
          scheduledStart: s.scheduled_start,
          scheduledEnd: s.scheduled_end,
        }));
      if (drawerSteps[step.id]) {
        drawerSteps[step.id].orderLineParts = siblingSteps;
      }
    }
  }

  const columns: DepartmentColumn[] = (departments ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    steps: stepsByDept.get(d.id) ?? [],
  }));

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Floor Board</h1>
      </div>
      <FloorBoard columns={columns} drawerSteps={drawerSteps} />
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/app/planning/
git commit -m "feat(planning): floor board — department columns, job cards, detail drawer"
```

---

### Task 5: Start job flow — modal and server action

**Goal:** Let a manager start a job for an order line, choosing auto-schedule or manual dates. Creates `job_routing_step` rows from the BOM labor operations.

**Files:**
- Create: `src/app/app/planning/(gated)/floor/actions.ts`
- Create: `src/app/app/planning/(gated)/floor/start-job-modal.tsx`
- Modify: `src/app/app/planning/(gated)/floor/page.tsx` (add unstarted orders panel + Start Job button)

**Acceptance Criteria:**
- [ ] `startJob` action creates one `job_routing_step` row per BOM labor operation per order line
- [ ] Steps with no `blocked_by` get status `queued`; steps with deps get status `blocked`
- [ ] Auto-schedule fills `scheduled_start`/`scheduled_end` using `scheduleJob()`
- [ ] Manual schedule uses dates provided by the manager
- [ ] After start, floor board reflects new steps without full page reload (revalidatePath)

**Verify:** `npx tsc --noEmit` → 0 errors. Manually start a job and confirm rows appear in `job_routing_step`.

**Steps:**

- [ ] **Step 1: Create start job server action**

`src/app/app/planning/(gated)/floor/actions.ts`:
```typescript
"use server";

import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";
import { scheduleJob } from "@/lib/planning/scheduling";

export async function startJob(formData: FormData) {
  const orderLineId = formData.get("order_line_id")?.toString() ?? "";
  const mode = formData.get("mode")?.toString() as "auto" | "manual";
  const manualDatesJson = formData.get("manual_dates")?.toString() ?? "{}";

  if (!orderLineId) return;

  const ctx = await getServerTenantContext();
  if (!ctx) return;
  const { supabase, tenantId } = ctx;

  // 1. Get the order line to find quantity and variant
  const { data: orderLine } = await supabase
    .from("order_line")
    .select("id, quantity, order_id, variant:variant_id(id, product_bom(id, product_bom_labor(*)))")
    .eq("id", orderLineId)
    .eq("tenant_id", tenantId)
    .single();

  if (!orderLine) return;

  const variant = (orderLine.variant as any);
  // Find active BOM
  const activeBom = (variant?.product_bom ?? []).find(
    (b: any) => b.is_active === true
  );
  if (!activeBom) return;

  const laborOps = (activeBom.product_bom_labor ?? []) as any[];
  if (laborOps.length === 0) return;

  const bomLaborRows = laborOps.map((op: any) => ({
    id: op.id,
    department_id: op.department_id,
    sequence: op.sequence,
    blocked_by: op.blocked_by ?? [],
    operation_name: op.operation_name,
    setup_hours: op.setup_hours ?? 0,
    run_hours_per_unit: op.run_hours_per_unit ?? 0,
  }));

  const startFrom = new Date();
  const scheduled = scheduleJob(bomLaborRows, Number(orderLine.quantity), startFrom);

  const manualDates: Record<number, { start: string; end: string }> =
    mode === "manual" ? JSON.parse(manualDatesJson) : {};

  const rows = scheduled.map((s) => {
    const manual = manualDates[s.sequence];
    return {
      tenant_id: tenantId,
      order_line_id: orderLineId,
      department_id: s.departmentId,
      bom_labor_id: s.bomLaborId,
      sequence: s.sequence,
      blocked_by: s.blockedBy,
      operation_name: s.operationName,
      status: s.initialStatus,
      scheduled_start: manual?.start ?? s.scheduledStart.toISOString(),
      scheduled_end: manual?.end ?? s.scheduledEnd.toISOString(),
      priority: s.sequence * 10,
    };
  });

  await supabase.from("job_routing_step").insert(rows);

  revalidatePath("/app/planning/floor");
}
```

- [ ] **Step 2: Create StartJobModal client component**

`src/app/app/planning/(gated)/floor/start-job-modal.tsx`:
```tsx
"use client";

import { useState, useTransition } from "react";
import { startJob } from "./actions";
import styles from "./floor.module.css";

type Props = {
  orderLineId: string;
  orderNumber: string;
  productTitle: string;
  onClose: () => void;
};

export function StartJobModal({ orderLineId, orderNumber, productTitle, onClose }: Props) {
  const [mode, setMode] = useState<"auto" | "manual">("auto");
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      await startJob(fd);
      onClose();
    });
  }

  return (
    <>
      <div className={styles.drawerOverlay} onClick={onClose} />
      <div className={styles.drawer}>
        <button className={styles.drawerClose} onClick={onClose}>✕</button>
        <div className={styles.drawerTitle}>Start Job</div>
        <div className={styles.drawerMeta}>
          <span>{orderNumber}</span>
          <span>{productTitle}</span>
        </div>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <input type="hidden" name="order_line_id" value={orderLineId} />
          <input type="hidden" name="mode" value={mode} />
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => setMode("auto")}
              style={{
                flex: 1, padding: "10px 0", borderRadius: 12, border: "1px solid",
                borderColor: mode === "auto" ? "var(--brand-2)" : "color-mix(in srgb, var(--stroke) 60%, transparent)",
                background: mode === "auto" ? "color-mix(in srgb, var(--brand-2) 10%, transparent)" : "transparent",
                color: "var(--ink-strong)", cursor: "pointer", fontWeight: mode === "auto" ? 700 : 400,
              }}
            >
              Auto-schedule
            </button>
            <button
              type="button"
              onClick={() => setMode("manual")}
              style={{
                flex: 1, padding: "10px 0", borderRadius: 12, border: "1px solid",
                borderColor: mode === "manual" ? "var(--brand-2)" : "color-mix(in srgb, var(--stroke) 60%, transparent)",
                background: mode === "manual" ? "color-mix(in srgb, var(--brand-2) 10%, transparent)" : "transparent",
                color: "var(--ink-strong)", cursor: "pointer", fontWeight: mode === "manual" ? 700 : 400,
              }}
            >
              Manual dates
            </button>
          </div>
          {mode === "auto" && (
            <p style={{ fontSize: "0.84rem", color: "var(--ink-muted)", margin: 0 }}>
              The system will schedule each step starting from now, respecting
              routing dependencies.
            </p>
          )}
          <button
            type="submit"
            disabled={pending}
            style={{
              minHeight: 42, padding: "0 24px", borderRadius: 999, border: "none",
              background: "linear-gradient(135deg, color-mix(in srgb, var(--brand-2) 72%, #142131), color-mix(in srgb, var(--brand-1) 88%, #0e1624))",
              color: "#f8fbff", fontWeight: 700, cursor: "pointer",
            }}
          >
            {pending ? "Starting…" : "Start Job"}
          </button>
        </form>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Add "unstarted jobs" panel and Start Job button to floor page**

In `src/app/app/planning/(gated)/floor/page.tsx`, before the `FloorBoard` render, add a query for unstarted order lines and pass them to a `StartJobButton` wrapper component. The simplest approach: add a floating "Start Job" button that opens the modal, seeded with orders that have no routing steps yet.

Add to the page query block:
```tsx
// Fetch order lines with no routing steps yet (unstarted jobs)
const { data: unstartedLines } = await supabase
  .from("order_line")
  .select(`
    id, quantity,
    order:order_id ( order_number ),
    variant:variant_id ( title, product:product_id ( title ) )
  `)
  .not(
    "id",
    "in",
    `(select distinct order_line_id from job_routing_step where tenant_id = '${ctx.tenantId}')`
  )
  .limit(50);
```

Note: The subquery approach above may need adjustment depending on Supabase client version. An alternative is to fetch all active routing step order_line_ids first, then exclude them client-side.

Add `UnstartedPanel` client component import and render it below the header in the page.

- [ ] **Step 4: Commit**

```bash
git add src/app/app/planning/
git commit -m "feat(planning): start job flow — modal, auto-schedule, routing step generation"
```

---

### Task 6: Step lifecycle — start, complete, and unlock cascade

**Goal:** Operators and managers can start and complete routing steps. Completing a step unlocks dependent steps and checks for notification triggers.

**Files:**
- Create: `src/lib/planning/unlock-cascade.ts`
- Create: `src/lib/planning/__tests__/unlock-cascade.test.ts`
- Modify: `src/app/app/planning/(gated)/floor/actions.ts` (add `startStep`, `completeStep`)

**Acceptance Criteria:**
- [ ] `completeStep` sets `actual_end`, moves status to `complete`
- [ ] `unlockCascade` finds all `blocked` steps for the order line whose `blocked_by` are now all complete, and sets them to `queued`
- [ ] `startStep` sets `actual_start`, moves status to `active`
- [ ] Tests for unlock cascade pass

**Verify:** `npx jest src/lib/planning/__tests__/unlock-cascade.test.ts` → PASS

**Steps:**

- [ ] **Step 1: Write failing test for unlock cascade**

`src/lib/planning/__tests__/unlock-cascade.test.ts`:
```typescript
import { computeUnlocked } from "../unlock-cascade";

describe("computeUnlocked", () => {
  it("returns steps whose all blockers are in completedSeqs", () => {
    const blocked = [
      { id: "b", sequence: 2, blocked_by: [1] },
      { id: "c", sequence: 3, blocked_by: [1, 2] },
      { id: "d", sequence: 4, blocked_by: [3] },
    ];
    const completedSeqs = new Set([1, 2]);
    const result = computeUnlocked(blocked, completedSeqs);
    expect(result.map((s) => s.id)).toEqual(["b", "c"]);
  });

  it("returns empty array when no steps are fully unblocked", () => {
    const blocked = [{ id: "b", sequence: 2, blocked_by: [1] }];
    const completedSeqs = new Set<number>();
    expect(computeUnlocked(blocked, completedSeqs)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
npx jest src/lib/planning/__tests__/unlock-cascade.test.ts
```
Expected: FAIL — `Cannot find module '../unlock-cascade'`

- [ ] **Step 3: Implement unlock-cascade.ts**

`src/lib/planning/unlock-cascade.ts`:
```typescript
type BlockedStep = { id: string; sequence: number; blocked_by: number[] };

/** Pure function — given blocked steps and completed sequences, return the ones now fully unblocked. */
export function computeUnlocked(
  blockedSteps: BlockedStep[],
  completedSeqs: Set<number>
): BlockedStep[] {
  return blockedSteps.filter((step) =>
    step.blocked_by.every((seq) => completedSeqs.has(seq))
  );
}

/**
 * Database-side: after a step is completed, unlock any steps that are now unblocked.
 * Returns the IDs of steps that were unlocked.
 */
export async function runUnlockCascade(
  supabase: any,
  tenantId: string,
  orderLineId: string
): Promise<string[]> {
  const [{ data: blocked }, { data: completed }] = await Promise.all([
    supabase
      .from("job_routing_step")
      .select("id, sequence, blocked_by")
      .eq("tenant_id", tenantId)
      .eq("order_line_id", orderLineId)
      .eq("status", "blocked"),
    supabase
      .from("job_routing_step")
      .select("sequence")
      .eq("tenant_id", tenantId)
      .eq("order_line_id", orderLineId)
      .eq("status", "complete"),
  ]);

  if (!blocked || blocked.length === 0) return [];

  const completedSeqs = new Set<number>((completed ?? []).map((s: any) => s.sequence));
  const toUnlock = computeUnlocked(blocked, completedSeqs);

  if (toUnlock.length === 0) return [];

  await supabase
    .from("job_routing_step")
    .update({ status: "queued", updated_at: new Date().toISOString() })
    .in("id", toUnlock.map((s) => s.id));

  return toUnlock.map((s) => s.id);
}
```

- [ ] **Step 4: Run test to confirm pass**

```bash
npx jest src/lib/planning/__tests__/unlock-cascade.test.ts
```
Expected: PASS — 2 tests pass

- [ ] **Step 5: Add startStep and completeStep to actions.ts**

Add to `src/app/app/planning/(gated)/floor/actions.ts`:
```typescript
export async function startStep(formData: FormData) {
  const stepId = formData.get("step_id")?.toString() ?? "";
  if (!stepId) return;

  const ctx = await getServerTenantContext();
  if (!ctx) return;
  const { supabase, tenantId } = ctx;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase
    .from("job_routing_step")
    .update({
      status: "active",
      actual_start: new Date().toISOString(),
      started_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", stepId)
    .eq("tenant_id", tenantId);

  revalidatePath("/app/planning/floor");
  revalidatePath("/app/planning/shopfloor");
}

export async function completeStep(formData: FormData) {
  const stepId = formData.get("step_id")?.toString() ?? "";
  if (!stepId) return;

  const ctx = await getServerTenantContext();
  if (!ctx) return;
  const { supabase, tenantId } = ctx;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 1. Mark this step complete
  const { data: completedStep } = await supabase
    .from("job_routing_step")
    .update({
      status: "complete",
      actual_end: new Date().toISOString(),
      completed_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", stepId)
    .eq("tenant_id", tenantId)
    .select("order_line_id")
    .single();

  if (!completedStep) return;

  // 2. Unlock dependent steps
  await runUnlockCascade(supabase, tenantId, completedStep.order_line_id);

  // 3. TODO Task 8: fire notification if trigger exists for this step

  revalidatePath("/app/planning/floor");
  revalidatePath("/app/planning/shopfloor");
}
```

Add the import at the top of actions.ts:
```typescript
import { runUnlockCascade } from "@/lib/planning/unlock-cascade";
```

- [ ] **Step 6: Commit**

```bash
git add src/lib/planning/ src/app/app/planning/
git commit -m "feat(planning): step lifecycle — start, complete, unlock cascade"
```

---

### Task 7: Shop floor app

**Goal:** A mobile-optimised, full-screen page at `/app/planning/shopfloor` for operators. Shows the current department's queue with Start and Complete buttons.

**Files:**
- Create: `src/app/app/planning/(gated)/shopfloor/page.tsx`
- Create: `src/app/app/planning/(gated)/shopfloor/operator-queue.tsx`
- Create: `src/app/app/planning/(gated)/shopfloor/shopfloor.module.css`

**Acceptance Criteria:**
- [ ] Page renders without sidebar at mobile viewport
- [ ] Operator selects department (saved to localStorage)
- [ ] Queue shows active jobs highlighted, then queued, then blocked (disabled)
- [ ] Start and Complete buttons call `startStep` / `completeStep` and refresh queue
- [ ] Manager PIN button (PIN = "1234" hardcoded initially) reveals an override menu

**Verify:** `npx tsc --noEmit` → 0 errors. Open `/app/planning/shopfloor` on mobile viewport in browser devtools.

**Steps:**

- [ ] **Step 1: Create shop floor CSS**

`src/app/app/planning/(gated)/shopfloor/shopfloor.module.css`:
```css
.shell {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--surface);
  color: var(--ink-strong);
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid color-mix(in srgb, var(--stroke) 50%, transparent);
  flex-shrink: 0;
}
.deptLabel { font-size: 1rem; font-weight: 700; }
.managerBtn {
  padding: 8px 16px; border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--stroke) 60%, transparent);
  background: transparent; color: var(--ink-muted);
  font-size: 0.82rem; cursor: pointer;
}
.queue { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
.card {
  border: 1px solid color-mix(in srgb, var(--stroke) 60%, transparent);
  border-radius: 18px; padding: 16px 18px;
  background: var(--bg-card);
}
.cardActive { border-color: color-mix(in srgb, var(--brand-2) 60%, transparent); }
.cardBlocked { opacity: 0.5; pointer-events: none; }
.cardTop { display: flex; justify-content: space-between; align-items: center; }
.orderNum { font-size: 1rem; font-weight: 700; }
.statusBadge {
  font-size: 0.72rem; font-weight: 700; padding: 4px 10px;
  border-radius: 999px; text-transform: uppercase;
}
.statusBadge[data-status="active"]  { background: color-mix(in srgb, #22c55e 20%, transparent); color: #16a34a; }
.statusBadge[data-status="queued"]  { background: color-mix(in srgb, var(--brand-2) 16%, transparent); color: color-mix(in srgb, var(--brand-2) 70%, white); }
.statusBadge[data-status="blocked"] { background: color-mix(in srgb, var(--stroke) 30%, transparent); color: var(--ink-faint); }
.cardOp { margin-top: 6px; font-size: 0.9rem; color: var(--ink-muted); }
.cardProduct { font-size: 0.82rem; color: var(--ink-faint); margin-top: 2px; }
.lockNote { font-size: 0.75rem; color: var(--ink-faint); margin-top: 8px; }
.actions { display: flex; gap: 10px; margin-top: 14px; }
.btnStart {
  flex: 1; min-height: 48px; border-radius: 14px; border: none;
  background: color-mix(in srgb, var(--brand-2) 20%, transparent);
  color: color-mix(in srgb, var(--brand-2) 80%, white);
  font-size: 0.9rem; font-weight: 700; cursor: pointer;
}
.btnComplete {
  flex: 1; min-height: 48px; border-radius: 14px; border: none;
  background: color-mix(in srgb, #22c55e 20%, transparent);
  color: #15803d; font-size: 0.9rem; font-weight: 700; cursor: pointer;
}
.deptPicker {
  padding: 40px 20px; display: flex; flex-direction: column; gap: 16px;
}
.deptPicker h2 { margin: 0; font-size: 1.3rem; }
.deptBtn {
  padding: 16px 20px; border-radius: 16px;
  border: 1px solid color-mix(in srgb, var(--stroke) 60%, transparent);
  background: var(--bg-card); color: var(--ink-strong);
  font-size: 1rem; font-weight: 600; text-align: left; cursor: pointer;
}
```

- [ ] **Step 2: Create OperatorQueue client component**

`src/app/app/planning/(gated)/shopfloor/operator-queue.tsx`:
```tsx
"use client";

import { useState, useTransition, useEffect } from "react";
import { startStep, completeStep } from "../floor/actions";
import styles from "./shopfloor.module.css";

type StepItem = {
  id: string;
  orderNumber: string | null;
  productTitle: string;
  operationName: string;
  status: "active" | "queued" | "blocked";
  blockedBy: number[];
};

type Department = { id: string; name: string };

type Props = {
  departments: Department[];
  stepsByDept: Record<string, StepItem[]>;
};

const MANAGER_PIN = "1234";

export function OperatorQueue({ departments, stepsByDept }: Props) {
  const [deptId, setDeptId] = useState<string | null>(null);
  const [managerMode, setManagerMode] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const saved = localStorage.getItem("shopfloor_dept");
    if (saved) setDeptId(saved);
  }, []);

  function selectDept(id: string) {
    localStorage.setItem("shopfloor_dept", id);
    setDeptId(id);
  }

  function handleManagerPin() {
    const pin = window.prompt("Enter manager PIN:");
    if (pin === MANAGER_PIN) setManagerMode(true);
    else window.alert("Incorrect PIN.");
  }

  function handleStart(stepId: string) {
    const fd = new FormData();
    fd.set("step_id", stepId);
    startTransition(() => startStep(fd));
  }

  function handleComplete(stepId: string) {
    const fd = new FormData();
    fd.set("step_id", stepId);
    startTransition(() => completeStep(fd));
  }

  const dept = departments.find((d) => d.id === deptId);
  const steps = deptId ? (stepsByDept[deptId] ?? []) : [];

  if (!deptId) {
    return (
      <div className={styles.deptPicker}>
        <h2>Select your department</h2>
        {departments.map((d) => (
          <button key={d.id} className={styles.deptBtn} onClick={() => selectDept(d.id)}>
            {d.name}
          </button>
        ))}
      </div>
    );
  }

  const sorted = [...steps].sort((a, b) => {
    const order = { active: 0, queued: 1, blocked: 2 };
    return order[a.status] - order[b.status];
  });

  return (
    <div className={styles.shell}>
      <div className={styles.topbar}>
        <span className={styles.deptLabel}>{dept?.name}</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={styles.managerBtn} onClick={() => setDeptId(null)}>
            Change dept
          </button>
          {!managerMode && (
            <button className={styles.managerBtn} onClick={handleManagerPin}>
              Manager
            </button>
          )}
        </div>
      </div>

      <div className={styles.queue}>
        {sorted.length === 0 && (
          <p style={{ color: "var(--ink-faint)", textAlign: "center", marginTop: 40 }}>
            No jobs in queue.
          </p>
        )}
        {sorted.map((step) => (
          <div
            key={step.id}
            className={[
              styles.card,
              step.status === "active" ? styles.cardActive : "",
              step.status === "blocked" ? styles.cardBlocked : "",
            ].filter(Boolean).join(" ")}
          >
            <div className={styles.cardTop}>
              <span className={styles.orderNum}>{step.orderNumber ?? "—"}</span>
              <span className={styles.statusBadge} data-status={step.status}>
                {step.status}
              </span>
            </div>
            <div className={styles.cardOp}>{step.operationName}</div>
            <div className={styles.cardProduct}>{step.productTitle}</div>
            {step.status === "blocked" && (
              <div className={styles.lockNote}>
                Waiting on step{step.blockedBy.length > 1 ? "s" : ""} {step.blockedBy.join(", ")}
              </div>
            )}
            <div className={styles.actions}>
              {step.status === "queued" && (
                <button
                  className={styles.btnStart}
                  onClick={() => handleStart(step.id)}
                  disabled={pending}
                >
                  Start
                </button>
              )}
              {(step.status === "active" || managerMode) && (
                <button
                  className={styles.btnComplete}
                  onClick={() => handleComplete(step.id)}
                  disabled={pending}
                >
                  Complete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create shop floor server page**

`src/app/app/planning/(gated)/shopfloor/page.tsx`:
```tsx
import { getServerTenantContext } from "@/lib/tenant/context";
import { redirect } from "next/navigation";
import { OperatorQueue } from "./operator-queue";

export default async function ShopFloorPage() {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/login");
  const { supabase } = ctx;

  const [{ data: departments }, { data: routingSteps }] = await Promise.all([
    supabase.from("department").select("id,name").eq("is_active", true).order("name"),
    supabase
      .from("job_routing_step")
      .select(`
        id, sequence, blocked_by, status, operation_name, department_id,
        order_line:order_line_id (
          order:order_id ( order_number ),
          variant:variant_id ( title, product:product_id ( title ) )
        )
      `)
      .in("status", ["active", "queued", "blocked"])
      .order("priority", { ascending: true }),
  ]);

  const stepsByDept: Record<string, any[]> = {};
  for (const step of routingSteps ?? []) {
    const ol = step.order_line as any;
    const order = ol?.order as any;
    const variant = ol?.variant as any;
    const product = variant?.product as any;

    if (!stepsByDept[step.department_id]) stepsByDept[step.department_id] = [];
    stepsByDept[step.department_id].push({
      id: step.id,
      orderNumber: order?.order_number ?? null,
      productTitle: product?.title ?? variant?.title ?? "Product",
      operationName: step.operation_name,
      status: step.status,
      blockedBy: step.blocked_by ?? [],
    });
  }

  return (
    <OperatorQueue
      departments={departments ?? []}
      stepsByDept={stepsByDept}
    />
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/app/planning/
git commit -m "feat(planning): shop floor app — operator queue, start/complete, manager PIN"
```

---

### Task 8: Customer notification engine

**Goal:** Install Resend and implement the notification engine that fires when a routing step is completed and a `product_notification_trigger` exists for that BOM × sequence.

**Files:**
- Create: `src/lib/notifications/notification-engine.ts`
- Modify: `src/app/app/planning/(gated)/floor/actions.ts` (wire notification into `completeStep`)

**Acceptance Criteria:**
- [ ] `fireNotificationIfConfigured()` queries `product_notification_trigger` for the BOM and sequence
- [ ] If found, renders the template and sends via Resend
- [ ] Logs result to `notification_log`
- [ ] If `customer_email` is null on the order, skips silently
- [ ] If Resend call fails, sets `delivery_status = 'failed'` in log (does not throw)

**Verify:** `npx tsc --noEmit` → 0 errors. Set `RESEND_API_KEY` in `.env.local`, trigger a complete action, check `notification_log` table.

**Steps:**

- [ ] **Step 1: Install Resend**

```bash
npm install resend
```

Add to `.env.local`:
```
RESEND_API_KEY=re_your_key_here
```

- [ ] **Step 2: Create notification engine**

`src/lib/notifications/notification-engine.ts`:
```typescript
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

type FireParams = {
  supabase: any;
  tenantId: string;
  stepId: string;
  orderLineId: string;
};

export async function fireNotificationIfConfigured({
  supabase,
  tenantId,
  stepId,
  orderLineId,
}: FireParams): Promise<void> {
  // 1. Get the completed step with its BOM info and order customer email
  const { data: step } = await supabase
    .from("job_routing_step")
    .select(`
      sequence, operation_name,
      bom_labor:bom_labor_id ( product_bom_id ),
      order_line:order_line_id (
        order:order_id ( id, order_number, customer_email ),
        variant:variant_id ( title, product:product_id ( title ) )
      )
    `)
    .eq("id", stepId)
    .single();

  if (!step) return;

  const bomLaborInfo = step.bom_labor as any;
  const productBomId: string | null = bomLaborInfo?.product_bom_id ?? null;
  if (!productBomId) return;

  const ol = step.order_line as any;
  const order = ol?.order as any;
  const customerEmail: string | null = order?.customer_email ?? null;
  if (!customerEmail) return;

  const variant = ol?.variant as any;
  const product = variant?.product as any;

  // 2. Check for a notification trigger for this BOM + sequence
  const { data: trigger } = await supabase
    .from("product_notification_trigger")
    .select("id, message_template, channel")
    .eq("tenant_id", tenantId)
    .eq("product_bom_id", productBomId)
    .eq("routing_sequence", step.sequence)
    .maybeSingle();

  if (!trigger) return;

  // 3. Render template
  const vars: Record<string, string> = {
    product_name: product?.title ?? variant?.title ?? "your product",
    order_number: order?.order_number ?? "",
    department_name: step.operation_name,
    customer_first_name: "", // extend when customer table has name
  };
  const body = renderTemplate(trigger.message_template, vars);
  const subject = `Update on your order ${order?.order_number ?? ""}`;

  // 4. Send and log
  let deliveryStatus: "sent" | "failed" = "sent";
  try {
    await resend.emails.send({
      from: "Manuva <noreply@manuva.app>",
      to: customerEmail,
      subject,
      html: `<p>${body}</p>`,
    });
  } catch {
    deliveryStatus = "failed";
  }

  await supabase.from("notification_log").insert({
    tenant_id: tenantId,
    order_id: order?.id,
    order_line_id: orderLineId,
    trigger_id: trigger.id,
    channel: trigger.channel,
    recipient: customerEmail,
    delivery_status: deliveryStatus,
  });
}
```

- [ ] **Step 3: Wire into completeStep action**

In `src/app/app/planning/(gated)/floor/actions.ts`, replace the `// 3. TODO Task 8` comment in `completeStep` with:

```typescript
  // 3. Fire notification if trigger configured for this step
  await fireNotificationIfConfigured({
    supabase,
    tenantId,
    stepId,
    orderLineId: completedStep.order_line_id,
  });
```

Add the import at the top:
```typescript
import { fireNotificationIfConfigured } from "@/lib/notifications/notification-engine";
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/notifications/ src/app/app/planning/
git commit -m "feat(planning): customer notification engine — Resend integration, trigger on step complete"
```

---

### Task 9: Product notification trigger configuration UI

**Goal:** Add a "Notifications" tab to the variant detail page where admins can configure which routing steps trigger a customer notification and what the message says.

**Files:**
- Modify: `src/app/app/products/variant-tabs.tsx`
- Modify: `src/app/app/products/variants/[variantId]/page.tsx`
- Create: `src/app/app/products/variants/[variantId]/notifications-tab.tsx`
- Modify: `src/app/app/products/actions.ts` (add upsert/delete notification trigger actions)

**Acceptance Criteria:**
- [ ] "Notifications" tab appears in the variant detail page tab bar
- [ ] Tab lists all BOM labor steps for the active BOM with a toggle and message template input per step
- [ ] Saving creates or updates a `product_notification_trigger` row
- [ ] Deleting (toggling off) removes the trigger row
- [ ] Admin only — hidden for non-admin roles

**Verify:** `npx tsc --noEmit` → 0 errors. Visit a variant detail page, click Notifications tab, configure a trigger, verify row in `product_notification_trigger`.

**Steps:**

- [ ] **Step 1: Read variant-tabs.tsx to understand current structure**

Read `src/app/app/products/variant-tabs.tsx` to see the exact `Tab` type and `TAB_LABELS`. The current tabs are `"overview" | "bom" | "routing" | "versions"`.

- [ ] **Step 2: Add "notifications" to the Tab type**

In `src/app/app/products/variant-tabs.tsx`, extend:
```typescript
export type Tab = "overview" | "bom" | "routing" | "versions" | "notifications";
```

Add to `TAB_LABELS` (or equivalent object):
```typescript
notifications: "Notifications",
```

Add to `VALID_TABS`:
```typescript
"notifications",
```

Add a `notifications` prop to the component that accepts `ReactNode` (matching the existing pattern for other tabs) and render it when the active tab is `"notifications"`.

- [ ] **Step 3: Create notification trigger server actions**

Add to `src/app/app/products/actions.ts`:
```typescript
export async function upsertNotificationTrigger(formData: FormData) {
  const productBomId = formData.get("product_bom_id")?.toString() ?? "";
  const routingSequence = parseInt(formData.get("routing_sequence")?.toString() ?? "0");
  const messageTemplate = formData.get("message_template")?.toString() ?? "";

  if (!productBomId || !routingSequence || !messageTemplate) return;

  const ctx = await getServerTenantContext();
  if (!ctx) return;
  const { supabase, tenantId } = ctx;

  await supabase.from("product_notification_trigger").upsert(
    {
      tenant_id: tenantId,
      product_bom_id: productBomId,
      routing_sequence: routingSequence,
      message_template: messageTemplate,
      channel: "email",
    },
    { onConflict: "tenant_id,product_bom_id,routing_sequence" }
  );

  revalidatePath(`/app/products`);
}

export async function deleteNotificationTrigger(formData: FormData) {
  const triggerId = formData.get("trigger_id")?.toString() ?? "";
  if (!triggerId) return;

  const ctx = await getServerTenantContext();
  if (!ctx) return;
  const { supabase, tenantId } = ctx;

  await supabase
    .from("product_notification_trigger")
    .delete()
    .eq("id", triggerId)
    .eq("tenant_id", tenantId);

  revalidatePath(`/app/products`);
}
```

Add `revalidatePath` import if not already present.

- [ ] **Step 4: Create NotificationsTab component**

`src/app/app/products/variants/[variantId]/notifications-tab.tsx`:
```tsx
import { upsertNotificationTrigger, deleteNotificationTrigger } from "../../actions";

type LaborStep = {
  id: string;
  sequence: number;
  operation_name: string;
  department: { name: string } | null;
};

type Trigger = {
  id: string;
  routing_sequence: number;
  message_template: string;
};

type Props = {
  productBomId: string;
  laborSteps: LaborStep[];
  triggers: Trigger[];
};

export function NotificationsTab({ productBomId, laborSteps, triggers }: Props) {
  const triggerBySeq = new Map(triggers.map((t) => [t.routing_sequence, t]));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "8px 0" }}>
      <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--ink-muted)" }}>
        Configure which routing steps send a customer notification. Use{" "}
        <code>{"{{product_name}}"}</code>, <code>{"{{order_number}}"}</code>,{" "}
        <code>{"{{department_name}}"}</code>, <code>{"{{customer_first_name}}"}</code>.
      </p>
      {laborSteps.map((step) => {
        const existing = triggerBySeq.get(step.sequence);
        return (
          <div
            key={step.id}
            style={{
              border: "1px solid color-mix(in srgb, var(--stroke) 60%, transparent)",
              borderRadius: 14,
              padding: "14px 16px",
            }}
          >
            <div style={{ fontWeight: 700, fontSize: "0.88rem", marginBottom: 8 }}>
              Step {step.sequence}: {step.operation_name}
              {step.department && (
                <span style={{ fontWeight: 400, color: "var(--ink-faint)", marginLeft: 8 }}>
                  ({step.department.name})
                </span>
              )}
            </div>
            {existing ? (
              <form style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <input type="hidden" name="product_bom_id" value={productBomId} />
                <input type="hidden" name="routing_sequence" value={step.sequence} />
                <textarea
                  name="message_template"
                  defaultValue={existing.message_template}
                  rows={2}
                  style={{
                    width: "100%", borderRadius: 10,
                    border: "1px solid color-mix(in srgb, var(--stroke) 60%, transparent)",
                    padding: "8px 12px", background: "var(--surface)", color: "var(--ink-strong)",
                    font: "inherit", resize: "vertical",
                  }}
                />
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    formAction={upsertNotificationTrigger}
                    style={{ padding: "8px 16px", borderRadius: 999, border: "none",
                      background: "color-mix(in srgb, var(--brand-2) 20%, transparent)",
                      color: "color-mix(in srgb, var(--brand-2) 80%, white)",
                      fontWeight: 700, cursor: "pointer", fontSize: "0.82rem" }}
                  >
                    Save
                  </button>
                  <form>
                    <input type="hidden" name="trigger_id" value={existing.id} />
                    <button
                      formAction={deleteNotificationTrigger}
                      style={{ padding: "8px 16px", borderRadius: 999, border: "none",
                        background: "color-mix(in srgb, var(--stroke) 30%, transparent)",
                        color: "var(--ink-muted)", cursor: "pointer", fontSize: "0.82rem" }}
                    >
                      Remove
                    </button>
                  </form>
                </div>
              </form>
            ) : (
              <form style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <input type="hidden" name="product_bom_id" value={productBomId} />
                <input type="hidden" name="routing_sequence" value={step.sequence} />
                <textarea
                  name="message_template"
                  placeholder={`Hi {{customer_first_name}}, your {{product_name}} is now in ${step.operation_name.toLowerCase()}.`}
                  rows={2}
                  style={{
                    width: "100%", borderRadius: 10,
                    border: "1px solid color-mix(in srgb, var(--stroke) 60%, transparent)",
                    padding: "8px 12px", background: "var(--surface)", color: "var(--ink-strong)",
                    font: "inherit", resize: "vertical",
                  }}
                />
                <button
                  formAction={upsertNotificationTrigger}
                  style={{ padding: "8px 16px", borderRadius: 999, border: "none",
                    background: "color-mix(in srgb, var(--brand-2) 20%, transparent)",
                    color: "color-mix(in srgb, var(--brand-2) 80%, white)",
                    fontWeight: 700, cursor: "pointer", fontSize: "0.82rem", width: "fit-content" }}
                >
                  Enable notification
                </button>
              </form>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: Wire into variant detail page**

In `src/app/app/products/variants/[variantId]/page.tsx`:

1. Add to the existing data fetch (inside the Promise.all or after):
```typescript
// Fetch notification triggers for the active BOM
const activeBomId = activeBom?.id ?? null;
const { data: notifTriggers } = activeBomId
  ? await supabase
      .from("product_notification_trigger")
      .select("id, routing_sequence, message_template")
      .eq("product_bom_id", activeBomId)
  : { data: [] };
```

2. Import and render the `NotificationsTab` component, passing it to the `notifications` prop of `VariantTabs`.

- [ ] **Step 6: Commit**

```bash
git add src/app/app/products/
git commit -m "feat(planning): product notification trigger UI — Notifications tab on variant detail"
```

---

### Task 10: BOM routing dependency configuration

**Goal:** Let admins set `blocked_by` on each BOM labor operation — which steps must complete before this one can start. UI in the existing "Labour & Routing" tab on the variant detail page.

**Files:**
- Modify: `src/app/app/products/variants/[variantId]/page.tsx` (render `blocked_by` select in routing tab)
- Modify: `src/app/app/products/actions.ts` (update `updateBomLaborLine` to accept `blocked_by`)

**Acceptance Criteria:**
- [ ] Each labor row in the routing tab shows a multi-select of other steps that it depends on
- [ ] Saving updates `product_bom_labor.blocked_by` array in the database
- [ ] A step cannot depend on itself (its own sequence filtered out)

**Verify:** `npx tsc --noEmit` → 0 errors. Add a dependency, confirm `blocked_by` column updated in Supabase.

**Steps:**

- [ ] **Step 1: Explore the routing tab UI**

Read `src/app/app/products/variants/[variantId]/page.tsx` lines 515–639 to understand the exact structure of the routing tab form. Identify: the form component/action used for updating labor rows, and the existing input fields.

- [ ] **Step 2: Update updateBomLaborLine server action**

In `src/app/app/products/actions.ts`, find the `updateBomLaborLine` function (or equivalent). Add `blocked_by` to the update payload:

```typescript
// Inside updateBomLaborLine, add to the update object:
blocked_by: JSON.parse(formData.get("blocked_by")?.toString() ?? "[]") as number[],
```

- [ ] **Step 3: Add blocked_by selector to routing tab form**

In the routing tab form for each labor row, add a field after the existing inputs. Pass `laborSteps` (the full list for this BOM) so each row can show the others as options:

```tsx
{/* Inside the labor row edit form */}
<div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
  <label style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", color: "var(--ink-faint)" }}>
    Blocked by steps
  </label>
  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
    {laborSteps
      .filter((other) => other.sequence !== currentStep.sequence)
      .map((other) => {
        const isChecked = (currentStep.blocked_by ?? []).includes(other.sequence);
        return (
          <label key={other.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.84rem" }}>
            <input
              type="checkbox"
              name={`dep_${other.sequence}`}
              defaultChecked={isChecked}
            />
            Step {other.sequence}: {other.operation_name}
          </label>
        );
      })}
  </div>
  {/* Serialize checked sequences to hidden input before submit */}
</div>
```

Note: Because HTML forms don't natively serialize checkbox groups to JSON arrays, add a small client-side script or use a hidden input. The simplest approach: convert the form to a client component for this tab, collect the checked sequences, and serialize to the `blocked_by` hidden input as JSON on submit.

Alternatively, use individual hidden inputs with name `blocked_by[]` and parse them as an array in the action:
```typescript
// In the action:
const blockedByRaw = formData.getAll("blocked_by[]").map(Number);
```

- [ ] **Step 4: Commit**

```bash
git add src/app/app/products/
git commit -m "feat(planning): BOM routing dependencies — blocked_by config in routing tab"
```

---

## Self-Review

### Spec coverage check

| Spec requirement | Task(s) |
|---|---|
| `tenant.has_planning_module` gate | Task 1 + Task 2 |
| Route group gating + upgrade page | Task 2 |
| Sidebar nav conditional Planning link | Task 2 |
| `job_routing_step` table | Task 1 |
| `product_notification_trigger` table | Task 1 |
| `notification_log` table | Task 1 |
| `blocked_by` on `product_bom_labor` | Task 1 + Task 10 |
| Floor board — department columns, job cards | Task 4 |
| Job detail drawer with routing timeline | Task 4 |
| Start Job modal — auto/manual scheduling | Task 5 |
| Greedy scheduling algorithm | Task 3 |
| Step start / complete / unlock cascade | Task 6 |
| Shop floor app — operator queue, Start/Complete | Task 7 |
| Manager PIN override on shop floor | Task 7 |
| Notification engine — Resend + template render | Task 8 |
| Notification log | Task 8 |
| Product notification trigger config UI | Task 9 |
| BOM dependency config UI | Task 10 |
| Schedule/Gantt tab | **Phase 2 — separate plan** |

### Type consistency check

- `RoutingStepStatus` defined in `types.ts` — used in `scheduling.ts`, `unlock-cascade.ts`, `floor-board.tsx`, `operator-queue.tsx`. Consistent.
- `BomLaborRow` defined in `types.ts` — used in `scheduling.ts` and `scheduleJob()` call in `actions.ts`. Consistent.
- `blocked_by int[]` — used in schema, `scheduleJob()`, `computeUnlocked()`, and floor board rendering. Consistent.
- `completeStep` calls `runUnlockCascade(supabase, tenantId, orderLineId)` — matches signature in `unlock-cascade.ts`. Consistent.
- `fireNotificationIfConfigured` called with `{ supabase, tenantId, stepId, orderLineId }` — matches the `FireParams` type. Consistent.

### Notes for implementer

- **`orders.customer_email`**: Added in Task 1 migration. The Shopify sync (separate scope) needs updating to write this column. Until then, notifications will silently skip — which is safe.
- **Unstarted jobs panel** (Task 5 Step 3): The subquery approach for excluding started order lines may need adjustment. An alternative: fetch all `job_routing_step.order_line_id` distinct values first, then filter in a second query.
- **Manager PIN** (Task 7): Hardcoded as `"1234"` for now. Replace with a per-tenant configurable PIN in a follow-up.
- **`product_id` on `shopify_variant`**: Confirmed as `product_id → shopify_product`. The join `variant:variant_id(title, product:product_id(title))` is correct.
