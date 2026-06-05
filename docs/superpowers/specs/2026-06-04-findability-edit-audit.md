# App-wide Findability & Inline-Edit Audit

**Date:** 2026-06-04
**Status:** Spec — approved for execution
**Type:** Audit (gate) → fix-in-batches

## Problem

Across the Manuva app, the same entity (a component, supplier, order, BOM line)
appears on many pages, but the page you happen to be on often won't let you act on
it where you see it. Two recurring frustrations, plus two adjacent ones:

1. **Navigation dead-ends** — an entity is rendered as plain text where it should
   link to its detail page. Example: on the supplier detail page
   (`src/app/app/suppliers/[supplierId]/supplier-tabs.tsx:460`) the supplied
   component's name is a plain `<span>`, not a link to
   `/app/components/[componentId]`.
2. **Missing inline edits** — a value you'd reasonably want to change is read-only
   at the place you're looking at it. Example: same file line `467`, the base
   `unit_cost` is display-only; you can add price *breaks* but not edit the
   headline price.
3. **Findability gaps** — data that exists but has no entry point from anywhere, or
   is buried where you'd never look (e.g. costings hidden in a tab).
4. **True a11y (WCAG)** — keyboard navigation, focus states, ARIA labels, colour
   contrast, screen-reader semantics, `div`-as-button, missing form labels / alt.

## Goal

Produce **one prioritised audit document** cataloguing every instance of the four
categories across all `/app` pages, each ranked on an **impact × effort** matrix so
we fix high-impact / low-effort wins first.

The audit is a **gate**: we agree priorities before any code changes. Fixes follow
in separate batches, each its own implementation pass.

## Non-goals

- No code changes during the audit phase.
- No redesign of pages or new features — this is about reaching and editing
  existing data, not adding capabilities.
- Unrelated refactoring is out of scope.

## Finding rubric

Every finding, from every cluster, uses this identical shape:

| Field | Values |
|---|---|
| ID | cluster-prefixed, e.g. `SUP-03` |
| Location | route + `file:line` |
| Category | Nav dead-end · Inline-edit · Findability · A11y |
| Pain | one line: what the user can't do |
| Fix | concrete change (e.g. "wrap name in `<Link href=/app/components/[id]>`") |
| Impact | High / Med / Low |
| Effort | S / M / L |
| Verify-in-browser | yes/no (mainly runtime a11y: focus, contrast, keyboard) |

**Category definitions (so agents score consistently):**

- **Nav dead-end** — an entity reference (something with its own detail route) is
  shown as non-interactive text. Fix is almost always wrapping in `<Link>`.
- **Inline-edit** — a field a user would change in the normal course of work is
  read-only here, *and* editing it requires navigating elsewhere or isn't possible
  at all. Not every value needs to be editable everywhere; flag where the *absence*
  causes a detour.
- **Findability** — an entity/page/action with no incoming link from a place a user
  would look, or buried under a tab/route with no signpost.
- **A11y** — measured against WCAG 2.1 AA basics: semantic element misuse
  (`div`/`span` with onClick instead of `button`/`a`), missing `aria-label` on
  icon-only controls, form inputs without labels, images without `alt`, and
  (verify-in-browser) focus visibility, keyboard operability, contrast.

## Execution — parallel subagents, one shared rubric

Split `/app` into 6 balanced clusters. Dispatch one **read-only** agent per cluster
(Explore or general-purpose). Each agent receives the rubric and category
definitions verbatim and returns **only** findings in rubric form — no prose
summaries, no code edits.

| Cluster | Routes |
|---|---|
| **Products** | `components` (list, `[componentId]`, import), `bom` (list, templates), `products` (list, `[productId]`, `variants/[variantId]`) |
| **Operations-A** | `purchasing` (list, `[id]`), `goods-inwards` (list, `[id]`, new), `inventory`, `stocktake` (list, `[sessionId]`) |
| **Operations-B** | `costing`, `capacity`, `staff-costings`, `staffing`, `actual-time`, `planning`, `departments` |
| **Logistics** | `suppliers` (list, `[supplierId]`, import), `warehouse/locations`, `settings/locations` |
| **Orders + Dashboard** | `orders` (list, `[orderId]`), app home (`app/page.tsx`), `reports/*` |
| **Admin** | `settings/*`, `super-admin/*`, `activity-log`, `trash` |

Each agent is told the available detail routes (so it knows what *should* be
linkable), and is pointed at the design-system rules in `CLAUDE.md` /
`docs/design-system.md` and the `_ui/` primitives so its suggested fixes are
idiomatic (compose from `_ui/`, tokens only, no inline styles, links not buttons
for navigation).

## Output

Consolidated into `docs/superpowers/specs/2026-06-04-findability-edit-audit-findings.md`
(this spec stays as the method; findings live in their own doc), structured as:

1. **Quick wins** — table up front: High impact × S effort, sorted. This is what we
   draw the first fix batch from.
2. **Findings by cluster** — full rubric tables, one section per cluster.
3. **Cross-cutting patterns** — appendix grouping findings that share one fix (e.g.
   "entity-name-as-link" may resolve a dozen spots via one pattern / helper), so the
   fix phase batches efficiently.

## Fix phase (after audit review)

After the user reviews the findings doc, pick a batch (from quick wins or a shared
pattern). Implement against `CLAUDE.md` design-system rules:

- Compose from `src/app/app/_ui/` primitives (buttons, table, list-panel, etc.).
- Tokens only — no hardcoded hex, no invented token names.
- No inline styles for layout/colour (dynamic values excepted).
- Navigation is `<Link>`, not a button.

Each batch is its own implementation pass with its own verification.

## Success criteria

- Every `/app` route appears in the findings doc (covered, even if "no findings").
- Each finding is independently actionable from its `file:line` + Fix field alone.
- Quick-wins table is non-empty and correctly filtered to High × S.
- Cross-cutting patterns appendix identifies at least the entity-link and
  inline-price patterns the user explicitly raised.
