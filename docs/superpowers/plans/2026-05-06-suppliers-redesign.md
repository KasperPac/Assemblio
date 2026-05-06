# Suppliers Module Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the suppliers module from a name-only list into a full vendor management hub: contact details, supplier–component catalog with quantity price breaks, preferred supplier tracking, actual vs. promised lead time derived from delivery history, and a supplier comparison view on the component page.

**Architecture:** Supplier-centric hub (Approach A from spec). Supplier detail page has three tabs (Overview, Components, Purchase Orders) implemented as a single client component `supplier-tabs.tsx`. Data is fetched server-side in `page.tsx` and passed down. The component detail page gains a fourth "Suppliers" tab using the same pattern. The `delivery_receipt` table (which already exists with `received_at`, `supplier_id`, `purchase_order_id`) provides the data needed to compute actual vs. promised lead times — no new columns needed on `purchase_order` for that calculation.

**Tech Stack:** Next.js 15 App Router, React 19, Supabase PostgREST + RLS, TypeScript, CSS Modules, Vitest

**Spec:** `docs/superpowers/specs/2026-05-06-suppliers-redesign-design.md`

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `supabase/patches/suppliers_module.sql` | Create | Schema changes: extend `suppliers`, new tables, add `expected_date` + `unit_cost` columns |
| `src/lib/suppliers/types.ts` | Create | TypeScript types for all new tables |
| `src/lib/suppliers/catalog.ts` | Create | `getAvgActualLeadTimes()`, `deriveLeadTimeStatus()`, `resolvePriceForQuantity()` |
| `src/lib/suppliers/catalog.test.ts` | Create | Unit tests for pure logic functions |
| `src/app/app/suppliers/page.tsx` | Modify | Redesigned list: component count, last PO, open POs badge, All/Active/Archived filter, search |
| `src/app/app/suppliers/actions.ts` | Modify | Add `archiveSupplier` |
| `src/app/app/suppliers/suppliers.module.css` | Modify | Updated column layout |
| `src/app/app/suppliers/[supplierId]/page.tsx` | Create | Supplier detail server component — fetches all tab data |
| `src/app/app/suppliers/[supplierId]/supplier-tabs.tsx` | Create | Client tabs: Overview / Components / Purchase Orders |
| `src/app/app/suppliers/[supplierId]/supplier-tabs.module.css` | Create | Styles for supplier detail tabs |
| `src/app/app/suppliers/[supplierId]/actions.ts` | Create | `updateSupplier`, `addContact`, `removeContact`, `linkComponent`, `unlinkComponent`, `togglePreferred`, `addPriceBreak`, `removePriceBreak` |
| `src/app/app/components/[componentId]/page.tsx` | Modify | Add supplier catalog fetch; pass `supplierCatalog` to `DetailTabs` |
| `src/app/app/components/[componentId]/detail-tabs.tsx` | Modify | Add "Suppliers" tab with comparison table + link supplier modal |
| `src/app/app/components/[componentId]/component-detail.module.css` | Modify | Styles for suppliers tab |

---

### Task 1: Schema patch and TypeScript types

**Goal:** Apply the database schema changes needed by the suppliers module and define the TypeScript types that all subsequent tasks depend on.

**Files:**
- Create: `supabase/patches/suppliers_module.sql`
- Create: `src/lib/suppliers/types.ts`

**Acceptance Criteria:**
- [ ] `suppliers` table has all new columns (contact_name, contact_email, contact_phone, website, address, payment_terms, default_currency, default_lead_time_days, notes, is_active)
- [ ] `supplier_contacts`, `supplier_components`, `supplier_component_price_breaks` tables exist with correct columns and RLS
- [ ] `purchase_order` has `expected_date` column (nullable timestamptz)
- [ ] `purchase_order_line` has `unit_cost` column (nullable numeric)
- [ ] All new tables have tenant_isolation RLS policies matching the pattern used in `supabase/patches/delivery_receipt_tables.sql`
- [ ] TypeScript types in `src/lib/suppliers/types.ts` compile without errors

**Verify:** `npx tsc --noEmit` → no errors

**Steps:**

- [ ] **Step 1: Write the SQL patch**

Create `supabase/patches/suppliers_module.sql`:

```sql
-- Extend suppliers table
alter table public.suppliers
  add column if not exists contact_name text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists website text,
  add column if not exists address text,
  add column if not exists payment_terms text,
  add column if not exists default_currency text,
  add column if not exists default_lead_time_days integer,
  add column if not exists notes text,
  add column if not exists is_active boolean not null default true;

-- supplier_contacts
create table if not exists public.supplier_contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  role text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.supplier_contacts enable row level security;

create policy "tenant_isolation_select" on public.supplier_contacts
  for select using ((tenant_id = public.current_tenant_id()) or public.is_super_admin());
create policy "tenant_isolation_insert" on public.supplier_contacts
  for insert with check ((tenant_id = public.current_tenant_id()) or public.is_super_admin());
create policy "tenant_isolation_update" on public.supplier_contacts
  for update using ((tenant_id = public.current_tenant_id()) or public.is_super_admin())
  with check ((tenant_id = public.current_tenant_id()) or public.is_super_admin());
create policy "tenant_isolation_delete" on public.supplier_contacts
  for delete using ((tenant_id = public.current_tenant_id()) or public.is_super_admin());

-- supplier_components (catalog)
create table if not exists public.supplier_components (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenant(id),
  supplier_id uuid not null references public.suppliers(id) on delete cascade,
  component_id uuid not null references public.component(id) on delete cascade,
  supplier_part_number text,
  unit_cost numeric check (unit_cost >= 0),
  currency text,
  lead_time_days integer check (lead_time_days >= 0),
  moq numeric check (moq >= 0),
  is_preferred boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  constraint supplier_components_unique unique (tenant_id, supplier_id, component_id)
);

alter table public.supplier_components enable row level security;

create policy "tenant_isolation_select" on public.supplier_components
  for select using ((tenant_id = public.current_tenant_id()) or public.is_super_admin());
create policy "tenant_isolation_insert" on public.supplier_components
  for insert with check ((tenant_id = public.current_tenant_id()) or public.is_super_admin());
create policy "tenant_isolation_update" on public.supplier_components
  for update using ((tenant_id = public.current_tenant_id()) or public.is_super_admin())
  with check ((tenant_id = public.current_tenant_id()) or public.is_super_admin());
create policy "tenant_isolation_delete" on public.supplier_components
  for delete using ((tenant_id = public.current_tenant_id()) or public.is_super_admin());

-- supplier_component_price_breaks
create table if not exists public.supplier_component_price_breaks (
  id uuid primary key default gen_random_uuid(),
  supplier_component_id uuid not null references public.supplier_components(id) on delete cascade,
  min_quantity numeric not null check (min_quantity > 0),
  unit_cost numeric not null check (unit_cost >= 0),
  created_at timestamptz not null default now()
);

alter table public.supplier_component_price_breaks enable row level security;

-- Price breaks inherit access via their parent supplier_component; use a join policy
create policy "tenant_isolation_select" on public.supplier_component_price_breaks
  for select using (
    exists (
      select 1 from public.supplier_components sc
      where sc.id = supplier_component_id
        and (sc.tenant_id = public.current_tenant_id() or public.is_super_admin())
    )
  );
create policy "tenant_isolation_insert" on public.supplier_component_price_breaks
  for insert with check (
    exists (
      select 1 from public.supplier_components sc
      where sc.id = supplier_component_id
        and (sc.tenant_id = public.current_tenant_id() or public.is_super_admin())
    )
  );
create policy "tenant_isolation_delete" on public.supplier_component_price_breaks
  for delete using (
    exists (
      select 1 from public.supplier_components sc
      where sc.id = supplier_component_id
        and (sc.tenant_id = public.current_tenant_id() or public.is_super_admin())
    )
  );

-- Extend purchase_order with expected delivery date
alter table public.purchase_order
  add column if not exists expected_date timestamptz;

-- Extend purchase_order_line with unit cost captured at time of ordering
alter table public.purchase_order_line
  add column if not exists unit_cost numeric check (unit_cost >= 0);
```

- [ ] **Step 2: Apply the patch to your local Supabase instance**

Run: `npx supabase db push` (or paste into the Supabase SQL editor for a remote project)

Expected: patch executes without errors

- [ ] **Step 3: Write TypeScript types**

Create `src/lib/suppliers/types.ts`:

```typescript
export type Supplier = {
  id: string;
  tenant_id: string;
  name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website: string | null;
  address: string | null;
  payment_terms: string | null;
  default_currency: string | null;
  default_lead_time_days: number | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
};

export type SupplierContact = {
  id: string;
  tenant_id: string;
  supplier_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  is_primary: boolean;
  created_at: string;
};

export type SupplierComponent = {
  id: string;
  tenant_id: string;
  supplier_id: string;
  component_id: string;
  supplier_part_number: string | null;
  unit_cost: number | null;
  currency: string | null;
  lead_time_days: number | null;
  moq: number | null;
  is_preferred: boolean;
  notes: string | null;
  created_at: string;
};

export type SupplierComponentPriceBreak = {
  id: string;
  supplier_component_id: string;
  min_quantity: number;
  unit_cost: number;
  created_at: string;
};

// Lead time status derived from avg actual vs. promised
export type LeadTimeStatus = "on-time" | "late" | "insufficient-data";

// Avg actual lead time for one supplier-component pair
export type AvgLeadTime = {
  componentId: string;
  avgDays: number;
  sampleCount: number;
  status: LeadTimeStatus;
};
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add supabase/patches/suppliers_module.sql src/lib/suppliers/types.ts
git commit -m "feat(suppliers): schema patch — extend suppliers, catalog tables, price breaks"
```

---

### Task 2: Catalog logic and tests

**Goal:** Implement the pure logic functions and the Supabase data-fetching function needed to compute avg actual lead times and resolve prices for a given order quantity. These are used by Tasks 3–6.

**Files:**
- Create: `src/lib/suppliers/catalog.ts`
- Create: `src/lib/suppliers/catalog.test.ts`

**Acceptance Criteria:**
- [ ] `deriveLeadTimeStatus(avgDays, promisedDays)` returns `"on-time"` when avgDays ≤ promisedDays, `"late"` when avgDays > promisedDays
- [ ] `resolvePriceForQuantity(breaks, quantity, baseUnitCost)` returns the correct tiered price
- [ ] `getAvgActualLeadTimes()` returns a `Map<string, AvgLeadTime>` keyed by componentId; entries with fewer than 3 delivery receipts are omitted
- [ ] All tests pass: `npx vitest run src/lib/suppliers/catalog.test.ts`

**Verify:** `npx vitest run src/lib/suppliers/catalog.test.ts` → all tests pass

**Steps:**

- [ ] **Step 1: Write the failing tests first**

Create `src/lib/suppliers/catalog.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  deriveLeadTimeStatus,
  resolvePriceForQuantity,
} from "./catalog";
import type { SupplierComponentPriceBreak } from "./types";

describe("deriveLeadTimeStatus", () => {
  it("returns on-time when avg equals promised", () => {
    expect(deriveLeadTimeStatus(7, 7)).toBe("on-time");
  });

  it("returns on-time when avg is less than promised", () => {
    expect(deriveLeadTimeStatus(5.5, 7)).toBe("on-time");
  });

  it("returns late when avg exceeds promised", () => {
    expect(deriveLeadTimeStatus(9.1, 7)).toBe("late");
  });
});

describe("resolvePriceForQuantity", () => {
  const breaks: SupplierComponentPriceBreak[] = [
    { id: "1", supplier_component_id: "x", min_quantity: 50, unit_cost: 3.8, created_at: "" },
    { id: "2", supplier_component_id: "x", min_quantity: 200, unit_cost: 3.4, created_at: "" },
  ];

  it("returns base cost when quantity is below the first break", () => {
    expect(resolvePriceForQuantity(breaks, 10, 4.2)).toBe(4.2);
  });

  it("returns first break price at exactly the first break quantity", () => {
    expect(resolvePriceForQuantity(breaks, 50, 4.2)).toBe(3.8);
  });

  it("returns first break price when quantity is between breaks", () => {
    expect(resolvePriceForQuantity(breaks, 100, 4.2)).toBe(3.8);
  });

  it("returns second break price at the second break quantity", () => {
    expect(resolvePriceForQuantity(breaks, 200, 4.2)).toBe(3.4);
  });

  it("returns base cost when breaks array is empty", () => {
    expect(resolvePriceForQuantity([], 100, 4.2)).toBe(4.2);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx vitest run src/lib/suppliers/catalog.test.ts`
Expected: FAIL — `deriveLeadTimeStatus` and `resolvePriceForQuantity` are not yet defined

- [ ] **Step 3: Implement the module**

Create `src/lib/suppliers/catalog.ts`. This file exports two async fetchers and two pure helpers used by both the supplier detail page (keyed by componentId) and the component detail page (keyed by supplierId):

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";
import type { SupplierComponentPriceBreak, AvgLeadTime, LeadTimeStatus } from "./types";

export function deriveLeadTimeStatus(
  avgDays: number,
  promisedDays: number
): LeadTimeStatus {
  return avgDays <= promisedDays ? "on-time" : "late";
}

// Returns the unit cost for a given quantity, applying the highest qualifying price break.
// breaks must not be empty; if no break qualifies, returns baseUnitCost.
export function resolvePriceForQuantity(
  breaks: SupplierComponentPriceBreak[],
  quantity: number,
  baseUnitCost: number
): number {
  const qualifying = breaks
    .filter((b) => quantity >= b.min_quantity)
    .sort((a, b) => b.min_quantity - a.min_quantity);
  return qualifying[0]?.unit_cost ?? baseUnitCost;
}

type DeliveryReceiptRow = {
  received_at: string;
  purchase_order: { created_at: string } | Array<{ created_at: string }> | null;
  delivery_receipt_line:
    | Array<{ component_id: string }>
    | { component_id: string }
    | null;
};

// Computes avg actual lead time per component for a given supplier.
// Uses delivery_receipt.received_at minus purchase_order.created_at.
// Returns only entries with >= 3 receipts (insufficient data excluded).
export async function getAvgActualLeadTimes(
  supabase: SupabaseClient,
  tenantId: string,
  supplierId: string
): Promise<Map<string, AvgLeadTime>> {
  const { data } = await supabase
    .from("delivery_receipt")
    .select(
      "received_at, purchase_order:purchase_order_id(created_at), delivery_receipt_line(component_id)"
    )
    .eq("supplier_id", supplierId)
    .eq("tenant_id", tenantId)
    .not("purchase_order_id", "is", null);

  const accum = new Map<string, { totalDays: number; count: number }>();

  for (const row of (data ?? []) as DeliveryReceiptRow[]) {
    if (!row.received_at) continue;
    const po = Array.isArray(row.purchase_order)
      ? row.purchase_order[0]
      : row.purchase_order;
    if (!po) continue;

    const days =
      (new Date(row.received_at).getTime() - new Date(po.created_at).getTime()) /
      (1000 * 60 * 60 * 24);
    if (days < 0) continue;

    const lines = Array.isArray(row.delivery_receipt_line)
      ? row.delivery_receipt_line
      : row.delivery_receipt_line
      ? [row.delivery_receipt_line]
      : [];

    for (const line of lines) {
      const entry = accum.get(line.component_id) ?? { totalDays: 0, count: 0 };
      accum.set(line.component_id, {
        totalDays: entry.totalDays + days,
        count: entry.count + 1,
      });
    }
  }

  const result = new Map<string, AvgLeadTime>();
  for (const [componentId, { totalDays, count }] of accum) {
    if (count < 3) continue;
    const avgDays = totalDays / count;
    result.set(componentId, { componentId, avgDays, sampleCount: count, status: "insufficient-data" });
  }
  return result;
}

// For the component detail page: given one componentId, returns avg lead time per supplierId.
// Queries all delivery_receipts for the given component, groups by supplier.
export async function getAvgActualLeadTimesForComponent(
  supabase: SupabaseClient,
  tenantId: string,
  componentId: string
): Promise<Map<string, AvgLeadTime>> {
  const { data } = await supabase
    .from("delivery_receipt_line")
    .select(
      "delivery_receipt:delivery_receipt_id(received_at, supplier_id, purchase_order:purchase_order_id(created_at))"
    )
    .eq("component_id", componentId)
    .eq("tenant_id", tenantId);

  const accum = new Map<string, { totalDays: number; count: number }>();

  for (const lineRow of data ?? []) {
    const dr = Array.isArray(lineRow.delivery_receipt)
      ? lineRow.delivery_receipt[0]
      : lineRow.delivery_receipt;
    if (!dr?.received_at || !dr.supplier_id) continue;
    const po = Array.isArray(dr.purchase_order) ? dr.purchase_order[0] : dr.purchase_order;
    if (!po) continue;

    const days =
      (new Date(dr.received_at).getTime() - new Date(po.created_at).getTime()) /
      (1000 * 60 * 60 * 24);
    if (days < 0) continue;

    const entry = accum.get(dr.supplier_id) ?? { totalDays: 0, count: 0 };
    accum.set(dr.supplier_id, { totalDays: entry.totalDays + days, count: entry.count + 1 });
  }

  const result = new Map<string, AvgLeadTime>();
  for (const [supplierId, { totalDays, count }] of accum) {
    if (count < 3) continue;
    const avgDays = totalDays / count;
    result.set(supplierId, { componentId, avgDays, sampleCount: count, status: "insufficient-data" });
  }
  return result;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npx vitest run src/lib/suppliers/catalog.test.ts`
Expected: all 8 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/suppliers/catalog.ts src/lib/suppliers/catalog.test.ts
git commit -m "feat(suppliers): catalog logic — avg lead time, price break resolution"
```

---

### Task 3: Supplier list page redesign

**Goal:** Replace the current name-only list with a richer view showing component count, last PO date, open PO count badge, All/Active/Archived filter tabs, search, and an archive action.

**Files:**
- Modify: `src/app/app/suppliers/page.tsx`
- Modify: `src/app/app/suppliers/actions.ts`
- Modify: `src/app/app/suppliers/suppliers.module.css`

**Acceptance Criteria:**
- [ ] List shows: name, website, component count, default lead time, last PO date, open POs badge
- [ ] All / Active / Archived tab filter works (default: Active)
- [ ] Search by name filters the list client-side
- [ ] Archive action sets `is_active = false` on the supplier
- [ ] Archived suppliers are dimmed and hidden from Active tab, shown in All and Archived tabs
- [ ] ••• menu per row: Rename, Archive (or Unarchive), with Delete shown only when component count and PO count are both zero

**Verify:** Run `npm run dev`, navigate to `/app/suppliers`. Confirm list renders with columns, filter tabs switch correctly, archiving a supplier hides it from Active tab.

**Steps:**

- [ ] **Step 1: Add `archiveSupplier` to actions.ts**

In `src/app/app/suppliers/actions.ts`, add after the existing actions:

```typescript
export async function archiveSupplier(
  _prevState: SupplierState,
  formData: FormData
): Promise<SupplierState> {
  const supplierId = formData.get("supplier_id")?.toString() ?? "";
  if (!supplierId) return { error: "Missing supplier id." };

  const context = await getServerTenantContext();
  if (!context) return { error: "Missing tenant context." };
  const { supabase, tenantId } = context;

  const { error } = await supabase
    .from("suppliers")
    .update({ is_active: false })
    .eq("tenant_id", tenantId)
    .eq("id", supplierId);

  if (error) return { error: error.message };

  revalidatePath("/app/suppliers");
  return { success: "Supplier archived." };
}
```

- [ ] **Step 2: Rewrite `page.tsx` with enriched query and filter tabs**

Replace `src/app/app/suppliers/page.tsx` entirely:

```typescript
import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "./suppliers.module.css";
import { createSupplier } from "./actions";
import SupplierCreateForm from "./supplier-create-form";
import PageHeader from "../_ui/page-header";
import Link from "next/link";

type SupplierRow = {
  id: string;
  name: string;
  website: string | null;
  default_lead_time_days: number | null;
  is_active: boolean;
  component_count: number;
  last_po_date: string | null;
  open_po_count: number;
};

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter = "active" } = await searchParams;
  const supabase = await createSupabaseServerClient();

  // Fetch suppliers with aggregated counts via Supabase PostgREST
  const query = supabase
    .from("suppliers")
    .select(
      `id, name, website, default_lead_time_days, is_active,
       supplier_components(count),
       purchase_order(id, status, created_at)`
    )
    .order("name");

  if (filter === "active") query.eq("is_active", true);
  if (filter === "archived") query.eq("is_active", false);

  const { data, error } = await query;

  const rows: SupplierRow[] = (data ?? []).map((s: any) => {
    const pos = (s.purchase_order ?? []) as Array<{
      id: string;
      status: string;
      created_at: string;
    }>;
    const openPos = pos.filter((p) => p.status === "open");
    const lastPo = pos
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    return {
      id: s.id,
      name: s.name,
      website: s.website ?? null,
      default_lead_time_days: s.default_lead_time_days ?? null,
      is_active: s.is_active,
      component_count: Array.isArray(s.supplier_components)
        ? s.supplier_components.length
        : 0,
      last_po_date: lastPo?.created_at ?? null,
      open_po_count: openPos.length,
    };
  });

  const tabs = [
    { key: "active", label: "Active" },
    { key: "archived", label: "Archived" },
    { key: "all", label: "All" },
  ];

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Suppliers"
        title="Supplier directory"
        description="Manage suppliers used throughout purchasing and inbound stock workflows."
      />

      <div className={styles.toolbar}>
        <div className={styles.filterTabs}>
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={`/app/suppliers?filter=${t.key}`}
              className={`${styles.filterTab} ${filter === t.key ? styles.filterTabActive : ""}`}
            >
              {t.label}
            </Link>
          ))}
        </div>
        <SupplierCreateForm action={createSupplier} />
      </div>

      {error ? (
        <p className={styles.errorMsg}>Failed to load suppliers.</p>
      ) : rows.length === 0 ? (
        <p className={styles.emptyMsg}>No suppliers.</p>
      ) : (
        <div className={styles.table}>
          <div className={styles.tableHeader}>
            <span>Supplier</span>
            <span>Components</span>
            <span>Lead time</span>
            <span>Last PO</span>
            <span>Open POs</span>
          </div>
          {rows.map((row) => (
            <div
              key={row.id}
              className={`${styles.tableRow} ${!row.is_active ? styles.tableRowArchived : ""}`}
            >
              <div>
                <Link href={`/app/suppliers/${row.id}`} className={styles.supplierName}>
                  {row.name}
                </Link>
                {row.website && (
                  <div className={styles.supplierWebsite}>{row.website}</div>
                )}
              </div>
              <span>
                {row.component_count > 0 ? `${row.component_count} components` : "—"}
              </span>
              <span>
                {row.default_lead_time_days ? `${row.default_lead_time_days} days` : "—"}
              </span>
              <span>
                {row.last_po_date
                  ? new Date(row.last_po_date).toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })
                  : "—"}
              </span>
              <span>
                {row.open_po_count > 0 ? (
                  <span className={styles.openPoBadge}>{row.open_po_count} open</span>
                ) : (
                  "—"
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Update CSS**

In `src/app/app/suppliers/suppliers.module.css`, replace existing rules and add:

```css
.page {
  padding: 2rem;
  max-width: 1100px;
}

.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  gap: 1rem;
}

.filterTabs {
  display: flex;
  gap: 0.25rem;
}

.filterTab {
  padding: 0.4rem 1rem;
  font-size: 0.82rem;
  border-radius: 6px;
  text-decoration: none;
  color: inherit;
  opacity: 0.55;
  background: rgba(255, 255, 255, 0.05);
}

.filterTab:hover { opacity: 0.8; }
.filterTabActive { opacity: 1; background: rgba(255, 255, 255, 0.12); }

.table { border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; overflow: hidden; }

.tableHeader,
.tableRow {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr 1fr;
  gap: 0;
  padding: 0.75rem 1rem;
  font-size: 0.85rem;
  align-items: center;
}

.tableHeader {
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.45;
  border-bottom: 1px solid rgba(255,255,255,0.1);
}

.tableRow { border-bottom: 1px solid rgba(255,255,255,0.06); }
.tableRow:last-child { border-bottom: none; }
.tableRowArchived { opacity: 0.4; }

.supplierName {
  font-weight: 500;
  text-decoration: none;
  color: var(--color-link, #4f8ef7);
}

.supplierWebsite {
  font-size: 0.75rem;
  opacity: 0.5;
  margin-top: 2px;
}

.openPoBadge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.78rem;
  background: rgba(79,142,247,0.2);
  color: #4f8ef7;
}

.errorMsg, .emptyMsg { opacity: 0.5; font-size: 0.9rem; margin-top: 2rem; }
```

- [ ] **Step 4: Start dev server and verify**

Run: `npm run dev`
Navigate to `http://localhost:3000/app/suppliers`

Check:
- Table renders with 5 columns
- Filter tabs switch between Active / Archived / All
- Clicking a supplier name navigates to `/app/suppliers/[id]` (404 is fine — detail page built in Task 4)

- [ ] **Step 5: Commit**

```bash
git add src/app/app/suppliers/page.tsx src/app/app/suppliers/actions.ts src/app/app/suppliers/suppliers.module.css
git commit -m "feat(suppliers): redesign list page — component count, PO activity, filter tabs"
```

---

### Task 4: Supplier detail page — scaffold and Overview tab

**Goal:** Create the supplier detail route with a three-tab layout and a fully functional Overview tab showing contact info, additional contacts, and notes.

**Files:**
- Create: `src/app/app/suppliers/[supplierId]/page.tsx`
- Create: `src/app/app/suppliers/[supplierId]/supplier-tabs.tsx`
- Create: `src/app/app/suppliers/[supplierId]/supplier-tabs.module.css`
- Create: `src/app/app/suppliers/[supplierId]/actions.ts`

**Acceptance Criteria:**
- [ ] Navigating to `/app/suppliers/[id]` renders supplier name, website, active status in page header
- [ ] Overview tab shows all contact fields in a grid
- [ ] Additional contacts list renders; "Add contact" creates a new `supplier_contacts` row
- [ ] Removing a contact deletes the row
- [ ] Notes field is editable and saves via `updateSupplier`
- [ ] Archive button sets `is_active = false` and redirects to `/app/suppliers`
- [ ] Invalid supplierId triggers Next.js `notFound()`

**Verify:** Run `npm run dev`, navigate to an existing supplier. Overview tab renders with data from the database.

**Steps:**

- [ ] **Step 1: Create server actions for the detail page**

Create `src/app/app/suppliers/[supplierId]/actions.ts`:

```typescript
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";

// Update top-level supplier fields
export async function updateSupplier(formData: FormData) {
  const supplierId = formData.get("supplier_id")?.toString() ?? "";
  const context = await getServerTenantContext();
  if (!context || !supplierId) return;
  const { supabase, tenantId } = context;

  await supabase
    .from("suppliers")
    .update({
      contact_name: formData.get("contact_name")?.toString() ?? null,
      contact_email: formData.get("contact_email")?.toString() ?? null,
      contact_phone: formData.get("contact_phone")?.toString() ?? null,
      website: formData.get("website")?.toString() ?? null,
      address: formData.get("address")?.toString() ?? null,
      payment_terms: formData.get("payment_terms")?.toString() ?? null,
      default_currency: formData.get("default_currency")?.toString() ?? null,
      default_lead_time_days: formData.get("default_lead_time_days")
        ? Number(formData.get("default_lead_time_days"))
        : null,
      notes: formData.get("notes")?.toString() ?? null,
    })
    .eq("tenant_id", tenantId)
    .eq("id", supplierId);

  revalidatePath(`/app/suppliers/${supplierId}`);
}

export async function archiveSupplier(formData: FormData) {
  const supplierId = formData.get("supplier_id")?.toString() ?? "";
  const context = await getServerTenantContext();
  if (!context || !supplierId) return;
  const { supabase, tenantId } = context;

  await supabase
    .from("suppliers")
    .update({ is_active: false, })
    .eq("tenant_id", tenantId)
    .eq("id", supplierId);

  revalidatePath("/app/suppliers");
  redirect("/app/suppliers");
}

export async function addContact(formData: FormData) {
  const supplierId = formData.get("supplier_id")?.toString() ?? "";
  const context = await getServerTenantContext();
  if (!context || !supplierId) return;
  const { supabase, tenantId } = context;

  await supabase.from("supplier_contacts").insert({
    tenant_id: tenantId,
    supplier_id: supplierId,
    name: formData.get("name")?.toString() ?? "",
    email: formData.get("email")?.toString() ?? null,
    phone: formData.get("phone")?.toString() ?? null,
    role: formData.get("role")?.toString() ?? null,
  });

  revalidatePath(`/app/suppliers/${supplierId}`);
}

export async function removeContact(formData: FormData) {
  const contactId = formData.get("contact_id")?.toString() ?? "";
  const supplierId = formData.get("supplier_id")?.toString() ?? "";
  const context = await getServerTenantContext();
  if (!context || !contactId) return;
  const { supabase, tenantId } = context;

  await supabase
    .from("supplier_contacts")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", contactId);

  revalidatePath(`/app/suppliers/${supplierId}`);
}

export async function linkComponent(formData: FormData) {
  const supplierId = formData.get("supplier_id")?.toString() ?? "";
  const componentId = formData.get("component_id")?.toString() ?? "";
  const context = await getServerTenantContext();
  if (!context || !supplierId || !componentId) return;
  const { supabase, tenantId } = context;

  await supabase.from("supplier_components").upsert(
    {
      tenant_id: tenantId,
      supplier_id: supplierId,
      component_id: componentId,
      supplier_part_number: formData.get("supplier_part_number")?.toString() ?? null,
      unit_cost: formData.get("unit_cost") ? Number(formData.get("unit_cost")) : null,
      currency: formData.get("currency")?.toString() ?? null,
      lead_time_days: formData.get("lead_time_days")
        ? Number(formData.get("lead_time_days"))
        : null,
      moq: formData.get("moq") ? Number(formData.get("moq")) : null,
    },
    { onConflict: "tenant_id,supplier_id,component_id" }
  );

  // Revalidate both directions — catalog is shared between supplier and component pages
  revalidatePath(`/app/suppliers/${supplierId}`);
  revalidatePath(`/app/components/${componentId}`);
}

export async function unlinkComponent(formData: FormData) {
  const supplierComponentId = formData.get("supplier_component_id")?.toString() ?? "";
  const supplierId = formData.get("supplier_id")?.toString() ?? "";
  const context = await getServerTenantContext();
  if (!context || !supplierComponentId) return;
  const { supabase, tenantId } = context;

  await supabase
    .from("supplier_components")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", supplierComponentId);

  revalidatePath(`/app/suppliers/${supplierId}`);
}

export async function togglePreferred(formData: FormData) {
  const supplierComponentId = formData.get("supplier_component_id")?.toString() ?? "";
  const componentId = formData.get("component_id")?.toString() ?? "";
  const supplierId = formData.get("supplier_id")?.toString() ?? "";
  const context = await getServerTenantContext();
  if (!context || !supplierComponentId || !componentId) return;
  const { supabase, tenantId } = context;

  // Clear preferred on all other rows for this component first
  await supabase
    .from("supplier_components")
    .update({ is_preferred: false })
    .eq("tenant_id", tenantId)
    .eq("component_id", componentId)
    .neq("id", supplierComponentId);

  // Set this one as preferred
  await supabase
    .from("supplier_components")
    .update({ is_preferred: true })
    .eq("tenant_id", tenantId)
    .eq("id", supplierComponentId);

  // Revalidate both directions — preferred state is shown on both pages
  revalidatePath(`/app/suppliers/${supplierId}`);
  revalidatePath(`/app/components/${componentId}`);
}

export async function addPriceBreak(formData: FormData) {
  const supplierComponentId = formData.get("supplier_component_id")?.toString() ?? "";
  const supplierId = formData.get("supplier_id")?.toString() ?? "";
  const context = await getServerTenantContext();
  if (!context || !supplierComponentId) return;
  const { supabase, tenantId } = context;

  // Verify ownership via supplier_components
  const { data: sc } = await supabase
    .from("supplier_components")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("id", supplierComponentId)
    .maybeSingle();

  if (!sc) return;

  await supabase.from("supplier_component_price_breaks").insert({
    supplier_component_id: supplierComponentId,
    min_quantity: Number(formData.get("min_quantity")),
    unit_cost: Number(formData.get("unit_cost")),
  });

  revalidatePath(`/app/suppliers/${supplierId}`);
}

export async function removePriceBreak(formData: FormData) {
  const priceBreakId = formData.get("price_break_id")?.toString() ?? "";
  const supplierComponentId = formData.get("supplier_component_id")?.toString() ?? "";
  const supplierId = formData.get("supplier_id")?.toString() ?? "";
  const context = await getServerTenantContext();
  if (!context || !priceBreakId) return;
  const { supabase, tenantId } = context;

  // Verify ownership
  const { data: sc } = await supabase
    .from("supplier_components")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("id", supplierComponentId)
    .maybeSingle();

  if (!sc) return;

  await supabase
    .from("supplier_component_price_breaks")
    .delete()
    .eq("id", priceBreakId);

  revalidatePath(`/app/suppliers/${supplierId}`);
}
```

- [ ] **Step 2: Create the detail server page**

Create `src/app/app/suppliers/[supplierId]/page.tsx`:

```typescript
import { notFound } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import SupplierTabs from "./supplier-tabs";
import styles from "./supplier-tabs.module.css";
import {
  updateSupplier,
  archiveSupplier,
  addContact,
  removeContact,
  linkComponent,
  unlinkComponent,
  togglePreferred,
  addPriceBreak,
  removePriceBreak,
} from "./actions";
import type { Supplier, SupplierContact, SupplierComponent, SupplierComponentPriceBreak } from "@/lib/suppliers/types";
import { getAvgActualLeadTimes } from "@/lib/suppliers/catalog";

type Props = { params: Promise<{ supplierId: string }> };

export default async function SupplierDetailPage({ params }: Props) {
  const { supplierId } = await params;
  const supabase = await createSupabaseServerClient();

  const [
    { data: supplier },
    { data: contacts },
    { data: catalogRows },
    { data: allComponents },
  ] = await Promise.all([
    supabase
      .from("suppliers")
      .select("*")
      .eq("id", supplierId)
      .maybeSingle(),
    supabase
      .from("supplier_contacts")
      .select("*")
      .eq("supplier_id", supplierId)
      .order("is_primary", { ascending: false }),
    supabase
      .from("supplier_components")
      .select("*, supplier_component_price_breaks(*), component:component_id(id,name,unit)")
      .eq("supplier_id", supplierId)
      .order("created_at"),
    supabase
      .from("component")
      .select("id,name,sku")
      .eq("is_active", true)
      .order("name"),
  ]);

  if (!supplier) notFound();

  // Avg lead times require tenantId — fetched after supplier is confirmed to exist
  const tenantId = (supplier as Supplier).tenant_id;
  const avgLeadTimesMap = await getAvgActualLeadTimes(supabase, tenantId, supplierId);

  const s = supplier as Supplier;
  const typedContacts = (contacts ?? []) as SupplierContact[];
  const typedCatalog = (catalogRows ?? []) as Array<
    SupplierComponent & {
      supplier_component_price_breaks: SupplierComponentPriceBreak[];
      component: { id: string; name: string; unit: string | null } | null;
    }
  >;

  return (
    <div className={styles.detailPage}>
      <div className={styles.backRow}>
        <Link href="/app/suppliers" className={styles.backLink}>&larr; Suppliers</Link>
      </div>

      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.supplierName}>{s.name}</h1>
          {s.website && (
            <span className={styles.supplierMeta}>{s.website} · {s.is_active ? "Active" : "Archived"}</span>
          )}
        </div>
        <div className={styles.headerActions}>
          <form action={archiveSupplier}>
            <input type="hidden" name="supplier_id" value={s.id} />
            <button type="submit" className={styles.btnDanger}>
              {s.is_active ? "Archive" : "Archived"}
            </button>
          </form>
        </div>
      </div>

      <SupplierTabs
        supplier={s}
        contacts={typedContacts}
        catalog={typedCatalog}
        avgLeadTimes={avgLeadTimesMap}
        allComponents={(allComponents ?? []) as Array<{ id: string; name: string; sku: string | null }>}
        actions={{ updateSupplier, addContact, removeContact, linkComponent, unlinkComponent, togglePreferred, addPriceBreak, removePriceBreak }}
      />
    </div>
  );
}
```

- [ ] **Step 3: Create the client tabs component (Overview tab only in this task)**

Create `src/app/app/suppliers/[supplierId]/supplier-tabs.tsx`:

```typescript
"use client";

import { useState } from "react";
import type { Supplier, SupplierContact, SupplierComponent, SupplierComponentPriceBreak, AvgLeadTime } from "@/lib/suppliers/types";
import styles from "./supplier-tabs.module.css";

type CatalogRow = SupplierComponent & {
  supplier_component_price_breaks: SupplierComponentPriceBreak[];
  component: { id: string; name: string; unit: string | null } | null;
};

type Actions = {
  updateSupplier: (formData: FormData) => Promise<void>;
  addContact: (formData: FormData) => Promise<void>;
  removeContact: (formData: FormData) => Promise<void>;
  linkComponent: (formData: FormData) => Promise<void>;
  unlinkComponent: (formData: FormData) => Promise<void>;
  togglePreferred: (formData: FormData) => Promise<void>;
  addPriceBreak: (formData: FormData) => Promise<void>;
  removePriceBreak: (formData: FormData) => Promise<void>;
};

type Props = {
  supplier: Supplier;
  contacts: SupplierContact[];
  catalog: CatalogRow[];
  avgLeadTimes: Map<string, AvgLeadTime>;
  allComponents: Array<{ id: string; name: string; sku: string | null }>;
  actions: Actions;
};

const TABS = ["Overview", "Components", "Purchase Orders"] as const;
type Tab = (typeof TABS)[number];

export default function SupplierTabs({ supplier, contacts, catalog, avgLeadTimes, allComponents, actions }: Props) {
  const [active, setActive] = useState<Tab>("Overview");
  const [editMode, setEditMode] = useState(false);

  return (
    <div className={styles.tabsContainer}>
      <div className={styles.tabBar}>
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            className={`${styles.tab} ${active === tab ? styles.tabActive : ""}`}
            onClick={() => setActive(tab)}
          >
            {tab === "Components" ? `Components (${catalog.length})` : tab}
          </button>
        ))}
      </div>

      {active === "Overview" && (
        <div className={styles.tabContent}>
          {editMode ? (
            <form action={actions.updateSupplier} onSubmit={() => setEditMode(false)}>
              <input type="hidden" name="supplier_id" value={supplier.id} />
              <div className={styles.editGrid}>
                {[
                  ["contact_name", "Contact Name", supplier.contact_name ?? ""],
                  ["contact_email", "Email", supplier.contact_email ?? ""],
                  ["contact_phone", "Phone", supplier.contact_phone ?? ""],
                  ["website", "Website", supplier.website ?? ""],
                  ["address", "Address", supplier.address ?? ""],
                  ["payment_terms", "Payment Terms", supplier.payment_terms ?? ""],
                  ["default_currency", "Currency", supplier.default_currency ?? ""],
                  ["default_lead_time_days", "Default Lead Time (days)", String(supplier.default_lead_time_days ?? "")],
                ].map(([name, label, value]) => (
                  <label key={name} className={styles.editField}>
                    <span>{label}</span>
                    <input name={name} defaultValue={value} className={styles.editInput} />
                  </label>
                ))}
                <label className={`${styles.editField} ${styles.editFieldFull}`}>
                  <span>Notes</span>
                  <textarea name="notes" defaultValue={supplier.notes ?? ""} className={styles.editTextarea} rows={3} />
                </label>
              </div>
              <div className={styles.editActions}>
                <button type="submit" className={styles.btnPrimary}>Save</button>
                <button type="button" onClick={() => setEditMode(false)} className={styles.btnSecondary}>Cancel</button>
              </div>
            </form>
          ) : (
            <>
              <div className={styles.infoGrid}>
                {[
                  ["Contact Name", supplier.contact_name],
                  ["Email", supplier.contact_email],
                  ["Phone", supplier.contact_phone],
                  ["Website", supplier.website],
                  ["Address", supplier.address],
                  ["Payment Terms", supplier.payment_terms],
                  ["Currency", supplier.default_currency],
                  ["Default Lead Time", supplier.default_lead_time_days ? `${supplier.default_lead_time_days} days` : null],
                ].map(([label, value]) => (
                  <div key={label} className={styles.infoField}>
                    <dt className={styles.infoLabel}>{label}</dt>
                    <dd className={styles.infoValue}>{value ?? <span className={styles.empty}>—</span>}</dd>
                  </div>
                ))}
              </div>
              {supplier.notes && (
                <div className={styles.notesSection}>
                  <div className={styles.sectionHeading}>Notes</div>
                  <p className={styles.notesText}>{supplier.notes}</p>
                </div>
              )}
              <button onClick={() => setEditMode(true)} className={styles.btnSecondary}>
                Edit
              </button>
            </>
          )}

          {/* Additional contacts */}
          <div className={styles.sectionHeading}>Additional Contacts</div>
          {contacts.length === 0 ? (
            <p className={styles.empty}>No additional contacts.</p>
          ) : (
            <div className={styles.contactsList}>
              {contacts.map((c) => (
                <div key={c.id} className={styles.contactRow}>
                  <span className={styles.contactName}>{c.name}</span>
                  {c.role && <span className={styles.contactRole}>{c.role}</span>}
                  {c.email && <span className={styles.contactEmail}>{c.email}</span>}
                  {c.phone && <span className={styles.contactPhone}>{c.phone}</span>}
                  <form action={actions.removeContact} className={styles.contactRemove}>
                    <input type="hidden" name="contact_id" value={c.id} />
                    <input type="hidden" name="supplier_id" value={supplier.id} />
                    <button type="submit" className={styles.btnDanger}>Remove</button>
                  </form>
                </div>
              ))}
            </div>
          )}
          <form action={actions.addContact} className={styles.addContactForm}>
            <input type="hidden" name="supplier_id" value={supplier.id} />
            <input name="name" placeholder="Name" required className={styles.editInput} />
            <input name="email" placeholder="Email" type="email" className={styles.editInput} />
            <input name="phone" placeholder="Phone" className={styles.editInput} />
            <input name="role" placeholder="Role (e.g. Accounts)" className={styles.editInput} />
            <button type="submit" className={styles.btnPrimary}>Add Contact</button>
          </form>
        </div>
      )}

      {active === "Components" && (
        <div className={styles.tabContent}>
          <p className={styles.empty}>Components tab — built in Task 5.</p>
        </div>
      )}

      {active === "Purchase Orders" && (
        <div className={styles.tabContent}>
          <p className={styles.empty}>Purchase Orders tab — built in Task 6.</p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create CSS for the detail page**

Create `src/app/app/suppliers/[supplierId]/supplier-tabs.module.css`:

```css
.detailPage { padding: 2rem; max-width: 1000px; }
.backRow { margin-bottom: 1rem; }
.backLink { font-size: 0.85rem; opacity: 0.55; text-decoration: none; color: inherit; }
.backLink:hover { opacity: 0.9; }

.pageHeader { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; }
.supplierName { font-size: 1.4rem; font-weight: 600; margin: 0; }
.supplierMeta { font-size: 0.82rem; opacity: 0.5; display: block; margin-top: 4px; }
.headerActions { display: flex; gap: 0.5rem; }

.tabsContainer { }
.tabBar { display: flex; gap: 4px; margin-bottom: 0; }
.tab {
  padding: 0.5rem 1.25rem; font-size: 0.85rem; cursor: pointer;
  border-radius: 6px 6px 0 0; border: 1px solid rgba(255,255,255,0.1); border-bottom: none;
  background: rgba(255,255,255,0.05); opacity: 0.55;
}
.tab:hover { opacity: 0.8; }
.tabActive { opacity: 1; background: rgba(255,255,255,0.1); }
.tabContent {
  border: 1px solid rgba(255,255,255,0.12); border-radius: 0 6px 6px 6px;
  padding: 1.5rem; background: rgba(255,255,255,0.03);
}

.infoGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
.infoField { display: flex; flex-direction: column; gap: 3px; }
.infoLabel { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.4; }
.infoValue { font-size: 0.88rem; }

.notesSection { margin: 1rem 0; }
.notesText { font-size: 0.85rem; opacity: 0.7; line-height: 1.6; padding: 0.75rem; background: rgba(255,255,255,0.04); border-radius: 6px; }
.sectionHeading { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; opacity: 0.4; padding-top: 1rem; margin: 1rem 0 0.5rem; border-top: 1px solid rgba(255,255,255,0.08); }

.editGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1rem; }
.editField { display: flex; flex-direction: column; gap: 4px; font-size: 0.82rem; }
.editFieldFull { grid-column: 1 / -1; }
.editInput { padding: 0.4rem 0.6rem; border-radius: 4px; border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.07); color: inherit; font-size: 0.85rem; }
.editTextarea { padding: 0.4rem 0.6rem; border-radius: 4px; border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.07); color: inherit; font-size: 0.85rem; resize: vertical; }
.editActions { display: flex; gap: 0.5rem; }

.contactsList { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem; }
.contactRow { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0.75rem; background: rgba(255,255,255,0.04); border-radius: 6px; font-size: 0.85rem; }
.contactName { font-weight: 500; }
.contactRole, .contactEmail, .contactPhone { opacity: 0.5; font-size: 0.8rem; }
.contactRemove { margin-left: auto; }
.addContactForm { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; margin-top: 0.5rem; }

.btnPrimary { padding: 0.4rem 1rem; border-radius: 5px; border: none; background: #4f8ef7; color: white; cursor: pointer; font-size: 0.82rem; }
.btnSecondary { padding: 0.4rem 1rem; border-radius: 5px; border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.05); color: inherit; cursor: pointer; font-size: 0.82rem; }
.btnDanger { padding: 0.4rem 0.75rem; border-radius: 5px; border: none; background: rgba(255,80,80,0.15); color: #ff6b6b; cursor: pointer; font-size: 0.78rem; }
.btnDanger:hover { background: rgba(255,80,80,0.25); }

.empty { opacity: 0.4; font-size: 0.85rem; }

/* Placeholder for catalog/PO tables — added in Tasks 5 & 6 */
.catalogTable { margin-top: 1rem; }
.poTable { margin-top: 1rem; }
```

- [ ] **Step 5: Verify in browser**

Run `npm run dev`. Navigate to an existing supplier. Confirm:
- Overview tab renders with supplier fields
- Edit mode shows form with correct defaultValues
- Save updates the supplier record
- Add Contact and Remove Contact work
- Archive redirects to `/app/suppliers`

- [ ] **Step 6: Commit**

```bash
git add src/app/app/suppliers/[supplierId]/
git commit -m "feat(suppliers): detail page scaffold — Overview tab with contacts and edit"
```

---

### Task 5: Supplier detail page — Components tab

**Goal:** Build out the Components tab on the supplier detail page: catalog table with avg actual lead times, inline price break expansion, preferred star toggle, and link/unlink component functionality.

**Files:**
- Modify: `src/app/app/suppliers/[supplierId]/supplier-tabs.tsx`
- Modify: `src/app/app/suppliers/[supplierId]/supplier-tabs.module.css`

**Acceptance Criteria:**
- [ ] Components tab lists all `supplier_components` rows for this supplier
- [ ] Each row shows: component name, supplier part #, unit cost, MOQ, lead time (promised), avg actual (green if ≤ promised, red if >, — if < 3 receipts)
- [ ] Price breaks expand inline per row (▾ toggle)
- [ ] Preferred star toggles correctly — sets `is_preferred = true` on clicked row, clears others for same component
- [ ] "Link Component" opens an inline form; submitting calls `linkComponent` and creates a `supplier_components` row
- [ ] ••• Remove unlinks a component (calls `unlinkComponent`)

**Verify:** Navigate to a supplier detail page → Components tab. Add a component via "Link Component". Verify it appears. Toggle preferred star. Verify only one star per component.

**Steps:**

- [ ] **Step 1: Add Components tab content to `supplier-tabs.tsx`**

In the `{active === "Components"}` block, replace the placeholder with:

```typescript
{active === "Components" && (
  <div className={styles.tabContent}>
    <div className={styles.tabToolbar}>
      <span className={styles.tabCount}>{catalog.length} components</span>
      <button
        type="button"
        className={styles.btnPrimary}
        onClick={() => setLinkComponentOpen(true)}
      >
        + Link Component
      </button>
    </div>

    {linkComponentOpen && (
      <form
        action={actions.linkComponent}
        onSubmit={() => setLinkComponentOpen(false)}
        className={styles.linkForm}
      >
        <input type="hidden" name="supplier_id" value={supplier.id} />
        <select name="component_id" required className={styles.editInput}>
          <option value="">Select component…</option>
          {allComponents.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} {c.sku ? `(${c.sku})` : ""}
            </option>
          ))}
        </select>
        <input name="supplier_part_number" placeholder="Supplier part #" className={styles.editInput} />
        <input name="unit_cost" type="number" step="0.01" placeholder="Unit cost" className={styles.editInput} />
        <input name="currency" placeholder="Currency (e.g. AUD)" className={styles.editInput} />
        <input name="lead_time_days" type="number" placeholder="Lead time (days)" className={styles.editInput} />
        <input name="moq" type="number" step="0.01" placeholder="MOQ" className={styles.editInput} />
        <button type="submit" className={styles.btnPrimary}>Link</button>
        <button type="button" onClick={() => setLinkComponentOpen(false)} className={styles.btnSecondary}>Cancel</button>
      </form>
    )}

    <div className={styles.catalogTable}>
      <div className={styles.catalogHeader}>
        <span>Component</span>
        <span>Part #</span>
        <span>Unit Cost</span>
        <span>MOQ</span>
        <span>Lead Time</span>
        <span>Avg Actual</span>
        <span style={{ textAlign: "center" }}>Pref</span>
        <span />
      </div>
      {catalog.map((row) => {
        const lt = avgLeadTimes.get(row.component_id);
        const avgDaysDisplay = lt
          ? `${lt.avgDays.toFixed(1)}d`
          : "—";
        const ltColor =
          lt && row.lead_time_days != null
            ? lt.avgDays <= row.lead_time_days
              ? styles.ltGreen
              : styles.ltRed
            : "";
        return (
          <CatalogRowItem
            key={row.id}
            row={row}
            avgDaysDisplay={avgDaysDisplay}
            ltColor={ltColor}
            supplierId={supplier.id}
            actions={actions}
          />
        );
      })}
    </div>
  </div>
)}
```

Add `const [linkComponentOpen, setLinkComponentOpen] = useState(false);` to the component state.

- [ ] **Step 2: Add the `CatalogRowItem` subcomponent**

Add after the main `SupplierTabs` export in the same file:

```typescript
function CatalogRowItem({
  row,
  avgDaysDisplay,
  ltColor,
  supplierId,
  actions,
}: {
  row: CatalogRow;
  avgDaysDisplay: string;
  ltColor: string;
  supplierId: string;
  actions: Actions;
}) {
  const [breaksOpen, setBreaksOpen] = useState(false);

  return (
    <>
      <div className={styles.catalogRow}>
        <div>
          <span>{row.component?.name ?? row.component_id}</span>
          {row.component?.unit && (
            <span className={styles.catalogUnit}> / {row.component.unit}</span>
          )}
        </div>
        <span className={styles.catalogPartNum}>{row.supplier_part_number ?? "—"}</span>
        <div>
          <span>{row.unit_cost != null ? `$${row.unit_cost.toFixed(2)}` : "—"}</span>
          {row.supplier_component_price_breaks.length > 0 && (
            <button
              type="button"
              className={styles.breaksToggle}
              onClick={() => setBreaksOpen((v) => !v)}
            >
              {breaksOpen ? "▴" : "▾"} {row.supplier_component_price_breaks.length} breaks
            </button>
          )}
        </div>
        <span>{row.moq != null ? String(row.moq) : "—"}</span>
        <span>{row.lead_time_days != null ? `${row.lead_time_days}d` : "—"}</span>
        <span className={ltColor}>{avgDaysDisplay}</span>
        <form action={actions.togglePreferred} style={{ textAlign: "center" }}>
          <input type="hidden" name="supplier_component_id" value={row.id} />
          <input type="hidden" name="component_id" value={row.component_id} />
          <input type="hidden" name="supplier_id" value={supplierId} />
          <button type="submit" className={styles.starBtn}>
            {row.is_preferred ? "★" : "☆"}
          </button>
        </form>
        <form action={actions.unlinkComponent}>
          <input type="hidden" name="supplier_component_id" value={row.id} />
          <input type="hidden" name="supplier_id" value={supplierId} />
          <button type="submit" className={styles.btnDanger}>Remove</button>
        </form>
      </div>
      {breaksOpen &&
        row.supplier_component_price_breaks
          .slice()
          .sort((a, b) => a.min_quantity - b.min_quantity)
          .map((pb) => (
            <div key={pb.id} className={styles.priceBreakRow}>
              <span className={styles.breakQty}>↳ {pb.min_quantity}+</span>
              <span />
              <span>${pb.unit_cost.toFixed(2)}</span>
              <span /><span /><span /><span />
              <form action={actions.removePriceBreak}>
                <input type="hidden" name="price_break_id" value={pb.id} />
                <input type="hidden" name="supplier_component_id" value={row.id} />
                <input type="hidden" name="supplier_id" value={supplierId} />
                <button type="submit" className={styles.btnDanger}>×</button>
              </form>
            </div>
          ))}
    </>
  );
}
```

- [ ] **Step 3: Add catalog and price break CSS to `supplier-tabs.module.css`**

```css
.tabToolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
.tabCount { font-size: 0.82rem; opacity: 0.5; }
.linkForm { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; padding: 1rem; background: rgba(255,255,255,0.04); border-radius: 6px; margin-bottom: 1rem; }

.catalogHeader,
.catalogRow {
  display: grid;
  grid-template-columns: 2fr 1.2fr 1.1fr 0.8fr 0.9fr 0.9fr 60px 80px;
  gap: 0; padding: 0.6rem 0.75rem; font-size: 0.83rem; align-items: center;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.catalogHeader { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.4; border-bottom: 1px solid rgba(255,255,255,0.14); }
.catalogPartNum { font-family: monospace; font-size: 0.8rem; opacity: 0.6; }
.catalogUnit { opacity: 0.5; font-size: 0.78rem; }
.breaksToggle { background: none; border: none; cursor: pointer; font-size: 0.75rem; opacity: 0.55; color: inherit; padding: 0 0.25rem; }

.priceBreakRow {
  display: grid;
  grid-template-columns: 2fr 1.2fr 1.1fr 0.8fr 0.9fr 0.9fr 60px 80px;
  gap: 0; padding: 0.4rem 0.75rem 0.4rem 2rem; font-size: 0.78rem;
  background: rgba(255,255,255,0.025); border-bottom: 1px solid rgba(255,255,255,0.04);
  opacity: 0.75; align-items: center;
}
.breakQty { opacity: 0.6; }

.starBtn { background: none; border: none; cursor: pointer; font-size: 1.1rem; color: #f5c542; }
.ltGreen { color: #48c774; }
.ltRed { color: #ff6b6b; }
```

- [ ] **Step 4: Verify in browser**

Navigate to a supplier's Components tab. Verify:
- Catalog rows render with all columns
- Price break expansion works
- Preferred star toggles (check DB to confirm `is_preferred` updates)
- Link Component form adds a new row
- Remove unlinks the row

- [ ] **Step 5: Commit**

```bash
git add src/app/app/suppliers/[supplierId]/supplier-tabs.tsx src/app/app/suppliers/[supplierId]/supplier-tabs.module.css
git commit -m "feat(suppliers): Components tab — catalog, price breaks, preferred toggle, link/unlink"
```

---

### Task 6: Supplier detail page — Purchase Orders tab

**Goal:** Build the Purchase Orders tab showing all POs linked to this supplier with on-time/late indicators derived from `delivery_receipt.received_at` vs `purchase_order.expected_date`.

**Files:**
- Modify: `src/app/app/suppliers/[supplierId]/page.tsx`
- Modify: `src/app/app/suppliers/[supplierId]/supplier-tabs.tsx`
- Modify: `src/app/app/suppliers/[supplierId]/supplier-tabs.module.css`

**Acceptance Criteria:**
- [ ] Purchase Orders tab lists all POs for this supplier ordered by `created_at` descending
- [ ] Each row shows: PO reference (first 8 chars of UUID), created date, status, expected date, received date + on-time/late tag, value (sum of line quantity × unit_cost if available)
- [ ] On-time shows green "✓ on time"; late shows red "+N days late"
- [ ] Received date comes from the latest `delivery_receipt.received_at` linked to that PO
- [ ] If `expected_date` is null, the on-time indicator is omitted
- [ ] Filter tabs: All / Open / Received

**Verify:** Navigate to a supplier with existing POs. Verify rows render. Check that on-time/late indicator shows correctly when `expected_date` is set on a received PO.

**Steps:**

- [ ] **Step 1: Add PO data fetch to `page.tsx`**

In `src/app/app/suppliers/[supplierId]/page.tsx`, extend the `Promise.all` to include PO data:

```typescript
// Add to the Promise.all array in page.tsx:
supabase
  .from("purchase_order")
  .select(`
    id, status, created_at, expected_date,
    purchase_order_line(quantity, unit_cost),
    delivery_receipt(received_at)
  `)
  .eq("supplier_id", supplierId)
  .order("created_at", { ascending: false })
  .limit(100),
```

Destructure as `{ data: posData }` and pass `pos` (typed below) to `SupplierTabs`.

Add the PO type:

```typescript
type PoRow = {
  id: string;
  status: string;
  created_at: string;
  expected_date: string | null;
  purchase_order_line: Array<{ quantity: number; unit_cost: number | null }>;
  delivery_receipt: Array<{ received_at: string }>;
};
```

Pass `pos={typedPos}` to `<SupplierTabs />` and add it to the Props type.

- [ ] **Step 2: Add Purchase Orders tab content to `supplier-tabs.tsx`**

Add `pos: PoRow[]` to the Props type (define `PoRow` inline or import).

Replace the PO tab placeholder:

```typescript
{active === "Purchase Orders" && (
  <div className={styles.tabContent}>
    <div className={styles.tabToolbar}>
      <div className={styles.filterTabs}>
        {(["all", "open", "received"] as const).map((f) => (
          <button
            key={f}
            type="button"
            className={`${styles.filterChip} ${poFilter === f ? styles.filterChipActive : ""}`}
            onClick={() => setPoFilter(f)}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>
    </div>

    <div className={styles.poTable}>
      <div className={styles.poHeader}>
        <span>PO Ref</span>
        <span>Created</span>
        <span>Status</span>
        <span>Expected</span>
        <span>Received</span>
        <span>Value</span>
      </div>
      {filteredPos.length === 0 ? (
        <p className={styles.empty}>No purchase orders.</p>
      ) : (
        filteredPos.map((po) => {
          const latestReceipt = po.delivery_receipt
            .slice()
            .sort((a, b) => b.received_at.localeCompare(a.received_at))[0];
          const value = po.purchase_order_line.reduce(
            (sum, l) => sum + l.quantity * (l.unit_cost ?? 0),
            0
          );
          let onTimePill: React.ReactNode = null;
          if (latestReceipt && po.expected_date) {
            const late =
              new Date(latestReceipt.received_at) > new Date(po.expected_date);
            if (late) {
              const diffDays = Math.round(
                (new Date(latestReceipt.received_at).getTime() -
                  new Date(po.expected_date).getTime()) /
                  (1000 * 60 * 60 * 24)
              );
              onTimePill = (
                <span className={styles.lateTag}>+{diffDays}d late</span>
              );
            } else {
              onTimePill = <span className={styles.onTimeTag}>✓ on time</span>;
            }
          }
          return (
            <div key={po.id} className={styles.poRow}>
              <span className={styles.poRef}>{po.id.slice(0, 8).toUpperCase()}</span>
              <span>
                {new Date(po.created_at).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </span>
              <span>
                <span className={po.status === "received" ? styles.badgeReceived : styles.badgeOpen}>
                  {po.status.charAt(0).toUpperCase() + po.status.slice(1)}
                </span>
              </span>
              <span>
                {po.expected_date
                  ? new Date(po.expected_date).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
                  : "—"}
              </span>
              <span>
                {latestReceipt
                  ? new Date(latestReceipt.received_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
                  : "—"}
                {onTimePill}
              </span>
              <span>{value > 0 ? `$${value.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}</span>
            </div>
          );
        })
      )}
    </div>
  </div>
)}
```

Add state at the top of the component:
```typescript
const [poFilter, setPoFilter] = useState<"all" | "open" | "received">("all");
const filteredPos = pos.filter((p) => poFilter === "all" || p.status === poFilter);
```

- [ ] **Step 3: Add PO tab CSS to `supplier-tabs.module.css`**

```css
.filterTabs { display: flex; gap: 4px; }
.filterChip { padding: 0.3rem 0.75rem; font-size: 0.78rem; border-radius: 5px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04); color: inherit; cursor: pointer; opacity: 0.55; }
.filterChip:hover { opacity: 0.8; }
.filterChipActive { opacity: 1; background: rgba(255,255,255,0.12); }

.poHeader,
.poRow {
  display: grid;
  grid-template-columns: 1fr 1.2fr 1fr 1fr 1.4fr 1fr;
  gap: 0; padding: 0.6rem 0.75rem; font-size: 0.83rem; align-items: center;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.poHeader { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.4; border-bottom: 1px solid rgba(255,255,255,0.14); }
.poRef { font-family: monospace; font-size: 0.8rem; opacity: 0.7; }
.badgeOpen { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 0.78rem; background: rgba(79,142,247,0.2); color: #4f8ef7; }
.badgeReceived { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 0.78rem; background: rgba(72,199,116,0.2); color: #48c774; }
.onTimeTag { font-size: 0.78rem; color: #48c774; margin-left: 6px; }
.lateTag { font-size: 0.78rem; color: #ff6b6b; margin-left: 6px; }
```

- [ ] **Step 4: Verify in browser**

Navigate to a supplier with POs. Verify:
- PO rows render with correct columns
- Filter chips switch between All / Open / Received
- Set `expected_date` on a received PO (via SQL editor or existing UI) and confirm on-time/late tag appears correctly

- [ ] **Step 5: Commit**

```bash
git add src/app/app/suppliers/[supplierId]/page.tsx src/app/app/suppliers/[supplierId]/supplier-tabs.tsx src/app/app/suppliers/[supplierId]/supplier-tabs.module.css
git commit -m "feat(suppliers): Purchase Orders tab — PO list with on-time/late indicator"
```

---

### Task 7: Component page — Suppliers tab

**Goal:** Add a "Suppliers (N)" tab to the component detail page showing all suppliers that stock this component side-by-side, with best-price/fastest auto-tags, preferred star toggle, avg actual lead time, and a Link Supplier inline form.

**Files:**
- Modify: `src/app/app/components/[componentId]/page.tsx`
- Modify: `src/app/app/components/[componentId]/detail-tabs.tsx`
- Modify: `src/app/app/components/[componentId]/component-detail.module.css`

**Acceptance Criteria:**
- [ ] "Suppliers (N)" tab appears in the component detail tabs alongside Overview / Movements / BOM Usage
- [ ] Table columns: Supplier, Part #, Unit Cost, MOQ, Lead Time, Avg Actual, Preferred
- [ ] "best price" tag on the row with the lowest `unit_cost`; "fastest" tag on the row with the shortest `lead_time_days` (auto-derived, no stored field)
- [ ] Avg Actual shown in green (≤ promised) or red (> promised); — if insufficient data
- [ ] Preferred star toggles via `togglePreferred` action; clearing others for the same component
- [ ] "+ Link Supplier" inline form creates a `supplier_components` row
- [ ] Toggling preferred from the component page updates the same record as toggling from the supplier page

**Verify:** Navigate to a component with 2+ supplier catalog entries. Confirm tags auto-apply, avg lead time colours are correct, and preferred star toggle works.

**Steps:**

- [ ] **Step 1: Fetch supplier catalog data in `page.tsx`**

In `src/app/app/components/[componentId]/page.tsx`, add to the `Promise.all`:

```typescript
supabase
  .from("supplier_components")
  .select(`
    id, supplier_id, unit_cost, currency, lead_time_days, moq,
    supplier_part_number, is_preferred, notes,
    supplier:supplier_id(id, name),
    supplier_component_price_breaks(id, min_quantity, unit_cost)
  `)
  .eq("component_id", componentId)
  .order("is_preferred", { ascending: false }),

// Also fetch all active suppliers for the Link Supplier dropdown
supabase
  .from("suppliers")
  .select("id, name")
  .eq("is_active", true)
  .order("name"),
```

Destructure as `{ data: supplierCatalogRaw }` and `{ data: allSuppliersRaw }`.

Add the type:

```typescript
type SupplierCatalogRow = {
  id: string;
  supplier_id: string;
  unit_cost: number | null;
  currency: string | null;
  lead_time_days: number | null;
  moq: number | null;
  supplier_part_number: string | null;
  is_preferred: boolean;
  notes: string | null;
  supplier: { id: string; name: string } | Array<{ id: string; name: string }> | null;
  supplier_component_price_breaks: Array<{ id: string; min_quantity: number; unit_cost: number }>;
};
```

Use `getAvgActualLeadTimesForComponent` from `@/lib/suppliers/catalog` to fetch avg lead times for all suppliers of this component in one query (keyed by `supplierId`).

Then pass `supplierCatalog` and `allSuppliers` to `DetailTabs`.

Full fetch block to add to the `Promise.all` in `page.tsx`:

```typescript
supabase
  .from("supplier_components")
  .select(`
    id, supplier_id, unit_cost, currency, lead_time_days, moq,
    supplier_part_number, is_preferred, notes,
    supplier:supplier_id(id, name),
    supplier_component_price_breaks(id, min_quantity, unit_cost)
  `)
  .eq("component_id", componentId)
  .order("is_preferred", { ascending: false }),
supabase
  .from("suppliers")
  .select("id, name")
  .eq("is_active", true)
  .order("name"),
```

After `if (!component) notFound()`, fetch avg lead times and build the catalog prop:

```typescript
const avgLtMap = await getAvgActualLeadTimesForComponent(supabase, component.tenant_id, componentId);

const supplierCatalog = ((supplierCatalogRaw ?? []) as SupplierCatalogRow[]).map((row) => {
  const supplier = Array.isArray(row.supplier) ? row.supplier[0] : row.supplier;
  const lt = avgLtMap.get(row.supplier_id);
  return {
    id: row.id,
    supplierId: row.supplier_id,
    supplierName: supplier?.name ?? "—",
    partNumber: row.supplier_part_number,
    unitCost: row.unit_cost,
    moq: row.moq,
    leadTimeDays: row.lead_time_days,
    isPreferred: row.is_preferred,
    avgActualDays: lt ? lt.avgDays : null,
    priceBreaks: row.supplier_component_price_breaks.map((pb) => ({
      id: pb.id,
      minQuantity: pb.min_quantity,
      unitCost: pb.unit_cost,
    })),
  };
});
```

Pass `supplierCatalog={supplierCatalog}`, `allSuppliers={allSuppliersRaw ?? []}`, and `componentId={componentId}` to `<DetailTabs />`.

- [ ] **Step 2: Add Suppliers tab to `detail-tabs.tsx`**

Add `"Suppliers"` to the `tabs` array:

```typescript
const tabs = ["Overview", "Movements", "BOM Usage", "Suppliers"] as const;
```

Add to the Props type:

```typescript
supplierCatalog: Array<{
  id: string;
  supplierId: string;
  supplierName: string;
  partNumber: string | null;
  unitCost: number | null;
  moq: number | null;
  leadTimeDays: number | null;
  isPreferred: boolean;
  avgActualDays: number | null;
  priceBreaks: Array<{ id: string; minQuantity: number; unitCost: number }>;
}>;
allSuppliers: Array<{ id: string; name: string }>;
componentId: string;
```

Add the Suppliers tab render block after BOM Usage:

```typescript
{active === "Suppliers" && (
  <div className={styles.tabContent}>
    <ComponentSuppliersTab
      componentId={componentId}
      catalog={supplierCatalog}
      allSuppliers={allSuppliers}
    />
  </div>
)}
```

Add the `ComponentSuppliersTab` component at the bottom of the file:

```typescript
import { togglePreferred, linkComponent } from "@/app/app/suppliers/[supplierId]/actions";

function ComponentSuppliersTab({
  componentId,
  catalog,
  allSuppliers,
}: {
  componentId: string;
  catalog: Props["supplierCatalog"];
  allSuppliers: Props["allSuppliers"];
}) {
  const [linkOpen, setLinkOpen] = useState(false);

  const minCost = Math.min(...catalog.map((r) => r.unitCost ?? Infinity));
  const minLt = Math.min(...catalog.map((r) => r.leadTimeDays ?? Infinity));

  return (
    <div>
      <div className={styles.tabToolbar}>
        <span className={styles.tabCount}>{catalog.length} supplier{catalog.length !== 1 ? "s" : ""}</span>
        <button type="button" className={styles.btnSmall} onClick={() => setLinkOpen(true)}>
          + Link Supplier
        </button>
      </div>

      {linkOpen && (
        <form
          action={async (fd) => { await linkComponent(fd); setLinkOpen(false); }}
          className={styles.linkForm}
        >
          <input type="hidden" name="component_id" value={componentId} />
          <select name="supplier_id" required className={styles.miniInput}>
            <option value="">Select supplier…</option>
            {allSuppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <input name="supplier_part_number" placeholder="Part #" className={styles.miniInput} />
          <input name="unit_cost" type="number" step="0.01" placeholder="Unit cost" className={styles.miniInput} />
          <input name="lead_time_days" type="number" placeholder="Lead time (days)" className={styles.miniInput} />
          <input name="moq" type="number" step="0.01" placeholder="MOQ" className={styles.miniInput} />
          <button type="submit" className={styles.btnSmall}>Link</button>
          <button type="button" className={styles.btnSmall} onClick={() => setLinkOpen(false)}>Cancel</button>
        </form>
      )}

      <div className={styles.suppliersTable}>
        <div className={styles.suppliersHeader}>
          <span>Supplier</span>
          <span>Part #</span>
          <span>Unit Cost</span>
          <span>MOQ</span>
          <span>Lead Time</span>
          <span>Avg Actual</span>
          <span style={{ textAlign: "center" }}>Pref</span>
        </div>
        {catalog.map((row) => {
          const isBestPrice = row.unitCost != null && row.unitCost === minCost;
          const isFastest = row.leadTimeDays != null && row.leadTimeDays === minLt;
          const ltColor =
            row.avgActualDays != null && row.leadTimeDays != null
              ? row.avgActualDays <= row.leadTimeDays
                ? styles.ltGreen
                : styles.ltRed
              : "";
          return (
            <div key={row.id} className={styles.suppliersRow}>
              <div>
                <span className={styles.supplierLink}>{row.supplierName}</span>
                {isBestPrice && <span className={styles.tagGreen}>best price</span>}
                {isFastest && <span className={styles.tagBlue}>fastest</span>}
              </div>
              <span className={styles.catalogPartNum}>{row.partNumber ?? "—"}</span>
              <span>{row.unitCost != null ? `$${row.unitCost.toFixed(2)}` : "—"}</span>
              <span>{row.moq != null ? String(row.moq) : "—"}</span>
              <span>{row.leadTimeDays != null ? `${row.leadTimeDays}d` : "—"}</span>
              <span className={ltColor}>
                {row.avgActualDays != null ? `${row.avgActualDays.toFixed(1)}d` : "—"}
              </span>
              <form action={togglePreferred} style={{ textAlign: "center" }}>
                <input type="hidden" name="supplier_component_id" value={row.id} />
                <input type="hidden" name="component_id" value={componentId} />
                <input type="hidden" name="supplier_id" value={row.supplierId} />
                <button type="submit" className={styles.starBtn}>
                  {row.isPreferred ? "★" : "☆"}
                </button>
              </form>
            </div>
          );
        })}
        {catalog.length === 0 && (
          <p className={styles.empty}>No suppliers linked to this component yet.</p>
        )}
      </div>
    </div>
  );
}
```

Note: `linkComponent` needs a `supplier_id` in the form hidden field but there is no supplierId context here — the supplier is selected from the dropdown (`name="supplier_id"`). The `linkComponent` action reads `supplier_id` from `formData`, so the dropdown selection covers it. Pass the `componentId` via hidden field.

- [ ] **Step 3: Add CSS to `component-detail.module.css`**

```css
.tabToolbar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; }
.tabCount { font-size: 0.82rem; opacity: 0.5; }
.btnSmall { padding: 0.3rem 0.75rem; font-size: 0.78rem; border-radius: 5px; border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.05); color: inherit; cursor: pointer; }
.linkForm { display: flex; gap: 0.4rem; flex-wrap: wrap; align-items: center; padding: 0.75rem; background: rgba(255,255,255,0.04); border-radius: 6px; margin-bottom: 0.75rem; }
.miniInput { padding: 0.3rem 0.5rem; border-radius: 4px; border: 1px solid rgba(255,255,255,0.15); background: rgba(255,255,255,0.07); color: inherit; font-size: 0.8rem; }

.suppliersTable { margin-top: 0.5rem; }
.suppliersHeader,
.suppliersRow {
  display: grid;
  grid-template-columns: 2fr 1.1fr 1fr 0.8fr 0.9fr 0.9fr 60px;
  gap: 0; padding: 0.6rem 0.5rem; font-size: 0.83rem; align-items: center;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.suppliersHeader { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.4; border-bottom: 1px solid rgba(255,255,255,0.14); }
.supplierLink { font-weight: 500; }
.tagGreen { display: inline-block; margin-left: 6px; padding: 1px 6px; border-radius: 8px; font-size: 0.7rem; background: rgba(72,199,116,0.15); color: #48c774; }
.tagBlue { display: inline-block; margin-left: 6px; padding: 1px 6px; border-radius: 8px; font-size: 0.7rem; background: rgba(79,142,247,0.15); color: #4f8ef7; }
.ltGreen { color: #48c774; }
.ltRed { color: #ff6b6b; }
.starBtn { background: none; border: none; cursor: pointer; font-size: 1.1rem; color: #f5c542; }
```

- [ ] **Step 4: Verify in browser**

Navigate to a component with 2+ supplier catalog entries. Confirm:
- Suppliers tab appears with count badge
- best-price / fastest tags auto-apply to correct rows
- Avg actual lead time shows in correct colour
- Preferred star toggles (verify DB update)
- Link Supplier form creates a new `supplier_components` row

- [ ] **Step 5: Commit**

```bash
git add src/app/app/components/[componentId]/page.tsx src/app/app/components/[componentId]/detail-tabs.tsx src/app/app/components/[componentId]/component-detail.module.css
git commit -m "feat(suppliers): component page Suppliers tab — comparison view, tags, preferred toggle"
```
