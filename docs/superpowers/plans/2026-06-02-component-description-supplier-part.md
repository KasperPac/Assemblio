# Component Description & Supplier Part Number Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `description` field to components and surface `supplier_part_number` during component creation and CSV import, automatically creating a `supplier_components` row (with `is_preferred = true`) whenever a supplier is selected.

**Architecture:** One DB patch adds `description text` to the `component` table. The `createComponent` server action gains two new fields and a post-insert upsert to `supplier_components`. The `updateComponent` action gains `description`. Three UI files (create form, edit form, detail page) are updated. The CSV import template and commit phase are extended with the two new columns.

**Tech Stack:** Next.js 15 App Router server actions, Supabase Postgres upsert, React `useState` for conditional field visibility.

---

## File Map

| File | Change |
|---|---|
| `supabase/patches/component_description_and_supplier_part.sql` | New — `description text` column on `component` |
| `src/app/app/components/actions.ts` | Add `description` + `supplier_part_number` to `createComponent`; add `description` to `updateComponent` |
| `src/app/app/components/[componentId]/page.tsx` | Add `description` to `ComponentRecord` type, Supabase select, and detail card render |
| `src/app/app/components/component-create-form.tsx` | Add Description textarea, controlled supplier select, conditional Supplier Part Number input |
| `src/app/app/components/component-edit-form.tsx` | Add Description textarea + `description` to `InitialValues` type |
| `src/app/app/components/import/page.tsx` | Update `TEMPLATE_CSV` with two new columns |
| `src/app/api/import/components/route.ts` | Read `description` + `supplier_part_number` from rows; upsert `supplier_components` after commit |

---

### Task 1: DB migration — add `description` column

**Goal:** Add a nullable `description text` column to the `component` table.

**Files:**
- Create: `supabase/patches/component_description_and_supplier_part.sql`

**Acceptance Criteria:**
- [ ] File contains `alter table public.component add column if not exists description text`
- [ ] File committed to git

**Verify:** File exists at `supabase/patches/component_description_and_supplier_part.sql`. Apply via Supabase Studio SQL Editor and confirm column appears in table editor.

**Steps:**

- [ ] **Step 1: Create the SQL patch**

Create `supabase/patches/component_description_and_supplier_part.sql`:

```sql
-- Component description and supplier part number entry
--
-- Adds description column to component.
-- supplier_part_number already exists on supplier_components — no schema change needed there.

alter table public.component
  add column if not exists description text;
```

- [ ] **Step 2: Apply via Supabase Studio**

Paste the SQL into Supabase Studio → SQL Editor → Run.

- [ ] **Step 3: Commit**

```bash
git add supabase/patches/component_description_and_supplier_part.sql
git commit -m "feat(db): add description column to component table"
```

---

### Task 2: Update `createComponent` and `updateComponent` server actions

**Goal:** `createComponent` reads `description` and `supplier_part_number`, includes `description` in the component insert, and upserts a `supplier_components` row when a supplier is selected. `updateComponent` reads and saves `description`.

**Files:**
- Modify: `src/app/app/components/actions.ts`

**Acceptance Criteria:**
- [ ] `createComponent` includes `description` in the `component` insert payload
- [ ] `createComponent` upserts `supplier_components` when `supplierId` is non-null, with `supplier_part_number` and `is_preferred = true`, touching only those two fields on conflict
- [ ] `updateComponent` reads `description` from formData, includes it in the `component` update payload, fetches it in the before-snapshot, and logs it in before/after metadata
- [ ] `npx tsc --noEmit` passes

**Verify:** `npx tsc --noEmit` → no output

**Steps:**

- [ ] **Step 1: Update `createComponent`**

In `src/app/app/components/actions.ts`, find `createComponent`. Make the following changes:

Add two new field extractions after the existing `groupId` line:
```typescript
const description = formData.get("description")?.toString().trim() || null;
const supplierPartNumber = formData.get("supplier_part_number")?.toString().trim() || null;
```

Add `description` to the component insert payload (after `group_id`):
```typescript
const { data: newComponent, error } = await supabase
  .from("component")
  .insert({
    tenant_id: tenantId,
    name,
    sku: sku || null,
    unit: unit || null,
    reorder_point: reorderPoint,
    low_stock_level: lowStockLevel,
    cost_per_unit: costPerUnit,
    supplier_id: supplierId,
    location_id: locationId,
    group_id: groupId,
    description,
  })
  .select("id")
  .single();

if (error) return { error: error.message };
```

> **Note:** Change the existing `.insert({...})` to `.insert({...}).select("id").single()` so you get the new component's ID back. The existing code uses `const { error } = ...` — change to `const { data: newComponent, error } = ...`.

After the insert success check (`if (error) return ...`), add the `supplier_components` upsert:

```typescript
// Upsert supplier_components when supplier is selected
if (supplierId && newComponent?.id) {
  const { error: scErr } = await supabase
    .from("supplier_components")
    .upsert(
      {
        tenant_id: tenantId,
        supplier_id: supplierId,
        component_id: newComponent.id,
        supplier_part_number: supplierPartNumber,
        is_preferred: true,
      },
      { onConflict: "tenant_id,supplier_id,component_id", ignoreDuplicates: false }
    );
  // Log but don't fail component creation if the upsert errors
  if (scErr) console.error("supplier_components upsert failed:", scErr.message);
}
```

- [ ] **Step 2: Update `updateComponent`**

In the same file, find `updateComponent`. Make these changes:

Add `description` extraction after `groupId`:
```typescript
const description = formData.get("description")?.toString().trim() || null;
```

In the `.select(...)` that fetches the current snapshot, add `description`:
```typescript
const { data: current } = await supabase
  .from("component")
  .select("name, sku, unit, cost_per_unit, reorder_point, low_stock_level, supplier_id, group_id, description")
  .eq("id", componentId)
  .eq("tenant_id", tenantId)
  .maybeSingle();
```

In the `.update({...})` call, add `description`:
```typescript
const { error } = await supabase
  .from("component")
  .update({
    name,
    sku: sku || null,
    unit: unit || null,
    cost_per_unit: costPerUnit,
    reorder_point: reorderPoint,
    low_stock_level: lowStockLevel,
    supplier_id: supplierId,
    group_id: groupId,
    description,
  })
  .eq("id", componentId)
  .eq("tenant_id", tenantId);
```

In the activity_log insert, add `description` to both `before` and `after` objects:
```typescript
metadata: {
  component_id: componentId,
  before: {
    name: current.name,
    sku: current.sku,
    unit: current.unit,
    cost_per_unit: current.cost_per_unit,
    reorder_point: current.reorder_point,
    low_stock_level: current.low_stock_level,
    supplier_id: current.supplier_id,
    group_id: current.group_id,
    description: current.description,        // ← add
  },
  after: {
    name,
    sku: sku || null,
    unit: unit || null,
    cost_per_unit: costPerUnit,
    reorder_point: reorderPoint,
    low_stock_level: lowStockLevel,
    supplier_id: supplierId,
    group_id: groupId,
    description,                              // ← add
  },
},
```

- [ ] **Step 3: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no output (no errors)

- [ ] **Step 4: Commit**

```bash
git add src/app/app/components/actions.ts
git commit -m "feat(components): add description and supplier_part_number to createComponent; add description to updateComponent"
```

---

### Task 3: Update create form, edit form, and detail page

**Goal:** Add Description textarea to create and edit forms; add conditional Supplier Part Number input to create form (shown when a supplier is selected); render `description` on the component detail page.

**Files:**
- Modify: `src/app/app/components/component-create-form.tsx`
- Modify: `src/app/app/components/component-edit-form.tsx`
- Modify: `src/app/app/components/[componentId]/page.tsx`

**Acceptance Criteria:**
- [ ] Description textarea in create form, positioned below Name and above SKU+Unit
- [ ] Supplier Part Number text input in create form, rendered only when a supplier is selected
- [ ] Description textarea in edit form, positioned below Name and above SKU+Unit, pre-populated from `initialValues.description`
- [ ] `ComponentRecord` type includes `description: string | null`
- [ ] `description` is in the Supabase select string for the component query
- [ ] Description text rendered in the detail page info card when non-null
- [ ] `npx tsc --noEmit` passes

**Verify:** `npx tsc --noEmit` → no output. Then `npm run dev` and manually confirm:
- Create form shows Description + conditional Supplier Part Number
- Edit form shows Description pre-populated
- Detail page shows description text

**Steps:**

- [ ] **Step 1: Update `component-create-form.tsx`**

Open `src/app/app/components/component-create-form.tsx`.

**a) Add `useState` import** (already has `useActionState`, `useRef`, `useState` — check; if `useState` isn't imported, add it):
```typescript
import { useActionState, useRef, useState } from "react";
```

**b) Add `selectedSupplierId` state** inside the component function, after existing state declarations:
```typescript
const [selectedSupplierId, setSelectedSupplierId] = useState("");
```

Also reset it when the form key changes (the dialog reopens). Add to the effect or the formKey reset handler — find the `setFormKey` call and add `setSelectedSupplierId("")` alongside it:
```typescript
// When opening the dialog (wherever setFormKey is called):
setFormKey((k) => k + 1);
setSelectedSupplierId("");   // ← add this line
```

**c) Add Description textarea** — insert between the Name field and the SKU+Unit fieldRow. The Name field ends at approximately line 116 with `</label>`. Add immediately after:

```tsx
<label className={styles.field}>
  Description
  <textarea
    name="description"
    rows={2}
    placeholder="Optional — what is this component used for?"
    style={{ resize: "vertical" }}
  />
</label>
```

**d) Make the supplier `<select>` controlled** — find the existing supplier select and add `value` and `onChange`:

```tsx
<select
  name="supplier_id"
  value={selectedSupplierId}
  onChange={(e) => setSelectedSupplierId(e.target.value)}
>
  <option value="">-- None --</option>
  {lookups.suppliers.map((s) => (
    <option key={s.id} value={s.id}>{s.name}</option>
  ))}
</select>
```

**e) Add conditional Supplier Part Number input** — immediately after the closing `</label>` of the supplier field (still inside the `fieldRow` div, or just after it — check the structure; if supplier and group are siblings in a fieldRow, add a new full-width element AFTER the fieldRow):

```tsx
{selectedSupplierId && (
  <label className={styles.field}>
    Supplier Part Number
    <input
      type="text"
      name="supplier_part_number"
      placeholder="e.g. RC0402FR-0710KL"
      autoComplete="off"
    />
  </label>
)}
```

Place this after the supplier+group `fieldRow` div closes and before the Location field.

- [ ] **Step 2: Update `component-edit-form.tsx`**

Open `src/app/app/components/component-edit-form.tsx`.

**a) Add `description` to the `InitialValues` type:**

```typescript
type InitialValues = {
  name: string;
  sku: string | null;
  unit: string | null;
  costPerUnit: number;
  reorderPoint: number;
  lowStockLevel: number;
  supplierId: string | null;
  groupId: string | null;
  description: string | null;   // ← add
};
```

**b) Add Description textarea** — between the Name field and the SKU+Unit section, same position as in the create form:

```tsx
<label className={styles.field}>
  Description
  <textarea
    name="description"
    rows={2}
    defaultValue={initialValues.description ?? ""}
    placeholder="Optional — what is this component used for?"
    style={{ resize: "vertical" }}
  />
</label>
```

- [ ] **Step 3: Update `page.tsx` — ComponentRecord type and select**

Open `src/app/app/components/[componentId]/page.tsx`.

**a) Add `description` to `ComponentRecord` type** (find the type near the top of the file):
```typescript
type ComponentRecord = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  cost_per_unit: number;
  reorder_point: number;
  low_stock_level: number;
  archived_at: string | null;
  supplier_id: string | null;
  group_id: string | null;
  created_at: string | null;
  bin_sub_location_id: string | null;
  bin_aisle_id: string | null;
  bin_bay_id: string | null;
  tenant_id: string;
  image_url: string | null;
  description: string | null;   // ← add
  supplier: { name: string } | Array<{ name: string }> | null;
  location: { name: string } | Array<{ name: string }> | null;
  group: { name: string } | Array<{ name: string }> | null;
};
```

**b) Add `description` to the Supabase select string** — find the `.from("component").select(...)` call and add `description` alongside the other scalar fields:
```
id, name, sku, unit, cost_per_unit, reorder_point, low_stock_level,
archived_at, supplier_id, group_id, created_at, tenant_id,
bin_sub_location_id, bin_aisle_id, bin_bay_id,
image_url, description,
supplier:suppliers(name), location:location(name), group:component_group(name)
```

**c) Render `description` in the info card** — find the `<aside className={styles.infoCard}>` section. Inside the right column of `imageRow` (the `<div>` that wraps `<h1>`, SKU badge, and alarm banner), add description after the alarm banner:

```tsx
{c.description && (
  <p style={{ margin: 0, fontSize: "var(--fs-sm)", color: "var(--ink-muted)" }}>
    {c.description}
  </p>
)}
```

**d) Pass `description` to the edit form** — find where `ComponentEditForm` is rendered. Its `initialValues` prop needs `description`:
```tsx
initialValues={{
  name: c.name,
  sku: c.sku,
  unit: c.unit,
  costPerUnit: c.cost_per_unit,
  reorderPoint: c.reorder_point,
  lowStockLevel: c.low_stock_level,
  supplierId: c.supplier_id,
  groupId: c.group_id,
  description: c.description,   // ← add
}}
```

- [ ] **Step 4: Verify TypeScript and run app**

```bash
npx tsc --noEmit
npm run dev
```

Navigate to `/app/components` → click "New Component" → confirm Description textarea and conditional Supplier Part Number appear. Open an existing component → confirm Description appears in edit form and detail card.

- [ ] **Step 5: Commit**

```bash
git add src/app/app/components/component-create-form.tsx \
        src/app/app/components/component-edit-form.tsx \
        "src/app/app/components/[componentId]/page.tsx"
git commit -m "feat(components): add description textarea and conditional supplier_part_number to create/edit forms and detail page"
```

---

### Task 4: Update CSV import template and commit route

**Goal:** Add `supplier_part_number` and `description` columns to the downloadable CSV template; update the import commit phase to include `description` in component inserts and upsert `supplier_components` rows after bulk insert.

**Files:**
- Modify: `src/app/app/components/import/page.tsx`
- Modify: `src/app/api/import/components/route.ts`

**Acceptance Criteria:**
- [ ] `TEMPLATE_CSV` has `supplier_part_number` after `supplier_name` and `description` as the last column
- [ ] Example row in template is updated with sample values for both new columns
- [ ] Import commit phase includes `description` in each component insert row
- [ ] Import commit phase bulk-upserts `supplier_components` for all rows with a resolved `supplier_id`, using `supplier_part_number` from the CSV and `is_preferred = true`
- [ ] `npx tsc --noEmit` passes

**Verify:** `npx tsc --noEmit` → no output. Manually download the template and confirm new columns. Upload a CSV with all fields and confirm components are created with description and supplier_components rows.

**Steps:**

- [ ] **Step 1: Update `TEMPLATE_CSV` in `import/page.tsx`**

Open `src/app/app/components/import/page.tsx`. Find the `TEMPLATE_CSV` constant (currently two lines — header + example row) and replace it:

```typescript
const TEMPLATE_CSV = [
  "name,sku,unit,cost_per_unit,reorder_point,low_stock_level,supplier_name,supplier_part_number,location_name,group_name,description",
  "Safety Laser Scanner,CMP-001,ea,142.00,10,5,Omron,F3SG-4RA0960P14,Warehouse A,Electronics,Compact safety laser scanner for machine guarding",
].join("\n");
```

- [ ] **Step 2: Update the import route — dry-run phase**

Open `src/app/api/import/components/route.ts`.

In the dry-run path, `supplier_part_number` and `description` require no special handling — they're optional free-text strings with no lookup. Check `validateComponentRows` in its helper file: if it explicitly whitelists column names, add `"supplier_part_number"` and `"description"` to that list. If it only checks that `"name"` is present (the current behaviour), no change is needed here.

- [ ] **Step 3: Update the import route — commit phase, component insert rows**

Find where `insertRows` is built (the `.map()` call around line 192). Add `description` to each row:

```typescript
const insertRows = validatedRows.map((r) => {
  const raw = r.raw;
  const supplierName = raw["supplier_name"]?.trim() || null;
  const locationName = raw["location_name"]?.trim() || null;
  const groupName = raw["group_name"]?.trim() || null;

  return {
    tenant_id: tenantId,
    name: raw["name"].trim(),
    sku: raw["sku"]?.trim() || null,
    unit: raw["unit"]?.trim() || null,
    cost_per_unit: raw["cost_per_unit"]?.trim() ? Number(raw["cost_per_unit"]) : 0,
    reorder_point: raw["reorder_point"]?.trim() ? Number(raw["reorder_point"]) : 0,
    low_stock_level: raw["low_stock_level"]?.trim() ? Number(raw["low_stock_level"]) : 0,
    supplier_id: supplierName ? (supplierIdMap.get(supplierName.toLowerCase()) ?? null) : null,
    location_id: locationName ? (locationIdMap.get(locationName.toLowerCase()) ?? null) : null,
    group_id: groupName ? (groupIdMap.get(groupName.toLowerCase()) ?? null) : null,
    description: raw["description"]?.trim() || null,   // ← add
  };
});
```

Also capture `supplier_part_number` per row for the upsert step. Build a parallel array:

```typescript
const supplierPartNumbers = validatedRows.map((r) =>
  r.raw["supplier_part_number"]?.trim() || null
);
```

Add this immediately before or after `insertRows` is built.

- [ ] **Step 4: Change component insert to return IDs**

Find the existing insert call:
```typescript
const { error: insertError } = await supabase
  .from("component")
  .insert(insertRows);
```

Change it to:
```typescript
const { data: insertedComponents, error: insertError } = await supabase
  .from("component")
  .insert(insertRows)
  .select("id, supplier_id");
```

- [ ] **Step 5: Add `supplier_components` bulk upsert after component insert**

After the existing `if (insertError)` check, add:

```typescript
// Upsert supplier_components for rows that had a supplier
if (insertedComponents) {
  const scRows = insertedComponents
    .map((comp, i) => ({
      comp,
      supplierPartNumber: supplierPartNumbers[i],
    }))
    .filter(({ comp }) => comp.supplier_id !== null)
    .map(({ comp, supplierPartNumber }) => ({
      tenant_id: tenantId,
      supplier_id: comp.supplier_id!,
      component_id: comp.id,
      supplier_part_number: supplierPartNumber,
      is_preferred: true,
    }));

  if (scRows.length > 0) {
    const { error: scErr } = await supabase
      .from("supplier_components")
      .upsert(scRows, {
        onConflict: "tenant_id,supplier_id,component_id",
        ignoreDuplicates: false,
      });
    if (scErr) console.error("supplier_components bulk upsert failed:", scErr.message);
  }
}
```

- [ ] **Step 6: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/app/app/components/import/page.tsx \
        src/app/api/import/components/route.ts
git commit -m "feat(components): add description and supplier_part_number to CSV import template and route"
```
