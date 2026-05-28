# Suppliers Feature Audit Report

**Date:** 2026-05-28  
**Feature:** Suppliers  
**Routes:** `/app/suppliers`, `/app/suppliers/[supplierId]`  
**Related:** `/app/reports/spend-by-supplier`

---

## Overview

The Suppliers feature covers supplier directory management, component-supplier cataloguing (with price breaks and lead times), additional contacts, purchase order history per supplier, and a spend-by-supplier report. The data model is thorough and the core workflows are implemented.

---

## Scorecard Matrix

| Dimension        | Score | Notes |
|------------------|-------|-------|
| **Usefulness**   | 7/10  | Core workflows are present and functional. Lead time comparison, price breaks, and spend report add genuine value. Gaps: no New PO shortcut, PO rows not navigable, website not clickable. |
| **Accessibility**| 3/10  | Multiple broken semantic structures (CSS grid masquerading as tables, bare `<dt>`/`<dd>` without `<dl>`), interactive buttons lack `aria-label`, tabs missing ARIA roles/`aria-selected`. |
| **Ease of Use**  | 5/10  | Clean layout, but no loading feedback, no save confirmation, destructive actions (Archive, Remove, Unlink) have no confirmation dialogs, and form state closes before server responds. |

---

## Easy Wins (Value Additions, Not Fixes)

These are enhancements *above and beyond* the bugs and gaps documented below — small changes with disproportionate user value:

1. **Make website URLs clickable `<a>` links** — Currently the website is displayed as plain text in both the list (`page.tsx:119`) and the detail overview (`supplier-tabs.tsx:156`). One-line change per location. Massive daily convenience for users navigating to supplier portals.

2. **Make the contact email a `mailto:` link** — The Email field in the Overview tab renders as plain text. A `<a href={`mailto:${supplier.contact_email}`}>` lets users open their email client directly from the supplier page. Costs nothing, used constantly.

3. **Make PO rows link to the PO detail page** — The Purchase Orders tab shows a truncated PO reference (first 8 chars of UUID) with no navigation. Wrapping each row in a `<Link href={`/app/purchase-orders/${po.id}`}>` lets users jump directly to a PO from the supplier context — a very common workflow.

4. **Add a "+ New PO for this supplier" button** on the Purchase Orders tab — The supplier page is a natural jump-off point for creating a new purchase order. A button that routes to `/app/purchase-orders/new?supplier_id=…` with the supplier pre-selected saves the user from re-selecting a supplier they already navigated to.

5. **Add an Unarchive action** — You can archive a supplier from the detail page but there is no way to un-archive it from there. The archived state is visible in the header meta but offers no recovery action. Users must currently find the supplier in the "Archived" filter and… nothing. A simple unarchive button toggle costs one server action.

---

## Broken Links

| Location | Issue |
|----------|-------|
| `supplier-tabs.tsx:381` | PO reference (`po.id.slice(0,8).toUpperCase()`) is plain text, not linked to the PO detail page |
| `page.tsx:119` | Supplier website renders as text, not a hyperlink |
| `supplier-tabs.tsx:156` | Website in Overview tab also plain text, not a hyperlink |
| `supplier-tabs.tsx:171` | Contact email is plain text, not a `mailto:` link |

---

## Missing Content

| Location | Issue |
|----------|-------|
| `supplier-tabs.tsx:177` | Notes section hidden when `supplier.notes` is null/empty — no "No notes added yet" empty state |
| `[supplierId]/page.tsx:114–119` | Archive button always shows, even when the supplier is already archived. There is no Unarchive option anywhere. |
| `supplier-tabs.tsx:325–340` | Purchase Orders tab toolbar has no "+ New PO" button |
| `page.tsx` | Supplier list has no search/name filter — only Active/Archived/All tabs |
| `supplier-tabs.tsx:291–300` | Components "table" header row has no empty state inside the table itself when `catalog.length === 0` |
| `supplier-tabs.tsx:381` | PO reference truncated to 8 chars with no `title` tooltip to show full ID |

---

## Accessibility Issues

### Critical (breaks screen reader / keyboard navigation)

| Location | Issue |
|----------|-------|
| `supplier-tabs.tsx:79–90` | Tab buttons have no `role="tab"`, no `aria-selected`, no `aria-controls` — not recognised as tabs by AT |
| `supplier-tabs.tsx:291–321` | Components section is a CSS grid of `<div>` elements, not a `<table>` — no column headers, no `scope`, no semantic structure |
| `supplier-tabs.tsx:342–424` | Purchase Orders section is also a CSS grid of `<div>` elements, not a `<table>` |
| `supplier-tabs.tsx:168–175` | `<dt>` and `<dd>` elements are inside a `<div className={styles.infoField}>` that is not a `<dl>` — invalid HTML, screen readers won't announce label/value pairs correctly |
| `supplier-create-form.tsx:37` | Dialog close button (`×`) has no `aria-label="Close dialog"` |

### High (poor screen reader experience)

| Location | Issue |
|----------|-------|
| `supplier-tabs.tsx:476` | Star/preferred button (`★`/`☆`) has no `aria-label` — screen reader reads "star" or nothing |
| `supplier-tabs.tsx:460–465` | Price break toggle button (`▴`/`▾`) has no `aria-label` and no `aria-expanded` |
| `supplier-tabs.tsx:328–338` | PO filter chips ("All", "Open", "Received") have no `aria-pressed` to indicate active state |
| `supplier-tabs.tsx:493` | `↳` arrow character in price break rows not wrapped in `aria-hidden="true"` — read aloud as "right arrow" |
| `supplier-tabs.tsx:376` | `✓ on time` and `+Xd late` pill content has no `aria-label` for richer context |

### Medium (keyboard/focus)

| Location | Issue |
|----------|-------|
| `supplier-create-form.tsx` | Dialog opens via `dialog.showModal()` but focus is not explicitly moved to the first input |
| `supplier-tabs.tsx` | No keyboard shortcut or focus management when switching tabs |

---

## Ease of Use Issues

### Form Feedback (no loading / no confirmation)

| Location | Issue |
|----------|-------|
| `supplier-tabs.tsx:97` | `onSubmit={() => setEditMode(false)}` fires before the server action completes. Edit mode closes instantly; if the server rejects the save, the user never knows. |
| `supplier-tabs.tsx:268` | Same bug on `linkComponent` form — closes before server responds |
| All detail page actions | No success toast, no error toast, no loading spinner. Every form submit is silent on completion. |
| `[supplierId]/page.tsx:114–119` | Archive button submits immediately with no confirmation dialog. Archive is reversible in principle but there's currently no Unarchive, so it's effectively destructive. |
| `supplier-tabs.tsx:210–216` | "Remove" contact has no confirmation — one mis-click permanently deletes the contact record |
| `supplier-tabs.tsx:480–485` | "Remove" component link has no confirmation |

### Input & Validation UX

| Location | Issue |
|----------|-------|
| `supplier-tabs.tsx:104` | `contact_email` input has no `type="email"` — no browser-native email validation |
| `supplier-tabs.tsx:106` | `website` input has no `type="url"` — no URL format feedback |
| `supplier-tabs.tsx:113` | `default_lead_time_days` input has no `type="number"` and no `min="0"` |
| `supplier-tabs.tsx:282` | Currency input is a free-text field — no dropdown, no ISO code validation, no placeholder indicating expected format (e.g. "AUD") |
| `supplier-tabs.tsx:281–284` | `unit_cost`, `lead_time_days`, `moq` number inputs have no `min="0"` — negative values accepted by the browser |
| `supplier-tabs.tsx:508–525` | Price break quantity and cost inputs have no `min="0"` even though the DB has `check (min_quantity > 0)` and `check (unit_cost >= 0)` — a constraint violation will produce a silent failure |

### Navigation Gaps

| Location | Issue |
|----------|-------|
| `supplier-tabs.tsx:354` | Purchase Orders are listed but rows don't link anywhere — users can't navigate to a PO from the supplier page |
| `[supplierId]/page.tsx` | No link to the Spend by Supplier report from the supplier detail |
| `page.tsx` | No link to the Spend by Supplier report from the supplier list |

---

## Server Actions — Silent Failures

All actions in `[supplierId]/actions.ts` return `Promise<void>` and swallow errors silently. If a Supabase mutation fails (network issue, constraint violation, RLS rejection), the page re-renders without any indication of failure. Affected actions:

- `updateSupplier` — no error return, silent on Supabase error
- `addContact` — silent failure
- `removeContact` — silent failure
- `linkComponent` — silent failure (upsert conflict also silent)
- `unlinkComponent` — silent failure
- `togglePreferred` — silent failure (two sequential writes, either can fail)
- `addPriceBreak` — silent failure; DB constraint violation on `min_quantity > 0` will silently no-op
- `removePriceBreak` — silent failure

By contrast, `createSupplier` (list page) correctly uses `useActionState` and returns `{ error?, success? }` — this pattern should be applied to all detail page actions.

---

## Missing Route Files

| Missing File | Impact |
|--------------|--------|
| `/app/suppliers/loading.tsx` | No loading skeleton while server fetches supplier list |
| `/app/suppliers/[supplierId]/loading.tsx` | Detail page (5 parallel queries) shows nothing while loading — blank page on slow connections |
| `/app/suppliers/error.tsx` | Unhandled errors in list page show Next.js generic error |
| `/app/suppliers/[supplierId]/error.tsx` | Unhandled errors in detail page show Next.js generic error |

---

## Other Observations

- **`page.tsx:44`** uses `(data ?? []).map((s: any) => ...)` — the `any` cast bypasses type safety. The `SupplierRow` type already exists above; the map callback should be typed.
- **`supplier-tabs.tsx:381`** — PO reference is `po.id.slice(0,8).toUpperCase()` which is a partial UUID, not a meaningful PO number. If POs have a human-readable reference number, that should be shown instead; if not, consider displaying creation date as the identifier.
- **`[supplierId]/page.tsx:83`** — PO query is hard-limited to 100 records with no pagination. Suppliers with many POs will silently drop older orders.
- **`page.tsx`** — No `<title>` or metadata export for the Suppliers list page.
- **Archive state UX** — Archived suppliers in the list are visually dimmed (`styles.archivedRow`) which is good. However the detail page header just appends "Archived" to the meta line — it could be more visually prominent (e.g. an amber badge).

---

## Summary

The Suppliers feature is functionally solid — the data model is well-designed, the lead time comparison is a genuine differentiator, and price breaks are properly implemented. The main gaps before launch are:

1. **Feedback loops are broken** — forms close before the server responds, errors are swallowed silently, and there is no loading state.
2. **Destructive actions are unguarded** — Archive, Remove contact, and Unlink component all fire immediately with no confirmation.
3. **Accessibility is poor** — The tab bar, component grid, and PO grid all lack ARIA semantics. Interactive icon buttons have no labels.
4. **Navigation is incomplete** — PO rows don't link to POs, websites aren't clickable links, and there's no route to related features from the supplier page.
