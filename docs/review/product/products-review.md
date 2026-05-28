# Products Feature Review
> Pre-launch review · 2026-05-28
> Scope: `/app/products`, `/app/products/[productId]`, `/app/products/variants/[variantId]` (all tabs), BOM Lightbox, BOM Versions tab

---

## Importance Scale

| Symbol | Level | Meaning |
|--------|-------|---------|
| 🔴 | **Critical** | Incorrect behaviour, silent data loss, or actively misleads the user |
| 🟠 | **High** | Significant UX gap or accessibility failure that will frustrate users regularly |
| 🟡 | **Medium** | Noticeable rough edge; not blocking but should be addressed before growth |
| 🟢 | **Low** | Polish / nice-to-have; fine to defer post-launch |

---

## Category A — Bugs & Incorrect Behaviour

### A1 · "Last sync" label shows creation date, not sync date 🔴
**File:** `src/app/app/products/[productId]/page.tsx` line 310
**Detail:** `const lastSync = product.created_at` — the product detail header description reads
`"Last sync X ago"` but the value used is the record's `created_at` timestamp. After the initial
Shopify import this date never changes, so the label is permanently wrong.
**Fix options:** (a) rename to "Added" / "Imported", or (b) add a `last_synced_at` column to
`product` and update it on every Shopify sync.

---

### A2 · `{{customer_first_name}}` variable is always blank in sent emails 🔴
**File:** `src/lib/notifications/notification-engine.ts` line 79,
`src/app/app/products/variants/[variantId]/notifications-tab.tsx` line 97
**Detail:** The notification engine includes `customer_first_name: ""` — hardcoded empty string.
The notifications UI shows this variable in its placeholder example but the documented variable
list omits it. Users who use `{{customer_first_name}}` in a template will send emails with a
silent blank, with no warning.
**Fix options:** (a) look up customer first name from order data and populate it, or (b) remove
the variable from the engine and the placeholder until it is properly supported.

---

### A3 · Routing tab shows editable forms for all BOM versions including archived 🟠
**File:** `src/app/app/products/variants/[variantId]/page.tsx` lines 608–895
**Detail:** `typedBoms.map(...)` renders every version's labor operations with live Save/Remove
buttons. Only the active or draft BOM's operations are meaningful to edit. Old archived versions
appear indistinguishable in edit mode, and a user can modify operations on a version that isn't
live. The cost summary is only shown for the editor BOM, making the other forms functionally
orphaned but destructively editable.
**Fix:** Filter `typedBoms` in the routing tab to show only the active or draft BOM for editing.
Display prior versions read-only, or collapse them behind a "Show historical routing" toggle.

---

### A4 · "Import Products" button has no feedback 🟠
**File:** `src/app/app/products/page.tsx` line 294
**Detail:** `<form method="post" action="/api/shopify/sync">` — the sync route exists but the
form has no loading state, no success message, and no error display. After clicking the button
the page appears completely unchanged. Users will click it multiple times or assume it is broken.
**Fix:** Either convert to a client component with `useTransition` + toast, or redirect to a
confirmation/status page after the POST.

---

### A5 · Orphaned file with broken CSS reference 🟡
**File:** `src/app/app/products/product-variant-picker.tsx`
**Detail:** Never imported anywhere in the codebase. References `styles.variantSelect` which
does not exist in `product-detail.module.css`. It was likely superseded by the variant coverage
table navigation.
**Fix:** Delete the file.

---

## Category B — Accessibility

### B1 · Products list page has no `<h1>` heading 🔴
**File:** `src/app/app/products/page.tsx` line 288
**Detail:** The header block renders a `<p>` with the product count and an import button. The
CSS defines a `.header h1` rule that is never used. Screen readers navigate to this page with no
heading landmark. The `PageHeader` component (already used on product detail) supports `title`
and `actions` props.
**Fix:** Replace the header block with `<PageHeader title="Products" actions={...} />`.

---

### B2 · Filter `<select>` never submits without pressing Enter 🟠
**File:** `src/app/app/products/page.tsx` line 308
**Detail:** The filter form is `method="get"` with a search input (works with Enter) and a
`<select>` (never triggers submission at all without a submit button). Users who change the
dropdown filter see no response.
**Fix:** Add `onChange={(e) => e.currentTarget.form?.requestSubmit()}` to the `<select>`, or
add a visible submit button.

---

### B3 · Variant coverage table rows are mouse-only 🟠
**File:** `src/app/app/products/[productId]/variant-coverage-table.tsx` lines 85–89
**Detail:** `<tr onClick={() => router.push(...)} style={{ cursor: "pointer" }}>` — the rows
have pointer cursor and click navigation but no `role`, `tabIndex`, or `onKeyDown`. Keyboard
users cannot navigate to a variant from the product detail page.
**Fix:** Add `role="button"` (or use a wrapping `<Link>`) + `tabIndex={0}` + `onKeyDown`
Enter/Space handler. The pattern is already correctly implemented in `bom-versions-tab.tsx`
lines 535–539 — replicate it.

---

### B4 · Remove buttons are icon-only with no accessible label 🟡
**Files:** `src/app/app/products/bom-editor.tsx` line 411,
`src/app/app/products/bom-lightbox.tsx` line 377
**Detail:** Both render `<button>✕</button>` with no `aria-label`. Screen readers announce
"times" or "multiplication sign". In the BOM editor this removes a component line; in the
lightbox it removes a component from the selection.
**Fix:** Add `aria-label={`Remove ${line.component.name}`}` to each button.

---

### B5 · Mobile product list loses column context when stacked 🟡
**File:** `src/app/app/products/products.module.css` lines 162–175
**Detail:** At < 900px `tableHeader` is hidden and each row collapses to a single column. The
five data cells (variant count, status, sell price, Material GP%, Actual GP%) are rendered with
no visible labels in the stacked layout. A user on mobile cannot tell which number is which.
**Fix:** Use `data-label` attributes on each `<td>` and show them via CSS `::before` content in
the mobile breakpoint, or convert to a card-based layout with inline labels.

---

### B6 · `dangerouslySetInnerHTML` on product description without sanitisation 🟢
**File:** `src/app/app/products/[productId]/page.tsx` line 334
**Detail:** Product description HTML from Shopify is rendered directly. Shopify's own API
sanitises output, so real-world risk is low — but any future description source that isn't
pre-sanitised creates an XSS surface.
**Fix:** Pipe through `DOMPurify` (client) or a server-side sanitiser (e.g. `sanitize-html`)
before rendering.

---

## Category C — Ease of Use

### C1 · "Save BOM" activates live version with no warning 🟠
**File:** `src/app/app/products/bom-editor.tsx` line 237
**Detail:** The primary action button in draft mode is labelled "Save BOM". What it actually
does is replace the currently-live BOM with the draft, making it immediately active for
production orders. The label does not communicate the consequence. There is no confirmation step.
**Fix:** Rename to "Activate BOM". Add a short confirmation: *"This will replace the currently
active BOM (v2). Continue?"* A lightweight `<dialog>` or `window.confirm()` is sufficient.

---

### C2 · Discard / Delete draft have no confirmation 🟠
**File:** `src/app/app/products/bom-editor.tsx` lines 227–232 (Discard), 253–258 (Delete draft)
**Detail:** Both actions immediately and permanently delete the draft BOM with no undo. A user
who clicks "Discard" by accident loses all unsaved work with no recovery path.
**Fix:** Add a confirmation step to both actions. A `<dialog>` prompt reading *"Delete this
draft? This cannot be undone."* is sufficient.

---

### C3 · Routing save scrolls user back to page top 🟡
**File:** `src/app/app/products/actions.ts` — `createBomLaborLine`, `updateBomLaborLine`,
`deleteBomLaborLine` all call `redirectVariantResult()`
**Detail:** Every routing save/delete redirects to `?tab=routing&laborSuccess=...`, which lands
at the page top with the tab query param reselecting the routing tab. Users editing a third or
fourth operation must scroll back down. The success message is also tiny and easy to miss at the
top.
**Fix:** Either use an optimistic client-side update (remove the redirect, mutate local state),
or at minimum use `useRouter().replace()` with `scroll: false` to suppress the scroll reset.

---

### C4 · Shopify IDs exposed in user-facing UI 🟡
**Files:** `src/app/app/products/[productId]/page.tsx` line 316,
`src/app/app/products/variants/[variantId]/page.tsx` lines 535–536
**Detail:** Both pages surface raw Shopify GIDs in the primary header/card. These are internal
system identifiers with no meaning to end users and add visual noise.
**Fix:** Move Shopify ID to the Overview tab under a collapsible "System Details" section, or
remove from the visible UI entirely (it is still in the DB if needed for debugging).

---

### C5 · Template and copy-from-variant options are hidden in the BOM lightbox footer 🟡
**File:** `src/app/app/products/bom-lightbox.tsx` lines 403–433
**Detail:** The "from template" and "copy from variant" flows are tucked below the component
list as small inline `<select>` + link-button combos in the footer row. First-time users see a
large component picker and miss these options entirely. The `BomSeedPanel` empty state does
surface them as distinct cards, but once the lightbox is open that context is gone.
**Fix:** Promote these to a clearly labelled section at the top of the lightbox — e.g. a
"Start from" row with three buttons: "Pick components", "Use a template", "Copy a variant" —
that switches the panel content.

---

### C6 · Overview tab on variant detail is sparse 🟢
**File:** `src/app/app/products/variants/[variantId]/page.tsx` lines 541–568
**Detail:** The Overview tab shows five fields: title, SKU, Shopify ID, price, created date.
Three of these (SKU, price, created date) are already visible in the variant card above the
tabs. The tab adds little incremental value and a user landing here first gets no BOM context.
**Fix:** Enrich the Overview tab with a summary of BOM status (active version, component count,
material cost, GP%), or fold the existing fields into the card above the tabs and repurpose
Overview as the BOM summary.

---

## Category D — Feature Additions (Easy Wins)

### D1 · Export BOM to CSV 🟠
**What:** A download button on the active BOM tab that generates a CSV of component name, SKU,
unit, quantity, yield %, unit cost, line cost, and totals.
**Why it matters:** Manufacturing teams routinely share BOMs with suppliers, attach them to
purchase orders, and print them for the shop floor. Currently this requires manually transcribing
from the screen.
**Effort:** Low — all data is already in the BOM editor. A server action that serialises
`bom.lines` to CSV and returns a download response is the entire implementation.

---

### D2 · BOM Activation Notes (version changelog) 🟡
**What:** An optional "What changed?" textarea in the activation flow (or as a field on the
draft BOM). Stored as a `notes` column on `product_bom`. Shown in the Versions tab sidebar
below the date.
**Why it matters:** The version history currently shows dates and costs but no context. As the
product catalogue grows, "v4 · 12 Jan" is meaningless without knowing why v4 exists. One
sentence per activation transforms audit trail quality.
**Effort:** Very low — one nullable text column, one input field, display in the version
sidebar.

---

### D3 · Live stock check inline on BOM components 🟡
**What:** Show current on-hand inventory level next to each component line on the active BOM.
A small "In stock: 42 kg" label with a red/amber/green indicator based on whether stock covers
a target run quantity.
**Why it matters:** The BOM is currently a cost document only. Adding stock context makes it a
production-readiness check — the key question on the shop floor is "can we make this today?"
**Effort:** Medium — requires a join to the inventory/component stock table, but the data
relationship already exists. No new DB tables needed.

---

### D4 · Clone BOM to multiple variants at once 🟡
**What:** A "Copy to other variants" multi-select action on the active BOM, scoped to variants
within the same product. Runs `copyBomToDraft` in a loop for each selected variant.
**Why it matters:** Products with multiple colour/size variants often share an identical or
near-identical BOM. The current per-variant copy flow requires N repetitions for N variants.
This collapses that to a single action during setup.
**Effort:** Low — `copyBomToDraft` server action already exists. New UI is a multi-select
checkbox list of sibling variants + a single submit.

---

### D5 · "Component costs changed since activation" badge 🟡
**What:** A warning badge on the BOM tab — *"Component costs have changed since this BOM was
activated"* — when any component's current `cost_per_unit` differs from the cost at the time
the BOM was activated. Clicking it shows a diff of which components changed and by how much.
**Why it matters:** If a supplier raises prices in the Components section, GP% on the Products
list silently drops. There is currently no signal pointing back to the root cause. This closes
the "why did my margin change?" loop.
**Effort:** Medium — requires either snapshotting costs at activation time (a
`cost_snapshot` jsonb column on `product_bom`) or a live comparison query at render time.

---

## Summary Table

| ID | Finding | Category | Importance |
|----|---------|----------|------------|
| A1 | "Last sync" shows creation date | Bug | 🔴 Critical |
| A2 | `{{customer_first_name}}` always empty | Bug | 🔴 Critical |
| B1 | No `<h1>` on products list | Accessibility | 🔴 Critical |
| A3 | Routing tab editable for all BOM versions | Bug | 🟠 High |
| A4 | Import button has no feedback | Bug | 🟠 High |
| B2 | Filter select never submits | Accessibility | 🟠 High |
| B3 | Variant table rows mouse-only | Accessibility | 🟠 High |
| C1 | "Save BOM" activates with no warning | Ease of Use | 🟠 High |
| C2 | Discard/Delete draft no confirmation | Ease of Use | 🟠 High |
| D1 | Export BOM to CSV | Feature | 🟠 High |
| A5 | Orphaned file with broken CSS ref | Bug | 🟡 Medium |
| B4 | Remove buttons no accessible label | Accessibility | 🟡 Medium |
| B5 | Mobile list loses column labels | Accessibility | 🟡 Medium |
| C3 | Routing save resets scroll to top | Ease of Use | 🟡 Medium |
| C4 | Shopify IDs in user-facing UI | Ease of Use | 🟡 Medium |
| C5 | Template/copy options hidden in lightbox | Ease of Use | 🟡 Medium |
| D2 | BOM activation notes / changelog | Feature | 🟡 Medium |
| D3 | Live stock check on BOM components | Feature | 🟡 Medium |
| D4 | Clone BOM to multiple variants | Feature | 🟡 Medium |
| D5 | Costs-changed-since-activation badge | Feature | 🟡 Medium |
| B6 | `dangerouslySetInnerHTML` no sanitiser | Accessibility | 🟢 Low |
| C6 | Overview tab is sparse | Ease of Use | 🟢 Low |
