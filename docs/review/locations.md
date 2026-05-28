# Locations Feature Audit Report

**Date:** 2026-05-28  
**Feature:** Locations (Warehouse / Bin Management)  
**Routes:** `/app/warehouse/locations`, `/app/settings/locations`  
**Related:** `/app/components/[componentId]` (Bin Location tab)

---

## Overview

The Locations feature provides a four-tier warehouse hierarchy (Warehouse → Sub-location → Aisle → Bay), barcode label generation, component-to-bin assignment via cascading dropdowns, and a default-location setting in Settings. It is gated behind the "growth" subscription tier (`binManagement` feature flag).

The feature is architecturally solid: the data model is well-normalised, RLS is in place, delete protection checks component dependencies before allowing removal, and the collapse/expand tree UI is genuinely well-done.

---

## Scorecard Matrix

| Dimension        | Score | Notes |
|------------------|-------|-------|
| **Usefulness**   | 8/10  | Hierarchical location management, barcode printing, and cascading bin assignment on the component page are genuinely valuable. Short code system is a nice touch. Minor gaps: no component count on tree nodes, no link between Settings > Locations and the management page. |
| **Accessibility**| 4/10  | Collapse/expand buttons correctly use `aria-label` (a green flag). However the barcode modal is a `<div>` with no `role="dialog"` or `aria-modal`, focus is not trapped, the close button has no `aria-label`, Unicode icon characters (⊕ ▦ ✎ ✕) pollute the AT tree, and the tree has no semantic ARIA tree roles. |
| **Ease of Use**  | 6/10  | Inline editing is clean. Key issues: submitting an empty name silently closes the form with no save and no error; the aisle delete confirmation uses a browser `window.confirm()` which is jarring; the Settings page points users to Locations but does not link there; and the barcode modal has no "copy code" affordance. |

---

## Easy Wins (Value Additions, Not Fixes)

These are improvements *beyond* the bugs and gaps documented below — small changes with disproportionate user value:

1. **Add component count badges to tree nodes** — Each sub-location, aisle, and bay should show how many components are currently assigned to it (e.g. "3 components"). This gives warehouse managers instant visibility into which bins are populated and which are empty, without navigating away. The count data is already available via the dependency checks in `deleteSubLocation` / `deleteAisle` / `deleteBay`.

2. **Add a "Copy code" button in the barcode modal** — The short location code (e.g. `A3F9C2`) is displayed in the modal but has no way to be copied to clipboard. A single `navigator.clipboard.writeText()` call lets users paste the code into spreadsheets, purchase orders, or location labels without printing.

3. **Add Expand All / Collapse All controls per warehouse** — When a warehouse has many sub-locations and aisles, expanding and collapsing nodes one-by-one is tedious. Two small buttons ("Expand all" / "Collapse all") on the warehouse header row would save many clicks for managers reviewing their full location tree.

4. **Make the Settings > Locations page link to `/app/warehouse/locations`** — The settings page exists only to set the default location, but the empty state message says "Create locations in the Locations module first" with no link. Even when locations do exist, there is no route to the management page. Adding a "Manage locations →" link in the settings page header bridges the two screens and removes the need to know where to navigate.

5. **Show the full location path in the barcode modal print label** — The print label already includes `path` (e.g. "Main Warehouse · Receiving · Aisle A · Bay 3") but the screen view truncates the path in a small `modalPath` style. Making the full path more prominent in the on-screen preview helps users confirm they are printing the right label before hitting Print.

---

## Broken Links

| Location | Issue |
|----------|-------|
| `settings/locations/page.tsx:49` | Empty state message says "Create locations in the Locations module first" — no `<Link>` to `/app/warehouse/locations` |
| `settings/locations/page.tsx` | No link to `/app/warehouse/locations` from anywhere on the settings page even when locations exist |
| `barcode-modal.tsx:36` | Close button (`✕`) has no `aria-label` — assistive technology announces the raw character |

---

## Missing Content

| Location | Issue |
|----------|-------|
| `warehouse/locations/page.tsx` | Page has no `<title>` or metadata export |
| `warehouse/locations/page.tsx:39` | `<PageHeader>` has `eyebrow` and `description` but no `title` prop — the page header renders with no H1 heading text |
| `locations-tree.tsx:194` | Empty sub-locations state shows "No sub-locations yet — add one to organise aisles." but there is no matching empty state when a warehouse has sub-locations but none have aisles |
| `barcode-modal.tsx` | No fallback UI if `jsbarcode` fails to load or generate the barcode — the SVG just renders empty |
| `settings/locations/page.tsx` | No page title/H1 — only the `PageHeader` description renders |
| All tree nodes | No indicator of how many components are assigned to each location node |

---

## Accessibility Issues

### Critical (WCAG 2.1 failures)

| Location | Issue |
|----------|-------|
| `barcode-modal.tsx:34` | Modal overlay is a `<div>`, not a `<dialog>`. Missing `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` or `aria-label`. Screen readers will not announce it as a modal. |
| `barcode-modal.tsx:36` | Close button label is the raw Unicode character `✕` with no `aria-label="Close barcode modal"` |
| `barcode-modal.tsx` | Focus is not moved into the modal on open, and focus is not trapped — keyboard users can tab behind the modal overlay |
| `locations-tree.tsx` | The hierarchical tree has no semantic ARIA tree structure (`role="tree"`, `role="treeitem"`, `aria-expanded`) — screen readers cannot navigate it as a tree |

### High (poor screen reader experience)

| Location | Issue |
|----------|-------|
| `locations-tree.tsx:174,227,281,311` | Button labels like `⊕ Sub-loc`, `▦ Barcode`, `✎ Edit` include Unicode characters that screen readers announce as their Unicode name ("circled plus", "medium white square", "lower left pencil"). Should use `aria-label` and `aria-hidden` on the icons. |
| `locations-tree.tsx:82,105` | `SimpleDeleteButton` and `AisleDeleteButton` render `✕ Delete` — the `✕` character will be read aloud before "Delete" |
| `locations-tree.tsx:340` | `⊕ Add Warehouse` button — same Unicode character issue |
| `InlineForm` (line 55–56) | "Save" and "Cancel" buttons have no context — screen reader users hear "Save" without knowing what is being saved (which warehouse, which aisle, etc.) |

### Medium

| Location | Issue |
|----------|-------|
| `bin-location-select.tsx:69–118` | The `<label>` elements wrap `<span>` + `<select>` correctly, but `<select>` elements have no `id` and `<label>` has no `htmlFor` — the association relies on wrapping (implicit), which is technically valid but less robust |
| `bin-location-select.tsx:97,101` | Disabled selects ("Aisle" when no sub-location selected, "Bay" when no aisle selected) have no `aria-describedby` explaining why they are disabled |

---

## Ease of Use Issues

### Silent Form Failure on Empty Name

| Location | Issue |
|----------|-------|
| `actions.ts:18` | `addWarehouse`: `if (!name) return;` returns `undefined`. `InlineForm` treats `undefined` as success (no `result?.error`) and calls `router.refresh()` and `onDone()`. The form closes, nothing is saved, user gets no feedback. Same bug on `editWarehouse` (line 28), `addSubLocation` (line 40), `editSubLocation` (line 50), `addAisle` (line 79), `editAisle` (line 92), `addBay` (line 136), `editBay` (line 146). |

The fix is to return `{ error: "Name is required" }` from these actions rather than bare `return`.

### Inconsistent Confirmation UX

| Location | Issue |
|----------|-------|
| `locations-tree.tsx:69` | `AisleDeleteButton` uses `window.confirm()` for the cascade-delete confirmation — a browser-native blocking dialog that looks nothing like the rest of the app's UI and is suppressed by some browsers |
| `locations-tree.tsx:82,105` | `SimpleDeleteButton` for sub-locations and bays fires the delete immediately with no confirmation at all (relies on `deleteSubLocation` blocking if components are assigned, but if there are no components it just deletes) |

### Navigation Gaps

| Location | Issue |
|----------|-------|
| `settings/locations/page.tsx` | No link to `/app/warehouse/locations` — users who land here to change the default need to already know where to create/manage locations |
| `warehouse/locations/page.tsx` | No link to `settings/locations` from the management page — the two related screens are disconnected |

### Print UX

| Location | Issue |
|----------|-------|
| `barcode-modal.tsx:48` | `window.print()` prints the entire page, relying on CSS `print` media query to hide everything except `printLabel`. This works but gives no feedback if print is cancelled, and in some browsers opens the system print dialog immediately with no intermediate state |

---

## Server Actions — Return Type Inconsistencies

The add/edit actions return `void` or `undefined` on validation failure (empty name) instead of `{ error: string }`. The `InlineForm` client component interprets `undefined` as success. Affected actions:

| Action | Failure Mode |
|--------|-------------|
| `addWarehouse` | Returns `undefined`, form closes with no save |
| `editWarehouse` | Returns `undefined`, form closes with no save |
| `addSubLocation` | Returns `undefined`, form closes with no save |
| `editSubLocation` | Returns `undefined`, form closes with no save |
| `addAisle` | Returns `undefined`, form closes with no save |
| `editAisle` | Returns `undefined`, form closes with no save |
| `addBay` | Returns `undefined`, form closes with no save |
| `editBay` | Returns `undefined`, form closes with no save |

The delete actions (`deleteSubLocation`, `deleteAisle`, `deleteBay`) correctly return `{ error?: string }` — this pattern just needs to be applied to the add/edit actions too.

---

## Missing Route Files

| Missing File | Impact |
|--------------|--------|
| `/app/warehouse/locations/loading.tsx` | No loading skeleton while Supabase fetches the full warehouse tree |
| `/app/warehouse/locations/error.tsx` | Unhandled errors fall through to Next.js generic error page |
| `/app/settings/locations/loading.tsx` | No skeleton while location list loads |
| `/app/settings/locations/error.tsx` | Errors not caught at route level |

---

## Other Observations

- **`page.tsx:16`** — The subscription gate checks `hasFeature(access.sub, "binManagement")` and shows a `FeatureUpsell` component. This is well-implemented. However, the Settings > Locations page has no equivalent gate — users on non-growth plans can open Settings > Locations and see an empty list with no explanation of why (the locations would exist if they were on a higher tier).
- **`bin-location-select.tsx:51`** — `filteredAisles` only shows aisles when a sub-location is selected (`slId ? ... : []`). This means if a warehouse has aisles not assigned to a sub-location, they cannot be selected in the dropdown. This is by design (the hierarchy requires sub-location → aisle) but could confuse users who created "orphan" aisles.
- **`locations-tree.tsx:145`** — Aisles without a `sub_location_id` are silently skipped in the tree rendering (`if (!aisle.sub_location_id) continue;`). There is no warning about orphaned aisles. Any aisles created without a sub-location are invisible in the UI.
- **Short code collisions** — `shortCode()` takes the last 6 chars of the UUID, hex-encoded. Two different UUIDs could theoretically produce the same short code. This is a display issue (not a data integrity issue) but could confuse users who scan barcodes.
- **`settings/locations/actions.ts`** — The `setDefaultLocation` action throws errors but the settings page has no error display path — errors would surface as an unhandled Next.js error rather than an inline message.

---

## Summary

The Locations feature is the strongest candidate for a "polished" rating in the app — the inline tree editing, barcode generation, cascading dropdown on component detail, and delete-protection logic are all well-built. The critical items before launch are:

1. **Silent save failures** — Empty name submissions close the form without saving and without any error. Every add/edit action needs to return `{ error: "Name is required" }` instead of bare `return`.
2. **Barcode modal accessibility** — The modal is a `<div>` with no ARIA dialog semantics, no focus trap, and no labelled close button. It will be unusable for screen reader and keyboard-only users.
3. **Unicode characters in button labels** — Screen readers will announce "circled plus", "medium white square", "lower left pencil" before the button text. Wrap icons in `aria-hidden="true"` spans.
4. **Settings > Locations disconnection** — The settings page points users to create locations elsewhere but gives no link to where. One `<Link>` fixes this entirely.
