# Locations Pre-Launch Review — Design Spec

**Date:** 2026-06-01
**Feature:** Locations (Warehouse / Bin Management)
**Routes:** `/app/warehouse/locations`, `/app/settings/locations`
**Review source:** `docs/review/locations.md`
**Approach:** Single PR — all bug/a11y fixes + easy wins

---

## Overview

The Locations feature is architecturally solid. This pass fixes silent form failures, accessibility blockers, disconnected navigation, and a native-dialog conversion, while also shipping three easy-win value additions (component count badges, copy code, expand/collapse all).

**No new routes, no DB changes, no new server actions.** All changes are confined to:
- `src/app/app/warehouse/locations/` (4 files + 2 new route files)
- `src/app/app/settings/locations/` (2 files + 2 new route files)

---

## Section 1 — Server Action Validation Returns

### Problem
All 8 add/edit actions (`addWarehouse`, `editWarehouse`, `addSubLocation`, `editSubLocation`, `addAisle`, `editAisle`, `addBay`, `editBay`) do `if (!name) return;` — returning `undefined`. `InlineForm` treats `undefined` as success, closes the form, calls `router.refresh()`, and gives the user no feedback. Nothing is saved.

### Fix
Change every early validation `return;` to `return { error: "Name is required" };`. Unify all action return types to `Promise<{ error?: string } | void>`.

No changes to `InlineForm` — it already checks `result?.error` and renders the error inline.

**Affected actions (all in `actions.ts`):**

| Action | Current | Fixed |
|--------|---------|-------|
| `addWarehouse` | `if (!name) return;` | `if (!name) return { error: "Name is required" };` |
| `editWarehouse` | `if (!id \|\| !name) return;` | `if (!id \|\| !name) return { error: "Name is required" };` |
| `addSubLocation` | `if (!warehouseId \|\| !name) return;` | `if (!warehouseId \|\| !name) return { error: "Name is required" };` |
| `editSubLocation` | `if (!id \|\| !name) return;` | `if (!id \|\| !name) return { error: "Name is required" };` |
| `addAisle` | `if (!warehouseId \|\| !name) return;` | `if (!warehouseId \|\| !name) return { error: "Name is required" };` |
| `editAisle` | `if (!id \|\| !name) return;` | `if (!id \|\| !name) return { error: "Name is required" };` |
| `addBay` | `if (!aisleId \|\| !name) return;` | `if (!aisleId \|\| !name) return { error: "Name is required" };` |
| `editBay` | `if (!id \|\| !name) return;` | `if (!id \|\| !name) return { error: "Name is required" };` |

---

## Section 2 — Page Structure

### 2a. Page Title
`warehouse/locations/page.tsx` renders `<PageHeader eyebrow="Warehouse" description="...">` with no `title` prop. The page has no H1.

**Fix:** Add `title="Locations"` to the `<PageHeader>`.

`settings/locations/page.tsx` has the same issue — add `title="Default Location"`.

### 2b. Loading and Error Route Files
Neither route has `loading.tsx` or `error.tsx`. Unhandled errors fall through to the Next.js generic error page.

**Create 4 files:**

| File | Content |
|------|---------|
| `warehouse/locations/loading.tsx` | Minimal skeleton — `<div className={styles.page}><PageHeader eyebrow="Warehouse" title="Locations" /><p className={styles.loading}>Loading locations…</p></div>` |
| `warehouse/locations/error.tsx` | `"use client"` error boundary — shows error message + Reset button |
| `settings/locations/loading.tsx` | Minimal skeleton matching the settings layout |
| `settings/locations/error.tsx` | `"use client"` error boundary |

### 2c. Settings Subscription Gate
`settings/locations/page.tsx` has no tier check. Non-growth users see an empty list with no explanation.

**Fix:** Add subscription check after the role redirect:
```ts
const access = await getSubscriptionAccess(supabase, tenantId);
if (!access.sub || !hasFeature(access.sub, "binManagement")) {
  return <FeatureUpsell feature="Multi-location and bin management" requiredTier="growth" />;
}
```

---

## Section 3 — Icon Button ARIA

### Problem
All action buttons in `locations-tree.tsx` embed raw Unicode characters in button text: `⊕ Sub-loc`, `▦ Barcode`, `✎ Edit`, `✕ Delete`. Screen readers announce "circled plus Sub-loc", "medium white square Barcode", etc.

### Fix
Wrap each icon in `<span aria-hidden="true">` and add an `aria-label` on the button that includes the entity name from scope:

```tsx
// Before
<button className={styles.btnIcon} onClick={...}>⊕ Sub-loc</button>

// After
<button
  className={styles.btnIcon}
  aria-label={`Add sub-location to ${wh.name}`}
  onClick={...}
>
  <span aria-hidden="true">⊕</span> Sub-loc
</button>
```

**All affected buttons with their `aria-label` pattern:**

| Button | `aria-label` pattern |
|--------|---------------------|
| `⊕ Sub-loc` on warehouse row | `"Add sub-location to {wh.name}"` |
| `▦ Barcode` on warehouse row | `"Print barcode for {wh.name}"` |
| `✎ Edit` on warehouse row | `"Edit warehouse {wh.name}"` |
| `⊕ Aisle` on sub-location row | `"Add aisle to {sl.name}"` |
| `▦ Barcode` on sub-location row | `"Print barcode for {sl.name}"` |
| `✎ Edit` on sub-location row | `"Edit sub-location {sl.name}"` |
| `⊕ Bay` on aisle row | `"Add bay to {aisle.name}"` |
| `▦ Barcode` on aisle row | `"Print barcode for {aisle.name}"` |
| `✎ Edit` on aisle row | `"Edit aisle {aisle.name}"` |
| `▦ Barcode` on bay row | `"Print barcode for {bay.name}"` |
| `✎ Edit` on bay row | `"Edit bay {bay.name}"` |
| `⊕ Add Warehouse` | `aria-label="Add warehouse"` |

**`InlineForm` Save/Cancel buttons** get a `label` prop (the entity description, e.g. `"warehouse Main Warehouse"`) and render `aria-label={"Save " + label}` / `aria-label={"Cancel editing " + label}`.

**Delete buttons** (`✕ Delete`) are addressed in Section 5.

---

## Section 4 — Barcode Modal → Native `<dialog>`

### Problem
`BarcodeModal` is a `<div>` overlay. Missing: `role="dialog"`, `aria-modal`, `aria-labelledby`, focus trap, labelled close button.

### Fix
Convert to native `<dialog>`. `BarcodeModal` mounts/unmounts based on the `barcode` state in `LocationsTree`, so it owns its own `dialogRef` internally — no prop threading needed. `showModal()` is called in a mount `useEffect`.

**`barcode-modal.tsx` changes:**

```tsx
// Props unchanged from current (no dialogRef prop added)
interface Props {
  entityId: string;
  entityType: string;
  entityName: string;
  path: string;
  onClose: () => void;
}

export function BarcodeModal({ entityId, entityType, entityName, path, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // showModal on mount
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  // wire cancel event (native Escape) to onClose
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    el.addEventListener("cancel", onClose);
    return () => el.removeEventListener("cancel", onClose);
  }, [onClose]);

  // remove manual keydown Escape handler — dialog handles it

  return (
    <dialog
      ref={dialogRef}
      className={styles.modal}
      aria-labelledby="barcode-modal-title"
    >
      <button className={styles.modalClose} aria-label="Close barcode modal" onClick={onClose}>
        <span aria-hidden="true">✕</span>
      </button>
      <div className={styles.modalType}>{entityType}</div>
      <div id="barcode-modal-title" className={styles.modalName}>{entityName}</div>
      <div className={styles.modalPath}>{path}</div>  {/* path prominence: larger font, see CSS */}
      ...
    </dialog>
  );
}
```

**In `LocationsTree`:** add `const barcodeDialogRef = useRef<HTMLDialogElement>(null);` and pass it to `BarcodeModal`.

**Backdrop:** `.modalOverlay` CSS rules move to `dialog::backdrop` (same visual effect, native behaviour).

### Copy Code Button
Add alongside the short code display:
```tsx
const [copied, setCopied] = useState(false);

<button
  className={styles.btnCopyCode}
  aria-label="Copy location code to clipboard"
  onClick={() => {
    navigator.clipboard.writeText(shortCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }}
>
  {copied ? "Copied!" : "Copy code"}
</button>
```

### Barcode Fallback
Wrap the `jsbarcode` import in try/catch; set a `barcodeError` state on failure. Render:
```tsx
{barcodeError
  ? <p className={styles.barcodeFallback}>Could not generate barcode.</p>
  : <svg ref={svgRef} />
}
```

### Full Path Prominence
Update `.modalPath` CSS: increase from the current small muted style to `font-size: var(--fs-sm); color: var(--ink-muted); font-weight: var(--fw-semibold);` so the full path is clearly readable before printing.

---

## Section 5 — Confirmation Dialogs

### Problem
- `AisleDeleteButton` uses `window.confirm()` for cascade-delete warning — jarring, suppressible
- `SimpleDeleteButton` fires immediately with no confirmation (relies solely on component-assignment check)

### Shared `ConfirmDialog` Primitive
A new internal component inside `locations-tree.tsx`:

```tsx
function ConfirmDialog({
  dialogRef,
  message,
  confirmLabel = "Delete",
  onConfirm,
}: {
  dialogRef: React.RefObject<HTMLDialogElement>;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
}) {
  return (
    <dialog ref={dialogRef} className={styles.confirmDialog}>
      <p>{message}</p>
      <div className={styles.confirmActions}>
        <button
          type="button"
          className={styles.btnCancel}
          onClick={() => dialogRef.current?.close()}
        >
          Cancel
        </button>
        <button
          type="button"
          className={styles.btnDanger}
          onClick={() => { dialogRef.current?.close(); onConfirm(); }}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
```

Each delete button component owns its own `useRef<HTMLDialogElement>`. Multiple buttons on screen do not interfere.

### `AisleDeleteButton` Changes
Replace `window.confirm(...)` with `dialogRef.current?.showModal()`. The `ConfirmDialog` message uses the `bayCount` from the server response: `"This aisle has ${bayCount} bay(s) that will also be deleted. Continue?"`. The confirm callback submits the second `deleteAisle` call with `confirmed=true`.

The component now has two dialog states: the cascade-confirm dialog (when `bayCount > 0`) and no dialog (when the first call succeeds directly). Add a `label` prop for the entity name to give the delete button a proper `aria-label`.

### `SimpleDeleteButton` Changes
Add a `label` prop (entity type + name, e.g. `"sub-location Receiving"`) for context. On click, open the `ConfirmDialog` instead of submitting immediately. Message: `"Delete this ${entityType}? This cannot be undone."` On confirm, submit the form action.

### CSS Additions (in `page.module.css`)
```css
.confirmDialog {
  border: none;
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  color: var(--ink-strong);
  box-shadow: var(--shadow-lg);
  padding: 24px;
  max-width: 380px;
  width: 92vw;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.confirmDialog::backdrop { background: var(--bg-overlay); }
.confirmActions { display: flex; justify-content: flex-end; gap: 8px; }
.btnDanger {
  background: var(--danger);
  border: 1px solid var(--danger);
  color: #fff;
  border-radius: 5px;
  padding: 5px 14px;
  font-size: 13px;
  cursor: pointer;
  font-family: inherit;
}
.btnDanger:hover { opacity: 0.85; }
```

---

## Section 6 — Component Count Badges

### Data Fetch
Add a second query to `warehouse/locations/page.tsx` in a `Promise.all`:

```ts
const [warehousesResult, compLocResult] = await Promise.all([
  supabase
    .from("location")
    .select(`id, name, is_default,
      sub_locations:bin_sub_location(id, name),
      aisles:bin_aisle(id, name, sub_location_id, bays:bin_bay(id, name, aisle_id))`)
    .eq("tenant_id", tenantId)
    .order("name"),
  supabase
    .from("component")
    .select("bin_sub_location_id, bin_aisle_id, bin_bay_id")
    .eq("tenant_id", tenantId)
    .is("archived_at", null),
]);
```

Reduce the component rows into a flat count map client-side (server component, so this runs on the server):

```ts
const componentCounts: Record<string, number> = {};
for (const row of compLocResult.data ?? []) {
  if (row.bin_sub_location_id) componentCounts[row.bin_sub_location_id] = (componentCounts[row.bin_sub_location_id] ?? 0) + 1;
  if (row.bin_aisle_id) componentCounts[row.bin_aisle_id] = (componentCounts[row.bin_aisle_id] ?? 0) + 1;
  if (row.bin_bay_id) componentCounts[row.bin_bay_id] = (componentCounts[row.bin_bay_id] ?? 0) + 1;
}
```

Pass as `componentCounts={componentCounts}` prop to `<LocationsTree>`.

### Display
`LocationsTree` receives `componentCounts: Record<string, number>`. On each sub-location, aisle, and bay row, render a count badge when `(componentCounts[id] ?? 0) > 0`:

```tsx
{(componentCounts[sl.id] ?? 0) > 0 && (
  <span className={styles.countTag}>
    {componentCounts[sl.id]} component{componentCounts[sl.id] !== 1 ? "s" : ""}
  </span>
)}
```

Zero-count nodes show no badge. Reuses the existing `countTag` CSS class (already used for "N aisles" / "N bays").

---

## Section 7 — Expand All / Collapse All

### Controls
Each warehouse header row gets two small text buttons at the far right: **"Expand all"** and **"Collapse all"**. Styled as muted text links (not icon buttons) so they don't compete with the Edit/Barcode/Add actions.

### Implementation
Both handlers use the warehouse's already-loaded data — no extra fetches needed.

```ts
function expandAll(wh: Warehouse) {
  setCollapsedWh(s => { const n = new Set(s); n.delete(wh.id); return n; });
  setCollapsedSl(s => {
    const n = new Set(s);
    wh.sub_locations.forEach(sl => n.delete(sl.id));
    return n;
  });
  setCollapsedAisle(s => {
    const n = new Set(s);
    wh.aisles.forEach(a => n.delete(a.id));
    return n;
  });
}

function collapseAll(wh: Warehouse) {
  setCollapsedWh(s => new Set([...s, wh.id]));
  setCollapsedSl(s => new Set([...s, ...wh.sub_locations.map(sl => sl.id)]));
  setCollapsedAisle(s => new Set([...s, ...wh.aisles.map(a => a.id)]));
}
```

**CSS for expand/collapse buttons:**
```css
.btnExpandCollapse {
  font-size: var(--fs-xs);
  color: var(--ink-muted);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0 4px;
  font-family: inherit;
}
.btnExpandCollapse:hover { color: var(--ink-strong); }
```

---

## Section 8 — Settings Navigation Links + Error Display

### 8a. Settings → Management Link
In `settings/locations/page.tsx`:

- Add `actions={<Link href="/app/warehouse/locations" className={styles.manageLink}>Manage locations →</Link>}` to the `PageHeader`.
- Change the empty state from `"No locations found. Create locations in the Locations module first."` to `"No locations yet. "` + inline `<Link href="/app/warehouse/locations">Create locations →</Link>`.

### 8b. Management → Settings Link
In `warehouse/locations/page.tsx`, add a small note below the `PageHeader`:

```tsx
<p className={styles.settingsHint}>
  Default location is set in{" "}
  <Link href="/app/settings/locations">Settings → Locations</Link>.
</p>
```

CSS:
```css
.settingsHint {
  font-size: var(--fs-sm);
  color: var(--ink-muted);
  margin: -8px 0 0;
}
.settingsHint a { color: var(--ink-muted); text-decoration: underline; }
.settingsHint a:hover { color: var(--ink-strong); }
```

### 8c. Settings Action Error Display
`setDefaultLocation` currently throws on error with no catch in the page. With the `error.tsx` boundary added in Section 2, thrown errors are now caught at the route level — this covers the most important failure mode.

For inline per-row feedback, extract the location list into a new `"use client"` component `DefaultLocationPicker` in `settings/locations/default-location-picker.tsx`. The server page remains a server component (auth redirects + DB query stay server-side); it passes the `locations` array as a prop to the client component. `DefaultLocationPicker` uses `useActionState` with `setDefaultLocation` and renders an inline error message when `state.error` is set.

`setDefaultLocation` changes from throwing to returning `{ error?: string }`.

---

## File Map

| File | Action |
|------|--------|
| `warehouse/locations/actions.ts` | Fix 8 validation returns |
| `warehouse/locations/page.tsx` | Add `title`, `Promise.all` + count map, `componentCounts` prop, settings hint link |
| `warehouse/locations/locations-tree.tsx` | ARIA labels, `ConfirmDialog`, `AisleDeleteButton`, `SimpleDeleteButton`, expand/collapse all, `componentCounts` badges, `barcodeDialogRef` |
| `warehouse/locations/barcode-modal.tsx` | Convert to `<dialog>`, copy code, barcode fallback, path prominence |
| `warehouse/locations/page.module.css` | `confirmDialog`, `confirmActions`, `btnDanger`, `btnExpandCollapse`, `settingsHint`, `barcodeFallback`, `btnCopyCode`, modal backdrop, path style updates |
| `warehouse/locations/loading.tsx` | **Create** |
| `warehouse/locations/error.tsx` | **Create** |
| `settings/locations/page.tsx` | Add title, subscription gate, management link, empty state link; pass locations to `DefaultLocationPicker` |
| `settings/locations/default-location-picker.tsx` | **Create** — `"use client"` component with `useActionState` + inline error display |
| `settings/locations/actions.ts` | `setDefaultLocation` returns `{ error? }` instead of throwing |
| `settings/locations/loading.tsx` | **Create** |
| `settings/locations/error.tsx` | **Create** |

---

## Out of Scope (Deferred)

- ARIA tree roles (`role="tree"`, `role="treeitem"`, `aria-expanded`) on the hierarchy — the collapse buttons already use `aria-label`; full semantic tree roles are a larger refactor with limited practical gain given the current button-based navigation
- Short code collision detection — display-only issue, not a data integrity risk
- `bin-location-select.tsx` `htmlFor`/`id` explicit association — implicit wrapping is technically valid
- Orphaned aisles warning — aisles without `sub_location_id` are silently skipped; surfacing them requires a separate UI concept
