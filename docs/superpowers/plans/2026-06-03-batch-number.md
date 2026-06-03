# Batch Number Capture per Receipt Line — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional `batch_number` text field to `delivery_receipt_line` so warehouse staff can record supplier lot/batch numbers when creating a receipt — read-only display afterward.

**Architecture:** Four sequential tasks: DB column → server action type + insert → form state + UI → detail page query + display. No update path needed — batch numbers are capture-only at receipt creation time. All changes are in the goods-inwards feature folder.

**Tech Stack:** Supabase Postgres (SQL patch), Next.js 15 App Router, TypeScript, React, CSS Modules

**Spec:** `docs/superpowers/specs/2026-06-03-batch-number-design.md`

---

## File Map

| File | Change |
|------|--------|
| `supabase/patches/2026-06-03-delivery-receipt-line-batch-number.sql` | New — adds `batch_number text` column |
| `src/app/app/goods-inwards/actions.ts` | Add `batch_number` to `DeliveryReceiptLineInput` type + line insert |
| `src/app/app/goods-inwards/receipt-form.tsx` | Add `batch_number` to `LineState`, `blankLine()`, PO prefill, PDF parse, submit serialisation, table column |
| `src/app/app/goods-inwards/[id]/page.tsx` | Add `batch_number` to `delivery_receipt_line` select string |
| `src/app/app/goods-inwards/receipt-detail.tsx` | Add `batch_number` to `ReceiptLine` type + read-only table column |

---

## Task 1: DB migration — add `batch_number` column

**Files:**
- Create: `supabase/patches/2026-06-03-delivery-receipt-line-batch-number.sql`

- [ ] **Step 1: Create the patch file**

  Create `supabase/patches/2026-06-03-delivery-receipt-line-batch-number.sql` with this content:

  ```sql
  alter table public.delivery_receipt_line
    add column if not exists batch_number text;
  ```

- [ ] **Step 2: Apply the migration to the database**

  Run the SQL against your Supabase project. In the Supabase Dashboard → SQL Editor, paste and run the file content. Or if using the Supabase CLI:

  ```bash
  npx supabase db execute --file supabase/patches/2026-06-03-delivery-receipt-line-batch-number.sql
  ```

  Verify: in the Supabase Table Editor, `delivery_receipt_line` now has a `batch_number` column of type `text`, nullable.

- [ ] **Step 3: Commit**

  ```bash
  git add supabase/patches/2026-06-03-delivery-receipt-line-batch-number.sql
  git commit -m "feat(db): add batch_number column to delivery_receipt_line"
  ```

---

## Task 2: Server action — `batch_number` in type and insert

**Files:**
- Modify: `src/app/app/goods-inwards/actions.ts`

The `DeliveryReceiptLineInput` type (lines 16–23) is the shape of each element in the JSON `lines` array parsed from FormData. The `createDeliveryReceipt` function inserts these into `delivery_receipt_line`. Both need `batch_number`.

- [ ] **Step 1: Add `batch_number` to `DeliveryReceiptLineInput`**

  Find the type definition (lines 16–23):

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

  Replace with:

  ```typescript
  export type DeliveryReceiptLineInput = {
    component_id: string;
    purchase_order_line_id: string | null;
    quantity_delivered: number;
    quantity_expected: number | null;
    cost_per_unit: number | null;
    notes: string | null;
    batch_number: string | null;
  };
  ```

- [ ] **Step 2: Add `batch_number` to the line insert**

  Find the `delivery_receipt_line` insert block (around lines 99–112):

  ```typescript
    const { error: linesError } = await supabase
      .from("delivery_receipt_line")
      .insert(
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
      );
  ```

  Replace with:

  ```typescript
    const { error: linesError } = await supabase
      .from("delivery_receipt_line")
      .insert(
        lines.map((l) => ({
          tenant_id: tenantId,
          delivery_receipt_id: receipt.id,
          component_id: l.component_id,
          purchase_order_line_id: l.purchase_order_line_id,
          quantity_delivered: l.quantity_delivered,
          quantity_expected: l.quantity_expected,
          cost_per_unit: l.cost_per_unit ?? null,
          notes: l.notes,
          batch_number: l.batch_number ?? null,
        }))
      );
  ```

- [ ] **Step 3: TypeScript check**

  ```bash
  npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: no errors (the form doesn't send `batch_number` yet but the type allows `null` so the existing JSON will still parse).

- [ ] **Step 4: Commit**

  ```bash
  git add src/app/app/goods-inwards/actions.ts
  git commit -m "feat(goods-inwards): add batch_number to DeliveryReceiptLineInput and insert"
  ```

---

## Task 3: Form — `batch_number` in state, submit, and table

**Files:**
- Modify: `src/app/app/goods-inwards/receipt-form.tsx`

This is the largest task. Make changes in order — each step builds on the previous.

- [ ] **Step 1: Add `batch_number` to `LineState`**

  Find the `LineState` type (lines 28–37):

  ```typescript
  type LineState = {
    key: string;
    component_id: string;
    quantity_delivered: string;
    cost_per_unit: string;
    notes: string;
    extractedName?: string;
    quantity_expected?: number | null;
    purchase_order_line_id?: string | null;
  };
  ```

  Replace with:

  ```typescript
  type LineState = {
    key: string;
    component_id: string;
    quantity_delivered: string;
    cost_per_unit: string;
    notes: string;
    batch_number: string;
    extractedName?: string;
    quantity_expected?: number | null;
    purchase_order_line_id?: string | null;
  };
  ```

- [ ] **Step 2: Add `batch_number` to `blankLine()`**

  Find `blankLine()` (lines 48–56):

  ```typescript
  function blankLine(): LineState {
    return {
      key: crypto.randomUUID(),
      component_id: "",
      quantity_delivered: "",
      cost_per_unit: "",
      notes: "",
    };
  }
  ```

  Replace with:

  ```typescript
  function blankLine(): LineState {
    return {
      key: crypto.randomUUID(),
      component_id: "",
      quantity_delivered: "",
      cost_per_unit: "",
      notes: "",
      batch_number: "",
    };
  }
  ```

- [ ] **Step 3: Add `batch_number` to the lazy-init PO lines in `useState`**

  In the `useState` initialiser for `lines` (around lines 89–112), find the `poLines` map inside the `if (initialPo)` block:

  ```typescript
        .map((l) => {
          const remaining = l.quantity - l.quantity_received;
          return {
            key: crypto.randomUUID(),
            component_id: l.component_id,
            quantity_delivered: String(remaining),
            cost_per_unit: "",
            notes: "",
            quantity_expected: remaining,
            purchase_order_line_id: l.id,
          };
        });
  ```

  Replace with:

  ```typescript
        .map((l) => {
          const remaining = l.quantity - l.quantity_received;
          return {
            key: crypto.randomUUID(),
            component_id: l.component_id,
            quantity_delivered: String(remaining),
            cost_per_unit: "",
            notes: "",
            batch_number: "",
            quantity_expected: remaining,
            purchase_order_line_id: l.id,
          };
        });
  ```

- [ ] **Step 4: Add `batch_number` to `handlePoSelect` PO lines**

  In `handlePoSelect` (around lines 136–150), find the `poLines` map:

  ```typescript
      const poLines = po.lines
        .filter((l) => l.quantity - l.quantity_received > 0)
        .map((l) => {
          const remaining = l.quantity - l.quantity_received;
          return {
            key: crypto.randomUUID(),
            component_id: l.component_id,
            quantity_delivered: String(remaining),
            cost_per_unit: "",
            notes: "",
            quantity_expected: remaining,
            purchase_order_line_id: l.id,
          };
        });
  ```

  Replace with:

  ```typescript
      const poLines = po.lines
        .filter((l) => l.quantity - l.quantity_received > 0)
        .map((l) => {
          const remaining = l.quantity - l.quantity_received;
          return {
            key: crypto.randomUUID(),
            component_id: l.component_id,
            quantity_delivered: String(remaining),
            cost_per_unit: "",
            notes: "",
            batch_number: "",
            quantity_expected: remaining,
            purchase_order_line_id: l.id,
          };
        });
  ```

- [ ] **Step 5: Add `batch_number` to PDF-parsed lines**

  In `handlePdfParse` (around lines 224–235), find the `setLines` call for parsed lines:

  ```typescript
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
  ```

  Replace with:

  ```typescript
      if (result.lines.length > 0) {
        setLines(
          result.lines.map((l: ParsedReceiptLine) => ({
            key: crypto.randomUUID(),
            component_id: "",
            quantity_delivered: String(l.quantity),
            cost_per_unit: "",
            notes: "",
            batch_number: "",
            extractedName: l.extracted_name,
          }))
        );
      }
  ```

- [ ] **Step 6: Add `batch_number` to `handleSubmit` serialisation**

  In `handleSubmit` (around lines 261–273), find the `fd.set("lines", ...)` call:

  ```typescript
      fd.set(
        "lines",
        JSON.stringify(
          filledLines.map((l) => ({
            component_id: l.component_id,
            purchase_order_line_id: l.purchase_order_line_id ?? null,
            quantity_delivered: parseFloat(l.quantity_delivered),
            quantity_expected: l.quantity_expected ?? null,
            cost_per_unit: l.cost_per_unit ? parseFloat(l.cost_per_unit) : null,
            notes: l.notes || null,
          }))
        )
      );
  ```

  Replace with:

  ```typescript
      fd.set(
        "lines",
        JSON.stringify(
          filledLines.map((l) => ({
            component_id: l.component_id,
            purchase_order_line_id: l.purchase_order_line_id ?? null,
            quantity_delivered: parseFloat(l.quantity_delivered),
            quantity_expected: l.quantity_expected ?? null,
            cost_per_unit: l.cost_per_unit ? parseFloat(l.cost_per_unit) : null,
            notes: l.notes || null,
            batch_number: l.batch_number || null,
          }))
        )
      );
  ```

- [ ] **Step 7: Add `Batch #` column header to the lines table**

  Find the `<thead>` of the lines table (around lines 460–469):

  ```tsx
          <thead>
            <tr>
              <th style={{ width: 40 }} aria-label="Image" />
              <th>Component</th>
              {selectedPoId && <th>Expected</th>}
              <th>Qty delivered</th>
              <th>Cost / unit (optional)</th>
              <th>Note</th>
              <th></th>
            </tr>
          </thead>
  ```

  Replace with:

  ```tsx
          <thead>
            <tr>
              <th style={{ width: 40 }} aria-label="Image" />
              <th>Component</th>
              {selectedPoId && <th>Expected</th>}
              <th>Qty delivered</th>
              <th>Cost / unit (optional)</th>
              <th>Note</th>
              <th>Batch #</th>
              <th></th>
            </tr>
          </thead>
  ```

- [ ] **Step 8: Add `Batch #` input cell to each line row**

  In the `<tbody>` lines map, find the Note `<td>` and the remove button `<td>` (around lines 575–595):

  ```tsx
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
                    disabled={lines.length === 1}
                    aria-label="Remove line"
                  >
                    ✕
                  </button>
                </td>
  ```

  Replace with:

  ```tsx
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
                  <input
                    type="text"
                    placeholder="Batch…"
                    value={line.batch_number}
                    onChange={(e) => updateLine(line.key, { batch_number: e.target.value })}
                    style={{ width: 120 }}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    onClick={() => removeLine(line.key)}
                    className={styles.secondary}
                    style={{ padding: "4px 10px" }}
                    disabled={lines.length === 1}
                    aria-label="Remove line"
                  >
                    ✕
                  </button>
                </td>
  ```

- [ ] **Step 9: TypeScript check**

  ```bash
  npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: no errors.

- [ ] **Step 10: Commit**

  ```bash
  git add src/app/app/goods-inwards/receipt-form.tsx
  git commit -m "feat(goods-inwards): add Batch # column to new receipt form"
  ```

---

## Task 4: Detail page — query and read-only display

**Files:**
- Modify: `src/app/app/goods-inwards/[id]/page.tsx`
- Modify: `src/app/app/goods-inwards/receipt-detail.tsx`

- [ ] **Step 1: Add `batch_number` to the `delivery_receipt_line` select in `[id]/page.tsx`**

  Find the `delivery_receipt_line` sub-select (lines 25–28):

  ```typescript
           delivery_receipt_line(
             id, component_id, quantity_delivered, quantity_expected, notes, cost_per_unit,
             component:component_id(name, sku, image_url)
           )
  ```

  Replace with:

  ```typescript
           delivery_receipt_line(
             id, component_id, quantity_delivered, quantity_expected, notes, cost_per_unit,
             batch_number,
             component:component_id(name, sku, image_url)
           )
  ```

- [ ] **Step 2: Add `batch_number` to `ReceiptLine` type in `receipt-detail.tsx`**

  Find the `ReceiptLine` type (lines 10–21):

  ```typescript
  type ReceiptLine = {
    id: string;
    component_id: string;
    quantity_delivered: number;
    quantity_expected: number | null;
    cost_per_unit: number | null;
    notes: string | null;
    component:
      | { name: string; sku: string | null; image_url: string | null }
      | Array<{ name: string; sku: string | null; image_url: string | null }>
      | null;
  };
  ```

  Replace with:

  ```typescript
  type ReceiptLine = {
    id: string;
    component_id: string;
    quantity_delivered: number;
    quantity_expected: number | null;
    cost_per_unit: number | null;
    notes: string | null;
    batch_number: string | null;
    component:
      | { name: string; sku: string | null; image_url: string | null }
      | Array<{ name: string; sku: string | null; image_url: string | null }>
      | null;
  };
  ```

- [ ] **Step 3: Add `Batch #` column header to the detail lines table**

  Find the `<thead>` of the lines table in the Lines card (around lines 450–459):

  ```tsx
          <thead>
            <tr>
              <th style={{ width: 40 }} aria-label="Image" />
              <th>Component</th>
              <th>Expected</th>
              <th>Delivered</th>
              <th>Variance</th>
              <th>Cost / unit</th>
              <th>Note</th>
            </tr>
          </thead>
  ```

  Replace with:

  ```tsx
          <thead>
            <tr>
              <th style={{ width: 40 }} aria-label="Image" />
              <th>Component</th>
              <th>Expected</th>
              <th>Delivered</th>
              <th>Variance</th>
              <th>Cost / unit</th>
              <th>Note</th>
              <th>Batch #</th>
            </tr>
          </thead>
  ```

- [ ] **Step 4: Add `Batch #` read-only cell to each line row**

  In the `receipt.delivery_receipt_line.map(...)` body, find the Note `<td>` (the last `<td>` in each row, around lines 494–511):

  ```tsx
                  <td>
                    {isEditing ? (
                      <input
                        type="text"
                        value={lineNotes[line.id] ?? ""}
                        onChange={(e) =>
                          setLineNotes((prev) => ({
                            ...prev,
                            [line.id]: e.target.value,
                          }))
                        }
                        placeholder="Note…"
                        style={{ width: 160 }}
                      />
                    ) : (
                      line.notes ?? "—"
                    )}
                  </td>
  ```

  Replace with:

  ```tsx
                  <td>
                    {isEditing ? (
                      <input
                        type="text"
                        value={lineNotes[line.id] ?? ""}
                        onChange={(e) =>
                          setLineNotes((prev) => ({
                            ...prev,
                            [line.id]: e.target.value,
                          }))
                        }
                        placeholder="Note…"
                        style={{ width: 160 }}
                      />
                    ) : (
                      line.notes ?? "—"
                    )}
                  </td>
                  <td>{line.batch_number ?? "—"}</td>
  ```

- [ ] **Step 5: TypeScript check**

  ```bash
  npx tsc --noEmit 2>&1 | head -20
  ```

  Expected: no errors.

- [ ] **Step 6: Smoke test**

  ```
  1. Open http://localhost:3000/app/goods-inwards/new
  2. Verify the lines table has a "Batch #" column (rightmost, before the ✕ button)
  3. Fill in a receipt with one line — enter "LOT-2024-001" as the batch number
  4. Submit the receipt
  5. On the receipt detail page, verify:
     - Lines table shows a "Batch #" column
     - The row shows "LOT-2024-001"
  6. Create a second receipt line with no batch number — verify it shows "—" in the detail
  7. Click Edit on the detail page — verify Batch # column shows the value as plain text (NOT an input)
  8. Check Supabase dashboard: delivery_receipt_line row has batch_number = 'LOT-2024-001'
  ```

- [ ] **Step 7: Commit**

  ```bash
  git add src/app/app/goods-inwards/[id]/page.tsx src/app/app/goods-inwards/receipt-detail.tsx
  git commit -m "feat(goods-inwards): display batch_number in receipt detail lines table"
  ```

---

## Self-Review Checklist

After all four tasks are committed:

- [ ] `batch_number` is in `LineState`, `blankLine()`, PO lazy-init, `handlePoSelect`, PDF parse, and `handleSubmit` — no path leaves it unset
- [ ] `batch_number: l.batch_number || null` converts empty string to null in the submit serialisation
- [ ] The DB insert includes `batch_number: l.batch_number ?? null`
- [ ] The detail page query selects `batch_number`
- [ ] `ReceiptLine.batch_number` is typed `string | null`
- [ ] The Batch # cell in edit mode is plain text (not an input)
- [ ] `npx tsc --noEmit` passes with no errors
