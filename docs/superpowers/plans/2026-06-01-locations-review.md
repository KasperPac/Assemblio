# Locations Pre-Launch Review — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all critical bugs, accessibility blockers, and UX gaps from the locations pre-launch review, and deliver three easy-win value additions (component count badges, copy code, expand/collapse all).

**Architecture:** All changes are confined to `src/app/app/warehouse/locations/` and `src/app/app/settings/locations/`. No new routes, no DB migrations, no new server actions beyond a `DefaultLocationPicker` client component. Eight independent tasks that can be committed individually.

**Tech Stack:** Next.js 15 App Router, TypeScript, CSS Modules, native HTML5 `<dialog>`, Supabase JS client, `jsbarcode`

**Spec:** `docs/superpowers/specs/2026-06-01-locations-review-design.md`

---

## File Map

| File | Action | Task(s) |
|------|--------|---------|
| `warehouse/locations/actions.ts` | Modify — fix 8 validation returns | 1 |
| `warehouse/locations/page.tsx` | Modify — title, Promise.all + count map, componentCounts prop, settings hint | 2, 7 |
| `warehouse/locations/loading.tsx` | **Create** | 2 |
| `warehouse/locations/error.tsx` | **Create** | 2 |
| `warehouse/locations/barcode-modal.tsx` | Modify — convert to `<dialog>`, copy code, fallback, path | 5 |
| `warehouse/locations/locations-tree.tsx` | Modify — ARIA, ConfirmDialog, delete buttons, count badges, expand/collapse | 4, 6, 7, 8 |
| `warehouse/locations/page.module.css` | Modify — backdrop, confirm dialog, expand btn, settings hint, copy code, barcode fallback | 5, 6, 8 |
| `settings/locations/page.tsx` | Modify — title, subscription gate, nav link, empty state link, extract to client component | 3 |
| `settings/locations/default-location-picker.tsx` | **Create** — `"use client"` component with `useActionState` | 3 |
| `settings/locations/actions.ts` | Modify — `setDefaultLocation` returns `{ error? }` instead of throwing | 3 |
| `settings/locations/loading.tsx` | **Create** | 3 |
| `settings/locations/error.tsx` | **Create** | 3 |

---

## Task 1 — Fix server action validation returns

**Files:**
- Modify: `src/app/app/warehouse/locations/actions.ts`

All 8 add/edit actions return bare `undefined` when the name field is empty, which `InlineForm` treats as success. Fix each to return `{ error: "Name is required" }`.

- [ ] **Step 1: Fix `addWarehouse` and `editWarehouse`**

In `actions.ts`, replace:

```ts
export async function addWarehouse(formData: FormData) {
  const name = formData.get("name")?.toString().trim();
  if (!name) return;
```

with:

```ts
export async function addWarehouse(formData: FormData): Promise<{ error: string } | void> {
  const name = formData.get("name")?.toString().trim();
  if (!name) return { error: "Name is required" };
```

Replace:

```ts
export async function editWarehouse(formData: FormData) {
  const id = formData.get("id")?.toString();
  const name = formData.get("name")?.toString().trim();
  if (!id || !name) return;
```

with:

```ts
export async function editWarehouse(formData: FormData): Promise<{ error: string } | void> {
  const id = formData.get("id")?.toString();
  const name = formData.get("name")?.toString().trim();
  if (!id || !name) return { error: "Name is required" };
```

- [ ] **Step 2: Fix `addSubLocation` and `editSubLocation`**

Replace:

```ts
export async function addSubLocation(formData: FormData) {
  const warehouseId = formData.get("warehouse_id")?.toString();
  const name = formData.get("name")?.toString().trim();
  if (!warehouseId || !name) return;
```

with:

```ts
export async function addSubLocation(formData: FormData): Promise<{ error: string } | void> {
  const warehouseId = formData.get("warehouse_id")?.toString();
  const name = formData.get("name")?.toString().trim();
  if (!warehouseId || !name) return { error: "Name is required" };
```

Replace:

```ts
export async function editSubLocation(formData: FormData) {
  const id = formData.get("id")?.toString();
  const name = formData.get("name")?.toString().trim();
  if (!id || !name) return;
```

with:

```ts
export async function editSubLocation(formData: FormData): Promise<{ error: string } | void> {
  const id = formData.get("id")?.toString();
  const name = formData.get("name")?.toString().trim();
  if (!id || !name) return { error: "Name is required" };
```

- [ ] **Step 3: Fix `addAisle` and `editAisle`**

Replace:

```ts
export async function addAisle(formData: FormData) {
  const warehouseId = formData.get("warehouse_id")?.toString();
  const name = formData.get("name")?.toString().trim();
  const subLocationId = formData.get("sub_location_id")?.toString() || null;
  if (!warehouseId || !name) return;
```

with:

```ts
export async function addAisle(formData: FormData): Promise<{ error: string } | void> {
  const warehouseId = formData.get("warehouse_id")?.toString();
  const name = formData.get("name")?.toString().trim();
  const subLocationId = formData.get("sub_location_id")?.toString() || null;
  if (!warehouseId || !name) return { error: "Name is required" };
```

Replace:

```ts
export async function editAisle(formData: FormData) {
  const id = formData.get("id")?.toString();
  const name = formData.get("name")?.toString().trim();
  const subLocationId = formData.get("sub_location_id")?.toString() || null;
  if (!id || !name) return;
```

with:

```ts
export async function editAisle(formData: FormData): Promise<{ error: string } | void> {
  const id = formData.get("id")?.toString();
  const name = formData.get("name")?.toString().trim();
  const subLocationId = formData.get("sub_location_id")?.toString() || null;
  if (!id || !name) return { error: "Name is required" };
```

- [ ] **Step 4: Fix `addBay` and `editBay`**

Replace:

```ts
export async function addBay(formData: FormData) {
  const aisleId = formData.get("aisle_id")?.toString();
  const name = formData.get("name")?.toString().trim();
  if (!aisleId || !name) return;
```

with:

```ts
export async function addBay(formData: FormData): Promise<{ error: string } | void> {
  const aisleId = formData.get("aisle_id")?.toString();
  const name = formData.get("name")?.toString().trim();
  if (!aisleId || !name) return { error: "Name is required" };
```

Replace:

```ts
export async function editBay(formData: FormData) {
  const id = formData.get("id")?.toString();
  const name = formData.get("name")?.toString().trim();
  if (!id || !name) return;
```

with:

```ts
export async function editBay(formData: FormData): Promise<{ error: string } | void> {
  const id = formData.get("id")?.toString();
  const name = formData.get("name")?.toString().trim();
  if (!id || !name) return { error: "Name is required" };
```

- [ ] **Step 5: Verify types**

```powershell
npx tsc --noEmit 2>&1 | Select-String "actions"
```

Expected: no errors on `actions.ts`.

- [ ] **Step 6: Manual test**

Start the dev server. Navigate to `/app/warehouse/locations`. Try to add a warehouse with an empty name — the form should stay open and show "Name is required". Try with a valid name — the form should close and the warehouse should appear.

- [ ] **Step 7: Commit**

```bash
git add src/app/app/warehouse/locations/actions.ts
git commit -m "fix(locations): return error object on empty name instead of silent undefined"
```

---

## Task 2 — Page title and loading/error route files

**Files:**
- Modify: `src/app/app/warehouse/locations/page.tsx`
- Create: `src/app/app/warehouse/locations/loading.tsx`
- Create: `src/app/app/warehouse/locations/error.tsx`

- [ ] **Step 1: Add `title` to PageHeader in `warehouse/locations/page.tsx`**

Replace:

```tsx
      <PageHeader
        eyebrow="Warehouse"
        description="Manage warehouses, sub-locations, aisles, and bays."
      />
```

with:

```tsx
      <PageHeader
        eyebrow="Warehouse"
        title="Locations"
        description="Manage warehouses, sub-locations, aisles, and bays."
      />
```

- [ ] **Step 2: Create `warehouse/locations/loading.tsx`**

Create `src/app/app/warehouse/locations/loading.tsx`:

```tsx
import PageHeader from "../../_ui/page-header";
import styles from "./page.module.css";

export default function LocationsLoading() {
  return (
    <div className={styles.page}>
      <PageHeader eyebrow="Warehouse" title="Locations" description="Manage warehouses, sub-locations, aisles, and bays." />
      <p className={styles.loadingHint}>Loading locations…</p>
    </div>
  );
}
```

Add `.loadingHint` to `page.module.css`:

```css
.loadingHint {
  font-size: var(--fs-sm);
  color: var(--ink-faint);
  padding: 12px 0;
}
```

- [ ] **Step 3: Create `warehouse/locations/error.tsx`**

Create `src/app/app/warehouse/locations/error.tsx`:

```tsx
"use client";

import { useEffect } from "react";
import styles from "./page.module.css";

export default function LocationsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className={styles.errorState}>
      <p className={styles.errorMessage}>Failed to load locations: {error.message}</p>
      <button className={styles.btnRetry} onClick={reset}>Try again</button>
    </div>
  );
}
```

Add to `page.module.css`:

```css
.errorState {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 24px;
  border: 1px solid var(--stroke-card);
  border-radius: var(--radius-xl);
  background: var(--bg-card);
}

.errorMessage {
  font-size: var(--fs-sm);
  color: var(--danger);
}

.btnRetry {
  align-self: flex-start;
  font-size: var(--fs-sm);
  color: var(--ink-muted);
  background: none;
  border: 1px solid var(--stroke-strong);
  border-radius: var(--radius-md);
  padding: 4px 12px;
  cursor: pointer;
  font-family: inherit;
}
.btnRetry:hover { color: var(--ink-strong); }
```

- [ ] **Step 4: Verify types**

```powershell
npx tsc --noEmit 2>&1 | Select-String "warehouse/locations"
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/app/warehouse/locations/page.tsx src/app/app/warehouse/locations/loading.tsx src/app/app/warehouse/locations/error.tsx src/app/app/warehouse/locations/page.module.css
git commit -m "fix(locations): add page title, loading skeleton, and error boundary"
```

---

## Task 3 — Settings: subscription gate, navigation links, error handling

**Files:**
- Modify: `src/app/app/settings/locations/page.tsx`
- Modify: `src/app/app/settings/locations/actions.ts`
- Create: `src/app/app/settings/locations/default-location-picker.tsx`
- Create: `src/app/app/settings/locations/loading.tsx`
- Create: `src/app/app/settings/locations/error.tsx`

- [ ] **Step 1: Fix `setDefaultLocation` to return `{ error? }` instead of throwing**

Open `src/app/app/settings/locations/actions.ts`. The current action likely throws on error. Replace it with:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";

export async function setDefaultLocation(
  _prevState: { error?: string },
  formData: FormData,
): Promise<{ error?: string }> {
  const locationId = formData.get("location_id")?.toString();
  if (!locationId) return { error: "No location selected." };

  const context = await getServerTenantContext();
  if (!context) return { error: "Unauthorized." };
  const { supabase, tenantId } = context;

  // Clear existing default
  const { error: clearError } = await supabase
    .from("location")
    .update({ is_default: false })
    .eq("tenant_id", tenantId!);
  if (clearError) return { error: clearError.message };

  // Set new default
  const { error: setError } = await supabase
    .from("location")
    .update({ is_default: true })
    .eq("id", locationId)
    .eq("tenant_id", tenantId!);
  if (setError) return { error: setError.message };

  revalidatePath("/app/settings/locations");
  return {};
}
```

Note: Check the existing `actions.ts` first — if the logic is different (e.g. it uses a single upsert or RPC), preserve that logic and just change the error-return pattern. The signature `(prevState, formData)` is required for `useActionState` compatibility.

- [ ] **Step 2: Create `default-location-picker.tsx`**

Create `src/app/app/settings/locations/default-location-picker.tsx`:

```tsx
"use client";

import { useActionState } from "react";
import { setDefaultLocation } from "./actions";
import styles from "./locations.module.css";

type Location = { id: string; name: string; is_default: boolean };

export function DefaultLocationPicker({ locations }: { locations: Location[] }) {
  const [state, formAction] = useActionState(setDefaultLocation, {});

  return (
    <div className={styles.list}>
      {state.error && (
        <p className={styles.actionError} role="alert">{state.error}</p>
      )}
      {locations.map((loc) => (
        <div
          key={loc.id}
          className={`${styles.row} ${loc.is_default ? styles.rowDefault : ""}`}
        >
          <div className={styles.rowInfo}>
            <span className={styles.name}>{loc.name}</span>
            {loc.is_default && (
              <span className={styles.defaultBadge}>Default</span>
            )}
          </div>
          {!loc.is_default && (
            <form action={formAction}>
              <input type="hidden" name="location_id" value={loc.id} />
              <button type="submit" className={styles.setDefaultButton}>
                Set as default
              </button>
            </form>
          )}
        </div>
      ))}
      {locations.length === 0 && (
        <p className={styles.empty}>
          No locations yet.{" "}
          <a href="/app/warehouse/locations" className={styles.emptyLink}>
            Create locations →
          </a>
        </p>
      )}
    </div>
  );
}
```

Add to `settings/locations/locations.module.css`:

```css
.actionError {
  font-size: var(--fs-sm);
  color: var(--danger);
  padding: 8px 12px;
  background: var(--danger-dim, color-mix(in srgb, var(--danger) 10%, transparent));
  border-radius: var(--radius-md);
}

.emptyLink {
  color: var(--ink-muted);
  text-decoration: underline;
}
.emptyLink:hover { color: var(--ink-strong); }
```

- [ ] **Step 3: Rewrite `settings/locations/page.tsx`**

Replace the entire file content:

```tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerTenantContext } from "@/lib/tenant/context";
import { getSubscriptionAccess } from "@/lib/subscription/access";
import { hasFeature } from "@/lib/plans/features";
import { FeatureUpsell } from "../../_components/feature-upsell";
import PageHeader from "../../_ui/page-header";
import { DefaultLocationPicker } from "./default-location-picker";
import styles from "./locations.module.css";

export default async function LocationsSettingsPage() {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/app/auth/login");
  if (ctx.role !== "admin" && ctx.role !== "super_admin") {
    redirect("/app/settings/profile");
  }

  const { supabase, tenantId } = ctx;

  const access = await getSubscriptionAccess(supabase, tenantId!);
  if (!access.sub || !hasFeature(access.sub, "binManagement")) {
    return (
      <FeatureUpsell
        feature="Multi-location and bin management"
        requiredTier="growth"
      />
    );
  }

  const { data: locations } = await supabase
    .from("location")
    .select("id, name, is_default")
    .eq("tenant_id", tenantId!)
    .order("name", { ascending: true });

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Default Location"
        description="Set the default warehouse location used across the workspace."
        actions={
          <Link href="/app/warehouse/locations" className={styles.manageLink}>
            Manage locations →
          </Link>
        }
      />
      <DefaultLocationPicker locations={locations ?? []} />
    </>
  );
}
```

Add to `settings/locations/locations.module.css`:

```css
.manageLink {
  font-size: var(--fs-sm);
  color: var(--ink-muted);
  text-decoration: none;
}
.manageLink:hover { color: var(--ink-strong); }
```

- [ ] **Step 4: Add settings hint link to warehouse locations page**

In `src/app/app/warehouse/locations/page.tsx`, add a `Link` import and a hint paragraph after the PageHeader. The return block currently is:

```tsx
  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Warehouse"
        title="Locations"
        description="Manage warehouses, sub-locations, aisles, and bays."
      />
      <LocationsTree warehouses={(warehouses ?? []) as Warehouse[]} />
    </div>
  );
```

Replace with:

```tsx
  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Warehouse"
        title="Locations"
        description="Manage warehouses, sub-locations, aisles, and bays."
      />
      <p className={styles.settingsHint}>
        Default location is set in{" "}
        <Link href="/app/settings/locations">Settings → Locations</Link>.
      </p>
      <LocationsTree warehouses={(warehouses ?? []) as Warehouse[]} />
    </div>
  );
```

Add `import Link from "next/link";` at the top of `warehouse/locations/page.tsx`.

Add to `page.module.css`:

```css
.settingsHint {
  font-size: var(--fs-sm);
  color: var(--ink-muted);
  margin: -8px 0 0;
}
.settingsHint a { color: var(--ink-muted); text-decoration: underline; }
.settingsHint a:hover { color: var(--ink-strong); }
```

- [ ] **Step 5: Create `settings/locations/loading.tsx`**

```tsx
import PageHeader from "../../_ui/page-header";
import styles from "./locations.module.css";

export default function LocationsSettingsLoading() {
  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Default Location"
        description="Set the default warehouse location used across the workspace."
      />
      <p className={styles.loadingHint}>Loading locations…</p>
    </>
  );
}
```

Add to `settings/locations/locations.module.css`:

```css
.loadingHint {
  font-size: var(--fs-sm);
  color: var(--ink-faint);
  padding: 12px 0;
}
```

- [ ] **Step 6: Create `settings/locations/error.tsx`**

```tsx
"use client";

import { useEffect } from "react";
import styles from "./locations.module.css";

export default function LocationsSettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => { console.error(error); }, [error]);

  return (
    <div className={styles.errorState}>
      <p className={styles.errorMessage}>Failed to load locations: {error.message}</p>
      <button className={styles.btnRetry} onClick={reset}>Try again</button>
    </div>
  );
}
```

Add to `settings/locations/locations.module.css`:

```css
.errorState {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 24px;
  border: 1px solid var(--stroke-card);
  border-radius: var(--radius-xl);
  background: var(--bg-card);
}
.errorMessage { font-size: var(--fs-sm); color: var(--danger); }
.btnRetry {
  align-self: flex-start;
  font-size: var(--fs-sm);
  color: var(--ink-muted);
  background: none;
  border: 1px solid var(--stroke-strong);
  border-radius: var(--radius-md);
  padding: 4px 12px;
  cursor: pointer;
  font-family: inherit;
}
.btnRetry:hover { color: var(--ink-strong); }
```

- [ ] **Step 7: Verify types**

```powershell
npx tsc --noEmit 2>&1 | Select-String "settings/locations"
```

Expected: no errors.

- [ ] **Step 8: Manual test**

Navigate to `/app/settings/locations`. Confirm:
- Page has "Default Location" heading.
- "Manage locations →" link in the header navigates to `/app/warehouse/locations`.
- Setting a default location works.
- The empty state (if no locations exist) shows "No locations yet. Create locations →" with working link.
- Navigate to `/app/warehouse/locations` — confirm "Default location is set in Settings → Locations" hint is visible.

- [ ] **Step 9: Commit**

```bash
git add src/app/app/settings/locations/page.tsx src/app/app/settings/locations/actions.ts src/app/app/settings/locations/default-location-picker.tsx src/app/app/settings/locations/loading.tsx src/app/app/settings/locations/error.tsx src/app/app/settings/locations/locations.module.css src/app/app/warehouse/locations/page.tsx src/app/app/warehouse/locations/page.module.css
git commit -m "fix(locations): settings subscription gate, nav links, error handling, page titles"
```

---

## Task 4 — Icon button ARIA

**Files:**
- Modify: `src/app/app/warehouse/locations/locations-tree.tsx`

All Unicode icon characters in button labels must be wrapped in `<span aria-hidden="true">` and buttons must have explicit `aria-label` attributes. `InlineForm` gets a `label` prop for Save/Cancel context.

- [ ] **Step 1: Add `label` prop to `InlineForm`**

Replace the `InlineForm` function signature and button renders:

```tsx
function InlineForm({ action, fields, onDone, label = "item" }: {
  action: (fd: FormData) => Promise<unknown>;
  fields: React.ReactNode;
  onDone: () => void;
  label?: string;
}) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  async function submit(fd: FormData) {
    setErr(null);
    try {
      const result = (await action(fd)) as { error?: string } | undefined;
      if (result?.error) { setErr(result.error); return; }
      router.refresh();
      onDone();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Error");
    }
  }
  return (
    <form action={submit} className={styles.inlineForm}>
      {fields}
      {err && <span className={styles.formError}>{err}</span>}
      <button type="submit" className={styles.btnSave} aria-label={`Save ${label}`}>Save</button>
      <button type="button" className={styles.btnCancel} onClick={onDone} aria-label={`Cancel editing ${label}`}>Cancel</button>
    </form>
  );
}
```

- [ ] **Step 2: Update warehouse row buttons**

Find the warehouse header row buttons (inside `{editingWh === wh.id ? ... :` block). Replace the three icon buttons:

```tsx
                <button className={styles.btnIcon} onClick={() => { setAddingSl(wh.id); setCollapsedWh(s => { const n = new Set(s); n.delete(wh.id); return n; }); }}>⊕ Sub-loc</button>
                <button className={styles.btnIcon} onClick={() => setBarcode({ id: wh.id, type: "Warehouse", name: wh.name, path: wh.name })}>▦ Barcode</button>
                <button className={styles.btnIcon} onClick={() => setEditingWh(wh.id)}>✎ Edit</button>
```

with:

```tsx
                <button className={styles.btnIcon} aria-label={`Add sub-location to ${wh.name}`} onClick={() => { setAddingSl(wh.id); setCollapsedWh(s => { const n = new Set(s); n.delete(wh.id); return n; }); }}><span aria-hidden="true">⊕</span> Sub-loc</button>
                <button className={styles.btnIcon} aria-label={`Print barcode for ${wh.name}`} onClick={() => setBarcode({ id: wh.id, type: "Warehouse", name: wh.name, path: wh.name })}><span aria-hidden="true">▦</span> Barcode</button>
                <button className={styles.btnIcon} aria-label={`Edit warehouse ${wh.name}`} onClick={() => setEditingWh(wh.id)}><span aria-hidden="true">✎</span> Edit</button>
```

Also update the warehouse `InlineForm` to pass `label`:

```tsx
              <InlineForm action={editWarehouse} onDone={() => setEditingWh(null)} label={`warehouse ${wh.name}`} fields={<>
```

And the add sub-location `InlineForm`:

```tsx
                    <InlineForm action={addSubLocation} onDone={() => setAddingSl(null)} label="new sub-location" fields={<>
```

- [ ] **Step 3: Update sub-location row buttons**

Find the sub-location row buttons. Replace:

```tsx
                          <button className={styles.btnIcon} onClick={() => { setAddingAisle(sl.id); setCollapsedSl(s => { const n = new Set(s); n.delete(sl.id); return n; }); }}>⊕ Aisle</button>
                          <button className={styles.btnIcon} onClick={() => setBarcode({ id: sl.id, type: "Sub-location", name: sl.name, path: `${wh.name} · ${sl.name}` })}>▦ Barcode</button>
                          <button className={styles.btnIcon} onClick={() => setEditingSl(sl.id)}>✎ Edit</button>
```

with:

```tsx
                          <button className={styles.btnIcon} aria-label={`Add aisle to ${sl.name}`} onClick={() => { setAddingAisle(sl.id); setCollapsedSl(s => { const n = new Set(s); n.delete(sl.id); return n; }); }}><span aria-hidden="true">⊕</span> Aisle</button>
                          <button className={styles.btnIcon} aria-label={`Print barcode for ${sl.name}`} onClick={() => setBarcode({ id: sl.id, type: "Sub-location", name: sl.name, path: `${wh.name} · ${sl.name}` })}><span aria-hidden="true">▦</span> Barcode</button>
                          <button className={styles.btnIcon} aria-label={`Edit sub-location ${sl.name}`} onClick={() => setEditingSl(sl.id)}><span aria-hidden="true">✎</span> Edit</button>
```

Update the edit sub-location `InlineForm` to pass `label`:

```tsx
                          <InlineForm action={editSubLocation} onDone={() => setEditingSl(null)} label={`sub-location ${sl.name}`} fields={<>
```

Update the add aisle `InlineForm`:

```tsx
                              <InlineForm action={addAisle} onDone={() => setAddingAisle(null)} label="new aisle" fields={<>
```

Also update the empty hint that contains a Unicode character:

```tsx
                          {aisles.length === 0 && addingAisle !== sl.id && (
                            <p className={styles.emptyHintSl}>No aisles — click <span aria-hidden="true">⊕</span> Aisle to add one.</p>
                          )}
```

- [ ] **Step 4: Update aisle row buttons**

Find the aisle row buttons. Replace:

```tsx
                                    <button className={styles.btnIcon} onClick={() => { setAddingBay(aisle.id); setCollapsedAisle(s => { const n = new Set(s); n.delete(aisle.id); return n; }); }}>⊕ Bay</button>
                                    <button className={styles.btnIcon} onClick={() => setBarcode({ id: aisle.id, type: "Aisle", name: aisle.name, path: `${wh.name} · ${sl.name} · ${aisle.name}` })}>▦ Barcode</button>
                                    <button className={styles.btnIcon} onClick={() => setEditingAisle(aisle.id)}>✎ Edit</button>
```

with:

```tsx
                                    <button className={styles.btnIcon} aria-label={`Add bay to ${aisle.name}`} onClick={() => { setAddingBay(aisle.id); setCollapsedAisle(s => { const n = new Set(s); n.delete(aisle.id); return n; }); }}><span aria-hidden="true">⊕</span> Bay</button>
                                    <button className={styles.btnIcon} aria-label={`Print barcode for ${aisle.name}`} onClick={() => setBarcode({ id: aisle.id, type: "Aisle", name: aisle.name, path: `${wh.name} · ${sl.name} · ${aisle.name}` })}><span aria-hidden="true">▦</span> Barcode</button>
                                    <button className={styles.btnIcon} aria-label={`Edit aisle ${aisle.name}`} onClick={() => setEditingAisle(aisle.id)}><span aria-hidden="true">✎</span> Edit</button>
```

Update the edit aisle `InlineForm` label:

```tsx
                                  <InlineForm action={editAisle} onDone={() => setEditingAisle(null)} label={`aisle ${aisle.name}`} fields={<>
```

Update the add bay `InlineForm`:

```tsx
                                      <InlineForm action={addBay} onDone={() => setAddingBay(null)} label="new bay" fields={<>
```

- [ ] **Step 5: Update bay row buttons**

Find the bay row buttons. Replace:

```tsx
                                        <button className={styles.btnIcon} onClick={() => setBarcode({ id: bay.id, type: "Bay", name: bay.name, path: `${wh.name} · ${sl.name} · ${aisle.name} · ${bay.name}` })}>▦ Barcode</button>
                                        <button className={styles.btnIcon} onClick={() => setEditingBay(bay.id)}>✎ Edit</button>
```

with:

```tsx
                                        <button className={styles.btnIcon} aria-label={`Print barcode for ${bay.name}`} onClick={() => setBarcode({ id: bay.id, type: "Bay", name: bay.name, path: `${wh.name} · ${sl.name} · ${aisle.name} · ${bay.name}` })}><span aria-hidden="true">▦</span> Barcode</button>
                                        <button className={styles.btnIcon} aria-label={`Edit bay ${bay.name}`} onClick={() => setEditingBay(bay.id)}><span aria-hidden="true">✎</span> Edit</button>
```

Update the edit bay `InlineForm` label:

```tsx
                                      <InlineForm action={editBay} onDone={() => setEditingBay(null)} label={`bay ${bay.name}`} fields={<>
```

- [ ] **Step 6: Update "Add Warehouse" button**

Replace:

```tsx
            <button className={styles.btnAddWarehouse} onClick={() => setAddingWh(true)}>⊕ Add Warehouse</button>
```

with:

```tsx
            <button className={styles.btnAddWarehouse} aria-label="Add warehouse" onClick={() => setAddingWh(true)}><span aria-hidden="true">⊕</span> Add Warehouse</button>
```

Update the add warehouse `InlineForm`:

```tsx
          <InlineForm action={addWarehouse} onDone={() => setAddingWh(false)} label="new warehouse" fields={
```

- [ ] **Step 7: Verify types**

```powershell
npx tsc --noEmit 2>&1 | Select-String "locations-tree"
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/app/app/warehouse/locations/locations-tree.tsx
git commit -m "fix(locations): aria-label on all icon buttons, aria-hidden on Unicode chars"
```

---

## Task 5 — Barcode modal → native `<dialog>`

**Files:**
- Modify: `src/app/app/warehouse/locations/barcode-modal.tsx`
- Modify: `src/app/app/warehouse/locations/page.module.css`

- [ ] **Step 1: Rewrite `barcode-modal.tsx`**

Replace the entire file:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./page.module.css";

interface Props {
  entityId: string;
  entityType: string;
  entityName: string;
  path: string;
  onClose: () => void;
}

export function BarcodeModal({ entityId, entityType, entityName, path, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const printSvgRef = useRef<SVGSVGElement>(null);
  const [copied, setCopied] = useState(false);
  const [barcodeError, setBarcodeError] = useState(false);
  const shortCode = entityId.replace(/-/g, "").slice(-6).toUpperCase();

  // Open dialog on mount
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  // Wire native cancel event (Escape key) to onClose
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    const handler = () => onClose();
    el.addEventListener("cancel", handler);
    return () => el.removeEventListener("cancel", handler);
  }, [onClose]);

  // Generate barcode
  useEffect(() => {
    setBarcodeError(false);
    import("jsbarcode")
      .then((mod) => {
        const JsBarcode = mod.default;
        try {
          if (svgRef.current) JsBarcode(svgRef.current, shortCode, { format: "CODE128", displayValue: false, margin: 0, width: 2.5, height: 64 });
          if (printSvgRef.current) JsBarcode(printSvgRef.current, shortCode, { format: "CODE128", displayValue: false, margin: 0, width: 2, height: 40 });
        } catch {
          setBarcodeError(true);
        }
      })
      .catch(() => setBarcodeError(true));
  }, [shortCode]);

  function handleCopyCode() {
    navigator.clipboard.writeText(shortCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.modal}
      aria-labelledby="barcode-modal-title"
    >
      <button
        className={styles.modalClose}
        aria-label="Close barcode modal"
        onClick={onClose}
      >
        <span aria-hidden="true">✕</span>
      </button>
      <div className={styles.modalType}>{entityType}</div>
      <div id="barcode-modal-title" className={styles.modalName}>{entityName}</div>
      <div className={styles.modalPath}>{path}</div>

      <div className={styles.barcodeBox}>
        {barcodeError ? (
          <p className={styles.barcodeFallback}>Could not generate barcode.</p>
        ) : (
          <svg ref={svgRef} />
        )}
        <div className={styles.shortCode2}>{shortCode}</div>
        <div className={styles.shortCodeLabel}>location code</div>
        <button
          type="button"
          className={styles.btnCopyCode}
          aria-label="Copy location code to clipboard"
          onClick={handleCopyCode}
        >
          {copied ? "Copied!" : "Copy code"}
        </button>
      </div>

      <div className={styles.modalActions}>
        <button className={styles.btnSave} onClick={() => window.print()}>Print Label</button>
      </div>

      {/* Print-only label */}
      <div className={styles.printLabel}>
        <div className={styles.printPath}>{path}</div>
        <div className={styles.printName}>{entityName}</div>
        {!barcodeError && <svg ref={printSvgRef} />}
        <div className={styles.printCode}>{shortCode}</div>
      </div>
    </dialog>
  );
}
```

- [ ] **Step 2: Update `page.module.css` — modal and backdrop**

Find the `.modalOverlay` rule in `page.module.css`. Replace it with a `dialog::backdrop` rule and update `.modal` to stand alone:

Find and replace the overlay rule. It will look something like:

```css
.modalOverlay {
  position: fixed;
  inset: 0;
  background: var(--bg-overlay);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
```

Remove `.modalOverlay` entirely and add to `.modal`:

```css
.modal::backdrop {
  background: var(--bg-overlay, rgba(0, 0, 0, 0.45));
}
```

Also update `.modalPath` to be more prominent:

Find the existing `.modalPath` rule and update it to:

```css
.modalPath {
  font-size: var(--fs-sm);
  color: var(--ink-muted);
  font-weight: var(--fw-semibold);
  margin-bottom: 4px;
}
```

- [ ] **Step 3: Add new CSS rules to `page.module.css`**

Append to `page.module.css`:

```css
/* ── Barcode modal additions ──────────────────────────── */

.barcodeFallback {
  font-size: var(--fs-sm);
  color: var(--ink-faint);
  font-style: italic;
  padding: 16px 0;
  text-align: center;
}

.btnCopyCode {
  margin-top: 6px;
  font-size: var(--fs-xs);
  color: var(--ink-muted);
  background: none;
  border: 1px solid var(--stroke-strong);
  border-radius: var(--radius-md);
  padding: 3px 10px;
  cursor: pointer;
  font-family: inherit;
  transition: color 0.15s;
}
.btnCopyCode:hover { color: var(--ink-strong); }
```

- [ ] **Step 4: Verify types**

```powershell
npx tsc --noEmit 2>&1 | Select-String "barcode-modal"
```

Expected: no errors.

- [ ] **Step 5: Manual test**

Navigate to locations. Open a barcode modal. Verify:
- Modal opens correctly (not broken layout).
- Escape key closes it.
- Clicking outside the modal area closes it (click on backdrop).
- Close button (✕) closes it.
- "Copy code" button copies the short code to clipboard and briefly shows "Copied!".
- "Print Label" still works.
- Full path is clearly readable.

- [ ] **Step 6: Commit**

```bash
git add src/app/app/warehouse/locations/barcode-modal.tsx src/app/app/warehouse/locations/page.module.css
git commit -m "fix(locations): convert barcode modal to native dialog, add copy code and fallback"
```

---

## Task 6 — Confirmation dialogs

**Files:**
- Modify: `src/app/app/warehouse/locations/locations-tree.tsx`
- Modify: `src/app/app/warehouse/locations/page.module.css`

Replace `window.confirm()` in `AisleDeleteButton` with a native `<dialog>` confirmation, and add confirmation to `SimpleDeleteButton`.

- [ ] **Step 1: Add CSS for confirmation dialogs**

Append to `page.module.css`:

```css
/* ── Confirmation dialogs ─────────────────────────────── */

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

.confirmDialog::backdrop {
  background: var(--bg-overlay, rgba(0, 0, 0, 0.45));
}

.confirmActions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.btnDanger {
  background: var(--danger);
  border: 1px solid var(--danger);
  color: #fff;
  border-radius: 5px;
  padding: 5px 14px;
  font-size: var(--fs-sm);
  cursor: pointer;
  font-family: inherit;
}
.btnDanger:hover { opacity: 0.85; }
```

- [ ] **Step 2: Add `ConfirmDialog` component to `locations-tree.tsx`**

Add this new component immediately after the `InlineForm` function (before `AisleDeleteButton`):

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
          onClick={() => {
            dialogRef.current?.close();
            onConfirm();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
```

- [ ] **Step 3: Rewrite `AisleDeleteButton`**

Replace the entire `AisleDeleteButton` function:

```tsx
function AisleDeleteButton({ aisleId, aisleName }: { aisleId: string; aisleName: string }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [bayCount, setBayCount] = useState<number>(0);
  const dialogRef = useRef<HTMLDialogElement>(null);

  async function handleDelete() {
    setErr(null);
    const fd = new FormData();
    fd.append("id", aisleId);
    const result = await deleteAisle(fd) as { error?: string; bayCount?: number };
    if (result?.error) { setErr(result.error); return; }
    if (result?.bayCount) {
      setBayCount(result.bayCount);
      dialogRef.current?.showModal();
      return;
    }
    router.refresh();
  }

  async function confirmCascade() {
    const fd = new FormData();
    fd.append("id", aisleId);
    fd.append("confirmed", "true");
    const result = await deleteAisle(fd) as { error?: string };
    if (result?.error) { setErr(result.error); return; }
    router.refresh();
  }

  return (
    <span>
      <button
        type="button"
        className={styles.btnDelete}
        aria-label={`Delete aisle ${aisleName}`}
        onClick={handleDelete}
      >
        <span aria-hidden="true">✕</span> Delete
      </button>
      {err && <span className={styles.deleteError}>{err}</span>}
      <ConfirmDialog
        dialogRef={dialogRef}
        message={`This aisle has ${bayCount} bay(s) that will also be deleted. Continue?`}
        confirmLabel="Delete aisle and bays"
        onConfirm={confirmCascade}
      />
    </span>
  );
}
```

- [ ] **Step 4: Rewrite `SimpleDeleteButton`**

Replace the entire `SimpleDeleteButton` function:

```tsx
function SimpleDeleteButton({ id, entityName, entityType, action }: {
  id: string;
  entityName: string;
  entityType: string;
  action: (fd: FormData) => Promise<{ error?: string }>;
}) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  async function handleConfirm() {
    setErr(null);
    const fd = new FormData();
    fd.append("id", id);
    const result = await action(fd);
    if (result?.error) { setErr(result.error); return; }
    router.refresh();
  }

  return (
    <span>
      <button
        type="button"
        className={styles.btnDelete}
        aria-label={`Delete ${entityType} ${entityName}`}
        onClick={() => dialogRef.current?.showModal()}
      >
        <span aria-hidden="true">✕</span> Delete
      </button>
      {err && <span className={styles.deleteError}>{err}</span>}
      <ConfirmDialog
        dialogRef={dialogRef}
        message={`Delete this ${entityType}? This cannot be undone.`}
        onConfirm={handleConfirm}
      />
    </span>
  );
}
```

- [ ] **Step 5: Update all `AisleDeleteButton` and `SimpleDeleteButton` callsites**

Find the sub-location row's `<SimpleDeleteButton>`:

```tsx
                          <SimpleDeleteButton id={sl.id} action={deleteSubLocation} />
```

Replace with:

```tsx
                          <SimpleDeleteButton id={sl.id} entityName={sl.name} entityType="sub-location" action={deleteSubLocation} />
```

Find the aisle row's `<AisleDeleteButton>`:

```tsx
                                    <AisleDeleteButton aisleId={aisle.id} />
```

Replace with:

```tsx
                                    <AisleDeleteButton aisleId={aisle.id} aisleName={aisle.name} />
```

Find the bay row's `<SimpleDeleteButton>`:

```tsx
                                        <SimpleDeleteButton id={bay.id} action={deleteBay} />
```

Replace with:

```tsx
                                        <SimpleDeleteButton id={bay.id} entityName={bay.name} entityType="bay" action={deleteBay} />
```

- [ ] **Step 6: Add `useRef` to the `useRouter` import line**

`useRef` is now needed in `AisleDeleteButton` and `SimpleDeleteButton`. Check that `useRef` is already in the imports at the top of `locations-tree.tsx`. The current import is:

```tsx
import { useState } from "react";
```

Replace with:

```tsx
import { useRef, useState } from "react";
```

- [ ] **Step 7: Verify types**

```powershell
npx tsc --noEmit 2>&1 | Select-String "locations-tree"
```

Expected: no errors.

- [ ] **Step 8: Manual test**

Navigate to locations. Verify:
- Deleting a sub-location (with no components) shows a confirmation dialog. Cancel aborts. Delete proceeds.
- Deleting an aisle with bays shows "This aisle has N bay(s) that will also be deleted." Cancel aborts. Confirm deletes.
- Deleting a bay shows confirmation. Cancel aborts. Delete proceeds.
- No `window.confirm()` browser dialogs appear anywhere.

- [ ] **Step 9: Commit**

```bash
git add src/app/app/warehouse/locations/locations-tree.tsx src/app/app/warehouse/locations/page.module.css
git commit -m "fix(locations): replace window.confirm with native dialog, add delete confirmation to sub-locs and bays"
```

---

## Task 7 — Component count badges

**Files:**
- Modify: `src/app/app/warehouse/locations/page.tsx`
- Modify: `src/app/app/warehouse/locations/locations-tree.tsx`

- [ ] **Step 1: Update the page query to also fetch component location data**

In `src/app/app/warehouse/locations/page.tsx`, find the existing data fetch:

```ts
  const { data: warehouses, error } = await supabase
    .from("location")
    .select(`
      id, name, is_default,
      sub_locations:bin_sub_location(id, name),
      aisles:bin_aisle(id, name, sub_location_id, bays:bin_bay(id, name, aisle_id))
    `)
    .eq("tenant_id", tenantId)
    .order("name");

  if (error) return <p className={styles.error}>Failed to load locations: {error.message}</p>;
```

Replace with:

```ts
  const [warehousesResult, compLocResult] = await Promise.all([
    supabase
      .from("location")
      .select(`
        id, name, is_default,
        sub_locations:bin_sub_location(id, name),
        aisles:bin_aisle(id, name, sub_location_id, bays:bin_bay(id, name, aisle_id))
      `)
      .eq("tenant_id", tenantId)
      .order("name"),
    supabase
      .from("component")
      .select("bin_sub_location_id, bin_aisle_id, bin_bay_id")
      .eq("tenant_id", tenantId)
      .is("archived_at", null),
  ]);

  if (warehousesResult.error) return <p className={styles.error}>Failed to load locations: {warehousesResult.error.message}</p>;

  const componentCounts: Record<string, number> = {};
  for (const row of compLocResult.data ?? []) {
    if (row.bin_sub_location_id) componentCounts[row.bin_sub_location_id] = (componentCounts[row.bin_sub_location_id] ?? 0) + 1;
    if (row.bin_aisle_id) componentCounts[row.bin_aisle_id] = (componentCounts[row.bin_aisle_id] ?? 0) + 1;
    if (row.bin_bay_id) componentCounts[row.bin_bay_id] = (componentCounts[row.bin_bay_id] ?? 0) + 1;
  }
```

- [ ] **Step 2: Pass `componentCounts` to `LocationsTree`**

Find:

```tsx
      <LocationsTree warehouses={(warehouses ?? []) as Warehouse[]} />
```

Replace with:

```tsx
      <LocationsTree warehouses={(warehousesResult.data ?? []) as Warehouse[]} componentCounts={componentCounts} />
```

- [ ] **Step 3: Add `componentCounts` prop to `LocationsTree`**

Find the `LocationsTree` function signature:

```tsx
export function LocationsTree({ warehouses }: { warehouses: Warehouse[] }) {
```

Replace with:

```tsx
export function LocationsTree({ warehouses, componentCounts = {} }: { warehouses: Warehouse[]; componentCounts?: Record<string, number> }) {
```

- [ ] **Step 4: Add component count badge to sub-location rows**

Find the sub-location row that shows the aisle count tag:

```tsx
                          <span className={styles.countTag}>{aisles.length} aisle{aisles.length !== 1 ? "s" : ""}</span>
```

Add the component count badge immediately after it:

```tsx
                          <span className={styles.countTag}>{aisles.length} aisle{aisles.length !== 1 ? "s" : ""}</span>
                          {(componentCounts[sl.id] ?? 0) > 0 && (
                            <span className={styles.countTag}>{componentCounts[sl.id]} component{componentCounts[sl.id] !== 1 ? "s" : ""}</span>
                          )}
```

- [ ] **Step 5: Add component count badge to aisle rows**

Find the aisle row that shows the bay count tag:

```tsx
                                    <span className={styles.countTag}>{bays.length} bay{bays.length !== 1 ? "s" : ""}</span>
```

Add the component count badge immediately after it:

```tsx
                                    <span className={styles.countTag}>{bays.length} bay{bays.length !== 1 ? "s" : ""}</span>
                                    {(componentCounts[aisle.id] ?? 0) > 0 && (
                                      <span className={styles.countTag}>{componentCounts[aisle.id]} component{componentCounts[aisle.id] !== 1 ? "s" : ""}</span>
                                    )}
```

- [ ] **Step 6: Add component count badge to bay rows**

Find the bay row content (inside the non-editing branch):

```tsx
                                        <span className={styles.levelTagBay}>Bay</span>
                                        <span className={styles.entityName}>{bay.name}</span>
                                        <span className={styles.shortCode}>{shortCode(bay.id)}</span>
```

Add component count after the entity name:

```tsx
                                        <span className={styles.levelTagBay}>Bay</span>
                                        <span className={styles.entityName}>{bay.name}</span>
                                        {(componentCounts[bay.id] ?? 0) > 0 && (
                                          <span className={styles.countTag}>{componentCounts[bay.id]} component{componentCounts[bay.id] !== 1 ? "s" : ""}</span>
                                        )}
                                        <span className={styles.shortCode}>{shortCode(bay.id)}</span>
```

- [ ] **Step 7: Verify types**

```powershell
npx tsc --noEmit 2>&1 | Select-String "warehouse/locations"
```

Expected: no errors.

- [ ] **Step 8: Manual test**

Navigate to locations. Assign a component to a sub-location/aisle/bay (via the component detail page). Confirm the count badge appears on the relevant tree nodes. Confirm nodes with zero components show no badge.

- [ ] **Step 9: Commit**

```bash
git add src/app/app/warehouse/locations/page.tsx src/app/app/warehouse/locations/locations-tree.tsx
git commit -m "feat(locations): show component count badges on tree nodes"
```

---

## Task 8 — Expand All / Collapse All

**Files:**
- Modify: `src/app/app/warehouse/locations/locations-tree.tsx`
- Modify: `src/app/app/warehouse/locations/page.module.css`

- [ ] **Step 1: Add CSS for expand/collapse buttons**

Append to `page.module.css`:

```css
/* ── Expand / Collapse all ────────────────────────────── */

.btnExpandCollapse {
  font-size: var(--fs-xs);
  color: var(--ink-muted);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0 4px;
  font-family: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.btnExpandCollapse:hover { color: var(--ink-strong); }
```

- [ ] **Step 2: Add expand/collapse handlers in `LocationsTree`**

Inside the `LocationsTree` function body, after the state declarations (`const [collapsedAisle, ...]`), add:

```tsx
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

- [ ] **Step 3: Add Expand all / Collapse all buttons to warehouse header row**

Find the warehouse header row buttons (in the non-editing branch). After the `✎ Edit` button and before the closing `</div>` of the warehouse row, add:

```tsx
                <button className={styles.btnExpandCollapse} onClick={() => expandAll(wh)}>Expand all</button>
                <button className={styles.btnExpandCollapse} onClick={() => collapseAll(wh)}>Collapse all</button>
```

The complete warehouse action buttons section should now read:

```tsx
                <button className={styles.btnIcon} aria-label={`Add sub-location to ${wh.name}`} onClick={() => { setAddingSl(wh.id); setCollapsedWh(s => { const n = new Set(s); n.delete(wh.id); return n; }); }}><span aria-hidden="true">⊕</span> Sub-loc</button>
                <button className={styles.btnIcon} aria-label={`Print barcode for ${wh.name}`} onClick={() => setBarcode({ id: wh.id, type: "Warehouse", name: wh.name, path: wh.name })}><span aria-hidden="true">▦</span> Barcode</button>
                <button className={styles.btnIcon} aria-label={`Edit warehouse ${wh.name}`} onClick={() => setEditingWh(wh.id)}><span aria-hidden="true">✎</span> Edit</button>
                <button className={styles.btnExpandCollapse} onClick={() => expandAll(wh)}>Expand all</button>
                <button className={styles.btnExpandCollapse} onClick={() => collapseAll(wh)}>Collapse all</button>
```

- [ ] **Step 4: Verify types**

```powershell
npx tsc --noEmit 2>&1 | Select-String "locations-tree"
```

Expected: no errors.

- [ ] **Step 5: Manual test**

Navigate to a warehouse with multiple sub-locations and aisles. Manually collapse a few nodes, then click "Expand all" — all sub-locations and aisles in that warehouse should open. Click "Collapse all" — all should close (including the warehouse itself).

Verify that "Expand all" / "Collapse all" on one warehouse does not affect another warehouse's collapsed state.

- [ ] **Step 6: Commit**

```bash
git add src/app/app/warehouse/locations/locations-tree.tsx src/app/app/warehouse/locations/page.module.css
git commit -m "feat(locations): expand all / collapse all per warehouse"
```

---

## Self-Review

**Spec coverage:**
- ✅ Section 1 (action validation) — Task 1
- ✅ Section 2 (page title, loading/error, settings gate) — Task 2 + Task 3
- ✅ Section 3 (icon button ARIA) — Task 4
- ✅ Section 4 (barcode modal dialog, copy code, fallback, path prominence) — Task 5
- ✅ Section 5 (confirmation dialogs, ConfirmDialog primitive, cascade-delete, simple-delete) — Task 6
- ✅ Section 6 (component count badges) — Task 7
- ✅ Section 7 (expand/collapse all) — Task 8
- ✅ Section 8a (settings → management link) — Task 3 Step 3
- ✅ Section 8b (management → settings link) — Task 3 Step 4
- ✅ Section 8c (settings action error display, DefaultLocationPicker) — Task 3 Steps 1-2

**Placeholder scan:** None. Every step has complete code.

**Type consistency:**
- `ConfirmDialog` defined in Task 6 Step 2 uses `dialogRef: React.RefObject<HTMLDialogElement>` — same type used in `AisleDeleteButton` and `SimpleDeleteButton` via `useRef<HTMLDialogElement>(null)`. ✅
- `componentCounts: Record<string, number>` defined in Task 7 Step 1, typed in Step 3, used in Steps 4-6. ✅
- `expandAll(wh: Warehouse)` / `collapseAll(wh: Warehouse)` in Task 8 reference `Warehouse` type defined at top of `locations-tree.tsx`. ✅
- `AisleDeleteButton` gains `aisleName` prop in Task 6 Step 3 and callsite is updated in Step 5. ✅
- `SimpleDeleteButton` gains `entityName` and `entityType` props in Task 6 Step 4 and all callsites updated in Step 5. ✅
- `useRef` import added in Task 6 Step 6 — needed for `AisleDeleteButton` and `SimpleDeleteButton`. ✅
