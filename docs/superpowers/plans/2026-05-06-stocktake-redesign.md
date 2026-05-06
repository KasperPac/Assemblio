# Stocktake Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the stocktake feature with multi-page navigation, bin-location grouping, pre-loaded component lines, initial stock count wizard, blind count mode, variance reconciliation with reason codes, print sheets, and CSV import/export.

**Architecture:** The single `/app/stocktake` page splits into a list page and a session detail page (`/app/stocktake/[sessionId]`). Sessions auto-populate all component lines on creation. A new `stocktake_variance_reason` table seeds defaults per tenant. Bin location (`bin_sub_location`, `bin_row`, `bin_bay`) is stored on the `component` row and used for grouping in the counting UI. The existing `apply_stocktake_session` RPC is reused without modification — initial sessions transition to `approved` in the server action before calling it.

**Tech Stack:** Next.js 15 App Router (server components + server actions), Supabase/PostgREST, Vitest, CSS Modules.

---

### Task 0: Schema migration

**Goal:** Add all new columns and tables required by the redesign, and seed default variance reasons for existing tenants.

**Files:**
- Create: `supabase/patches/stocktake_redesign_schema.sql`

**Acceptance Criteria:**
- [ ] `stocktake_session` has new columns: `reference_number`, `session_type`, `notes`, `blind_count`, `approved_by`, `approved_at`
- [ ] `stocktake_line` has new columns: `notes`, `counted_by`, `counted_at`, `variance_reason_id`
- [ ] `component` has new columns: `bin_sub_location`, `bin_row`, `bin_bay`
- [ ] `stocktake_variance_reason` table exists with default reasons for all existing tenants
- [ ] New status values `draft`, `counting`, `reconciliation` are valid in the DB check constraint
- [ ] `stocktake_session.reference_number` is unique per tenant

**Verify:** Apply the patch to the local Supabase instance: `npx supabase db push` or paste into the Supabase SQL editor. Confirm all tables and columns exist.

**Steps:**

- [ ] **Step 1: Write the SQL patch**

Create `supabase/patches/stocktake_redesign_schema.sql`:

```sql
-- stocktake_redesign_schema.sql
-- Adds: new session/line columns, variance_reason table,
--       bin location on component, updated status check constraint.

-- 1. Extend stocktake_session status check to include new values
alter table public.stocktake_session
  drop constraint if exists stocktake_session_status_check;

alter table public.stocktake_session
  add constraint stocktake_session_status_check
  check (status in ('draft','open','counting','reconciliation','approved','completed','locked','archived'));

-- 2. New columns on stocktake_session
alter table public.stocktake_session
  add column if not exists reference_number text,
  add column if not exists session_type     text not null default 'full'
    check (session_type in ('initial','full')),
  add column if not exists notes            text,
  add column if not exists blind_count      boolean not null default false,
  add column if not exists approved_by      uuid references public.profiles(id),
  add column if not exists approved_at      timestamptz;

-- Unique reference_number per tenant (nulls allowed for old rows)
create unique index if not exists stocktake_session_reference_number_tenant_uniq
  on public.stocktake_session (tenant_id, reference_number)
  where reference_number is not null;

-- 3. variance_reason lookup table
create table if not exists public.stocktake_variance_reason (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants(id) on delete cascade,
  name       text not null,
  sort_order int  not null default 0,
  created_at timestamptz not null default now()
);

alter table public.stocktake_variance_reason enable row level security;

create policy "tenant isolation" on public.stocktake_variance_reason
  using (tenant_id = (select tenant_id from public.profiles where id = auth.uid()));

-- 4. New columns on stocktake_line
alter table public.stocktake_line
  add column if not exists notes               text,
  add column if not exists counted_by          uuid references public.profiles(id),
  add column if not exists counted_at          timestamptz,
  add column if not exists variance_reason_id  uuid references public.stocktake_variance_reason(id);

-- 5. Bin location on component
alter table public.component
  add column if not exists bin_sub_location text,
  add column if not exists bin_row          text,
  add column if not exists bin_bay          text;

-- 6. Seed default variance reasons for all existing tenants
insert into public.stocktake_variance_reason (tenant_id, name, sort_order)
select t.id, r.name, r.sort_order
from public.tenants t
cross join (
  values
    ('Damage',           1),
    ('Theft',            2),
    ('Data Entry Error', 3),
    ('Found Stock',      4),
    ('Supplier Shortage',5),
    ('Other',            6)
) as r(name, sort_order)
where not exists (
  select 1 from public.stocktake_variance_reason vr where vr.tenant_id = t.id
);

-- 7. Grant permissions
grant select, insert, update, delete
  on public.stocktake_variance_reason to authenticated, service_role;
```

- [ ] **Step 2: Apply to local Supabase**

In the Supabase dashboard SQL editor (or via CLI), run the patch. Verify:
```sql
select column_name from information_schema.columns
where table_name = 'stocktake_session'
order by ordinal_position;
-- Should include: reference_number, session_type, notes, blind_count, approved_by, approved_at

select * from stocktake_variance_reason limit 10;
-- Should show 6 default reasons for each tenant
```

- [ ] **Step 3: Commit**

```bash
git add supabase/patches/stocktake_redesign_schema.sql
git commit -m "feat(stocktake): schema migration — new columns, variance_reason, bin location"
```

---

### Task 1: Lifecycle module — new statuses and helpers

**Goal:** Update `lifecycle.ts` to the new status set and transition graph, with full test coverage.

**Files:**
- Modify: `src/lib/stocktake/lifecycle.ts`
- Modify: `src/lib/stocktake/lifecycle.test.ts`

**Acceptance Criteria:**
- [ ] `StocktakeSessionStatus` includes `counting`, `reconciliation`; retains `open`, `approved`, `completed` for backward compat
- [ ] `canEditStocktakeLines` returns true for `counting` (not `open`)
- [ ] `canSubmitForReview` returns true only for `counting` when all-lines-counted check passes
- [ ] `canApprove` returns true for `reconciliation`
- [ ] `canApplyStocktakeSession` returns true for `approved` (unchanged, RPC still requires it)
- [ ] All tests pass: `npm test -- lifecycle`

**Verify:** `npm test -- lifecycle` → all pass, no skipped

**Steps:**

- [ ] **Step 1: Write failing tests**

Replace `src/lib/stocktake/lifecycle.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  canApplyStocktakeSession,
  canEditStocktakeLines,
  canTransitionStocktakeStatus,
  canSubmitForReview,
  canApprove,
  canSendBackForRecount,
  isCountingStatus,
} from "./lifecycle";

describe("stocktake lifecycle rules", () => {
  it("allows line editing only when counting", () => {
    expect(canEditStocktakeLines("counting")).toBe(true);
    expect(canEditStocktakeLines("open")).toBe(false); // legacy compat
    expect(canEditStocktakeLines("reconciliation")).toBe(false);
    expect(canEditStocktakeLines("approved")).toBe(false);
  });

  it("enforces valid status transitions for new lifecycle", () => {
    expect(canTransitionStocktakeStatus("counting", "reconciliation")).toBe(true);
    expect(canTransitionStocktakeStatus("reconciliation", "approved")).toBe(true);
    expect(canTransitionStocktakeStatus("reconciliation", "counting")).toBe(true);
    expect(canTransitionStocktakeStatus("approved", "completed")).toBe(false); // RPC handles this
    expect(canTransitionStocktakeStatus("completed", "counting")).toBe(false);
  });

  it("enforces valid transitions for legacy statuses", () => {
    expect(canTransitionStocktakeStatus("open", "locked")).toBe(true);
    expect(canTransitionStocktakeStatus("locked", "approved")).toBe(true);
    expect(canTransitionStocktakeStatus("approved", "locked")).toBe(true);
  });

  it("canSubmitForReview: only from counting", () => {
    expect(canSubmitForReview("counting")).toBe(true);
    expect(canSubmitForReview("reconciliation")).toBe(false);
    expect(canSubmitForReview("open")).toBe(false);
  });

  it("canApprove: only from reconciliation", () => {
    expect(canApprove("reconciliation")).toBe(true);
    expect(canApprove("counting")).toBe(false);
    expect(canApprove("approved")).toBe(false);
  });

  it("canSendBackForRecount: only from reconciliation", () => {
    expect(canSendBackForRecount("reconciliation")).toBe(true);
    expect(canSendBackForRecount("counting")).toBe(false);
  });

  it("allows apply only when approved", () => {
    expect(canApplyStocktakeSession("approved")).toBe(true);
    expect(canApplyStocktakeSession("counting")).toBe(false);
    expect(canApplyStocktakeSession("reconciliation")).toBe(false);
    expect(canApplyStocktakeSession("completed")).toBe(false);
  });

  it("isCountingStatus: identifies active counting statuses", () => {
    expect(isCountingStatus("counting")).toBe(true);
    expect(isCountingStatus("open")).toBe(true); // legacy sessions
    expect(isCountingStatus("reconciliation")).toBe(false);
    expect(isCountingStatus("completed")).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect failures**

```bash
npm test -- lifecycle
```
Expected: multiple failures (functions not exported yet).

- [ ] **Step 3: Rewrite lifecycle.ts**

```typescript
export type StocktakeSessionStatus =
  | "draft"
  | "open"        // legacy
  | "counting"
  | "reconciliation"
  | "approved"
  | "completed"
  | "locked"      // legacy
  | "archived";   // legacy

export const stocktakeAllowedTransitions: Record<
  StocktakeSessionStatus,
  StocktakeSessionStatus[]
> = {
  draft:           ["counting"],
  open:            ["locked", "archived", "counting"], // legacy + migration path
  counting:        ["reconciliation"],
  reconciliation:  ["counting", "approved"],
  approved:        ["locked"],           // RPC handles approved→completed
  completed:       [],
  locked:          ["open", "approved", "archived"],
  archived:        [],
};

export function canTransitionStocktakeStatus(
  from: StocktakeSessionStatus,
  to: StocktakeSessionStatus
) {
  if (from === to) return false;
  return (stocktakeAllowedTransitions[from] ?? []).includes(to);
}

export function canEditStocktakeLines(status: StocktakeSessionStatus) {
  return status === "counting" || status === "open";
}

export function canSubmitForReview(status: StocktakeSessionStatus) {
  return status === "counting";
}

export function canApprove(status: StocktakeSessionStatus) {
  return status === "reconciliation";
}

export function canSendBackForRecount(status: StocktakeSessionStatus) {
  return status === "reconciliation";
}

export function canApplyStocktakeSession(status: StocktakeSessionStatus) {
  return status === "approved";
}

export function isCountingStatus(status: StocktakeSessionStatus) {
  return status === "counting" || status === "open";
}
```

- [ ] **Step 4: Run — expect pass**

```bash
npm test -- lifecycle
```
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/stocktake/lifecycle.ts src/lib/stocktake/lifecycle.test.ts
git commit -m "feat(stocktake): update lifecycle — counting/reconciliation statuses, new helpers"
```

---

### Task 2: Bin location fields on component

**Goal:** Add `updateBinLocation` server action and a "Bin location" section on the component detail page.

**Files:**
- Modify: `src/app/app/components/actions.ts`
- Modify: `src/app/app/components/[componentId]/page.tsx`

**Acceptance Criteria:**
- [ ] Component detail page shows a "Bin location" section with Sub-location, Row, Bay text inputs
- [ ] Submitting the form calls `updateBinLocation` and saves to DB
- [ ] All three fields are optional; empty string saves as null
- [ ] Page re-renders with saved values after submit

**Verify:** Navigate to `/app/components/[any-id]`, scroll to bin location section, fill in values, submit, reload — values persist.

**Steps:**

- [ ] **Step 1: Add server action to actions.ts**

Add to the bottom of `src/app/app/components/actions.ts`:

```typescript
export async function updateBinLocation(
  _prevState: ComponentState,
  formData: FormData
): Promise<ComponentState> {
  const componentId = formData.get("component_id")?.toString().trim() ?? "";
  const binSubLocation = formData.get("bin_sub_location")?.toString().trim() || null;
  const binRow = formData.get("bin_row")?.toString().trim() || null;
  const binBay = formData.get("bin_bay")?.toString().trim() || null;

  if (!componentId) return { error: "Component ID is required." };

  const context = await getServerTenantContext();
  if (!context) return { error: "Missing tenant context." };
  const { supabase, tenantId } = context;

  const { error } = await supabase
    .from("component")
    .update({ bin_sub_location: binSubLocation, bin_row: binRow, bin_bay: binBay })
    .eq("id", componentId)
    .eq("tenant_id", tenantId);

  if (error) return { error: error.message };

  revalidatePath(`/app/components/${componentId}`);
  return { success: "Bin location saved." };
}
```

- [ ] **Step 2: Update ComponentRecord type and query in page.tsx**

In `src/app/app/components/[componentId]/page.tsx`, add the three new fields to the type and select:

```typescript
// Add to ComponentRecord type:
type ComponentRecord = {
  // ... existing fields ...
  bin_sub_location: string | null;
  bin_row: string | null;
  bin_bay: string | null;
};
```

Update the select call (find the `.select(` for the component query and add the three fields):
```typescript
.select("id,name,sku,unit,cost_per_unit,reorder_point,created_at,bin_sub_location,bin_row,bin_bay,supplier:supplier_id(name),location:location_id(name),group:group_id(name)")
```

- [ ] **Step 3: Add bin location section to the page JSX**

Import `updateBinLocation` and add the form section below the existing detail fields. Find the existing `<form>` area or add after the stats cards:

```tsx
import { updateBinLocation } from "../actions";

// In the JSX, add a section:
<section className={styles.section}>
  <h2 className={styles.sectionTitle}>Bin location</h2>
  <p className={styles.sectionDesc}>
    Where this component lives in the warehouse. Used to group items in stocktake sheets.
  </p>
  <form action={updateBinLocation}>
    <input type="hidden" name="component_id" value={component.id} />
    <div className={styles.fieldRow}>
      <label className={styles.field}>
        <span className={styles.label}>Sub-location</span>
        <input
          className={styles.input}
          name="bin_sub_location"
          defaultValue={component.bin_sub_location ?? ""}
          placeholder="e.g. Main Floor, Upstairs"
        />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Row</span>
        <input
          className={styles.input}
          name="bin_row"
          defaultValue={component.bin_row ?? ""}
          placeholder="e.g. R1, A"
        />
      </label>
      <label className={styles.field}>
        <span className={styles.label}>Bay</span>
        <input
          className={styles.input}
          name="bin_bay"
          defaultValue={component.bin_bay ?? ""}
          placeholder="e.g. B3, 7"
        />
      </label>
    </div>
    <button type="submit" className={styles.saveBtn}>Save bin location</button>
  </form>
</section>
```

Add to `component-detail.module.css` if the classes don't exist:
```css
.section { display: flex; flex-direction: column; gap: 12px; padding: 24px; background: var(--bg-card); border: 1px solid var(--stroke); border-radius: 18px; }
.sectionTitle { margin: 0; color: var(--ink-strong); font-size: 1rem; }
.sectionDesc { margin: 0; color: var(--ink-muted); font-size: 0.88rem; }
.fieldRow { display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 12px; }
.field { display: flex; flex-direction: column; gap: 6px; }
.label { font-size: 0.74rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-faint); }
.input { border: 1px solid var(--stroke); border-radius: 10px; min-height: 40px; padding: 0 12px; background: var(--bg-input); color: var(--ink-strong); font: inherit; }
.saveBtn { align-self: flex-start; display: inline-flex; align-items: center; min-height: 38px; padding: 0 16px; border-radius: 999px; background: var(--bg-card-alt); border: 1px solid var(--stroke); color: var(--ink-strong); font-size: 0.88rem; font-weight: 700; cursor: pointer; }
```

- [ ] **Step 4: Commit**

```bash
git add src/app/app/components/actions.ts src/app/app/components/[componentId]/page.tsx src/app/app/components/[componentId]/component-detail.module.css
git commit -m "feat(components): bin location fields — sub-location, row, bay"
```

---

### Task 3: Stocktake list page

**Goal:** Rewrite `/app/stocktake` as a session list with "New stocktake" and initial count detection. Remove old create/line forms.

**Files:**
- Modify: `src/app/app/stocktake/page.tsx` (full rewrite)
- Modify: `src/app/app/stocktake/stocktake.module.css` (new styles)
- Modify: `src/app/app/stocktake/actions.ts` (rewrite `createStocktakeSession`, add `seedVarianceReasons`)
- Delete: `src/app/app/stocktake/stocktake-create-form.tsx`
- Delete: `src/app/app/stocktake/stocktake-line-form.tsx`

**Acceptance Criteria:**
- [ ] Page shows session list with columns: Reference, Type, Location, Date, Lines, Status
- [ ] "New stocktake" button opens a `<dialog>` modal with location, notes, blind count fields
- [ ] Session links go to `/app/stocktake/[sessionId]`
- [ ] Completed sessions are dimmed with "View" instead of "Open"
- [ ] No old create/line forms on the page

**Verify:** Navigate to `/app/stocktake`. See session list. Click "New stocktake" → modal opens. Submit → session appears in list with `ST-{YEAR}-{NNN}` reference.

**Steps:**

- [ ] **Step 1: Rewrite actions.ts**

Replace `src/app/app/stocktake/actions.ts` entirely:

```typescript
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";
import { canTransitionStocktakeStatus, type StocktakeSessionStatus } from "@/lib/stocktake/lifecycle";

type StocktakeState = { error?: string; success?: string };

export async function seedVarianceReasonsIfNeeded(supabase: ReturnType<typeof import("@supabase/supabase-js").createClient>, tenantId: string) {
  const { count } = await supabase
    .from("stocktake_variance_reason")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  if ((count ?? 0) > 0) return;

  const defaults = [
    { name: "Damage",            sort_order: 1 },
    { name: "Theft",             sort_order: 2 },
    { name: "Data Entry Error",  sort_order: 3 },
    { name: "Found Stock",       sort_order: 4 },
    { name: "Supplier Shortage", sort_order: 5 },
    { name: "Other",             sort_order: 6 },
  ];
  await supabase.from("stocktake_variance_reason").insert(
    defaults.map((d) => ({ ...d, tenant_id: tenantId }))
  );
}

async function generateReferenceNumber(
  supabase: ReturnType<typeof import("@supabase/supabase-js").createClient>,
  tenantId: string
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `ST-${year}-`;
  const { count } = await supabase
    .from("stocktake_session")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .like("reference_number", `${prefix}%`);
  const next = (count ?? 0) + 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

export async function createStocktakeSession(
  _prev: StocktakeState,
  formData: FormData
): Promise<StocktakeState> {
  const locationId = formData.get("location_id")?.toString() ?? "";
  const notes = formData.get("notes")?.toString().trim() || null;
  const blindCount = formData.get("blind_count") === "on";
  const sessionType = (formData.get("session_type")?.toString() ?? "full") as "full" | "initial";

  if (!locationId) return { error: "Location is required." };

  const context = await getServerTenantContext();
  if (!context) return { error: "Missing tenant context." };
  const { supabase, tenantId } = context;

  await seedVarianceReasonsIfNeeded(supabase, tenantId);

  const referenceNumber = await generateReferenceNumber(supabase, tenantId);

  const { data: session, error: sessionError } = await supabase
    .from("stocktake_session")
    .insert({
      tenant_id: tenantId,
      location_id: locationId,
      status: "counting",
      session_type: sessionType,
      notes,
      blind_count: blindCount,
      reference_number: referenceNumber,
    })
    .select("id,location_id")
    .single();

  if (sessionError) return { error: sessionError.message };

  // Pre-load all components as lines (snapshot current on_hand as expected_on_hand)
  const { data: components } = await supabase
    .from("component")
    .select("id")
    .eq("tenant_id", tenantId);

  if (components && components.length > 0) {
    const { data: balances } = await supabase
      .from("inventory_balance")
      .select("component_id,on_hand")
      .eq("tenant_id", tenantId)
      .eq("location_id", locationId);

    const balanceMap = new Map(
      (balances ?? []).map((b) => [
        (b as { component_id: string; on_hand: number }).component_id,
        Number((b as { component_id: string; on_hand: number }).on_hand ?? 0),
      ])
    );

    const lines = (components as { id: string }[]).map((c) => ({
      tenant_id: tenantId,
      session_id: session.id,
      component_id: c.id,
      expected_on_hand: balanceMap.get(c.id) ?? 0,
      counted: null,
    }));

    // Insert in batches of 200 to avoid request size limits
    for (let i = 0; i < lines.length; i += 200) {
      await supabase.from("stocktake_line").insert(lines.slice(i, i + 200));
    }
  }

  revalidatePath("/app/stocktake");
  redirect(`/app/stocktake/${session.id}`);
}

export async function updateStocktakeStatus(formData: FormData) {
  const sessionId = formData.get("session_id")?.toString() ?? "";
  const status = (formData.get("status")?.toString() ?? "") as StocktakeSessionStatus;
  if (!sessionId || !status) return;

  const context = await getServerTenantContext();
  if (!context) return;
  const { supabase, tenantId } = context;

  const { data: sessionData } = await supabase
    .from("stocktake_session")
    .select("id,status")
    .eq("tenant_id", tenantId)
    .eq("id", sessionId)
    .maybeSingle();

  const current = (sessionData as { id: string; status: StocktakeSessionStatus } | null);
  if (!current?.id || !canTransitionStocktakeStatus(current.status, status)) return;

  await supabase
    .from("stocktake_session")
    .update({ status })
    .eq("tenant_id", tenantId)
    .eq("id", sessionId);

  revalidatePath("/app/stocktake");
  revalidatePath(`/app/stocktake/${sessionId}`);
}
```

- [ ] **Step 2: Rewrite page.tsx**

Replace `src/app/app/stocktake/page.tsx`:

```tsx
import Link from "next/link";
import styles from "./stocktake.module.css";
import { getServerTenantContext } from "@/lib/tenant/context";
import PageHeader from "../_ui/page-header";
import StatusBadge from "../_ui/status-badge";
import EmptyState from "../_ui/empty-state";
import { createStocktakeSession } from "./actions";

type SessionRow = {
  id: string;
  reference_number: string | null;
  session_type: string;
  status: string;
  created_at: string;
  blind_count: boolean;
  location: { name: string | null } | Array<{ name: string | null }> | null;
};

function statusVariant(s: string) {
  if (s === "completed") return "success";
  if (s === "approved") return "info";
  if (s === "reconciliation") return "warning";
  if (s === "counting") return "warning";
  return "info";
}

function isDone(s: string) {
  return s === "completed" || s === "archived";
}

export default async function StocktakePage() {
  const context = await getServerTenantContext();
  if (!context) return null;
  const { supabase, tenantId } = context;

  const [{ data: sessions, error }, { data: locations }, { data: lineCounts }, { data: balances }] =
    await Promise.all([
      supabase
        .from("stocktake_session")
        .select("id,reference_number,session_type,status,created_at,blind_count,location:location_id(name)")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("location").select("id,name").eq("tenant_id", tenantId).order("name"),
      supabase
        .from("stocktake_line")
        .select("session_id")
        .eq("tenant_id", tenantId),
      supabase
        .from("inventory_balance")
        .select("on_hand")
        .eq("tenant_id", tenantId),
    ]);

  // Count lines per session
  const lineCountBySession = ((lineCounts ?? []) as { session_id: string }[]).reduce<Record<string, number>>(
    (acc, l) => { acc[l.session_id] = (acc[l.session_id] ?? 0) + 1; return acc; },
    {}
  );

  // Show onboarding banner if ALL on_hand values are 0 and no completed sessions
  const hasAnyStock = ((balances ?? []) as { on_hand: number }[]).some((b) => Number(b.on_hand) > 0);
  const hasCompletedSession = ((sessions ?? []) as SessionRow[]).some((s) => s.status === "completed");
  const showBanner = !hasAnyStock && !hasCompletedSession;

  function formatDate(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
    return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
  }

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Stocktake"
        title="Inventory counts"
        description="Manage physical counts and reconcile inventory discrepancies."
        actions={
          <button className={styles.primary} onClick={undefined} popovertarget="new-stocktake-dialog">
            + New stocktake
          </button>
        }
      />

      {showBanner && (
        <div className={styles.banner}>
          <div className={styles.bannerInner}>
            <span className={styles.bannerIcon}>📦</span>
            <div>
              <strong className={styles.bannerTitle}>Set up your opening stock</strong>
              <p className={styles.bannerDesc}>
                Your inventory is empty. Run an initial stock count to enter your current on-hand quantities before using Assemblio for production.
              </p>
            </div>
          </div>
          <button
            className={styles.bannerCta}
            popovertarget="new-stocktake-dialog"
            onClick={undefined}
          >
            Start initial count →
          </button>
        </div>
      )}

      {/* New stocktake modal */}
      <dialog id="new-stocktake-dialog" className={styles.dialog} popover="auto">
        <form action={createStocktakeSession} method="dialog">
          <div className={styles.dialogHeader}>
            <span className={styles.dialogEyebrow}>New stocktake</span>
            <h2 className={styles.dialogTitle}>Create session</h2>
          </div>
          <div className={styles.dialogFields}>
            <label className={styles.dialogField}>
              <span className={styles.fieldLabel}>Location</span>
              <select name="location_id" className={styles.select} required>
                <option value="">Select location…</option>
                {((locations ?? []) as { id: string; name: string | null }[]).map((l) => (
                  <option key={l.id} value={l.id}>{l.name ?? "Unnamed"}</option>
                ))}
              </select>
            </label>
            <label className={styles.dialogField}>
              <span className={styles.fieldLabel}>Notes <span className={styles.optional}>(optional)</span></span>
              <input name="notes" className={styles.input} placeholder="e.g. End-of-month count" />
            </label>
            <label className={styles.checkboxRow}>
              <input type="checkbox" name="blind_count" />
              <div>
                <span className={styles.checkboxLabel}>Blind count mode</span>
                <span className={styles.checkboxDesc}>Expected qty hidden from counters until reconciliation</span>
              </div>
            </label>
            <input type="hidden" name="session_type" value="full" id="session-type-input" />
          </div>
          <div className={styles.dialogActions}>
            <button type="button" className={styles.secondary} popovertarget="new-stocktake-dialog">Cancel</button>
            <button type="submit" className={styles.primary}>Start counting →</button>
          </div>
        </form>
      </dialog>

      {/* Sessions list */}
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <span className={styles.eyebrow}>Sessions</span>
          <h2 className={styles.panelTitle}>All stocktake sessions</h2>
        </div>
        <div className={styles.tableHeader}>
          <span>Reference</span>
          <span>Type</span>
          <span>Location</span>
          <span>Date</span>
          <span>Lines</span>
          <span>Status</span>
          <span></span>
        </div>
        {error ? (
          <EmptyState title="Failed to load sessions" message={error.message} />
        ) : (sessions ?? []).length === 0 ? (
          <EmptyState title="No stocktake sessions yet" message="Create a session to begin counting." />
        ) : (
          ((sessions ?? []) as SessionRow[]).map((row) => {
            const location = Array.isArray(row.location) ? row.location[0] : row.location;
            const done = isDone(row.status);
            return (
              <div key={row.id} className={`${styles.tableRow} ${done ? styles.dimmed : ""}`}>
                <strong className={styles.reference}>{row.reference_number ?? row.id.slice(0, 8)}</strong>
                <span className={styles.meta}>{row.session_type === "initial" ? "Initial count" : "Full count"}</span>
                <span className={styles.meta}>{location?.name ?? "—"}</span>
                <span className={styles.meta}>{formatDate(row.created_at)}</span>
                <span className={styles.meta}>{lineCountBySession[row.id] ?? 0} lines</span>
                <StatusBadge variant={statusVariant(row.status)}>{row.status}</StatusBadge>
                <Link href={`/app/stocktake/${row.id}`} className={styles.viewLink}>
                  {done ? "View →" : "Open →"}
                </Link>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Rewrite stocktake.module.css**

Replace `src/app/app/stocktake/stocktake.module.css`:

```css
.page { display: flex; flex-direction: column; gap: 20px; }

/* Banner */
.banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 20px 24px;
  border-radius: 18px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--brand-2) 18%, transparent), color-mix(in srgb, var(--brand-1) 12%, transparent));
  border: 1px solid color-mix(in srgb, var(--brand-2) 35%, transparent);
}
.bannerInner { display: flex; align-items: center; gap: 16px; }
.bannerIcon { font-size: 2rem; }
.bannerTitle { display: block; font-weight: 700; color: var(--ink-strong); margin-bottom: 4px; }
.bannerDesc { margin: 0; color: var(--ink-muted); font-size: 0.86rem; }
.bannerCta {
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  min-height: 42px;
  padding: 0 20px;
  border-radius: 999px;
  background: linear-gradient(135deg, color-mix(in srgb, var(--brand-2) 72%, #142131), color-mix(in srgb, var(--brand-1) 88%, #0e1624));
  border: none;
  color: #f8fbff;
  font-size: 0.9rem;
  font-weight: 700;
  cursor: pointer;
}

/* Modal */
.dialog {
  background: var(--bg-card);
  border: 1px solid var(--stroke);
  border-radius: 20px;
  padding: 28px;
  width: 440px;
  max-width: 90vw;
  color: var(--ink-strong);
}
.dialog::backdrop { background: rgba(0,0,0,0.5); }
.dialogHeader { margin-bottom: 20px; }
.dialogEyebrow { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.15em; color: var(--brand-2); }
.dialogTitle { margin: 6px 0 0; font-size: 1.1rem; }
.dialogFields { display: flex; flex-direction: column; gap: 14px; margin-bottom: 20px; }
.dialogField { display: flex; flex-direction: column; gap: 6px; }
.fieldLabel { font-size: 0.75rem; font-weight: 700; color: var(--ink-faint); text-transform: uppercase; letter-spacing: 0.1em; }
.optional { font-weight: 400; opacity: 0.6; }
.select, .input {
  border: 1px solid var(--stroke);
  border-radius: 10px;
  min-height: 42px;
  padding: 0 12px;
  background: var(--bg-input);
  color: var(--ink-strong);
  font: inherit;
}
.checkboxRow { display: flex; align-items: flex-start; gap: 10px; padding: 12px; border-radius: 10px; background: var(--bg-card-alt); border: 1px solid var(--stroke-card); cursor: pointer; }
.checkboxLabel { display: block; font-weight: 600; color: var(--ink-strong); font-size: 0.88rem; }
.checkboxDesc { display: block; font-size: 0.78rem; color: var(--ink-muted); margin-top: 2px; }
.dialogActions { display: flex; gap: 10px; justify-content: flex-end; }

/* Panel */
.panel { display: flex; flex-direction: column; border: 1px solid var(--stroke); border-radius: 20px; background: var(--bg-card); overflow: hidden; }
.panelHeader { padding: 20px 24px 16px; border-bottom: 1px solid var(--stroke); }
.eyebrow { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.15em; color: var(--ink-faint); }
.panelTitle { margin: 6px 0 0; color: var(--ink-strong); }
.tableHeader {
  display: grid;
  grid-template-columns: 1fr 0.7fr 0.9fr 0.7fr 0.6fr 0.8fr 0.4fr;
  gap: 12px;
  padding: 8px 24px;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink-faint);
  border-bottom: 1px solid var(--stroke);
  background: var(--bg-card-alt);
}
.tableRow {
  display: grid;
  grid-template-columns: 1fr 0.7fr 0.9fr 0.7fr 0.6fr 0.8fr 0.4fr;
  gap: 12px;
  padding: 12px 24px;
  border-bottom: 1px solid color-mix(in srgb, var(--stroke) 50%, transparent);
  align-items: center;
}
.tableRow:last-child { border-bottom: none; }
.dimmed { opacity: 0.5; }
.reference { color: var(--ink-strong); }
.meta { color: var(--ink-muted); font-size: 0.88rem; }
.viewLink { color: color-mix(in srgb, var(--brand-2) 72%, white); text-decoration: none; font-weight: 700; font-size: 0.84rem; }

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
  border: 1px solid var(--stroke);
  background: var(--bg-card-alt);
  color: var(--ink-strong);
}
```

- [ ] **Step 4: Delete old form components**

```bash
rm src/app/app/stocktake/stocktake-create-form.tsx
rm src/app/app/stocktake/stocktake-line-form.tsx
```

- [ ] **Step 5: Commit**

```bash
git add src/app/app/stocktake/
git commit -m "feat(stocktake): rewrite list page — session list, new stocktake modal, onboarding banner"
```

---

### Task 4: Session detail page — counting view

**Goal:** Create `/app/stocktake/[sessionId]` showing all components grouped by bin location with inline qty inputs.

**Files:**
- Create: `src/app/app/stocktake/[sessionId]/page.tsx`
- Create: `src/app/app/stocktake/[sessionId]/page.module.css`
- Create: `src/app/app/stocktake/[sessionId]/actions.ts`

**Acceptance Criteria:**
- [ ] Page shows session header (reference, status, type, location, notes, blind count indicator)
- [ ] All stocktake lines loaded, grouped by `bin_sub_location → bin_row → bin_bay`
- [ ] Components with no bin assigned appear at bottom under "No location set"
- [ ] Each row shows component name, SKU, expected (hidden in blind count), inline qty input
- [ ] Saving a counted qty calls `saveLineCount` and updates `counted_by` + `counted_at`
- [ ] Summary bar: lines counted, lines with variance, net variance $
- [ ] "Submit for review →" button calls `submitForReview` → redirects back with reconciliation view

**Verify:** Navigate to `/app/stocktake/[sessionId]` for a `counting` status session. See all components. Enter qty in an input, press Enter/submit — line updates. See summary bar change.

**Steps:**

- [ ] **Step 1: Create actions.ts for session detail**

Create `src/app/app/stocktake/[sessionId]/actions.ts`:

```typescript
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";
import {
  canEditStocktakeLines,
  canSubmitForReview,
  canApprove,
  canSendBackForRecount,
} from "@/lib/stocktake/lifecycle";

type SessionRecord = {
  id: string;
  status: string;
  session_type: string;
  location_id: string;
};

async function fetchSession(supabase: ReturnType<typeof import("@supabase/supabase-js").createClient>, tenantId: string, sessionId: string) {
  const { data } = await supabase
    .from("stocktake_session")
    .select("id,status,session_type,location_id")
    .eq("tenant_id", tenantId)
    .eq("id", sessionId)
    .maybeSingle();
  return data as SessionRecord | null;
}

export async function saveLineCount(formData: FormData) {
  const lineId = formData.get("line_id")?.toString() ?? "";
  const sessionId = formData.get("session_id")?.toString() ?? "";
  const countedRaw = formData.get("counted")?.toString() ?? "";
  const notes = formData.get("notes")?.toString().trim() || null;

  if (!lineId || !sessionId || countedRaw === "") return;
  const counted = Number(countedRaw);
  if (!Number.isFinite(counted) || counted < 0) return;

  const context = await getServerTenantContext();
  if (!context) return;
  const { supabase, tenantId } = context;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const session = await fetchSession(supabase, tenantId, sessionId);
  if (!session || !canEditStocktakeLines(session.status as Parameters<typeof canEditStocktakeLines>[0])) return;

  await supabase
    .from("stocktake_line")
    .update({
      counted,
      notes,
      counted_by: user?.id ?? null,
      counted_at: new Date().toISOString(),
    })
    .eq("id", lineId)
    .eq("tenant_id", tenantId);

  revalidatePath(`/app/stocktake/${sessionId}`);
}

export async function submitForReview(formData: FormData) {
  const sessionId = formData.get("session_id")?.toString() ?? "";
  if (!sessionId) return;

  const context = await getServerTenantContext();
  if (!context) return;
  const { supabase, tenantId } = context;

  const session = await fetchSession(supabase, tenantId, sessionId);
  if (!session || !canSubmitForReview(session.status as Parameters<typeof canSubmitForReview>[0])) return;

  // Check all lines have been counted
  const { count: uncountedCount } = await supabase
    .from("stocktake_line")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("session_id", sessionId)
    .is("counted", null);

  if ((uncountedCount ?? 0) > 0) {
    redirect(`/app/stocktake/${sessionId}?error=uncounted_lines`);
  }

  await supabase
    .from("stocktake_session")
    .update({ status: "reconciliation" })
    .eq("id", sessionId)
    .eq("tenant_id", tenantId);

  revalidatePath(`/app/stocktake/${sessionId}`);
  revalidatePath("/app/stocktake");
  redirect(`/app/stocktake/${sessionId}`);
}

export async function saveVarianceReason(formData: FormData) {
  const lineId = formData.get("line_id")?.toString() ?? "";
  const sessionId = formData.get("session_id")?.toString() ?? "";
  const reasonId = formData.get("variance_reason_id")?.toString() || null;
  const notes = formData.get("notes")?.toString().trim() || null;

  if (!lineId || !sessionId) return;

  const context = await getServerTenantContext();
  if (!context) return;
  const { supabase, tenantId } = context;

  await supabase
    .from("stocktake_line")
    .update({ variance_reason_id: reasonId, notes })
    .eq("id", lineId)
    .eq("tenant_id", tenantId);

  revalidatePath(`/app/stocktake/${sessionId}`);
}

export async function approveAndApply(formData: FormData) {
  const sessionId = formData.get("session_id")?.toString() ?? "";
  if (!sessionId) redirect("/app/stocktake?apply_error=missing_session");

  const context = await getServerTenantContext();
  if (!context) redirect("/app/stocktake?apply_error=missing_tenant");
  const { supabase, tenantId } = context;

  const session = await fetchSession(supabase, tenantId, sessionId);
  if (!session || !canApprove(session.status as Parameters<typeof canApprove>[0])) {
    redirect(`/app/stocktake/${sessionId}?error=cannot_approve`);
  }

  // Check all variance lines have a reason set
  const { data: varianceLines } = await supabase
    .from("stocktake_line")
    .select("id,expected_on_hand,counted,variance_reason_id")
    .eq("tenant_id", tenantId)
    .eq("session_id", sessionId);

  const missingReason = (varianceLines ?? []).some((l) => {
    const variance = Number((l as { counted: number }).counted ?? 0) - Number((l as { expected_on_hand: number }).expected_on_hand ?? 0);
    return variance !== 0 && !(l as { variance_reason_id: string | null }).variance_reason_id;
  });

  if (missingReason) {
    redirect(`/app/stocktake/${sessionId}?error=missing_reasons`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Set to approved so the RPC accepts it
  await supabase
    .from("stocktake_session")
    .update({ status: "approved", approved_by: user?.id ?? null, approved_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("tenant_id", tenantId);

  const { data: rpcData, error: rpcError } = await supabase.rpc("apply_stocktake_session", {
    p_session_id: sessionId,
  });

  if (rpcError) {
    redirect(`/app/stocktake/${sessionId}?apply_error=${encodeURIComponent(rpcError.message)}`);
  }

  const summary = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as { applied_lines: number; adjustment_count: number } | null;

  await supabase.from("activity_log").insert({
    tenant_id: tenantId,
    event: "stocktake_applied",
    metadata: { session_id: sessionId, line_count: summary?.applied_lines ?? 0, adjustments: summary?.adjustment_count ?? 0 },
  });

  revalidatePath("/app/stocktake");
  revalidatePath("/app/inventory");
  redirect(`/app/stocktake?apply_ok=${summary?.adjustment_count ?? 0}/${summary?.applied_lines ?? 0}`);
}

export async function sendBackForRecount(formData: FormData) {
  const sessionId = formData.get("session_id")?.toString() ?? "";
  if (!sessionId) return;

  const context = await getServerTenantContext();
  if (!context) return;
  const { supabase, tenantId } = context;

  const session = await fetchSession(supabase, tenantId, sessionId);
  if (!session || !canSendBackForRecount(session.status as Parameters<typeof canSendBackForRecount>[0])) return;

  await supabase
    .from("stocktake_session")
    .update({ status: "counting" })
    .eq("id", sessionId)
    .eq("tenant_id", tenantId);

  revalidatePath(`/app/stocktake/${sessionId}`);
  revalidatePath("/app/stocktake");
  redirect(`/app/stocktake/${sessionId}`);
}

export async function applyOpeningStock(formData: FormData) {
  const sessionId = formData.get("session_id")?.toString() ?? "";
  if (!sessionId) redirect("/app/stocktake?apply_error=missing_session");

  const context = await getServerTenantContext();
  if (!context) redirect("/app/stocktake?apply_error=missing_tenant");
  const { supabase, tenantId } = context;

  const session = await fetchSession(supabase, tenantId, sessionId);
  if (!session || session.session_type !== "initial") {
    redirect(`/app/stocktake/${sessionId}?error=not_initial_session`);
  }

  // Check all lines counted
  const { count: uncountedCount } = await supabase
    .from("stocktake_line")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("session_id", sessionId)
    .is("counted", null);

  if ((uncountedCount ?? 0) > 0) {
    redirect(`/app/stocktake/${sessionId}?error=uncounted_lines`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Transition to approved so RPC accepts it
  await supabase
    .from("stocktake_session")
    .update({ status: "approved", approved_by: user?.id ?? null, approved_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("tenant_id", tenantId);

  const { data: rpcData, error: rpcError } = await supabase.rpc("apply_stocktake_session", {
    p_session_id: sessionId,
  });

  if (rpcError) {
    redirect(`/app/stocktake/${sessionId}?apply_error=${encodeURIComponent(rpcError.message)}`);
  }

  const summary = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as { applied_lines: number } | null;

  revalidatePath("/app/stocktake");
  revalidatePath("/app/inventory");
  redirect(`/app/stocktake?apply_ok=${summary?.applied_lines ?? 0}/initial`);
}
```

- [ ] **Step 2: Create page.tsx**

Create `src/app/app/stocktake/[sessionId]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import StatusBadge from "../../_ui/status-badge";
import styles from "./page.module.css";
import {
  saveLineCount,
  submitForReview,
  saveVarianceReason,
  approveAndApply,
  sendBackForRecount,
  applyOpeningStock,
} from "./actions";

type Props = {
  params: Promise<{ sessionId: string }>;
  searchParams?: Promise<{ error?: string; apply_error?: string }>;
};

type LineRow = {
  id: string;
  expected_on_hand: number;
  counted: number | null;
  notes: string | null;
  variance_reason_id: string | null;
  component: {
    id: string;
    name: string | null;
    sku: string | null;
    cost_per_unit: number;
    bin_sub_location: string | null;
    bin_row: string | null;
    bin_bay: string | null;
  } | Array<{
    id: string;
    name: string | null;
    sku: string | null;
    cost_per_unit: number;
    bin_sub_location: string | null;
    bin_row: string | null;
    bin_bay: string | null;
  }> | null;
};

type BinGroup = {
  key: string;
  subLocation: string | null;
  row: string | null;
  bay: string | null;
  lines: LineRow[];
};

function binKey(l: LineRow): string {
  const c = Array.isArray(l.component) ? l.component[0] : l.component;
  if (!c) return "__none";
  return [c.bin_sub_location ?? "", c.bin_row ?? "", c.bin_bay ?? ""].join("|");
}

function groupByBin(lines: LineRow[]): BinGroup[] {
  const map = new Map<string, BinGroup>();
  for (const l of lines) {
    const c = Array.isArray(l.component) ? l.component[0] : l.component;
    const key = binKey(l);
    if (!map.has(key)) {
      map.set(key, {
        key,
        subLocation: c?.bin_sub_location ?? null,
        row: c?.bin_row ?? null,
        bay: c?.bin_bay ?? null,
        lines: [],
      });
    }
    map.get(key)!.lines.push(l);
  }
  // Sort: non-null sub-locations first, then nulls; within each by row then bay
  return [...map.values()].sort((a, b) => {
    if (a.subLocation === null && b.subLocation !== null) return 1;
    if (a.subLocation !== null && b.subLocation === null) return -1;
    const sl = (a.subLocation ?? "").localeCompare(b.subLocation ?? "");
    if (sl !== 0) return sl;
    const r = (a.row ?? "").localeCompare(b.row ?? "");
    if (r !== 0) return r;
    return (a.bay ?? "").localeCompare(b.bay ?? "");
  });
}

function statusVariant(s: string) {
  if (s === "completed") return "success";
  if (s === "approved" || s === "reconciliation") return "warning";
  if (s === "counting") return "warning";
  return "info";
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 2 }).format(n);
}

export default async function SessionDetailPage({ params, searchParams }: Props) {
  const { sessionId } = await params;
  const sp = (await searchParams) ?? {};

  const context = await getServerTenantContext();
  if (!context) return null;
  const { supabase, tenantId, role } = context;

  const [{ data: sessionData }, { data: linesData }, { data: reasons }] = await Promise.all([
    supabase
      .from("stocktake_session")
      .select("id,reference_number,session_type,status,created_at,blind_count,notes,location:location_id(name)")
      .eq("tenant_id", tenantId)
      .eq("id", sessionId)
      .maybeSingle(),
    supabase
      .from("stocktake_line")
      .select("id,expected_on_hand,counted,notes,variance_reason_id,component:component_id(id,name,sku,cost_per_unit,bin_sub_location,bin_row,bin_bay)")
      .eq("tenant_id", tenantId)
      .eq("session_id", sessionId),
    supabase
      .from("stocktake_variance_reason")
      .select("id,name")
      .eq("tenant_id", tenantId)
      .order("sort_order"),
  ]);

  if (!sessionData) notFound();

  const session = sessionData as {
    id: string;
    reference_number: string | null;
    session_type: string;
    status: string;
    created_at: string;
    blind_count: boolean;
    notes: string | null;
    location: { name: string | null } | Array<{ name: string | null }> | null;
  };

  const lines = (linesData ?? []) as LineRow[];
  const reasonsList = (reasons ?? []) as { id: string; name: string }[];
  const locationName = (Array.isArray(session.location) ? session.location[0] : session.location)?.name ?? "Unknown";
  const isInitial = session.session_type === "initial";
  const isCounting = session.status === "counting" || session.status === "open";
  const isReconciliation = session.status === "reconciliation";
  const isCompleted = session.status === "completed";
  const isAdmin = role === "admin" || role === "super_admin";

  // Metrics
  const countedLines = lines.filter((l) => l.counted !== null);
  const varianceLines = lines.filter((l) => {
    if (l.counted === null) return false;
    return Number(l.counted) !== Number(l.expected_on_hand);
  });
  const netVariance = lines.reduce((acc, l) => {
    if (l.counted === null) return acc;
    const c = Array.isArray(l.component) ? l.component[0] : l.component;
    const costPerUnit = Number(c?.cost_per_unit ?? 0);
    const variance = Number(l.counted) - Number(l.expected_on_hand);
    return acc + variance * costPerUnit;
  }, 0);

  const binGroups = groupByBin(lines);

  const showBlind = isCounting && session.blind_count && !isReconciliation;

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.topRow}>
        <Link href="/app/stocktake" className={styles.back}>← Stocktake</Link>
      </div>

      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.titleRow}>
            <h1 className={styles.title}>{session.reference_number ?? sessionId.slice(0, 8)}</h1>
            <StatusBadge variant={statusVariant(session.status)}>{session.status}</StatusBadge>
            {isInitial && <span className={styles.typeBadge}>Initial count</span>}
            {session.blind_count && isCounting && <span className={styles.blindBadge}>Blind count</span>}
          </div>
          <p className={styles.headerMeta}>
            {locationName} · {new Date(session.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
            {isCounting && ` · ${countedLines.length} / ${lines.length} counted`}
          </p>
          {session.notes && <p className={styles.headerNotes}>{session.notes}</p>}
        </div>

        <div className={styles.headerActions}>
          {!isCompleted && (
            <>
              <Link href={`/app/stocktake/${sessionId}/print`} className={styles.secondary} target="_blank">
                Print sheet
              </Link>
            </>
          )}
          {isCounting && !isInitial && (
            <form action={submitForReview}>
              <input type="hidden" name="session_id" value={sessionId} />
              <button type="submit" className={styles.primary}
                disabled={countedLines.length < lines.length}>
                Submit for review →
              </button>
            </form>
          )}
          {isCounting && isInitial && (
            <form action={applyOpeningStock}>
              <input type="hidden" name="session_id" value={sessionId} />
              <button type="submit" className={styles.primary}
                disabled={countedLines.length < lines.length}>
                Apply opening stock →
              </button>
            </form>
          )}
          {isReconciliation && isAdmin && (
            <>
              <form action={sendBackForRecount}>
                <input type="hidden" name="session_id" value={sessionId} />
                <button type="submit" className={styles.danger}>↩ Send back for recount</button>
              </form>
              <form action={approveAndApply}>
                <input type="hidden" name="session_id" value={sessionId} />
                <button type="submit" className={styles.primary}>Approve & apply →</button>
              </form>
            </>
          )}
        </div>
      </div>

      {sp.error === "uncounted_lines" && (
        <p className={styles.errorMsg}>All lines must be counted before submitting for review.</p>
      )}
      {sp.error === "missing_reasons" && (
        <p className={styles.errorMsg}>All variance lines must have a reason set before approving.</p>
      )}
      {sp.apply_error && (
        <p className={styles.errorMsg}>Apply failed: {sp.apply_error.replace(/_/g, " ")}</p>
      )}

      {/* COUNTING VIEW */}
      {(isCounting || isCompleted) && (
        <div className={styles.countingSection}>
          {binGroups.map((group) => {
            const groupLabel = group.subLocation === null
              ? "No location set"
              : [group.subLocation, group.row ? `Row ${group.row}` : null, group.bay ? `Bay ${group.bay}` : null]
                  .filter(Boolean)
                  .join(" · ");

            return (
              <div key={group.key} className={styles.bayGroup}>
                <div className={styles.bayHeader}>{groupLabel} <span className={styles.bayCount}>· {group.lines.length} items</span></div>
                <div className={styles.bayTable}>
                  <div className={styles.bayTableHeader}>
                    <span>Component</span>
                    {!showBlind && <span className={styles.numCol}>Expected</span>}
                    <span className={styles.numCol}>{isInitial ? "On-hand count" : "Counted"}</span>
                    {!isInitial && !showBlind && <span className={styles.numCol}>Variance</span>}
                    {!isInitial && !showBlind && isAdmin && <span className={styles.numCol}>Value</span>}
                  </div>
                  {group.lines.map((line) => {
                    const comp = Array.isArray(line.component) ? line.component[0] : line.component;
                    const variance = line.counted !== null ? Number(line.counted) - Number(line.expected_on_hand) : null;
                    const costPerUnit = Number(comp?.cost_per_unit ?? 0);
                    const varValue = variance !== null ? variance * costPerUnit : null;
                    const hasCounted = line.counted !== null;
                    return (
                      <form key={line.id} action={saveLineCount} className={styles.lineRow}>
                        <input type="hidden" name="line_id" value={line.id} />
                        <input type="hidden" name="session_id" value={sessionId} />
                        <div className={styles.compCell}>
                          <span className={styles.compName}>{comp?.name ?? "Unknown"}</span>
                          <span className={styles.compSku}>{comp?.sku ?? ""}</span>
                        </div>
                        {!showBlind && (
                          <span className={`${styles.numCol} ${styles.muted}`}>
                            {isInitial ? "—" : Number(line.expected_on_hand).toFixed(0)}
                          </span>
                        )}
                        <span className={styles.numCol}>
                          {isCounting ? (
                            <input
                              className={styles.countInput}
                              type="number"
                              name="counted"
                              min="0"
                              step="1"
                              defaultValue={line.counted ?? ""}
                              placeholder="0"
                            />
                          ) : (
                            <span className={hasCounted ? styles.countedVal : styles.muted}>
                              {hasCounted ? Number(line.counted).toFixed(0) : "—"}
                            </span>
                          )}
                        </span>
                        {!isInitial && !showBlind && (
                          <span className={`${styles.numCol} ${variance === null ? styles.muted : variance > 0 ? styles.positive : variance < 0 ? styles.negative : styles.muted}`}>
                            {variance === null ? "—" : variance > 0 ? `+${variance}` : variance === 0 ? "—" : String(variance)}
                          </span>
                        )}
                        {!isInitial && !showBlind && isAdmin && (
                          <span className={`${styles.numCol} ${varValue === null ? styles.muted : varValue > 0 ? styles.positive : varValue < 0 ? styles.negative : styles.muted}`}>
                            {varValue === null ? "—" : varValue === 0 ? "—" : formatCurrency(varValue)}
                          </span>
                        )}
                        {isCounting && <button type="submit" className={styles.saveLineBtn}>Save</button>}
                      </form>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* RECONCILIATION VIEW */}
      {isReconciliation && (
        <div className={styles.reconciliationSection}>
          <div className={styles.summaryCards}>
            <div className={styles.card}>
              <span>Lines with variance</span>
              <strong className={styles.warnVal}>{varianceLines.length} / {lines.length}</strong>
            </div>
            <div className={styles.card}>
              <span>Stock gains</span>
              <strong className={styles.positiveVal}>
                {formatCurrency(lines.reduce((acc, l) => {
                  if (l.counted === null) return acc;
                  const c = Array.isArray(l.component) ? l.component[0] : l.component;
                  const v = (Number(l.counted) - Number(l.expected_on_hand)) * Number(c?.cost_per_unit ?? 0);
                  return acc + (v > 0 ? v : 0);
                }, 0))}
              </strong>
            </div>
            <div className={styles.card}>
              <span>Stock losses</span>
              <strong className={styles.negativeVal}>
                {formatCurrency(lines.reduce((acc, l) => {
                  if (l.counted === null) return acc;
                  const c = Array.isArray(l.component) ? l.component[0] : l.component;
                  const v = (Number(l.counted) - Number(l.expected_on_hand)) * Number(c?.cost_per_unit ?? 0);
                  return acc + (v < 0 ? v : 0);
                }, 0))}
              </strong>
            </div>
            <div className={styles.card}>
              <span>Net adjustment</span>
              <strong className={netVariance >= 0 ? styles.positiveVal : styles.negativeVal}>
                {formatCurrency(netVariance)}
              </strong>
            </div>
          </div>

          <div className={styles.varianceTable}>
            <div className={styles.varianceHeader}>
              <span>Lines with variance — sorted by $ impact</span>
            </div>
            <div className={styles.varianceColHeader}>
              <span>Component</span>
              <span className={styles.numCol}>Expected</span>
              <span className={styles.numCol}>Counted</span>
              <span className={styles.numCol}>Variance</span>
              <span className={styles.numCol}>Var %</span>
              {isAdmin && <span className={styles.numCol}>Value</span>}
            </div>
            {varianceLines
              .sort((a, b) => {
                const ca = Array.isArray(a.component) ? a.component[0] : a.component;
                const cb = Array.isArray(b.component) ? b.component[0] : b.component;
                const va = Math.abs((Number(a.counted) - Number(a.expected_on_hand)) * Number(ca?.cost_per_unit ?? 0));
                const vb = Math.abs((Number(b.counted) - Number(b.expected_on_hand)) * Number(cb?.cost_per_unit ?? 0));
                return vb - va;
              })
              .map((line) => {
                const comp = Array.isArray(line.component) ? line.component[0] : line.component;
                const variance = Number(line.counted) - Number(line.expected_on_hand);
                const varPct = line.expected_on_hand !== 0
                  ? ((variance / Number(line.expected_on_hand)) * 100).toFixed(1)
                  : "—";
                const value = variance * Number(comp?.cost_per_unit ?? 0);
                const missingReason = !line.variance_reason_id;
                return (
                  <div key={line.id} className={`${styles.varianceLine} ${variance < 0 ? styles.lossLine : styles.gainLine}`}>
                    <div className={styles.varianceLineData}>
                      <div className={styles.compCell}>
                        <span className={styles.compName}>{comp?.name ?? "Unknown"}</span>
                        <span className={styles.compSku}>{comp?.sku ?? ""}</span>
                      </div>
                      <span className={`${styles.numCol} ${styles.muted}`}>{Number(line.expected_on_hand).toFixed(0)}</span>
                      <span className={styles.numCol}>{Number(line.counted).toFixed(0)}</span>
                      <span className={`${styles.numCol} ${variance > 0 ? styles.positive : styles.negative}`}>
                        {variance > 0 ? `+${variance}` : variance}
                      </span>
                      <span className={`${styles.numCol} ${variance > 0 ? styles.positive : styles.negative}`}>
                        {varPct === "—" ? "—" : `${variance > 0 ? "+" : ""}${varPct}%`}
                      </span>
                      {isAdmin && (
                        <span className={`${styles.numCol} ${value > 0 ? styles.positive : styles.negative}`}>
                          {formatCurrency(value)}
                        </span>
                      )}
                    </div>
                    <form action={saveVarianceReason} className={styles.reasonRow}>
                      <input type="hidden" name="line_id" value={line.id} />
                      <input type="hidden" name="session_id" value={sessionId} />
                      <select
                        name="variance_reason_id"
                        className={`${styles.reasonSelect} ${missingReason ? styles.reasonRequired : ""}`}
                        defaultValue={line.variance_reason_id ?? ""}
                        onChange={undefined}
                      >
                        <option value="">Select reason…</option>
                        {reasonsList.map((r) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                      <input
                        name="notes"
                        className={styles.reasonNotes}
                        defaultValue={line.notes ?? ""}
                        placeholder={reasonsList.find((r) => r.id === line.variance_reason_id)?.name === "Other" ? "Comment required…" : "Optional comment…"}
                      />
                      <button type="submit" className={styles.saveLineBtn}>Save</button>
                    </form>
                  </div>
                );
              })}

            {varianceLines.length === 0 && (
              <p className={styles.noVariance}>No variance lines — all counts matched expected.</p>
            )}

            <div className={styles.zeroVarianceSummary}>
              {lines.length - varianceLines.length} lines matched exactly — no action needed.
            </div>
          </div>
        </div>
      )}

      {/* Summary bar */}
      {isCounting && (
        <div className={styles.summaryBar}>
          <div className={styles.summaryItem}>
            <span>Counted</span>
            <strong>{countedLines.length} / {lines.length}</strong>
          </div>
          {!isInitial && (
            <>
              <div className={styles.summaryItem}>
                <span>Variances</span>
                <strong className={styles.warnVal}>{varianceLines.length} lines</strong>
              </div>
              {isAdmin && (
                <div className={styles.summaryItem}>
                  <span>Net variance</span>
                  <strong className={netVariance >= 0 ? styles.positiveVal : styles.negativeVal}>
                    {formatCurrency(netVariance)}
                  </strong>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create page.module.css**

Create `src/app/app/stocktake/[sessionId]/page.module.css`:

```css
.page { display: flex; flex-direction: column; gap: 20px; }
.topRow { display: flex; align-items: center; }
.back { font-size: 0.84rem; font-weight: 700; color: color-mix(in srgb, var(--brand-2) 72%, white); text-decoration: none; }

.header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; flex-wrap: wrap; }
.headerLeft { display: flex; flex-direction: column; gap: 6px; }
.titleRow { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.title { margin: 0; font-size: 1.4rem; color: var(--ink-strong); }
.typeBadge, .blindBadge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 4px;
  font-size: 0.78rem;
  font-weight: 600;
  background: color-mix(in srgb, var(--brand-2) 15%, transparent);
  color: var(--brand-2);
}
.blindBadge { background: color-mix(in srgb, var(--warning) 15%, transparent); color: var(--warning); }
.headerMeta { margin: 0; color: var(--ink-muted); font-size: 0.85rem; }
.headerNotes { margin: 0; color: var(--ink-muted); font-size: 0.85rem; font-style: italic; }
.headerActions { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }

.errorMsg { margin: 0; color: var(--danger); font-size: 0.88rem; }

/* Counting */
.countingSection { display: flex; flex-direction: column; gap: 14px; }
.bayGroup { border: 1px solid var(--stroke); border-radius: 14px; overflow: hidden; }
.bayHeader {
  padding: 8px 16px;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--brand-2);
  background: var(--bg-card-alt);
  border-bottom: 1px solid var(--stroke);
}
.bayCount { font-weight: 400; color: var(--ink-faint); }
.bayTable { background: var(--bg-card); }
.bayTableHeader {
  display: grid;
  grid-template-columns: 2fr repeat(4, 0.7fr) 0.5fr;
  gap: 8px;
  padding: 8px 14px;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink-faint);
  border-bottom: 1px solid color-mix(in srgb, var(--stroke) 50%, transparent);
  background: var(--bg-input);
}
.lineRow {
  display: grid;
  grid-template-columns: 2fr repeat(4, 0.7fr) 0.5fr;
  gap: 8px;
  padding: 9px 14px;
  border-bottom: 1px solid color-mix(in srgb, var(--stroke) 30%, transparent);
  align-items: center;
}
.lineRow:last-child { border-bottom: none; }
.compCell { display: flex; flex-direction: column; gap: 2px; }
.compName { color: var(--ink-strong); font-weight: 500; font-size: 0.9rem; }
.compSku { color: var(--ink-faint); font-size: 0.75rem; }
.numCol { text-align: right; }
.muted { color: var(--ink-muted); }
.positive { color: var(--ok); font-weight: 600; }
.negative { color: var(--danger); font-weight: 600; }
.countedVal { color: var(--ink-strong); font-weight: 700; }
.warnVal { color: var(--warning); }
.positiveVal { color: var(--ok); }
.negativeVal { color: var(--danger); }
.countInput {
  width: 72px;
  text-align: right;
  border: 1px solid color-mix(in srgb, var(--brand-2) 50%, transparent);
  border-radius: 6px;
  padding: 4px 8px;
  background: color-mix(in srgb, var(--brand-2) 8%, var(--bg-input));
  color: var(--ink-strong);
  font: inherit;
  font-weight: 600;
}
.saveLineBtn {
  font-size: 0.76rem;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 6px;
  border: 1px solid var(--stroke);
  background: var(--bg-card-alt);
  color: var(--ink-muted);
  cursor: pointer;
  white-space: nowrap;
}

/* Reconciliation */
.reconciliationSection { display: flex; flex-direction: column; gap: 16px; }
.summaryCards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; }
.card {
  padding: 16px 18px;
  border-radius: 14px;
  background: var(--bg-card);
  border: 1px solid var(--stroke-card);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.card span { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-faint); }
.card strong { font-size: 1.3rem; color: var(--ink-strong); }
.varianceTable { border: 1px solid var(--stroke); border-radius: 14px; overflow: hidden; background: var(--bg-card); }
.varianceHeader { padding: 12px 16px; border-bottom: 1px solid var(--stroke); font-size: 0.78rem; font-weight: 700; color: var(--ink-muted); background: var(--bg-card-alt); }
.varianceColHeader {
  display: grid;
  grid-template-columns: 2fr repeat(5, 0.7fr);
  gap: 8px;
  padding: 8px 14px;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--ink-faint);
  border-bottom: 1px solid var(--stroke);
  background: var(--bg-input);
}
.varianceLine { border-bottom: 1px solid color-mix(in srgb, var(--stroke) 40%, transparent); }
.varianceLine:last-of-type { border-bottom: none; }
.lossLine { background: color-mix(in srgb, var(--danger) 4%, var(--bg-card)); }
.gainLine { background: color-mix(in srgb, var(--ok) 3%, var(--bg-card)); }
.varianceLineData {
  display: grid;
  grid-template-columns: 2fr repeat(5, 0.7fr);
  gap: 8px;
  padding: 10px 14px 6px;
  align-items: center;
}
.reasonRow {
  display: grid;
  grid-template-columns: 1fr 2fr auto;
  gap: 10px;
  padding: 0 14px 10px;
  align-items: center;
}
.reasonSelect {
  border: 1px solid var(--stroke);
  border-radius: 6px;
  padding: 5px 8px;
  background: var(--bg-input);
  color: var(--ink-strong);
  font: inherit;
  font-size: 0.82rem;
}
.reasonRequired { border-color: color-mix(in srgb, var(--warning) 60%, transparent); background: color-mix(in srgb, var(--warning) 6%, var(--bg-input)); }
.reasonNotes {
  border: 1px solid var(--stroke);
  border-radius: 6px;
  padding: 5px 10px;
  background: var(--bg-input);
  color: var(--ink-muted);
  font: inherit;
  font-size: 0.82rem;
}
.noVariance { padding: 16px; color: var(--ink-muted); text-align: center; }
.zeroVarianceSummary { padding: 10px 16px; font-size: 0.82rem; color: var(--ink-faint); border-top: 1px solid var(--stroke); background: var(--bg-card-alt); }

/* Summary bar */
.summaryBar { display: flex; gap: 14px; }
.summaryItem {
  flex: 1;
  padding: 12px 16px;
  border-radius: 12px;
  background: var(--bg-card);
  border: 1px solid var(--stroke-card);
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.summaryItem span { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: var(--ink-faint); }
.summaryItem strong { font-size: 1.2rem; color: var(--ink-strong); }

/* Buttons */
.primary, .secondary, .danger {
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
.primary { border: none; background: linear-gradient(135deg, color-mix(in srgb, var(--brand-2) 72%, #142131), color-mix(in srgb, var(--brand-1) 88%, #0e1624)); color: #f8fbff; }
.primary:disabled { opacity: 0.45; cursor: not-allowed; }
.secondary { border: 1px solid var(--stroke); background: var(--bg-card-alt); color: var(--ink-strong); text-decoration: none; }
.danger { border: 1px solid color-mix(in srgb, var(--danger) 40%, transparent); background: var(--bg-card-alt); color: var(--danger); }

@media (max-width: 900px) {
  .summaryCards { grid-template-columns: repeat(2, 1fr); }
  .header { flex-direction: column; }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/app/stocktake/[sessionId]/
git commit -m "feat(stocktake): session detail page — counting, reconciliation, initial count views"
```

---

### Task 5: Print view

**Goal:** Create a print-friendly page at `/app/stocktake/[sessionId]/print` scoped by query params.

**Files:**
- Create: `src/app/app/stocktake/[sessionId]/print/page.tsx`

**Acceptance Criteria:**
- [ ] Page renders with white background, no nav/sidebar chrome (via `@media print` CSS in the page)
- [ ] Scoped by `?sublocation=X`, `?sublocation=X&row=Y&bay=Z`, or no params (full session)
- [ ] Header: session reference, type, location, date, section label, counter name + signature lines
- [ ] Table: Component, SKU, Expected (blank when blind count), Counted (blank line), Notes (blank line)
- [ ] "Print sheet" button on each bay header in the session detail page links to this route

**Verify:** Navigate to `/app/stocktake/[sessionId]/print`. Browser shows a print-ready sheet. Use browser print preview to confirm white background and no nav.

**Steps:**

- [ ] **Step 1: Create print/page.tsx**

Create `src/app/app/stocktake/[sessionId]/print/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";

type Props = {
  params: Promise<{ sessionId: string }>;
  searchParams?: Promise<{ sublocation?: string; row?: string; bay?: string }>;
};

type LineRow = {
  id: string;
  expected_on_hand: number;
  component: {
    name: string | null;
    sku: string | null;
    bin_sub_location: string | null;
    bin_row: string | null;
    bin_bay: string | null;
  } | Array<{
    name: string | null;
    sku: string | null;
    bin_sub_location: string | null;
    bin_row: string | null;
    bin_bay: string | null;
  }> | null;
};

export default async function PrintPage({ params, searchParams }: Props) {
  const { sessionId } = await params;
  const sp = (await searchParams) ?? {};

  const context = await getServerTenantContext();
  if (!context) return null;
  const { supabase, tenantId } = context;

  const [{ data: sessionData }, { data: linesData }] = await Promise.all([
    supabase
      .from("stocktake_session")
      .select("id,reference_number,session_type,blind_count,created_at,location:location_id(name)")
      .eq("tenant_id", tenantId)
      .eq("id", sessionId)
      .maybeSingle(),
    supabase
      .from("stocktake_line")
      .select("id,expected_on_hand,component:component_id(name,sku,bin_sub_location,bin_row,bin_bay)")
      .eq("tenant_id", tenantId)
      .eq("session_id", sessionId),
  ]);

  if (!sessionData) notFound();

  const session = sessionData as {
    id: string;
    reference_number: string | null;
    session_type: string;
    blind_count: boolean;
    created_at: string;
    location: { name: string | null } | Array<{ name: string | null }> | null;
  };

  const locationName = (Array.isArray(session.location) ? session.location[0] : session.location)?.name ?? "—";
  const allLines = (linesData ?? []) as LineRow[];

  // Filter by scope
  let lines = allLines;
  let sectionLabel = "Full session";

  if (sp.sublocation) {
    lines = lines.filter((l) => {
      const c = Array.isArray(l.component) ? l.component[0] : l.component;
      return c?.bin_sub_location === sp.sublocation;
    });
    sectionLabel = sp.sublocation;
    if (sp.row) {
      lines = lines.filter((l) => {
        const c = Array.isArray(l.component) ? l.component[0] : l.component;
        return c?.bin_row === sp.row;
      });
      sectionLabel += ` → Row ${sp.row}`;
      if (sp.bay) {
        lines = lines.filter((l) => {
          const c = Array.isArray(l.component) ? l.component[0] : l.component;
          return c?.bin_bay === sp.bay;
        });
        sectionLabel += ` → Bay ${sp.bay}`;
      }
    }
  }

  // Sort by component name
  lines.sort((a, b) => {
    const ca = (Array.isArray(a.component) ? a.component[0] : a.component)?.name ?? "";
    const cb = (Array.isArray(b.component) ? b.component[0] : b.component)?.name ?? "";
    return ca.localeCompare(cb);
  });

  const dateStr = new Date(session.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        body { font-family: Georgia, serif; color: #111; background: #fff; margin: 0; padding: 24px 32px; }
        @media print {
          body { padding: 0; }
          .no-print { display: none !important; }
        }
        h1 { font-size: 1rem; margin: 0 0 4px; font-family: Arial, sans-serif; }
        .meta { font-size: 0.82rem; color: #444; margin: 0; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 16px; }
        .sig-block { text-align: right; }
        .sig-line { border-bottom: 1px solid #111; width: 160px; height: 24px; margin: 4px 0 10px auto; }
        .sig-label { font-size: 0.75rem; color: #555; font-family: Arial, sans-serif; }
        table { width: 100%; border-collapse: collapse; font-size: 0.82rem; margin-top: 8px; }
        th { text-align: left; padding: 6px 8px; font-family: Arial, sans-serif; font-size: 0.75rem; border-bottom: 1px solid #888; }
        th.center { text-align: center; }
        td { padding: 8px 8px; border-bottom: 1px solid #ddd; vertical-align: middle; }
        td.center { text-align: center; }
        .blank-line { border-bottom: 1px solid #aaa; width: 70px; height: 20px; margin: 0 auto; }
        .note-line { border-bottom: 1px solid #ddd; height: 20px; width: 100%; }
        footer { margin-top: 16px; font-size: 0.75rem; color: #666; border-top: 1px solid #ddd; padding-top: 8px; font-family: Arial, sans-serif; }
        .print-btn { margin-bottom: 16px; padding: 8px 16px; font-size: 0.9rem; cursor: pointer; }
      `}</style>

      <button className="print-btn no-print" onClick={undefined} id="print-btn">
        🖨 Print this sheet
      </button>
      <script dangerouslySetInnerHTML={{ __html: "document.getElementById('print-btn').onclick = () => window.print();" }} />

      <div className="header">
        <div>
          <h1>ASSEMBLIO — STOCKTAKE SHEET</h1>
          <p className="meta">Session: <strong>{session.reference_number ?? sessionId.slice(0, 8)}</strong> &nbsp;·&nbsp; {session.session_type === "initial" ? "Initial count" : "Full count"} &nbsp;·&nbsp; {locationName}</p>
          <p className="meta">Date: {dateStr} &nbsp;·&nbsp; <strong>Section: {sectionLabel}</strong></p>
          {session.blind_count && <p className="meta" style={{ color: "#c00", marginTop: "4px" }}>⚠ Blind count — do not disclose expected quantities to counter</p>}
        </div>
        <div className="sig-block">
          <p className="sig-label">Counter name:</p>
          <div className="sig-line" />
          <p className="sig-label">Signature:</p>
          <div className="sig-line" />
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Component</th>
            <th>SKU</th>
            {!session.blind_count && <th className="center">Expected</th>}
            <th className="center">Counted</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const comp = Array.isArray(line.component) ? line.component[0] : line.component;
            return (
              <tr key={line.id}>
                <td>{comp?.name ?? "Unknown"}</td>
                <td style={{ color: "#555" }}>{comp?.sku ?? "—"}</td>
                {!session.blind_count && (
                  <td className="center">{Number(line.expected_on_hand).toFixed(0)}</td>
                )}
                <td className="center"><div className="blank-line" /></td>
                <td><div className="note-line" /></td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <footer>
        {session.blind_count
          ? "Blind count session — expected quantities are not shown. Count what you see and record it."
          : "Enter counted quantities in the spaces provided."}
        {" "}Return this sheet to your supervisor when complete.
      </footer>
    </>
  );
}
```

- [ ] **Step 2: Add "Print sheet" link to bay headers in session detail**

In `src/app/app/stocktake/[sessionId]/page.tsx`, update each `bayHeader` to include a print link. Find the `bayGroup` map and update the bay header div:

```tsx
<div className={styles.bayHeader}>
  <span>{groupLabel} <span className={styles.bayCount}>· {group.lines.length} items</span></span>
  <Link
    href={`/app/stocktake/${sessionId}/print${
      group.subLocation
        ? `?sublocation=${encodeURIComponent(group.subLocation)}${group.row ? `&row=${encodeURIComponent(group.row)}` : ""}${group.bay ? `&bay=${encodeURIComponent(group.bay)}` : ""}`
        : ""
    }`}
    target="_blank"
    className={styles.printLink}
  >
    🖨 Print
  </Link>
</div>
```

Add to `page.module.css`:
```css
.bayHeader { display: flex; justify-content: space-between; align-items: center; padding: 8px 16px; font-size: 0.78rem; font-weight: 700; color: var(--brand-2); background: var(--bg-card-alt); border-bottom: 1px solid var(--stroke); }
.printLink { font-size: 0.76rem; font-weight: 600; color: var(--ink-muted); text-decoration: none; }
.printLink:hover { color: var(--ink-strong); }
```

- [ ] **Step 3: Commit**

```bash
git add src/app/app/stocktake/[sessionId]/print/ src/app/app/stocktake/[sessionId]/page.tsx src/app/app/stocktake/[sessionId]/page.module.css
git commit -m "feat(stocktake): print view — bay/sublocation/full session scope, blind count aware"
```

---

### Task 6: CSV export/import

**Goal:** Export counted lines to CSV; import counted quantities from CSV matched by component id.

**Files:**
- Create: `src/app/api/stocktake/[sessionId]/export/route.ts`
- Create: `src/app/api/stocktake/[sessionId]/import/route.ts`
- Modify: `src/app/app/stocktake/[sessionId]/page.tsx` (add Export/Import buttons)

**Acceptance Criteria:**
- [ ] GET `/api/stocktake/[sessionId]/export` returns a CSV file download
- [ ] CSV columns: `component_id,component_name,sku,sub_location,row,bay,expected,counted,notes`
- [ ] POST `/api/stocktake/[sessionId]/import` accepts CSV upload, matches by `component_id`, updates `counted` and `notes`
- [ ] Import only works when session status is `counting`
- [ ] Both routes require authenticated tenant context

**Verify:** Open a counting session. Click "Export CSV" → file downloads. Open in Excel, fill "counted" column, save. Click "Import CSV" → upload → page refreshes with updated counts.

**Steps:**

- [ ] **Step 1: Create export route**

Create `src/app/api/stocktake/[sessionId]/export/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getServerTenantContext } from "@/lib/tenant/context";

type LineRow = {
  id: string;
  expected_on_hand: number;
  counted: number | null;
  notes: string | null;
  component: {
    id: string;
    name: string | null;
    sku: string | null;
    bin_sub_location: string | null;
    bin_row: string | null;
    bin_bay: string | null;
  } | Array<{
    id: string;
    name: string | null;
    sku: string | null;
    bin_sub_location: string | null;
    bin_row: string | null;
    bin_bay: string | null;
  }> | null;
};

function csvEscape(val: string | null | undefined): string {
  const s = val ?? "";
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;

  const context = await getServerTenantContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { supabase, tenantId } = context;

  const { data: lines } = await supabase
    .from("stocktake_line")
    .select("id,expected_on_hand,counted,notes,component:component_id(id,name,sku,bin_sub_location,bin_row,bin_bay)")
    .eq("tenant_id", tenantId)
    .eq("session_id", sessionId);

  const rows = (lines ?? []) as LineRow[];
  rows.sort((a, b) => {
    const ca = Array.isArray(a.component) ? a.component[0] : a.component;
    const cb = Array.isArray(b.component) ? b.component[0] : b.component;
    return (ca?.name ?? "").localeCompare(cb?.name ?? "");
  });

  const header = "component_id,component_name,sku,sub_location,row,bay,expected,counted,notes\r\n";
  const body = rows.map((l) => {
    const c = Array.isArray(l.component) ? l.component[0] : l.component;
    return [
      csvEscape(c?.id),
      csvEscape(c?.name),
      csvEscape(c?.sku),
      csvEscape(c?.bin_sub_location),
      csvEscape(c?.bin_row),
      csvEscape(c?.bin_bay),
      String(Number(l.expected_on_hand).toFixed(0)),
      l.counted !== null ? String(Number(l.counted).toFixed(0)) : "",
      csvEscape(l.notes),
    ].join(",");
  }).join("\r\n");

  const csv = header + body;
  const { data: sessionData } = await supabase
    .from("stocktake_session")
    .select("reference_number")
    .eq("id", sessionId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const ref = (sessionData as { reference_number: string | null } | null)?.reference_number ?? sessionId.slice(0, 8);

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${ref}-stocktake.csv"`,
    },
  });
}
```

- [ ] **Step 2: Create import route**

Create `src/app/api/stocktake/[sessionId]/import/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getServerTenantContext } from "@/lib/tenant/context";

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).filter(Boolean).map((line) => {
    const vals = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    return Object.fromEntries(headers.map((h, i) => [h, vals[i] ?? ""]));
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;

  const context = await getServerTenantContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { supabase, tenantId } = context;

  // Verify session is in counting status
  const { data: sessionData } = await supabase
    .from("stocktake_session")
    .select("id,status")
    .eq("id", sessionId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const session = sessionData as { id: string; status: string } | null;
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (session.status !== "counting" && session.status !== "open") {
    return NextResponse.json({ error: "Session is not in counting status" }, { status: 400 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });

  const text = await file.text();
  const rows = parseCSV(text);

  // Get existing lines for this session
  const { data: existingLines } = await supabase
    .from("stocktake_line")
    .select("id,component_id")
    .eq("tenant_id", tenantId)
    .eq("session_id", sessionId);

  const lineByComponentId = new Map(
    ((existingLines ?? []) as { id: string; component_id: string }[]).map((l) => [l.component_id, l.id])
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let updated = 0;
  for (const row of rows) {
    const componentId = row["component_id"]?.trim();
    const countedRaw = row["counted"]?.trim();
    const notes = row["notes"]?.trim() || null;

    if (!componentId || countedRaw === "") continue;
    const counted = Number(countedRaw);
    if (!Number.isFinite(counted) || counted < 0) continue;

    const lineId = lineByComponentId.get(componentId);
    if (!lineId) continue;

    await supabase
      .from("stocktake_line")
      .update({ counted, notes, counted_by: user?.id ?? null, counted_at: new Date().toISOString() })
      .eq("id", lineId)
      .eq("tenant_id", tenantId);

    updated++;
  }

  return NextResponse.json({ updated });
}
```

- [ ] **Step 3: Add Export/Import buttons to session detail page**

In `src/app/app/stocktake/[sessionId]/page.tsx`, update the `headerActions` section to include export/import when `isCounting`:

```tsx
{/* Add after the print link, before submit buttons: */}
{(isCounting || isReconciliation) && (
  <a href={`/api/stocktake/${sessionId}/export`} className={styles.secondary}>
    Export CSV
  </a>
)}
{isCounting && (
  <form
    action={`/api/stocktake/${sessionId}/import`}
    method="POST"
    encType="multipart/form-data"
    onSubmit={undefined}
  >
    <label className={styles.secondary} style={{ cursor: "pointer" }}>
      Import CSV
      <input type="file" name="file" accept=".csv" style={{ display: "none" }}
        onChange="this.form.submit()" />
    </label>
  </form>
)}
```

Note: The `onChange="this.form.submit()"` requires a client component for interactivity. Convert the import button to a small client component `ImportCsvButton`:

Create `src/app/app/stocktake/[sessionId]/import-csv-button.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import styles from "./page.module.css";

export function ImportCsvButton({ sessionId }: { sessionId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    await fetch(`/api/stocktake/${sessionId}/import`, { method: "POST", body: fd });
    router.refresh();
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <label className={styles.secondary} style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", minHeight: "42px", padding: "0 18px" }}>
      Import CSV
      <input ref={inputRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleChange} />
    </label>
  );
}
```

Then in `page.tsx` import and use `<ImportCsvButton sessionId={sessionId} />` instead of the form.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/stocktake/ src/app/app/stocktake/[sessionId]/import-csv-button.tsx src/app/app/stocktake/[sessionId]/page.tsx
git commit -m "feat(stocktake): CSV export/import — download lines, upload counted quantities"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Initial stock count onboarding wizard | Task 3 (banner + modal) + Task 4 (initial view + applyOpeningStock action) |
| Session header: reference_number, session_type, notes, blind_count, approved_by/at | Task 0 (schema) + Task 3 (createStocktakeSession) + Task 4 (page header) |
| Enriched line fields: variance %, cost per unit, extended $ value, counted_by, counted_at, notes | Task 0 (schema) + Task 4 (page counting view) |
| Blind count mode | Task 3 (session creation) + Task 4 (showBlind flag hides Expected column) |
| Variance reconciliation + reason codes | Task 4 (reconciliation view, saveVarianceReason, approveAndApply) |
| CSV export/import | Task 6 |
| Bin location on components | Task 0 (schema) + Task 2 (component UI) |
| Print-per-section | Task 5 |
| Session list page | Task 3 |
| Multi-page routing | Tasks 3 + 4 |
| Lifecycle update | Task 1 |
| Role-based: approve/apply admin-only | Task 4 (`isAdmin` check on approve buttons) |

All spec requirements covered.

**Placeholder scan:** No TBDs or incomplete code blocks.

**Type consistency:** `StocktakeSessionStatus` exported from `lifecycle.ts` used consistently. `LineRow`, `SessionRecord` types defined inline per page (no cross-file inconsistency). `saveVarianceReason`, `approveAndApply`, `sendBackForRecount`, `submitForReview`, `applyOpeningStock`, `saveLineCount` all defined in `[sessionId]/actions.ts` and imported in `page.tsx`.

**One gap fixed:** The `seedVarianceReasonsIfNeeded` function in `actions.ts` accepts the supabase client typed as a generic `ReturnType<...>`. In practice, pass `context.supabase` from `getServerTenantContext()`. The type annotation should match the pattern used elsewhere in the codebase — use `SupabaseClient` from `@supabase/supabase-js` if needed.
