# Goods Inwards Enhancements — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix card backgrounds, remove Link-to-PO UI, add line cost entry with confirmation modal, and add PDF parsing to pre-fill the receipt form.

**Architecture:** All changes are in the goods-inwards feature slice. CSS fix is standalone. Link-to-PO removal strips state/props/queries; backend stays. Line cost adds a DB column + form field + post-save modal. PDF parsing adds a server action (Anthropic SDK) and a pre-fill UI section in the form.

**Tech Stack:** Next.js 14 App Router, Supabase JS, Anthropic SDK (`@anthropic-ai/sdk`), CSS Modules.

---

## File Structure

**Modified:**
- `src/app/app/goods-inwards/goods-inwards.module.css` — fix undefined CSS variables
- `src/app/app/goods-inwards/receipt-form.tsx` — remove PO UI, add cost column, add PDF upload section
- `src/app/app/goods-inwards/receipt-detail.tsx` — remove PO UI, add cost column + cost update modal
- `src/app/app/goods-inwards/new/page.tsx` — remove openPOs query + prop
- `src/app/app/goods-inwards/[id]/page.tsx` — remove openPOs query + prop; add cost_per_unit to line select
- `src/app/app/goods-inwards/actions.ts` — add updateComponentCosts, parseReceiptPdf; extend createDeliveryReceipt
- `package.json` / `package-lock.json` — add @anthropic-ai/sdk

**Created:**
- `supabase/patches/delivery_receipt_line_cost.sql` — adds cost_per_unit column

---

### Task 0: Fix CSS variables

**Goal:** Replace the five undefined CSS variable references that make cards transparent/same-colour as the page.

**Files:**
- Modify: `src/app/app/goods-inwards/goods-inwards.module.css`

**Acceptance Criteria:**
- [ ] No reference to `var(--surface-raised)` or `var(--surface)` remains in the file
- [ ] Cards visually contrast with the page background in all themes

**Steps:**

- [ ] **Step 1: Apply all five replacements**

Open `src/app/app/goods-inwards/goods-inwards.module.css` and make these exact substitutions:

| Line | Old value | New value |
|---|---|---|
| `.tabs` background | `var(--surface-raised)` | `var(--bg-card-alt)` |
| `.tabActive` background | `var(--surface)` | `var(--bg-card)` |
| `.formCard` background | `var(--surface-raised)` | `var(--bg-card)` |
| `.field input,select,textarea` background | `var(--surface)` | `var(--bg-input)` |
| `.secondary` background | `var(--surface)` | `var(--bg-card-alt)` |

- [ ] **Step 2: Verify no broken variables remain**

```bash
grep "var(--surface" src/app/app/goods-inwards/goods-inwards.module.css
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/app/app/goods-inwards/goods-inwards.module.css
git commit -m "fix(goods-inwards): replace undefined CSS vars with correct bg tokens"
```

---

### Task 1: Remove Link-to-PO UI

**Goal:** Strip all Link-to-PO UI from the form and detail view while keeping backend actions intact.

**Files:**
- Modify: `src/app/app/goods-inwards/receipt-form.tsx`
- Modify: `src/app/app/goods-inwards/receipt-detail.tsx`
- Modify: `src/app/app/goods-inwards/new/page.tsx`
- Modify: `src/app/app/goods-inwards/[id]/page.tsx`

**Acceptance Criteria:**
- [ ] No Link to PO dropdown, button, or modal renders anywhere in goods-inwards
- [ ] No `openPOs` prop or query exists in the form or detail page
- [ ] `npm run build` (or tsc) passes with no type errors

**Steps:**

- [ ] **Step 1: Clean up receipt-form.tsx**

Replace the entire file content with:

```typescript
"use client";

import { useRef, useState, useTransition } from "react";
import { createDeliveryReceipt } from "./actions";
import styles from "./goods-inwards.module.css";

type Supplier = { id: string; name: string };
type Component = { id: string; name: string; sku: string | null };
type Location = { id: string; name: string; is_default: boolean };

type LineState = {
  key: string;
  component_id: string;
  quantity_delivered: string;
  cost_per_unit: string;
  notes: string;
};

const REASONS = [
  { value: "supplier_delivery", label: "Supplier delivery" },
  { value: "customer_return", label: "Customer return" },
  { value: "opening_stock", label: "Opening stock" },
  { value: "sample", label: "Sample" },
  { value: "adjustment", label: "Adjustment" },
  { value: "other", label: "Other" },
];

function blankLine(): LineState {
  return {
    key: crypto.randomUUID(),
    component_id: "",
    quantity_delivered: "",
    cost_per_unit: "",
    notes: "",
  };
}

function componentLabel(c: Component): string {
  return c.sku ? `${c.name} (${c.sku})` : c.name;
}

export default function ReceiptForm({
  suppliers,
  components,
  locations,
}: {
  suppliers: Supplier[];
  components: Component[];
  locations: Location[];
}) {
  const defaultLocation = locations.find((l) => l.is_default) ?? locations[0];

  const [supplierId, setSupplierId] = useState<string>("");
  const [showSupplierOverride, setShowSupplierOverride] = useState(false);
  const [locationId, setLocationId] = useState(defaultLocation?.id ?? "");
  const [lines, setLines] = useState<LineState[]>([blankLine()]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSupplierChange(value: string) {
    setSupplierId(value === "__other__" ? "" : value);
    setShowSupplierOverride(value === "__other__");
  }

  function updateLine(key: string, patch: Partial<LineState>) {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l))
    );
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const filledLines = lines.filter((l) => l.component_id && l.quantity_delivered);
    if (filledLines.length === 0) {
      setError("At least one complete line is required.");
      return;
    }

    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    if (showSupplierOverride) fd.set("supplier_id", "");
    fd.set(
      "lines",
      JSON.stringify(
        filledLines.map((l) => ({
          component_id: l.component_id,
          purchase_order_line_id: null,
          quantity_delivered: parseFloat(l.quantity_delivered),
          quantity_expected: null,
          cost_per_unit: l.cost_per_unit ? parseFloat(l.cost_per_unit) : null,
          notes: l.notes || null,
        }))
      )
    );

    startTransition(async () => {
      const result = await createDeliveryReceipt(fd);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className={styles.page}>
      {error && <div className={styles.errorNotice}>{error}</div>}

      <div className={styles.formCard}>
        <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>
          Delivery details
        </h2>

        <div className={styles.formGrid}>
          {/* Supplier */}
          <div className={styles.field}>
            <label htmlFor="supplier_id">Supplier</label>
            <select
              id="supplier_id"
              name="supplier_id"
              value={showSupplierOverride ? "__other__" : supplierId}
              onChange={(e) => handleSupplierChange(e.target.value)}
            >
              <option value="">Select supplier…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
              <option value="__other__">Other / not in system</option>
            </select>
          </div>

          {showSupplierOverride && (
            <div className={styles.field}>
              <label htmlFor="supplier_name_override">Supplier name</label>
              <input
                id="supplier_name_override"
                name="supplier_name_override"
                type="text"
                placeholder="Enter supplier name"
                required
              />
            </div>
          )}

          <div className={styles.field}>
            <label htmlFor="supplier_reference">Docket / reference number</label>
            <input
              id="supplier_reference"
              name="supplier_reference"
              type="text"
              placeholder="e.g. DEL-10042"
              required
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="received_at">Date received</label>
            <input
              id="received_at"
              name="received_at"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              required
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="location_id">Location</label>
            <select
              id="location_id"
              name="location_id"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              required
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}{l.is_default ? " (default)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor="stock_in_reason">Reason</label>
            <select id="stock_in_reason" name="stock_in_reason" required>
              <option value="">Select reason…</option>
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <div className={styles.fieldFull}>
            <label htmlFor="notes">Notes (optional)</label>
            <textarea id="notes" name="notes" rows={2} placeholder="Any overall delivery notes…" />
          </div>
        </div>
      </div>

      {/* Lines */}
      <div className={styles.formCard}>
        <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>Lines</h2>
        <table className={styles.linesTable}>
          <thead>
            <tr>
              <th>Component</th>
              <th>Qty delivered</th>
              <th>Cost / unit (optional)</th>
              <th>Note</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.key}>
                <td>
                  <select
                    value={line.component_id}
                    onChange={(e) => updateLine(line.key, { component_id: e.target.value })}
                  >
                    <option value="">Select component…</option>
                    {components.map((c) => (
                      <option key={c.id} value={c.id}>{componentLabel(c)}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={line.quantity_delivered}
                    onChange={(e) => updateLine(line.key, { quantity_delivered: e.target.value })}
                    style={{ width: 90 }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.cost_per_unit}
                    onChange={(e) => updateLine(line.key, { cost_per_unit: e.target.value })}
                    placeholder="—"
                    style={{ width: 100 }}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    placeholder="Note…"
                    value={line.notes}
                    onChange={(e) => updateLine(line.key, { notes: e.target.value })}
                    style={{ width: 140 }}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    onClick={() => removeLine(line.key)}
                    className={styles.secondary}
                    style={{ padding: "4px 10px" }}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          type="button"
          onClick={() => setLines((prev) => [...prev, blankLine()])}
          className={styles.secondary}
          style={{ alignSelf: "flex-start" }}
        >
          + Add line
        </button>
      </div>

      <div className={styles.actions}>
        <a href="/app/goods-inwards" className={styles.secondary}>Cancel</a>
        <button type="submit" className={styles.primary} disabled={isPending}>
          {isPending ? "Saving…" : "Save Receipt"}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Clean up new/page.tsx — remove openPOs query and prop**

Replace the file content with:

```typescript
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import ReceiptForm from "../receipt-form";

export default async function NewReceiptPage() {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/auth/login");
  const { supabase, tenantId } = ctx;

  const [suppliersResult, componentsResult, locationsResult] = await Promise.all([
    supabase.from("suppliers").select("id, name").eq("tenant_id", tenantId).order("name"),
    supabase.from("component").select("id, name, sku").eq("tenant_id", tenantId).order("name"),
    supabase.from("location").select("id, name, is_default").eq("tenant_id", tenantId).order("name"),
  ]);

  return (
    <ReceiptForm
      suppliers={suppliersResult.data ?? []}
      components={componentsResult.data ?? []}
      locations={locationsResult.data ?? []}
    />
  );
}
```

- [ ] **Step 3: Clean up receipt-detail.tsx — remove Link to PO section**

Remove the following from `receipt-detail.tsx`:
1. The `OpenPO` type definition
2. `openPOs` from the function props type and signature
3. The `showLinkModal`, `linkError`, `selectedPoId` state declarations
4. The `handleLink` function
5. The entire `{receipt.status === "unmatched" && ( ... )}` block containing the Link to PO button and form

The `openPOs` parameter should be removed from the function signature:

```typescript
export default function ReceiptDetail({
  receipt,
  suppliers,
  locations,
}: {
  receipt: Receipt;
  suppliers: SupplierOption[];
  locations: LocationOption[];
})
```

- [ ] **Step 4: Clean up [id]/page.tsx — remove openPOs query and prop**

Remove the `openPOs` conditional query block and the `openPOs` prop from the `ReceiptDetail` JSX. The return should become:

```typescript
  return (
    <ReceiptDetail
      receipt={receipt}
      suppliers={suppliers ?? []}
      locations={locations ?? []}
    />
  );
```

- [ ] **Step 5: Commit**

```bash
git add src/app/app/goods-inwards/receipt-form.tsx \
        src/app/app/goods-inwards/receipt-detail.tsx \
        src/app/app/goods-inwards/new/page.tsx \
        src/app/app/goods-inwards/[id]/page.tsx
git commit -m "feat(goods-inwards): remove link-to-PO UI, add cost column to form"
```

---

### Task 2: DB patch + wire cost_per_unit through create action

**Goal:** Add `cost_per_unit` to `delivery_receipt_line` in the DB and persist it from the create action.

**Files:**
- Create: `supabase/patches/delivery_receipt_line_cost.sql`
- Modify: `src/app/app/goods-inwards/actions.ts`

**Acceptance Criteria:**
- [ ] `delivery_receipt_line` has a nullable `cost_per_unit numeric` column
- [ ] `DeliveryReceiptLineInput` type includes `cost_per_unit: number | null`
- [ ] `createDeliveryReceipt` inserts `cost_per_unit` on each line

**Steps:**

- [ ] **Step 1: Create the SQL patch**

Create `supabase/patches/delivery_receipt_line_cost.sql`:

```sql
alter table public.delivery_receipt_line
  add column if not exists cost_per_unit numeric;
```

- [ ] **Step 2: Apply the patch**

```bash
supabase db reset
```

Verify: `\d delivery_receipt_line` shows `cost_per_unit | numeric | nullable`.

- [ ] **Step 3: Update DeliveryReceiptLineInput type and insert in actions.ts**

In `src/app/app/goods-inwards/actions.ts`, update the `DeliveryReceiptLineInput` type:

```typescript
export type DeliveryReceiptLineInput = {
  component_id: string;
  purchase_order_line_id: string | null;
  quantity_delivered: number;
  quantity_expected: number | null;
  cost_per_unit: number | null;
  notes: string | null;
};
```

In `createDeliveryReceipt`, update the line insert mapping:

```typescript
lines.map((l) => ({
  tenant_id: tenantId,
  delivery_receipt_id: receipt.id,
  component_id: l.component_id,
  purchase_order_line_id: l.purchase_order_line_id,
  quantity_delivered: l.quantity_delivered,
  quantity_expected: l.quantity_expected,
  cost_per_unit: l.cost_per_unit ?? null,
  notes: l.notes,
}))
```

- [ ] **Step 4: Commit**

```bash
git add supabase/patches/delivery_receipt_line_cost.sql \
        src/app/app/goods-inwards/actions.ts
git commit -m "feat(goods-inwards): add cost_per_unit to delivery_receipt_line"
```

---

### Task 3: Cost update modal on receipt detail

**Goal:** After saving a receipt, show a modal on the detail page when lines have costs, letting the user selectively update component prices.

**Files:**
- Modify: `src/app/app/goods-inwards/actions.ts`
- Modify: `src/app/app/goods-inwards/receipt-detail.tsx`
- Modify: `src/app/app/goods-inwards/[id]/page.tsx`

**Acceptance Criteria:**
- [ ] `updateComponentCosts` action updates `component.cost_per_unit` for the given component IDs
- [ ] Modal appears on detail page mount when any line has `cost_per_unit` set and hasn't been dismissed
- [ ] Modal lists per-line checkboxes with component name, receipt cost, and current price
- [ ] Confirming updates only the checked components; skipping or dismissing does nothing
- [ ] Modal does not reappear after dismissal (localStorage key `dismissed_cost_modal_<receipt_id>`)

**Steps:**

- [ ] **Step 1: Add updateComponentCosts to actions.ts**

Append to `src/app/app/goods-inwards/actions.ts`:

```typescript
export async function updateComponentCosts(
  updates: { component_id: string; cost_per_unit: number }[]
): Promise<{ updated: number } | { error: string }> {
  const ctx = await getServerTenantContext();
  if (!ctx) return { error: "Not authenticated" };
  const { supabase, tenantId } = ctx;

  let updated = 0;
  for (const u of updates) {
    const { error } = await supabase
      .from("component")
      .update({ cost_per_unit: u.cost_per_unit })
      .eq("id", u.component_id)
      .eq("tenant_id", tenantId);
    if (!error) updated++;
  }

  revalidatePath("/app/components");
  revalidatePath("/app/inventory");
  return { updated };
}
```

- [ ] **Step 2: Add cost_per_unit to the detail page line query**

In `src/app/app/goods-inwards/[id]/page.tsx`, extend the `delivery_receipt_line` select to include `cost_per_unit`:

```typescript
delivery_receipt_line(
  id, component_id, quantity_delivered, quantity_expected, notes, cost_per_unit,
  component:component_id(name, sku)
)
```

- [ ] **Step 3: Update ReceiptLine type and add Cost column + modal in receipt-detail.tsx**

Add `cost_per_unit: number | null` to the `ReceiptLine` type:

```typescript
type ReceiptLine = {
  id: string;
  component_id: string;
  quantity_delivered: number;
  quantity_expected: number | null;
  cost_per_unit: number | null;
  notes: string | null;
  component:
    | { name: string; sku: string | null }
    | Array<{ name: string; sku: string | null }>
    | null;
};
```

Add `showCostModal` state and dismiss logic at the top of `ReceiptDetail`:

```typescript
const linesWithCost = receipt.delivery_receipt_line.filter(
  (l) => l.cost_per_unit !== null
);
const dismissKey = `dismissed_cost_modal_${receipt.id}`;
const [showCostModal, setShowCostModal] = useState(() => {
  if (linesWithCost.length === 0) return false;
  if (typeof window === "undefined") return false;
  return !localStorage.getItem(dismissKey);
});
const [costChecked, setCostChecked] = useState<Record<string, boolean>>(
  () => Object.fromEntries(linesWithCost.map((l) => [l.id, true]))
);
const [costUpdatePending, startCostTransition] = useTransition();

function dismissCostModal() {
  localStorage.setItem(dismissKey, "1");
  setShowCostModal(false);
}

function handleCostUpdate() {
  const selected = linesWithCost
    .filter((l) => costChecked[l.id] && l.cost_per_unit !== null)
    .map((l) => ({ component_id: l.component_id, cost_per_unit: l.cost_per_unit! }));
  startCostTransition(async () => {
    if (selected.length > 0) await updateComponentCosts(selected);
    dismissCostModal();
  });
}
```

Add the import at the top:

```typescript
import { linkReceiptToPo, updateDeliveryReceipt, updateComponentCosts } from "./actions";
```

Add the Cost column to the lines table in the JSX (after the Delivered column, before Note):

```tsx
<th>Cost / unit</th>
```

```tsx
<td>{line.cost_per_unit != null ? `$${line.cost_per_unit.toFixed(2)}` : "—"}</td>
```

Add the modal just before the closing `</div>` of the page:

```tsx
{showCostModal && (
  <div className={styles.modalOverlay}>
    <div className={styles.modal}>
      <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>
        Update component prices?
      </h3>
      <p style={{ margin: "6px 0 0", color: "var(--ink-muted)", fontSize: "0.85rem" }}>
        These costs were recorded on this receipt. Select the components whose price you'd like to update.
      </p>
      <table className={styles.linesTable} style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th></th>
            <th>Component</th>
            <th>Receipt cost</th>
          </tr>
        </thead>
        <tbody>
          {linesWithCost.map((l) => (
            <tr key={l.id}>
              <td>
                <input
                  type="checkbox"
                  checked={costChecked[l.id] ?? true}
                  onChange={(e) =>
                    setCostChecked((prev) => ({ ...prev, [l.id]: e.target.checked }))
                  }
                />
              </td>
              <td>{resolveComponentName(l)}</td>
              <td>${l.cost_per_unit!.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className={styles.actions} style={{ marginTop: 16 }}>
        <button type="button" className={styles.secondary} onClick={dismissCostModal}>
          Skip
        </button>
        <button
          type="button"
          className={styles.primary}
          disabled={costUpdatePending}
          onClick={handleCostUpdate}
        >
          {costUpdatePending ? "Updating…" : "Update selected"}
        </button>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 4: Add modal CSS to goods-inwards.module.css**

Append to `src/app/app/goods-inwards/goods-inwards.module.css`:

```css
.modalOverlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}

.modal {
  background: var(--bg-card);
  border: 1px solid var(--stroke);
  border-radius: 16px;
  padding: 24px;
  max-width: 480px;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/app/goods-inwards/actions.ts \
        src/app/app/goods-inwards/receipt-detail.tsx \
        src/app/app/goods-inwards/[id]/page.tsx \
        src/app/app/goods-inwards/goods-inwards.module.css
git commit -m "feat(goods-inwards): cost update modal on receipt detail"
```

---

### Task 4: PDF upload + parse action

**Goal:** Add a "Parse delivery docket" section to the receipt form that uses the Anthropic API to pre-fill supplier reference, date, and line quantities.

**Files:**
- Modify: `package.json` (add @anthropic-ai/sdk)
- Modify: `src/app/app/goods-inwards/actions.ts`
- Modify: `src/app/app/goods-inwards/receipt-form.tsx`
- Modify: `.env.local` (add ANTHROPIC_API_KEY — user must do this manually)

**Acceptance Criteria:**
- [ ] `@anthropic-ai/sdk` is installed
- [ ] `parseReceiptPdf` returns `{ supplier_reference?, received_at?, lines: [{extracted_name, quantity}] }` on a valid PDF
- [ ] `parseReceiptPdf` returns `{ error: string }` on API failure or unreadable PDF
- [ ] The form shows a PDF file input + "Parse" button above the header fields
- [ ] On success: `supplier_reference` and `received_at` are pre-filled (with `[parsed]` badge)
- [ ] Lines from the PDF have `quantity_delivered` set and a read-only extracted name label; the component dropdown is blank for the user to fill
- [ ] Errors display inline without clearing the form
- [ ] Files over 10 MB are rejected client-side

**Steps:**

- [ ] **Step 1: Install Anthropic SDK**

```bash
npm install @anthropic-ai/sdk
```

Then add `ANTHROPIC_API_KEY=your_key_here` to `.env.local` (user must supply their key from https://console.anthropic.com).

- [ ] **Step 2: Add parseReceiptPdf to actions.ts**

Add this import at the top of `src/app/app/goods-inwards/actions.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";
```

Append the action:

```typescript
export type ParsedReceiptLine = {
  extracted_name: string;
  quantity: number;
};

export type ParsedReceipt = {
  supplier_reference?: string;
  received_at?: string;
  lines: ParsedReceiptLine[];
};

export async function parseReceiptPdf(
  formData: FormData
): Promise<ParsedReceipt | { error: string }> {
  const file = formData.get("pdf") as File | null;
  if (!file) return { error: "No file provided" };

  const buffer = await file.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let text: string;
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system:
        "You are extracting structured data from a delivery docket or packing slip. " +
        "Return ONLY valid JSON with no explanation, no markdown, no code fences.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64,
              },
            },
            {
              type: "text",
              text: 'Extract delivery details. Return JSON exactly matching this schema:\n{"supplier_reference":string|null,"received_at":string|null,"lines":[{"extracted_name":string,"quantity":number}]}\nreceived_at must be YYYY-MM-DD format or null. lines must have at least one entry if any products are listed.',
            },
          ],
        },
      ],
    });

    text =
      response.content[0].type === "text" ? response.content[0].text : "";
  } catch (err) {
    const msg = err instanceof Error ? err.message : "API error";
    return { error: `Parsing failed: ${msg}` };
  }

  try {
    const parsed = JSON.parse(text) as ParsedReceipt;
    if (!Array.isArray(parsed.lines)) return { error: "Unexpected response format" };
    return {
      supplier_reference: parsed.supplier_reference ?? undefined,
      received_at: parsed.received_at ?? undefined,
      lines: parsed.lines.filter(
        (l) => typeof l.extracted_name === "string" && typeof l.quantity === "number"
      ),
    };
  } catch {
    return { error: "Could not parse response from AI" };
  }
}
```

- [ ] **Step 3: Add PdfLine type and state to receipt-form.tsx**

Add to the top of `receipt-form.tsx` (after imports):

```typescript
import { createDeliveryReceipt, parseReceiptPdf } from "./actions";
import type { ParsedReceiptLine } from "./actions";
```

Add to `LineState`:

```typescript
type LineState = {
  key: string;
  component_id: string;
  quantity_delivered: string;
  cost_per_unit: string;
  notes: string;
  extractedName?: string; // set when pre-filled from PDF
};
```

Add state inside `ReceiptForm`:

```typescript
const [pdfParsing, setPdfParsing] = useState(false);
const [pdfError, setPdfError] = useState<string | null>(null);
const [parsedFields, setParsedFields] = useState<{
  supplier_reference?: string;
  received_at?: string;
} | null>(null);
const fileInputRef = useRef<HTMLInputElement>(null);
const supplierRefRef = useRef<HTMLInputElement>(null);
const receivedAtRef = useRef<HTMLInputElement>(null);
```

Add the handler inside `ReceiptForm`:

```typescript
async function handlePdfParse() {
  const file = fileInputRef.current?.files?.[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) {
    setPdfError("File must be under 10 MB");
    return;
  }
  setPdfParsing(true);
  setPdfError(null);
  const fd = new FormData();
  fd.set("pdf", file);
  const result = await parseReceiptPdf(fd);
  setPdfParsing(false);

  if ("error" in result) {
    setPdfError(result.error);
    return;
  }

  setParsedFields({
    supplier_reference: result.supplier_reference,
    received_at: result.received_at,
  });

  if (supplierRefRef.current && result.supplier_reference) {
    supplierRefRef.current.value = result.supplier_reference;
  }
  if (receivedAtRef.current && result.received_at) {
    receivedAtRef.current.value = result.received_at;
  }

  if (result.lines.length > 0) {
    setLines(
      result.lines.map((l: ParsedReceiptLine) => ({
        key: crypto.randomUUID(),
        component_id: "",
        quantity_delivered: String(l.quantity),
        cost_per_unit: "",
        notes: "",
        extractedName: l.extracted_name,
      }))
    );
  }
}
```

- [ ] **Step 4: Add PDF upload section and update form JSX**

Add a card above the header fields card in the form's return JSX:

```tsx
{/* PDF parse section */}
<div className={styles.formCard}>
  <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>
    Parse delivery docket (optional)
  </h2>
  <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.85rem" }}>
    Upload a PDF packing slip to pre-fill this form.
  </p>
  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
    <input
      ref={fileInputRef}
      type="file"
      accept=".pdf"
      style={{ flex: 1 }}
    />
    <button
      type="button"
      className={styles.secondary}
      onClick={handlePdfParse}
      disabled={pdfParsing}
    >
      {pdfParsing ? "Parsing…" : "Parse PDF"}
    </button>
  </div>
  {pdfError && (
    <div className={styles.errorNotice}>{pdfError}</div>
  )}
  {parsedFields && !pdfError && (
    <p style={{ margin: 0, color: "var(--ok)", fontSize: "0.85rem" }}>
      ✓ Pre-filled from PDF — review and adjust below.
    </p>
  )}
</div>
```

Add `ref={supplierRefRef}` to the `supplier_reference` input and `ref={receivedAtRef}` to the `received_at` input.

Update the lines table to show the extracted name label when present:

```tsx
<td>
  {line.extractedName && (
    <div style={{ fontSize: "0.75rem", color: "var(--ink-muted)", marginBottom: 4 }}>
      From PDF: {line.extractedName}
    </div>
  )}
  <select
    value={line.component_id}
    onChange={(e) => updateLine(line.key, { component_id: e.target.value })}
  >
    <option value="">Select component…</option>
    {components.map((c) => (
      <option key={c.id} value={c.id}>{componentLabel(c)}</option>
    ))}
  </select>
</td>
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json \
        src/app/app/goods-inwards/actions.ts \
        src/app/app/goods-inwards/receipt-form.tsx
git commit -m "feat(goods-inwards): PDF upload to pre-fill receipt form via Claude API"
```
