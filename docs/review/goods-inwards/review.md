# Feature Review: Goods Inwards

**Reviewed:** 2026-05-28  
**Reviewer:** Claude Code  
**Branch:** `feat/super-admin-foundation`  
**Status:** Awaiting brainstorm sessions (1 item per session)

---

## Overview

Goods Inwards is the stock-receiving feature. It records supplier deliveries, applies inventory movements via a Postgres RPC, supports PO reconciliation, captures component costs, pushes bills to Xero, and includes a Claude AI–powered PDF docket parser. The data model and server-side logic are solid; the main gaps are in UI completeness and missing additive features.

---

## Scorecard

| Dimension        | Score  | Notes |
|------------------|--------|-------|
| **Usefulness**   | 6 / 10 | Solid foundation, but broken PO-linking workflow limits real-world utility |
| **Accessibility**| 5 / 10 | Colour-only status indicators, no icon fallbacks, likely missing ARIA roles on modals |
| **Ease of Use**  | 7 / 10 | PDF parser and component picker are excellent; form complexity and the cost modal feel jarring |

---

## Findings

Each finding has an **importance rating** (P1–P4) and a **type** (Bug / UX / Accessibility / Feature Gap / Additive).

> **P1** — Must fix before launch (broken workflow)  
> **P2** — Should fix before launch (significant UX degradation)  
> **P3** — Fix soon after launch (noticeable but not blocking)  
> **P4** — Nice to have / low urgency

---

### P1 — Critical (Fix Before Launch)

---

#### F-01 · PO linking action has no UI
**Type:** Bug / Feature Gap  
**Priority:** P1  

The `linkReceiptToPo` server action is fully implemented — it fetches the PO, calculates variances, updates receipt status, and can auto-close the PO when fully received. However, no button, form, or dropdown in the UI exposes it. Every receipt will remain `status = 'unmatched'` indefinitely. The filter tabs (Unmatched / Discrepancy), variance column, and status badges are all effectively decorative until this is wired up.

**Affected files:**
- `src/app/app/goods-inwards/actions.ts` — `linkReceiptToPo()` (orphaned)
- `src/app/app/goods-inwards/receipt-detail.tsx` — missing UI trigger

---

#### F-02 · New receipt form has no PO selection field
**Type:** Bug / Feature Gap  
**Priority:** P1  

`createDeliveryReceipt()` accepts a `purchase_order_id` parameter and the RPC handles PO-linked creation correctly, but the form never sends it. Users cannot create a PO-linked receipt from the UI. The `stock_in_reason` field is hidden when a PO is linked (correct behaviour) but the toggle condition can never be true.

**Affected files:**
- `src/app/app/goods-inwards/receipt-form.tsx` — missing PO dropdown
- `src/app/app/goods-inwards/actions.ts` — `createDeliveryReceipt()` (parameter unused from UI)

---

### P2 — Significant (Should Fix Before Launch)

---

#### F-03 · No deep-link from Purchase Order to its receipts
**Type:** UX  
**Priority:** P2  

When viewing a PO, there is no "Received" tab, section, or link showing related delivery receipts. A purchasing manager reviewing a PO cannot see what has been received against it without navigating away to Goods Inwards and manually searching. The relationship exists in the database but is not surfaced on the PO side.

**Affected files:**
- `src/app/app/purchasing/[id]/` — missing receipts tab/section

---

#### F-04 · No deep-link from Supplier detail → receipt detail
**Type:** UX  
**Priority:** P2  

The supplier detail page (Purchase Orders tab) shows delivery receipt dates and on-time/late indicators per PO, but the receipts are not clickable. A supplier account manager reviewing delivery history cannot navigate to the receipt itself.

**Affected files:**
- `src/app/app/suppliers/[supplierId]/supplier-tabs.tsx` — receipt rows missing `<Link>`

---

#### F-05 · No "View PO" link on receipt detail when PO is linked
**Type:** UX  
**Priority:** P2  

When a receipt has `status = 'po_linked'` or `'discrepancy'`, the `purchase_order_id` is stored but never rendered as a navigable link. There is no way to get from a receipt back to its PO.

**Affected files:**
- `src/app/app/goods-inwards/receipt-detail.tsx` — PO reference not linked

---

### P3 — Notable (Fix Soon After Launch)

---

#### F-06 · Status badges and variance column are colour-only
**Type:** Accessibility  
**Priority:** P3  

The three status badges (Unmatched / PO Linked / Discrepancy) use grey / green / red with no accompanying icon. The variance column in detail view uses red (short) and orange (over) colouring alone to communicate state. Users with colour vision deficiency cannot distinguish these states.

**Fix direction:** Add a small icon alongside each badge (e.g. ⚠ for discrepancy, ✓ for po_linked) and a text label (e.g. "Short" / "Over") alongside variance colour.

**Affected files:**
- `src/app/app/goods-inwards/receipt-list.tsx`
- `src/app/app/goods-inwards/receipt-detail.tsx`

---

#### F-07 · Cost update modal cannot be re-triggered
**Type:** UX  
**Priority:** P3  

The modal prompting users to push captured costs back to component master data is dismissed to `localStorage` (key: `dismissed_cost_modal_{receipt.id}`) with no mechanism to reopen it. Users who dismiss it accidentally, or who want to update costs later, have no recourse short of clearing browser storage.

**Fix direction:** Replace one-time modal with a persistent collapsible section or secondary tab on the detail page (rendered conditionally when any line has `cost_per_unit` set).

**Affected files:**
- `src/app/app/goods-inwards/receipt-detail.tsx` — cost modal logic

---

#### F-08 · PDF parsing section silently disappears when API key is missing
**Type:** UX  
**Priority:** P3  

If `ANTHROPIC_API_KEY` is not set, the PDF parser section is not rendered at all. There is no indication to the user that the feature exists but is unconfigured. For admin users, a disabled/grayed-out state with a tooltip ("PDF parsing requires configuration — contact your administrator") would be more informative.

**Affected files:**
- `src/app/app/goods-inwards/receipt-form.tsx` — conditional render of PDF section

---

#### F-09 · Empty state on list is bare
**Type:** UX  
**Priority:** P3  

The list empty state renders only `"No receipts found."` — no illustration, no description, no call to action. For first-time users (and the filtered tab states), a contextual empty state with a prompt to record their first delivery would significantly reduce confusion.

**Affected files:**
- `src/app/app/goods-inwards/receipt-list.tsx` — empty state render

---

### P4 — Accessibility / Polish

---

#### F-10 · Modal and dialog ARIA roles likely incomplete
**Type:** Accessibility  
**Priority:** P4  

The component picker modal and cost update modal are complex interactive overlays. Based on the component structure, `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, and focus trap behaviour should be verified. Tab order through the lines table (component select → quantity → cost → notes → remove) also needs checking.

**Affected files:**
- `src/app/app/goods-inwards/receipt-form.tsx` — component picker modal
- `src/app/app/goods-inwards/receipt-detail.tsx` — cost update modal

---

## Additive Easy Wins

These features do not exist today. Each is independently valuable, quick to build, and would meaningfully improve the feature for a manufacturing audience at launch.

---

#### A-01 · "Receive Goods" shortcut from PO detail
**Type:** Additive Feature  
**Priority:** P1 (pairs with F-02)  
**Effort:** ~3 hours  

A **"Receive Goods →"** CTA on the PO detail page navigates to `/app/goods-inwards/new?po={id}`. The new receipt form reads the query param and pre-populates: supplier, received date, and one line per PO line with `quantity_expected` pre-filled. Users adjust actuals and save. This is the primary workflow for PO-driven businesses — they live on the PO page, not the goods inwards list.

---

#### A-02 · Lot / batch number capture per line
**Type:** Additive Feature  
**Priority:** P2  
**Effort:** ~3–4 hours  

Add an optional `batch_number` text field to `delivery_receipt_line`. One migration column, one input column in the form table, one display field in detail view. For a manufacturing business, batch traceability is the difference between being able to isolate a quality issue and a full product recall. Every component-level manufacturing SaaS user will expect this field to exist.

**Requires:** DB migration + form + detail display.

---

#### A-03 · Printable / exportable Goods Received Note (GRN)
**Type:** Additive Feature  
**Priority:** P2  
**Effort:** ~2–3 hours  

A **"Print GRN"** button on the detail page that opens a print-optimised route (`/app/goods-inwards/[id]/print`) rendering: company name, receipt reference, supplier, date, location, and a full line table with quantities and variances. Warehouse staff attach this to the physical packing slip. It also serves as a shareable record for supplier disputes. No new data required — purely a presentation layer over existing fields.

---

#### A-04 · Running receipt value total on detail page
**Type:** Additive Feature  
**Priority:** P3  
**Effort:** ~30 minutes  

Sum `quantity_delivered × cost_per_unit` across all lines where cost is present and display it as a **"Total received value"** figure below the lines table. Optionally surface this as a column on the list view. The data is already captured — this is a trivial calculation that answers the first question a purchasing manager asks when reviewing a delivery.

---

#### A-05 · "Due In" tab — upcoming expected deliveries
**Type:** Additive Feature  
**Priority:** P3  
**Effort:** ~3–4 hours  

Add a **"Due In"** tab on the list page alongside the existing filter tabs. It shows open POs with an `expected_delivery_date` within the next 7–14 days that have no linked receipt yet. Warehouse teams use this to plan dock space, brief staff, and flag late deliveries before they become a production problem. All the data exists in the PO table — this is a query and a render.

---

## Brainstorm Queue

Items are listed in suggested brainstorm order (P1 → P2 → P3 → Additive):

| # | ID | Title | Priority | Type |
|---|-----|-------|----------|------|
| 1 | F-01 + F-02 | PO linking — action wire-up + form field (do together) | P1 | Bug |
| 2 | A-01 | "Receive Goods" shortcut from PO detail | P1 | Additive |
| 3 | F-03 | PO detail → receipts section | P2 | UX |
| 4 | F-04 | Supplier detail → receipt deep-links | P2 | UX |
| 5 | F-05 | Receipt detail → View PO link | P2 | UX |
| 6 | A-02 | Lot / batch number per line | P2 | Additive |
| 7 | A-03 | Printable GRN | P2 | Additive |
| 8 | F-06 | Colour-only status badges + variance | P3 | Accessibility |
| 9 | F-07 | Cost modal → persistent section | P3 | UX |
| 10 | F-08 | PDF section hidden when unconfigured | P3 | UX |
| 11 | F-09 | Empty state improvement | P3 | UX |
| 12 | A-04 | Receipt value total | P3 | Additive |
| 13 | A-05 | "Due In" tab | P3 | Additive |
| 14 | F-10 | Modal ARIA + focus trap audit | P4 | Accessibility |
