# Goods Inwards Enhancements — Design Spec

**Date:** 2026-05-05
**Author:** Kasper Simonsen (with Claude)
**Status:** Approved — ready for implementation plan

---

## 1. Purpose

Four targeted improvements to the goods inwards flow following the MVP delivery:

1. Fix card background colours that blend into the page
2. Hide the Link-to-PO UI (feature not yet ready for use)
3. Line cost entry with an optional component price-update confirmation modal
4. PDF upload that parses a delivery docket and pre-fills the receipt form

---

## 2. Feature Designs

### 2.1 UI Card Background Fix

**Problem:** `goods-inwards.module.css` references undefined CSS variables (`var(--surface-raised)`, `var(--surface)`) so cards render transparent or the same colour as the page background.

**Fix:**
- `.formCard` background → `var(--bg-card)`
- Tab pill container background → `var(--bg-card-alt)`
- Active tab background → `var(--bg-card)`
- Input/select/textarea in form fields already inherit `var(--bg-input)` from globals.css — no change needed

No schema or logic changes. CSS-only.

---

### 2.2 Hide Link-to-PO UI

**Scope:** UI removal only. Backend actions (`linkReceiptToPo`) are preserved.

**receipt-form.tsx:**
- Remove `selectedPoId` state, `handlePoChange` handler, and the "Link to PO" dropdown field
- Remove the PO-driven line pre-fill logic (`handlePoChange` sets lines from PO lines)
- Remove `openPOs` prop and type

**receipt-detail.tsx:**
- Remove the "Link to PO" button and the inline PO selector form
- Remove `openPOs` prop and type
- Remove `showLinkModal` / `linkError` state

**new/page.tsx:**
- Remove the `purchase_order` query from `Promise.all`
- Remove `openPOs` from `ReceiptForm` props

**[id]/page.tsx:**
- Remove the `openPOs` conditional query
- Remove `openPOs` from `ReceiptDetail` props

---

### 2.3 Line Cost Entry + Component Price Update Modal

#### Database

Add `cost_per_unit` column to `delivery_receipt_line`:

```sql
alter table public.delivery_receipt_line
  add column if not exists cost_per_unit numeric;
```

New patch file: `supabase/patches/delivery_receipt_line_cost.sql`

#### Receipt form (entry)

Add an optional **Cost** column to the lines table in `receipt-form.tsx`. Numeric input, no minimum enforced (nullable). Stored in line state as `cost_per_unit: string` (empty = no cost). Passed in the `lines` JSON blob to `createDeliveryReceipt`.

#### Server action (create)

`createDeliveryReceipt` in `actions.ts` already inserts line data. Extend the line insert payload to include `cost_per_unit: l.cost_per_unit ?? null`.

No automatic update to `component.cost_per_unit` at save time.

#### Receipt detail (confirmation modal)

After save, the user is redirected to `/app/goods-inwards/[id]`. If any receipt lines have a `cost_per_unit` value, a modal is shown automatically on mount.

**Modal content:**
- Heading: "Update component prices?"
- Sub-text: "These costs were recorded on this receipt. Select the components whose price you'd like to update."
- Table: Component name | Receipt cost | Current price | Checkbox (default: checked)
- Footer buttons: "Update selected" (primary) | "Skip" (secondary, dismisses without updating)

The modal is dismissed permanently once the user clicks either button (use `localStorage` key `dismissed_cost_modal_<receipt_id>` so it doesn't re-appear on refresh).

#### Server action (update costs)

New action `updateComponentCosts(receiptId: string, updates: { component_id: string; cost_per_unit: number }[])`:
- For each update, runs `UPDATE component SET cost_per_unit = $1 WHERE id = $2 AND tenant_id = $3`
- Revalidates `/app/components` and `/app/inventory`
- Returns `{ updated: number }`

#### Receipt detail (read-only display)

Add a **Cost** column to the lines table in `receipt-detail.tsx` showing `cost_per_unit` if set, `—` otherwise.

---

### 2.4 PDF Upload — Pre-fill Receipt Form

#### UX

A "Parse delivery docket" section sits above the header fields in the new receipt form. It contains:
- A file input (PDF only, `accept=".pdf"`)
- A "Parse" button that activates once a file is selected
- A status area: idle → "Parsing…" spinner → success summary or error

On success, the form pre-fills:
- `supplier_reference` — if extracted
- `received_at` — if a date is found
- Lines — one row per extracted line with `quantity_delivered` set and a read-only **"From PDF"** label showing the extracted name above the component dropdown (which remains blank for the user to select)

Pre-filled fields get a subtle `[parsed]` badge so the user knows what came from the PDF. The user can edit or delete any pre-filled value.

If parsing fails or returns no usable data, an inline error message is shown and the form remains empty.

#### Server action

New action `parseReceiptPdf(formData: FormData)` in `actions.ts`:

1. Read file from `formData.get("pdf")` as an `ArrayBuffer`, convert to base64
2. Call `claude-haiku-4-5-20251001` via the Anthropic SDK using the **document** content block (PDF support):

```
System: You are extracting structured data from a delivery docket or packing slip.
Return ONLY valid JSON. No explanation.

Schema:
{
  "supplier_reference": string | null,   // docket/invoice number
  "received_at": string | null,           // ISO date YYYY-MM-DD
  "lines": [
    {
      "extracted_name": string,           // component name as written on docket
      "quantity": number                  // quantity delivered
    }
  ]
}
```

3. Parse the JSON response. Return it to the client.
4. On any error (API failure, invalid JSON, empty lines), return `{ error: string }`.

The Anthropic SDK is already a dependency (`import Anthropic from "@anthropic-ai/sdk"`).

#### Component matching

No automatic matching. The extracted name is displayed as a read-only label. The component dropdown remains empty — the user picks the match manually. This avoids silent mis-matches.

#### File handling

PDF is processed in-memory. No file is stored server-side. Max file size: 10 MB (enforced client-side before submission).

---

## 3. Out of scope

- Automatic component name matching / fuzzy search
- Storing the original PDF against the receipt
- Link-to-PO backend removal (kept for future use)
- Barcode scanning

---

## 4. Acceptance criteria

1. Form cards are visually distinct from the page background across all four themes.
2. No "Link to PO" button or dropdown appears in the form or detail view.
3. A **Cost** column appears in the receipt form lines table; values are saved to `delivery_receipt_line.cost_per_unit`.
4. On the detail page, if any line has a cost, a modal appears with per-line checkboxes; confirming updates `component.cost_per_unit`; skipping does nothing.
5. The modal does not re-appear after being dismissed (per receipt).
6. A PDF file input appears above the receipt form; selecting a valid PDF and clicking "Parse" pre-fills `supplier_reference`, `received_at`, and line quantities where extracted.
7. The component dropdown for PDF-pre-filled lines is left blank for manual selection.
8. A parsing error (bad PDF, API failure) shows an inline message without clearing the form.
