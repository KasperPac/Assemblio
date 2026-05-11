# Lot / Batch Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record a lot number and expiry date when receiving components via goods inwards, and display lot balances per component so operators can see what lots they hold and flag expiring stock.

**Architecture:** A new `inventory_lot` table stores one row per lot received, linked to the `delivery_receipt_line` that created it. The `delivery_receipt_line` table gains `lot_number` and `expiry_date` columns. The `DeliveryReceiptLineInput` type and `createDeliveryReceipt` action are extended to accept these fields. After the existing `receive_delivery_receipt` RPC call, lot records are created for any lines that provided a lot number. A lot balance view is added to the component detail page. Consumption tracking (decreasing lot balances when components are used in production) is out of scope for this plan.

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres + RLS), CSS Modules, TypeScript

---

### Task 1: Database migration — inventory_lot + delivery_receipt_line columns

**Goal:** Add `lot_number` and `expiry_date` to `delivery_receipt_line`, and create the `inventory_lot` table with tenant isolation.

**Files:**
- Create: `supabase/patches/lot_tracking.sql`

**Acceptance Criteria:**
- [ ] `delivery_receipt_line` has nullable `lot_number text` and `expiry_date date` columns
- [ ] `inventory_lot` table exists with all columns
- [ ] `inventory_lot` has RLS enabled with `current_tenant_id()` policy
- [ ] The same `(tenant_id, component_id, lot_number)` combination cannot be inserted twice (unique constraint)
- [ ] `authenticated` role has full access to `inventory_lot`

**Verify:** In Supabase SQL editor → run patch → `select column_name from information_schema.columns where table_name = 'delivery_receipt_line' and column_name in ('lot_number', 'expiry_date');` returns two rows.

**Steps:**

- [ ] **Step 1: Create `supabase/patches/lot_tracking.sql`**

```sql
-- Add lot tracking columns to delivery_receipt_line (nullable — existing rows unaffected)
alter table public.delivery_receipt_line
  add column if not exists lot_number  text,
  add column if not exists expiry_date date;

-- inventory_lot: one row per lot received, created when a delivery receipt line is processed
create table public.inventory_lot (
  id                       uuid        default gen_random_uuid() primary key,
  tenant_id                uuid        not null,
  component_id             uuid        not null,
  lot_number               text        not null,
  expiry_date              date,
  quantity_received        numeric     not null check (quantity_received > 0),
  delivery_receipt_line_id uuid        references public.delivery_receipt_line(id) on delete set null,
  notes                    text,
  created_at               timestamptz not null default now(),

  -- A lot number is unique per component per tenant
  unique (tenant_id, component_id, lot_number)
);

alter table public.inventory_lot enable row level security;

create policy "tenant isolation"
  on public.inventory_lot
  using (tenant_id = public.current_tenant_id());

grant all on public.inventory_lot to authenticated;

-- Index for the common query: all lots for a given component
create index inventory_lot_component_idx
  on public.inventory_lot (tenant_id, component_id);

-- Index for finding expiring lots
create index inventory_lot_expiry_idx
  on public.inventory_lot (tenant_id, expiry_date)
  where expiry_date is not null;
```

- [ ] **Step 2: Apply the patch in the Supabase SQL editor**

Run the file contents in the Supabase dashboard. Verify:

```sql
select column_name, data_type
from information_schema.columns
where table_name = 'delivery_receipt_line'
  and column_name in ('lot_number', 'expiry_date');
-- expects 2 rows

select table_name from information_schema.tables
where table_name = 'inventory_lot';
-- expects 1 row
```

- [ ] **Step 3: Commit**

```bash
git add supabase/patches/lot_tracking.sql
git commit -m "feat(lots): add inventory_lot table and lot columns to delivery_receipt_line"
```

---

### Task 2: Lot lib — createLots and getLotsByComponent

**Goal:** Implement the two reusable lot operations needed by the goods-inwards action and the component detail page.

**Files:**
- Create: `src/lib/inventory/lots.ts`

**Acceptance Criteria:**
- [ ] `createLots(supabase, tenantId, lines)` inserts one `inventory_lot` row per line that has a `lot_number`, skipping lines without one
- [ ] `createLots` is idempotent for the `(tenant_id, component_id, lot_number)` unique key — uses upsert with `onConflict: "tenant_id,component_id,lot_number"` and `ignoreDuplicates: true`
- [ ] `getLotsByComponent(supabase, tenantId, componentId)` returns lots ordered by expiry date (nulls last), most urgent first
- [ ] Both functions throw on unexpected Supabase errors

**Verify:** Write a quick manual test in the browser console (or via a temporary test route) inserting a lot and fetching it back.

**Steps:**

- [ ] **Step 1: Create `src/lib/inventory/lots.ts`**

```typescript
import type { SupabaseClient } from "@supabase/supabase-js";

export type LotInput = {
  component_id: string;
  lot_number: string;
  expiry_date: string | null; // "YYYY-MM-DD" or null
  quantity_received: number;
  delivery_receipt_line_id: string;
  notes: string | null;
};

export type InventoryLot = {
  id: string;
  tenant_id: string;
  component_id: string;
  lot_number: string;
  expiry_date: string | null;
  quantity_received: number;
  delivery_receipt_line_id: string | null;
  notes: string | null;
  created_at: string;
};

export async function createLots(
  supabase: SupabaseClient,
  tenantId: string,
  lines: LotInput[]
): Promise<void> {
  const lotsToInsert = lines
    .filter((l) => l.lot_number.trim() !== "")
    .map((l) => ({
      tenant_id: tenantId,
      component_id: l.component_id,
      lot_number: l.lot_number.trim(),
      expiry_date: l.expiry_date ?? null,
      quantity_received: l.quantity_received,
      delivery_receipt_line_id: l.delivery_receipt_line_id,
      notes: l.notes ?? null,
    }));

  if (lotsToInsert.length === 0) return;

  const { error } = await supabase
    .from("inventory_lot")
    .upsert(lotsToInsert, {
      onConflict: "tenant_id,component_id,lot_number",
      ignoreDuplicates: true,
    });

  if (error) throw new Error(`Failed to create lots: ${error.message}`);
}

export async function getLotsByComponent(
  supabase: SupabaseClient,
  tenantId: string,
  componentId: string
): Promise<InventoryLot[]> {
  const { data, error } = await supabase
    .from("inventory_lot")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("component_id", componentId)
    .order("expiry_date", { ascending: true, nullsFirst: false });

  if (error) throw new Error(`Failed to fetch lots: ${error.message}`);
  return data ?? [];
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/inventory/lots.ts
git commit -m "feat(lots): add createLots and getLotsByComponent lib functions"
```

---

### Task 3: Update goods-inwards action — accept and persist lot data

**Goal:** Extend `DeliveryReceiptLineInput` with optional lot fields, validate them, and after the RPC call, create `inventory_lot` records for any lines that have a lot number.

**Files:**
- Modify: `src/app/app/goods-inwards/actions.ts`

**Acceptance Criteria:**
- [ ] `DeliveryReceiptLineInput` has optional `lot_number: string | null` and `expiry_date: string | null`
- [ ] If `lot_number` is present and non-empty, `expiry_date` is accepted as an ISO date string or null
- [ ] After `receive_delivery_receipt` RPC succeeds, `createLots` is called with the inserted line IDs
- [ ] A `createLots` failure logs a warning but does not roll back the receipt (defensive `try/catch`)
- [ ] The activity log `metadata` includes `lots_count` (number of lines that had a lot number)

**Verify:** `npm run dev` → create a delivery receipt, enter a lot number for one line → check `inventory_lot` table in Supabase for a new row with the correct lot number, component_id, and quantity.

**Steps:**

- [ ] **Step 1: Extend `DeliveryReceiptLineInput` in `src/app/app/goods-inwards/actions.ts`**

Replace the existing type:

```typescript
export type DeliveryReceiptLineInput = {
  component_id: string;
  purchase_order_line_id: string | null;
  quantity_delivered: number;
  quantity_expected: number | null;
  cost_per_unit: number | null;
  notes: string | null;
  lot_number: string | null;   // add
  expiry_date: string | null;  // add — "YYYY-MM-DD" or null
};
```

- [ ] **Step 2: Add the `createLots` import at the top of the file**

```typescript
import { createLots } from "@/lib/inventory/lots";
```

- [ ] **Step 3: After the `delivery_receipt_line` insert, fetch the inserted line IDs and call `createLots`**

The existing code inserts lines and then calls the RPC. After the RPC call succeeds (after the `if (rpcError)` block), add:

```typescript
  // Create lot records for any lines that provided a lot number
  // Fetch the line IDs that were just inserted
  const { data: insertedLines } = await supabase
    .from("delivery_receipt_line")
    .select("id, component_id, quantity_delivered, lot_number, expiry_date")
    .eq("delivery_receipt_id", receipt.id)
    .eq("tenant_id", tenantId)
    .not("lot_number", "is", null);

  if (insertedLines && insertedLines.length > 0) {
    try {
      await createLots(
        supabase,
        tenantId,
        insertedLines.map((l) => ({
          component_id: l.component_id,
          lot_number: l.lot_number!,
          expiry_date: l.expiry_date ?? null,
          quantity_received: l.quantity_delivered,
          delivery_receipt_line_id: l.id,
          notes: null,
        }))
      );
    } catch (err) {
      // Lot creation failure is non-fatal — receipt is already committed
      console.warn("[goods-inwards] lot creation failed:", err);
    }
  }
```

- [ ] **Step 4: Update the activity log metadata to include `lots_count`**

In the existing activity log insert, add `lots_count` to the metadata:

```typescript
  await supabase.from("activity_log").insert({
    tenant_id: tenantId,
    actor_id: authData.user.id,
    event: "delivery_receipt_created",
    metadata: {
      delivery_receipt_id: receipt.id,
      supplier_reference: supplierReference,
      lines_count: lines.length,
      purchase_order_id: purchaseOrderId,
      lots_count: lines.filter((l) => l.lot_number).length,  // add
    },
  });
```

- [ ] **Step 5: Commit**

```bash
git add src/app/app/goods-inwards/actions.ts
git commit -m "feat(lots): create lot records on delivery receipt creation"
```

---

### Task 4: Update goods-inwards new receipt UI — lot number and expiry date fields

**Goal:** Add optional lot number and expiry date inputs to each receipt line in the new delivery receipt form.

**Files:**
- Modify: `src/app/app/goods-inwards/new/page.tsx` (or wherever the new receipt form component lives — read the file first)

**Acceptance Criteria:**
- [ ] Each receipt line row has a "Lot number" text input (optional, placeholder "e.g. LOT-2026-001")
- [ ] Each line row has an "Expiry date" date input (optional, only shown/required when lot number is filled)
- [ ] The lot_number and expiry_date values are included in the `lines` JSON submitted via the form
- [ ] If lot_number is empty, lot_number and expiry_date are submitted as null
- [ ] Existing form validation and submission are not broken

**Verify:** `npm run dev` → go to Goods Inwards → New Receipt → add a line → lot number and expiry date fields appear → submit with a lot number → check Supabase `inventory_lot`.

**Steps:**

- [ ] **Step 1: Read the current new receipt form to understand the line row component**

```
Read: src/app/app/goods-inwards/new/page.tsx
```

Identify the component that renders a single line row (look for where `quantity_delivered` is rendered as an input). The lot fields go in the same row or in a collapsible sub-row.

- [ ] **Step 2: Add lot_number and expiry_date to the line state type**

In the line row component/state, add two fields:

```typescript
type ReceiptLine = {
  component_id: string;
  purchase_order_line_id: string | null;
  quantity_delivered: string;
  quantity_expected: string | null;
  cost_per_unit: string;
  notes: string;
  lot_number: string;    // add — empty string = no lot
  expiry_date: string;   // add — empty string = no expiry
};

// Initial value for a new line:
const emptyLine: ReceiptLine = {
  component_id: "",
  purchase_order_line_id: null,
  quantity_delivered: "",
  quantity_expected: null,
  cost_per_unit: "",
  notes: "",
  lot_number: "",   // add
  expiry_date: "",  // add
};
```

- [ ] **Step 3: Add the lot inputs to the line row JSX**

After the existing `notes` input in the line row, add:

```tsx
<input
  type="text"
  placeholder="Lot number (optional)"
  value={line.lot_number}
  onChange={(e) => updateLine(index, "lot_number", e.target.value)}
  aria-label="Lot number"
/>
{line.lot_number && (
  <input
    type="date"
    value={line.expiry_date}
    onChange={(e) => updateLine(index, "expiry_date", e.target.value)}
    aria-label="Expiry date"
  />
)}
```

- [ ] **Step 4: Include lot fields in the JSON submitted to the server**

In the form submission handler where lines are serialised to JSON, map the two new fields:

```typescript
const payload = lines.map((l) => ({
  component_id: l.component_id,
  purchase_order_line_id: l.purchase_order_line_id,
  quantity_delivered: Number(l.quantity_delivered),
  quantity_expected: l.quantity_expected ? Number(l.quantity_expected) : null,
  cost_per_unit: l.cost_per_unit ? Number(l.cost_per_unit) : null,
  notes: l.notes || null,
  lot_number: l.lot_number.trim() || null,    // add
  expiry_date: l.expiry_date || null,         // add
}));
formData.set("lines", JSON.stringify(payload));
```

- [ ] **Step 5: Commit**

```bash
git add src/app/app/goods-inwards/new/
git commit -m "feat(lots): add lot number and expiry date fields to receipt line form"
```

---

### Task 5: Component lots view — lot balance tab on component detail page

**Goal:** Show all lots held for a component on its detail page — lot number, quantity received, expiry date, and the receipt it came from.

**Files:**
- Modify: `src/app/app/components/[componentId]/page.tsx`
- Create: `src/app/app/components/[componentId]/lots-tab.tsx`

**Acceptance Criteria:**
- [ ] A "Lots" section appears on the component detail page
- [ ] The section lists all lots for the component ordered by expiry date (soonest first, nulls last)
- [ ] Each row shows: lot number, quantity received, expiry date (or "—"), and a link to the goods inwards receipt
- [ ] Lots expiring within 30 days are highlighted with a warning colour (`var(--warning)`)
- [ ] If the component has no lots, the section shows an empty state: "No lot numbers recorded. Assign lot numbers when receiving this component via Goods Inwards."

**Verify:** `npm run dev` → Components → pick a component that has received deliveries with lot numbers → "Lots" section shows correct rows. Check the expiry warning by temporarily setting an expiry date within 30 days in Supabase.

**Steps:**

- [ ] **Step 1: Read `src/app/app/components/[componentId]/page.tsx` to understand the layout**

```
Read: src/app/app/components/[componentId]/page.tsx
```

Identify where other data sections (inventory balances, movements, etc.) are rendered. The lots tab goes after the existing content, same pattern.

- [ ] **Step 2: Create `src/app/app/components/[componentId]/lots-tab.tsx`**

```tsx
import styles from "./component-detail.module.css"; // use existing module

type Lot = {
  id: string;
  lot_number: string;
  expiry_date: string | null;
  quantity_received: number;
  delivery_receipt_line_id: string | null;
  created_at: string;
};

function isExpiringSoon(expiryDate: string | null): boolean {
  if (!expiryDate) return false;
  const daysUntilExpiry =
    (new Date(expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return daysUntilExpiry >= 0 && daysUntilExpiry <= 30;
}

export function LotsTab({ lots }: { lots: Lot[] }) {
  if (lots.length === 0) {
    return (
      <section className={styles.section} aria-label="Lots">
        <h2 className={styles.sectionTitle}>Lots</h2>
        <p className={styles.emptyMessage}>
          No lot numbers recorded. Assign lot numbers when receiving this
          component via Goods Inwards.
        </p>
      </section>
    );
  }

  return (
    <section className={styles.section} aria-label="Lots">
      <h2 className={styles.sectionTitle}>Lots</h2>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Lot number</th>
            <th>Qty received</th>
            <th>Expiry date</th>
            <th>Received</th>
          </tr>
        </thead>
        <tbody>
          {lots.map((lot) => (
            <tr
              key={lot.id}
              style={
                isExpiringSoon(lot.expiry_date)
                  ? { color: "var(--warning)" }
                  : undefined
              }
            >
              <td>{lot.lot_number}</td>
              <td>{lot.quantity_received}</td>
              <td>{lot.expiry_date ?? "—"}</td>
              <td>{new Date(lot.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
```

- [ ] **Step 3: Query lots in the component detail page and render `<LotsTab>`**

In `src/app/app/components/[componentId]/page.tsx`, after the existing queries, add:

```tsx
import { getLotsByComponent } from "@/lib/inventory/lots";
import { LotsTab } from "./lots-tab";

// In the page component, after the component query:
const lots = await getLotsByComponent(supabase, tenantId, componentId);

// In the JSX, after existing sections:
<LotsTab lots={lots} />
```

- [ ] **Step 4: Commit**

```bash
git add src/app/app/components/[componentId]/lots-tab.tsx src/app/app/components/[componentId]/page.tsx
git commit -m "feat(lots): add lots view to component detail page"
```
