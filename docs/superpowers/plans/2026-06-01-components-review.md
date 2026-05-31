# Components Pre-Launch Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all 19 findings from the components pre-launch review across navigation, CRUD, accessibility, and UX polish — shipped as a single PR.

**Architecture:** 8 independent tasks, one dependency chain (Task 5 archive needs Task 1 DB migration). Tasks 2–4 and 6–8 can run in parallel after Task 1. All changes are co-located within `src/app/app/components/` and its neighbors — no new routes.

**Tech Stack:** Next.js 15 App Router, Supabase (PostgREST client), TypeScript, CSS Modules, `useActionState` for client-side form state, vitest for unit tests, `npx tsc --noEmit` for type checks.

**Spec:** `docs/superpowers/specs/2026-06-01-components-review-design.md`

---

## Task 1: DB migration — add archived_at to component table

**Goal:** Add `archived_at timestamptz` to the `component` table and filter archived rows from all list queries.

**Files:**
- Create: `supabase/patches/component_archive.sql`
- Modify: `src/app/app/components/page.tsx`
- Modify: `src/app/app/components/[componentId]/page.tsx`

**Acceptance Criteria:**
- [ ] `archived_at timestamptz` column added to `component` table
- [ ] Component list query filters `archived_at IS NULL`
- [ ] Detail page select includes `archived_at`

**Verify:** `npx tsc --noEmit` → no errors; run the SQL patch against the DB via Supabase MCP.

**Steps:**

- [ ] **Step 1: Create the SQL patch**

Create `supabase/patches/component_archive.sql`:

```sql
-- Add soft-delete support to components
ALTER TABLE public.component
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;
```

- [ ] **Step 2: Apply via Supabase MCP**

Use the `mcp__plugin_supabase_supabase__apply_migration` tool with the SQL above. Confirm the cost first if prompted.

- [ ] **Step 3: Filter list query**

In `src/app/app/components/page.tsx`, find the `supabase.from("component").select(...)` call (around line 45) and add the archived_at filter:

```ts
// Before:
supabase.from("component").select("id,name,sku,reorder_point").eq("tenant_id", tenantId).order("name"),

// After:
supabase.from("component").select("id,name,sku,reorder_point").eq("tenant_id", tenantId).is("archived_at", null).order("name"),
```

- [ ] **Step 4: Add archived_at to detail page select**

In `src/app/app/components/[componentId]/page.tsx`, extend the component select (around line 115) to include `archived_at`:

```ts
// Before:
.select("id,name,sku,unit,cost_per_unit,reorder_point,created_at,tenant_id,bin_sub_location_id,bin_aisle_id,bin_bay_id,supplier:supplier_id(name),location:location_id(name),group:group_id(name)")

// After:
.select("id,name,sku,unit,cost_per_unit,reorder_point,low_stock_level,archived_at,created_at,tenant_id,bin_sub_location_id,bin_aisle_id,bin_bay_id,supplier_id,group_id,supplier:supplier_id(name),location:location_id(name),group:group_id(name)")
```

Note: `low_stock_level`, `supplier_id`, and `group_id` are also added here — they're needed by the edit modal in Task 4.

- [ ] **Step 5: Update the ComponentRecord type**

In `src/app/app/components/[componentId]/page.tsx`, update `ComponentRecord` to include the new fields:

```ts
type ComponentRecord = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  cost_per_unit: number;
  reorder_point: number;
  low_stock_level: number;         // added
  archived_at: string | null;      // added
  supplier_id: string | null;      // added
  group_id: string | null;         // added
  created_at: string | null;
  bin_sub_location_id: string | null;
  bin_aisle_id: string | null;
  bin_bay_id: string | null;
  tenant_id: string;
  supplier: { name: string } | Array<{ name: string }> | null;
  location: { name: string } | Array<{ name: string }> | null;
  group: { name: string } | Array<{ name: string }> | null;
};
```

- [ ] **Step 6: Type-check and commit**

```bash
npx tsc --noEmit
git add supabase/patches/component_archive.sql src/app/app/components/page.tsx src/app/app/components/[componentId]/page.tsx
git commit -m "feat(components): add archived_at column + filter list query"
```

---

## Task 2: Sidebar navigation — add Purchasing and Inventory entries (F-01, F-02)

**Goal:** Add Purchasing and Inventory to the Operations section of the sidebar so these routes are reachable without typing URLs manually.

**Files:**
- Modify: `src/app/app/sidebar-nav.tsx`

**Acceptance Criteria:**
- [ ] Purchasing appears in Operations section
- [ ] Inventory appears in Operations section
- [ ] Both highlight as active when visiting their routes

**Verify:** `npx tsc --noEmit` → no errors; both links visible in browser sidebar.

**Steps:**

- [ ] **Step 1: Add Purchasing entry**

In `src/app/app/sidebar-nav.tsx`, in `buildNavSections()`, add a Purchasing entry after the Reports entry (around line 110) inside the Operations section `items` array:

```ts
{
  label: "Purchasing",
  href: "/app/purchasing",
  icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
      <path d="M3 6h18" />
      <path d="M16 10a4 4 0 0 1-8 0" />
    </svg>
  ),
},
{
  label: "Inventory",
  href: "/app/inventory",
  icon: (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect width="20" height="14" x="2" y="7" rx="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  ),
},
```

- [ ] **Step 2: Type-check and commit**

```bash
npx tsc --noEmit
git add src/app/app/sidebar-nav.tsx
git commit -m "feat(nav): add Purchasing and Inventory sidebar entries (F-01, F-02)"
```

---

## Task 3: Navigation link fixes, page title, and location tab copy (F-03–F-05, F-07, F-10)

**Goal:** Fix BOM deep-links, Receive Stock context, movement ref links; add `<h1>` to list page; add explanatory copy to location tab.

**Files:**
- Modify: `src/app/app/components/[componentId]/page.tsx`
- Modify: `src/app/app/components/[componentId]/detail-tabs.tsx`
- Modify: `src/app/app/components/page.tsx`
- Modify: `src/app/app/goods-inwards/new/page.tsx`
- Modify: `src/app/app/goods-inwards/receipt-form.tsx`

**Acceptance Criteria:**
- [ ] BOM row links navigate to `/app/products/variants/[variantId]`
- [ ] "Receive Stock" link includes `?component_id=[id]`
- [ ] Goods-inwards new form pre-selects the component when `component_id` param is present
- [ ] Movements Ref column cells link to detail pages for `goods_receipt` and `production_order` types
- [ ] Component list has visible `<h1>Components</h1>`
- [ ] Location tab has explanatory paragraph above the bin selector

**Verify:** `npx tsc --noEmit` → no errors.

**Steps:**

- [ ] **Step 1: Add variantId to BOM query (F-03)**

In `src/app/app/components/[componentId]/page.tsx`, update the `product_bom_component` select to include `id` on the variant:

```ts
// Before:
.select("quantity,product_bom_id,product_bom:product_bom_id(version,is_active,variant:variant_id(title,product:product_id(title)))")

// After:
.select("quantity,product_bom_id,product_bom:product_bom_id(version,is_active,variant:variant_id(id,title,product:product_id(title)))")
```

- [ ] **Step 2: Update BomRow type and mapping (F-03)**

In `src/app/app/components/[componentId]/detail-tabs.tsx`, add `variantId` to the `BomRow` type:

```ts
type BomRow = {
  bomId: string;
  variantId: string | null;   // added
  product: string;
  variant: string;
  version: number;
  quantity: number;
  active: boolean;
};
```

In `src/app/app/components/[componentId]/page.tsx`, update the `bomRows` mapping to extract variant id:

```ts
const bomRows = typedBomUsage.map((row) => {
  const bom = unwrap(row.product_bom);
  const variant = bom ? unwrap(bom.variant) : null;
  const product = variant ? unwrap(variant.product) : null;
  return {
    bomId: row.product_bom_id as string,
    variantId: (variant as { id?: string } | null)?.id ?? null,   // added
    product: product?.title ?? "--",
    variant: variant?.title ?? "--",
    version: bom?.version ?? 0,
    quantity: row.quantity,
    active: bom?.is_active ?? false,
  };
});
```

- [ ] **Step 3: Fix BOM link in detail-tabs (F-03)**

In `src/app/app/components/[componentId]/detail-tabs.tsx`, find the BOM link (around line 232) and update:

```tsx
// Before:
<a href="/app/bom" className={styles.bomLink}>
  {row.product}
  {row.variant && row.variant !== "--" ? ` — ${row.variant}` : ""}
</a>

// After:
{row.variantId ? (
  <a href={`/app/products/variants/${row.variantId}`} className={styles.bomLink}>
    {row.product}
    {row.variant && row.variant !== "--" ? ` — ${row.variant}` : ""}
  </a>
) : (
  <span>
    {row.product}
    {row.variant && row.variant !== "--" ? ` — ${row.variant}` : ""}
  </span>
)}
```

- [ ] **Step 4: Add component_id to Receive Stock link (F-04)**

In `src/app/app/components/[componentId]/page.tsx`, find the cardActions section (around line 367) and update the Receive Stock link:

```tsx
// Before:
<Link href="/app/goods-inwards/new" className={styles.btnSecondary}>
  Receive stock
</Link>

// After:
<Link href={`/app/goods-inwards/new?component_id=${componentId}`} className={styles.btnSecondary}>
  Receive stock
</Link>
```

- [ ] **Step 5: Read component_id param in goods-inwards new page (F-04)**

In `src/app/app/goods-inwards/new/page.tsx`, update the page to accept searchParams and pass the initial component id:

```tsx
// Before:
export default async function NewReceiptPage() {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/auth/login");

// After:
type Props = {
  searchParams?: Promise<{ component_id?: string }>;
};

export default async function NewReceiptPage({ searchParams }: Props) {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/auth/login");
  const params = (await searchParams) ?? {};
  const initialComponentId = params.component_id ?? null;
```

And update the `ReceiptForm` render call at the bottom:

```tsx
// Before:
return (
  <ReceiptForm
    suppliers={suppliersResult.data ?? []}
    components={components}
    locations={locations}
    supplierComponentMap={supplierComponentMap}
  />
);

// After:
return (
  <ReceiptForm
    suppliers={suppliersResult.data ?? []}
    components={components}
    locations={locations}
    supplierComponentMap={supplierComponentMap}
    initialComponentId={initialComponentId}
  />
);
```

- [ ] **Step 6: Accept initialComponentId in ReceiptForm (F-04)**

In `src/app/app/goods-inwards/receipt-form.tsx`, update the Props signature (around line 45):

```tsx
// Before:
export default function ReceiptForm({
  suppliers,
  components,
  locations,
  supplierComponentMap,
}: {
  suppliers: Supplier[];
  components: Component[];
  locations: Location[];
  supplierComponentMap: Record<string, string[]>;
}) {

// After:
export default function ReceiptForm({
  suppliers,
  components,
  locations,
  supplierComponentMap,
  initialComponentId,
}: {
  suppliers: Supplier[];
  components: Component[];
  locations: Location[];
  supplierComponentMap: Record<string, string[]>;
  initialComponentId?: string | null;
}) {
```

Then update the lines state initialisation (around line 61):

```ts
// Before:
const [lines, setLines] = useState<LineState[]>([blankLine()]);

// After:
const [lines, setLines] = useState<LineState[]>([
  initialComponentId
    ? { ...blankLine(), component_id: initialComponentId }
    : blankLine(),
]);
```

- [ ] **Step 7: Add movement ref type links (F-05)**

In `src/app/app/components/[componentId]/detail-tabs.tsx`, update the `MovementRow` type to include `refId`:

```ts
type MovementRow = {
  id: string;
  date: string;
  deltaOnHand: number;
  deltaInProd: number;
  reason: string;
  refType: string;
  refId: string | null;  // added
};
```

In `src/app/app/components/[componentId]/page.tsx`, update the movements query to include `reference_id`:

```ts
// Before:
supabase
  .from("inventory_movement")
  .select("id,delta_on_hand,delta_in_prod,reason,reference_type,created_at")

// After:
supabase
  .from("inventory_movement")
  .select("id,delta_on_hand,delta_in_prod,reason,reference_type,reference_id,created_at")
```

Update the `MovementRecord` type:

```ts
type MovementRecord = {
  id: string;
  delta_on_hand: number;
  delta_in_prod: number;
  reason: string | null;
  reference_type: string | null;
  reference_id: string | null;  // added
  created_at: string;
};
```

Update `movementRows` mapping:

```ts
const movementRows = typedMovements.map((m) => ({
  id: m.id,
  date: new Date(m.created_at).toLocaleDateString("en-GB"),
  deltaOnHand: m.delta_on_hand,
  deltaInProd: m.delta_in_prod,
  reason: m.reason ?? "--",
  refType: m.reference_type ?? "--",
  refId: m.reference_id ?? null,   // added
}));
```

In `detail-tabs.tsx`, add a helper and update the Ref cell in Movements:

```tsx
// Add near the top of the file (after imports):
const REF_ROUTES: Partial<Record<string, (id: string) => string>> = {
  goods_receipt: (id) => `/app/goods-inwards/${id}`,
  production_order: (id) => `/app/orders/${id}`,
};

// In the Movements tab render, find the Ref cell (around line 191):
// Before:
<span className={styles.refCell}>{m.refType}</span>

// After:
<span className={styles.refCell}>
  {m.refId && REF_ROUTES[m.refType] ? (
    <a href={REF_ROUTES[m.refType]!(m.refId)} className={styles.refLink}>
      {m.refType}
    </a>
  ) : (
    m.refType
  )}
</span>
```

(The `refLink` style can be added to `component-detail.module.css` as a simple `color: var(--brand-1); text-decoration: underline;` rule.)

- [ ] **Step 8: Add page title to component list (F-07)**

In `src/app/app/components/page.tsx`, update the `<PageHeader>` call:

```tsx
// Before:
<PageHeader
  description={`${filtered.length} of ${allComponents.length} components in the current catalog.`}
  actions={...}
/>

// After:
<PageHeader
  eyebrow="Inventory"
  title="Components"
  description={`${filtered.length} of ${allComponents.length} components in the current catalog.`}
  actions={...}
/>
```

- [ ] **Step 9: Add location tab copy (F-10)**

In `src/app/app/components/[componentId]/detail-tabs.tsx`, find the Location tab content (around line 253):

```tsx
// Before:
{active === "Location" && isAdmin && (
  <div className={styles.tabContent}>
    <div className={styles.binCard}>
      <BinLocationSelect ...

// After:
{active === "Location" && isAdmin && (
  <div className={styles.tabContent}>
    <p className={styles.locationTabDesc}>
      Assign a default storage location for this component. When stock is
      received, it will be directed to this bin. Locations are managed in{" "}
      <a href="/app/warehouse/locations" className={styles.refLink}>
        Warehouse → Locations
      </a>
      .
    </p>
    <div className={styles.binCard}>
      <BinLocationSelect ...
```

Add `.locationTabDesc` to `component-detail.module.css`:

```css
.locationTabDesc {
  font-size: 0.85rem;
  color: var(--ink-muted);
  margin: 0 0 16px 0;
  line-height: 1.5;
}
```

- [ ] **Step 10: Type-check and commit**

```bash
npx tsc --noEmit
git add src/app/app/components/[componentId]/page.tsx \
        src/app/app/components/[componentId]/detail-tabs.tsx \
        src/app/app/components/[componentId]/component-detail.module.css \
        src/app/app/components/page.tsx \
        src/app/app/goods-inwards/new/page.tsx \
        src/app/app/goods-inwards/receipt-form.tsx
git commit -m "fix(components): nav link fixes, page title, location copy (F-03–F-05, F-07, F-10)"
```

---

## Task 4: Edit component modal (F-06)

**Goal:** Add `updateComponent` server action and `ComponentEditForm` modal so admins can edit component core fields.

**Files:**
- Modify: `src/app/app/components/actions.ts`
- Create: `src/app/app/components/component-edit-form.tsx`
- Modify: `src/app/app/components/[componentId]/page.tsx`

**Acceptance Criteria:**
- [ ] Edit button (admin-only) appears in info card header
- [ ] Dialog pre-fills with current name, SKU, unit, group, supplier, cost, reorder point, low stock level
- [ ] Successful save updates the component row, logs activity, closes the dialog
- [ ] Blank name shows inline error
- [ ] Non-admins don't see the Edit button
- [ ] Close button has `aria-label="Close dialog"`

**Verify:** `npx tsc --noEmit` → no errors.

**Steps:**

- [ ] **Step 1: Add updateComponent server action**

In `src/app/app/components/actions.ts`, add after `createComponent`:

```ts
export async function updateComponent(
  componentId: string,
  _prevState: ComponentState,
  formData: FormData
): Promise<ComponentState> {
  const name = formData.get("name")?.toString().trim() ?? "";
  const sku = formData.get("sku")?.toString().trim() ?? "";
  const unit = formData.get("unit")?.toString().trim() ?? "";
  const reorderPoint = parseNumber(formData.get("reorder_point")) ?? 0;
  const lowStockLevel = parseNumber(formData.get("low_stock_level")) ?? 0;
  const costPerUnit = parseNumber(formData.get("cost_per_unit")) ?? 0;
  const supplierId = parseUuid(formData.get("supplier_id"));
  const groupId = parseUuid(formData.get("group_id"));

  if (!name) return { error: "Component name is required." };

  const context = await getServerTenantContext();
  if (!context) return { error: "Missing tenant context." };
  const { supabase, tenantId, role } = context;

  if (role !== "admin" && role !== "super_admin") {
    return { error: "Only managers and above can edit components." };
  }

  const { data: current } = await supabase
    .from("component")
    .select("name, sku, unit, cost_per_unit, reorder_point, low_stock_level, supplier_id, group_id")
    .eq("id", componentId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!current) return { error: "Component not found." };

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
    })
    .eq("id", componentId)
    .eq("tenant_id", tenantId);

  if (error) return { error: error.message };

  await supabase.from("activity_log").insert({
    tenant_id: tenantId,
    event: "component_updated",
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
      },
      after: { name, sku: sku || null, unit: unit || null, cost_per_unit: costPerUnit, reorder_point: reorderPoint, low_stock_level: lowStockLevel, supplier_id: supplierId, group_id: groupId },
    },
  });

  revalidatePath(`/app/components/${componentId}`);
  revalidatePath("/app/components");
  revalidatePath("/app/activity-log");
  return { success: "Component updated." };
}
```

- [ ] **Step 2: Create ComponentEditForm**

Create `src/app/app/components/component-edit-form.tsx`:

```tsx
"use client";

import * as React from "react";
import { useState, useEffect, useRef } from "react";
import { updateComponent } from "./actions";
import styles from "./components.module.css";

type FormState = { error?: string; success?: string };

type LookupItem = { id: string; name: string };

type InitialValues = {
  name: string;
  sku: string | null;
  unit: string | null;
  costPerUnit: number;
  reorderPoint: number;
  lowStockLevel: number;
  supplierId: string | null;
  groupId: string | null;
};

type Props = {
  componentId: string;
  initialValues: InitialValues;
  lookups: {
    suppliers: LookupItem[];
    groups: LookupItem[];
  };
};

const initialState: FormState = {};

export default function ComponentEditForm({ componentId, initialValues, lookups }: Props) {
  const [open, setOpen] = useState(false);
  const boundAction = updateComponent.bind(null, componentId);
  const [state, formAction] = React.useActionState(boundAction, initialState);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (state.success) setOpen(false);
  }, [state.success]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) dialog.showModal();
    else dialog.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        className={styles.editButton}
        onClick={() => setOpen(true)}
        aria-label="Edit component"
      >
        ✎ Edit
      </button>

      <dialog
        ref={dialogRef}
        className={styles.dialog}
        onClose={() => setOpen(false)}
      >
        <div className={styles.dialogInner}>
          <div className={styles.dialogHeader}>
            <h2>Edit Component</h2>
            <button
              type="button"
              className={styles.dialogClose}
              onClick={() => setOpen(false)}
              aria-label="Close dialog"
            >
              &times;
            </button>
          </div>

          <form action={formAction} className={styles.dialogForm}>
            <label className={styles.field}>
              <span>Name *</span>
              <input name="name" required defaultValue={initialValues.name} />
            </label>

            <div className={styles.fieldRow}>
              <label className={styles.field}>
                <span>SKU</span>
                <input name="sku" defaultValue={initialValues.sku ?? ""} />
              </label>
              <label className={styles.field}>
                <span>Unit</span>
                <input name="unit" defaultValue={initialValues.unit ?? ""} placeholder="ea" />
              </label>
            </div>

            <div className={styles.fieldRow}>
              <label className={styles.field}>
                <span>Supplier</span>
                <select name="supplier_id" defaultValue={initialValues.supplierId ?? ""}>
                  <option value="">-- None --</option>
                  {lookups.suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Group</span>
                <select name="group_id" defaultValue={initialValues.groupId ?? ""}>
                  <option value="">-- None --</option>
                  {lookups.groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className={styles.fieldRow}>
              <label className={styles.field}>
                <span>Cost per Unit</span>
                <input name="cost_per_unit" type="number" step="0.01" min="0" defaultValue={initialValues.costPerUnit} />
              </label>
              <label className={styles.field}>
                <span>Reorder Point</span>
                <input name="reorder_point" type="number" step="1" min="0" defaultValue={initialValues.reorderPoint} />
              </label>
            </div>

            <label className={styles.field}>
              <span>Low Stock Level</span>
              <input name="low_stock_level" type="number" step="1" min="0" defaultValue={initialValues.lowStockLevel} />
              <span className={styles.fieldHint}>Should be lower than the reorder point.</span>
            </label>

            {state.error && <p className={styles.error}>{state.error}</p>}

            <div className={styles.dialogActions}>
              <button type="button" className={styles.btnCancel} onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button type="submit" className={styles.btnSubmit}>Save Changes</button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
```

- [ ] **Step 3: Add editButton style to components.module.css**

In `src/app/app/components/components.module.css`, add:

```css
.editButton {
  font-size: 0.8rem;
  padding: 4px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-card);
  color: var(--ink-base);
  cursor: pointer;
}
.editButton:hover {
  background: var(--bg-hover);
}
```

- [ ] **Step 4: Add Edit button to detail page**

In `src/app/app/components/[componentId]/page.tsx`:

Add import at top:
```ts
import ComponentEditForm from "../component-edit-form";
```

Add lookup fetches. In the parallel `Promise.all` (around line 138), add two more queries:
```ts
const [
  { data: balances },
  { data: movements },
  { data: bomUsage },
  { data: recentReceiptLines },
  { data: supplierCatalogRaw },
  { data: allSuppliersRaw },
  { data: groupsRaw },           // added
] = await Promise.all([
  // ... existing queries ...
  supabase.from("component_group").select("id, name").eq("tenant_id", tenantId).order("name"),  // added
]);
```

Then in the JSX, add `ComponentEditForm` inside the info card's `cardActions` div (admin-only):

```tsx
<div className={styles.cardActions}>
  {isAdmin && (
    <ComponentEditForm
      componentId={componentId}
      initialValues={{
        name: c.name,
        sku: c.sku,
        unit: c.unit,
        costPerUnit: c.cost_per_unit,
        reorderPoint: c.reorder_point,
        lowStockLevel: c.low_stock_level,
        supplierId: c.supplier_id,
        groupId: c.group_id,
      }}
      lookups={{
        suppliers: (allSuppliersRaw ?? []) as Array<{ id: string; name: string }>,
        groups: (groupsRaw ?? []) as Array<{ id: string; name: string }>,
      }}
    />
  )}
  <Link href={`/app/goods-inwards/new?component_id=${componentId}`} className={styles.btnSecondary}>
    Receive stock
  </Link>
</div>
```

- [ ] **Step 5: Type-check and commit**

```bash
npx tsc --noEmit
git add src/app/app/components/actions.ts \
        src/app/app/components/component-edit-form.tsx \
        src/app/app/components/components.module.css \
        src/app/app/components/[componentId]/page.tsx
git commit -m "feat(components): add edit component modal and updateComponent action (F-06)"
```

---

## Task 5: Archive component with conflict checks (F-08)

**Goal:** Add `archiveComponent` server action with four conflict checks and an Archive button with confirmation dialog.

**Blocked by:** Task 1 (needs `archived_at` column).

**Files:**
- Modify: `src/app/app/components/actions.ts`
- Create: `src/app/app/components/[componentId]/archive-button.tsx`
- Modify: `src/app/app/components/[componentId]/page.tsx`

**Acceptance Criteria:**
- [ ] Archive button (admin-only, destructive) in detail page header
- [ ] Confirmation step before calling the action
- [ ] Conflict check blocks archive if: active BOMs, on-hand stock > 0, open POs, or open order allocations
- [ ] Conflict dialog lists each blocking item
- [ ] Clean archive sets `archived_at` and redirects to `/app/components`
- [ ] Confirmation reads "This can be undone from Trash."

**Verify:** `npx tsc --noEmit` → no errors.

**Steps:**

- [ ] **Step 1: Add archiveComponent server action**

In `src/app/app/components/actions.ts`, add:

```ts
type ArchiveResult =
  | { success: true }
  | { error: string; conflicts: string[] };

export async function archiveComponent(componentId: string): Promise<ArchiveResult> {
  const context = await getServerTenantContext();
  if (!context) return { error: "Unauthorized", conflicts: [] };
  const { supabase, tenantId, role } = context;

  if (role !== "admin" && role !== "super_admin") {
    return { error: "Only managers and above can archive components.", conflicts: [] };
  }

  // Run conflict checks in parallel
  const [
    { data: activeBoms },
    { data: stockRows },
    { data: openPoLines },
    { data: openAllocations },
  ] = await Promise.all([
    supabase
      .from("product_bom_component")
      .select("product_bom_id, product_bom:product_bom_id!inner(is_active, variant:variant_id(product:product_id(title)))")
      .eq("component_id", componentId)
      .eq("product_bom.is_active", true),
    supabase
      .from("inventory_balance")
      .select("on_hand")
      .eq("component_id", componentId)
      .eq("tenant_id", tenantId)
      .gt("on_hand", 0),
    supabase
      .from("purchase_order_line")
      .select("id, purchase_order:purchase_order_id!inner(status)")
      .eq("component_id", componentId)
      .eq("tenant_id", tenantId)
      .not("purchase_order.status", "in", '("received","cancelled")'),
    supabase
      .from("order_component_allocation")
      .select("id, order_line:order_line_id!inner(order:order_id!inner(status))")
      .eq("component_id", componentId)
      .eq("tenant_id", tenantId)
      .not("order_line.order.status", "in", '("complete","cancelled")'),
  ]);

  const conflicts: string[] = [];

  if ((activeBoms ?? []).length > 0) {
    const bomCount = (activeBoms ?? []).length;
    conflicts.push(`Used in ${bomCount} active BOM${bomCount !== 1 ? "s" : ""}`);
  }
  if ((stockRows ?? []).length > 0) {
    const totalOnHand = (stockRows ?? []).reduce((s, r) => s + (r.on_hand ?? 0), 0);
    conflicts.push(`Has ${totalOnHand} unit${totalOnHand !== 1 ? "s" : ""} on hand`);
  }
  if ((openPoLines ?? []).length > 0) {
    conflicts.push(`Has ${openPoLines!.length} open purchase order line${openPoLines!.length !== 1 ? "s" : ""}`);
  }
  if ((openAllocations ?? []).length > 0) {
    conflicts.push(`Allocated to ${openAllocations!.length} open order${openAllocations!.length !== 1 ? "s" : ""}`);
  }

  if (conflicts.length > 0) {
    return { error: "Cannot archive: resolve the following first.", conflicts };
  }

  const { error } = await supabase
    .from("component")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", componentId)
    .eq("tenant_id", tenantId);

  if (error) return { error: error.message, conflicts: [] };

  await supabase.from("activity_log").insert({
    tenant_id: tenantId,
    event: "component_archived",
    metadata: { component_id: componentId },
  });

  revalidatePath("/app/components");
  revalidatePath("/app/activity-log");
  return { success: true };
}
```

- [ ] **Step 2: Create ArchiveButton client component**

Create `src/app/app/components/[componentId]/archive-button.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { archiveComponent } from "../actions";
import styles from "./component-detail.module.css";

type Props = { componentId: string };

type DialogState =
  | { phase: "idle" }
  | { phase: "confirm" }
  | { phase: "conflicts"; error: string; conflicts: string[] };

export default function ArchiveButton({ componentId }: Props) {
  const [dialog, setDialog] = useState<DialogState>({ phase: "idle" });
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleArchiveClick() {
    setDialog({ phase: "confirm" });
  }

  function handleConfirm() {
    startTransition(async () => {
      const result = await archiveComponent(componentId);
      if (result.success) {
        router.push("/app/components");
      } else {
        setDialog({ phase: "conflicts", error: result.error, conflicts: result.conflicts });
      }
    });
  }

  function handleClose() {
    setDialog({ phase: "idle" });
  }

  return (
    <>
      <button
        type="button"
        className={styles.archiveButton}
        onClick={handleArchiveClick}
      >
        Archive
      </button>

      {dialog.phase === "confirm" && (
        <div className={styles.archiveOverlay} role="dialog" aria-modal="true" aria-labelledby="archive-dialog-title">
          <div className={styles.archiveDialog}>
            <h3 id="archive-dialog-title">Archive this component?</h3>
            <p>
              It will be hidden from all lists and workflows.
              This can be undone from Trash.
            </p>
            <div className={styles.archiveDialogActions}>
              <button type="button" className={styles.btnCancel} onClick={handleClose}>
                Cancel
              </button>
              <button
                type="button"
                className={styles.archiveConfirmBtn}
                onClick={handleConfirm}
                disabled={isPending}
              >
                {isPending ? "Archiving…" : "Yes, archive"}
              </button>
            </div>
          </div>
        </div>
      )}

      {dialog.phase === "conflicts" && (
        <div className={styles.archiveOverlay} role="dialog" aria-modal="true" aria-labelledby="archive-conflict-title">
          <div className={styles.archiveDialog}>
            <h3 id="archive-conflict-title">Cannot archive</h3>
            <p>{dialog.error}</p>
            <ul className={styles.conflictList}>
              {dialog.conflicts.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <div className={styles.archiveDialogActions}>
              <button type="button" className={styles.btnCancel} onClick={handleClose}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3: Add archive styles**

In `src/app/app/components/[componentId]/component-detail.module.css`, add:

```css
.archiveButton {
  font-size: 0.8rem;
  padding: 4px 10px;
  border: 1px solid var(--danger);
  border-radius: 6px;
  background: transparent;
  color: var(--danger);
  cursor: pointer;
}
.archiveButton:hover {
  background: var(--danger-subtle, color-mix(in srgb, var(--danger) 10%, transparent));
}
.archiveOverlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.archiveDialog {
  background: var(--bg-card);
  border-radius: 12px;
  padding: 24px;
  max-width: 400px;
  width: 90%;
}
.archiveDialog h3 {
  margin: 0 0 8px 0;
  font-size: 1rem;
}
.archiveDialog p {
  margin: 0 0 16px 0;
  font-size: 0.9rem;
  color: var(--ink-muted);
}
.archiveDialogActions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 16px;
}
.archiveConfirmBtn {
  font-size: 0.85rem;
  padding: 6px 14px;
  border-radius: 6px;
  border: none;
  background: var(--danger);
  color: white;
  cursor: pointer;
}
.archiveConfirmBtn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.conflictList {
  margin: 8px 0 0 0;
  padding-left: 20px;
  font-size: 0.875rem;
  color: var(--ink-base);
}
.conflictList li {
  margin-bottom: 4px;
}
```

- [ ] **Step 4: Render ArchiveButton in detail page**

In `src/app/app/components/[componentId]/page.tsx`, add the import:

```ts
import ArchiveButton from "./archive-button";
```

In the JSX, add `ArchiveButton` to the `topRow` div (admin-only):

```tsx
<div className={styles.topRow}>
  <Link href="/app/components" className={styles.backButton}>
    &larr; Back
  </Link>
  {isAdmin && <ArchiveButton componentId={componentId} />}
</div>
```

- [ ] **Step 5: Type-check and commit**

```bash
npx tsc --noEmit
git add src/app/app/components/actions.ts \
        src/app/app/components/[componentId]/archive-button.tsx \
        src/app/app/components/[componentId]/component-detail.module.css \
        src/app/app/components/[componentId]/page.tsx
git commit -m "feat(components): archive component with conflict checks (F-08)"
```

---

## Task 6: Supplier link editing and unlinking (F-09)

**Goal:** Allow admins to edit supplier link fields inline and unlink suppliers from the Suppliers tab.

**Files:**
- Modify: `src/app/app/components/actions.ts`
- Modify: `src/app/app/components/[componentId]/detail-tabs.tsx`

**Acceptance Criteria:**
- [ ] Edit (pencil) and Unlink (×) buttons visible per supplier row (admin-only)
- [ ] Edit expands inline form row pre-filled with `unit_cost`, `lead_time_days`, `moq`, `part_number`
- [ ] Only one row editable at a time
- [ ] Save calls `updateComponentSupplier`; Cancel discards
- [ ] Unlink shows inline "Remove?" prompt then calls existing `unlinkComponent` action
- [ ] Non-admins see no buttons

**Verify:** `npx tsc --noEmit` → no errors.

**Steps:**

- [ ] **Step 1: Add updateComponentSupplier action**

In `src/app/app/components/actions.ts`, add:

```ts
export async function updateComponentSupplier(
  _prevState: ComponentState,
  formData: FormData
): Promise<ComponentState> {
  const supplierComponentId = formData.get("supplier_component_id")?.toString() ?? "";
  const componentId = formData.get("component_id")?.toString() ?? "";

  if (!supplierComponentId || !componentId) return { error: "Missing IDs." };

  const context = await getServerTenantContext();
  if (!context) return { error: "Unauthorized" };
  const { supabase, tenantId, role } = context;

  if (role !== "admin" && role !== "super_admin") {
    return { error: "Only managers and above can edit supplier links." };
  }

  const unitCost = parseNumber(formData.get("unit_cost"));
  const leadTimeDays = parseNumber(formData.get("lead_time_days"));
  const moq = parseNumber(formData.get("moq"));
  const partNumber = formData.get("supplier_part_number")?.toString().trim() || null;

  const { error } = await supabase
    .from("supplier_components")
    .update({
      unit_cost: unitCost,
      lead_time_days: leadTimeDays,
      moq,
      supplier_part_number: partNumber,
    })
    .eq("id", supplierComponentId)
    .eq("tenant_id", tenantId);

  if (error) return { error: error.message };

  await supabase.from("activity_log").insert({
    tenant_id: tenantId,
    event: "component_supplier_updated",
    metadata: { supplier_component_id: supplierComponentId, component_id: componentId },
  });

  revalidatePath(`/app/components/${componentId}`);
  revalidatePath("/app/activity-log");
  return { success: "Supplier link updated." };
}
```

- [ ] **Step 2: Update ComponentSuppliersTab to add edit/unlink UI**

In `src/app/app/components/[componentId]/detail-tabs.tsx`:

Add imports at the top of the file:

```ts
import { togglePreferred, linkComponent, unlinkComponent } from "@/app/app/suppliers/[supplierId]/actions";
import { updateComponentSupplier } from "../actions";
```

Remove the existing import of `togglePreferred` and `linkComponent` (they were already imported — just add `unlinkComponent` and `updateComponentSupplier`).

Update the `ComponentSuppliersTab` props to include `isAdmin`:

```ts
function ComponentSuppliersTab({
  componentId,
  catalog,
  allSuppliers,
  isAdmin,
}: {
  componentId: string;
  catalog: SupplierCatalogItem[];
  allSuppliers: Array<{ id: string; name: string }>;
  isAdmin: boolean;
}) {
```

Pass `isAdmin` from `DetailTabs`:

```tsx
{active === "Suppliers" && (
  <div className={styles.tabContent}>
    <ComponentSuppliersTab
      componentId={componentId}
      catalog={supplierCatalog}
      allSuppliers={allSuppliers}
      isAdmin={isAdmin}      {/* add this */}
    />
  </div>
)}
```

Inside `ComponentSuppliersTab`, add `editingId` state:

```ts
const [editingId, setEditingId] = useState<string | null>(null);
const [unlinkConfirmId, setUnlinkConfirmId] = useState<string | null>(null);
```

Update the `catalog.map(...)` block to add edit and unlink:

```tsx
catalog.map((row) => {
  const isBestPrice = row.unitCost != null && row.unitCost === minCost;
  const isFastest = row.leadTimeDays != null && row.leadTimeDays === minLt;
  const ltColor =
    row.avgActualDays != null && row.leadTimeDays != null
      ? row.avgActualDays <= row.leadTimeDays ? styles.ltGreen : styles.ltRed
      : "";
  const isEditing = editingId === row.id;
  const isUnlinkConfirm = unlinkConfirmId === row.id;

  return (
    <React.Fragment key={row.id}>
      <div className={styles.suppliersRow}>
        <div>
          <span className={styles.supplierLink}>{row.supplierName}</span>
          {isBestPrice && <span className={styles.tagGreen}>best price</span>}
          {isFastest && !isBestPrice && <span className={styles.tagBlue}>fastest</span>}
        </div>
        <span className={styles.catalogPartNum}>{row.partNumber ?? "—"}</span>
        <span>{row.unitCost != null ? `$${row.unitCost.toFixed(2)}` : "—"}</span>
        <span>{row.moq != null ? String(row.moq) : "—"}</span>
        <span>{row.leadTimeDays != null ? `${row.leadTimeDays}d` : "—"}</span>
        <span className={ltColor}>
          {row.avgActualDays != null ? `${row.avgActualDays.toFixed(1)}d` : "—"}
        </span>
        <form action={togglePreferred} style={{ textAlign: "center" }}>
          <input type="hidden" name="supplier_component_id" value={row.id} />
          <input type="hidden" name="component_id" value={componentId} />
          <input type="hidden" name="supplier_id" value={row.supplierId} />
          <button type="submit" className={styles.starBtn}>
            {row.isPreferred ? "★" : "☆"}
          </button>
        </form>
        {isAdmin && (
          <div className={styles.supplierRowActions}>
            <button
              type="button"
              className={styles.iconBtn}
              aria-label="Edit supplier link"
              onClick={() => setEditingId(isEditing ? null : row.id)}
            >
              ✎
            </button>
            <button
              type="button"
              className={styles.iconBtnDanger}
              aria-label="Unlink supplier"
              onClick={() => setUnlinkConfirmId(isUnlinkConfirm ? null : row.id)}
            >
              ×
            </button>
          </div>
        )}
      </div>

      {isEditing && (
        <form action={updateComponentSupplier} className={styles.supplierEditRow}
          onSubmit={() => setEditingId(null)}>
          <input type="hidden" name="supplier_component_id" value={row.id} />
          <input type="hidden" name="component_id" value={componentId} />
          <label className={styles.supplierEditField}>
            <span>Unit cost</span>
            <input name="unit_cost" type="number" step="0.01" defaultValue={row.unitCost ?? ""} className={styles.miniInput} />
          </label>
          <label className={styles.supplierEditField}>
            <span>Lead time (days)</span>
            <input name="lead_time_days" type="number" defaultValue={row.leadTimeDays ?? ""} className={styles.miniInput} />
          </label>
          <label className={styles.supplierEditField}>
            <span>MOQ</span>
            <input name="moq" type="number" defaultValue={row.moq ?? ""} className={styles.miniInput} />
          </label>
          <label className={styles.supplierEditField}>
            <span>Part #</span>
            <input name="supplier_part_number" defaultValue={row.partNumber ?? ""} className={styles.miniInput} />
          </label>
          <div className={styles.supplierEditActions}>
            <button type="submit" className={styles.btnSmall}>Save</button>
            <button type="button" className={styles.btnSmall} onClick={() => setEditingId(null)}>Cancel</button>
          </div>
        </form>
      )}

      {isUnlinkConfirm && (
        <div className={styles.supplierUnlinkConfirm}>
          <span>Remove {row.supplierName} from this component?</span>
          <form action={unlinkComponent} onSubmit={() => setUnlinkConfirmId(null)}>
            <input type="hidden" name="supplier_component_id" value={row.id} />
            <input type="hidden" name="component_id" value={componentId} />
            <input type="hidden" name="supplier_id" value={row.supplierId} />
            <button type="submit" className={styles.btnSmall} style={{ color: "var(--danger)" }}>Remove</button>
            <button type="button" className={styles.btnSmall} onClick={() => setUnlinkConfirmId(null)}>Cancel</button>
          </form>
        </div>
      )}
    </React.Fragment>
  );
})
```

Update the `suppliersHeader` to add an extra column when isAdmin:

```tsx
<div className={styles.suppliersHeader}>
  <span>Supplier</span>
  <span>Part #</span>
  <span>Unit Cost</span>
  <span>MOQ</span>
  <span>Lead Time</span>
  <span>Avg Actual</span>
  <span style={{ textAlign: "center" }}>Pref</span>
  {isAdmin && <span />}  {/* header spacer for actions column */}
</div>
```

- [ ] **Step 3: Add CSS for new supplier row elements**

In `src/app/app/components/[componentId]/component-detail.module.css`, add:

```css
.supplierRowActions {
  display: flex;
  gap: 4px;
  justify-content: flex-end;
}
.iconBtn {
  background: none;
  border: 1px solid var(--border);
  border-radius: 4px;
  width: 24px;
  height: 24px;
  cursor: pointer;
  font-size: 0.8rem;
  color: var(--ink-muted);
}
.iconBtnDanger {
  background: none;
  border: 1px solid var(--border);
  border-radius: 4px;
  width: 24px;
  height: 24px;
  cursor: pointer;
  font-size: 1rem;
  color: var(--danger);
}
.supplierEditRow {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: flex-end;
  padding: 8px 12px;
  background: var(--bg-subtle, var(--bg-card));
  border-bottom: 1px solid var(--border);
}
.supplierEditField {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 0.8rem;
  color: var(--ink-muted);
}
.supplierEditActions {
  display: flex;
  gap: 6px;
  align-items: flex-end;
}
.supplierUnlinkConfirm {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 12px;
  background: var(--bg-subtle, var(--bg-card));
  border-bottom: 1px solid var(--border);
  font-size: 0.85rem;
}
```

- [ ] **Step 4: Type-check and commit**

```bash
npx tsc --noEmit
git add src/app/app/components/actions.ts \
        src/app/app/components/[componentId]/detail-tabs.tsx \
        src/app/app/components/[componentId]/component-detail.module.css
git commit -m "feat(components): supplier link inline edit and unlink (F-09)"
```

---

## Task 7: Accessibility fixes (F-11–F-14)

**Goal:** Four surgical accessibility fixes: stat card labels, tab ARIA roles, dialog close button, color-only status dots.

**Files:**
- Modify: `src/app/app/components/[componentId]/detail-tabs.tsx`
- Modify: `src/app/app/components/component-create-form.tsx`
- Modify: `src/app/app/components/page.tsx`
- Modify: `src/app/app/components/components.module.css`

**Acceptance Criteria:**
- [ ] Stat values have `aria-labelledby` referencing their label's id
- [ ] Tab bar has `role="tablist"`; buttons have `role="tab"`, `aria-selected`, `aria-controls`; panels have `role="tabpanel"`
- [ ] Create dialog close button has `aria-label="Close dialog"`
- [ ] Status dots have a visually-hidden sibling with text "Critical", "Low", or "OK"

**Verify:** `npx tsc --noEmit` → no errors.

**Steps:**

- [ ] **Step 1: Fix stat card label association (F-11)**

In `src/app/app/components/[componentId]/detail-tabs.tsx`, find the `statsGrid` map (around lines 107–143) and update each stat card to wire up `aria-labelledby`:

```tsx
// Before:
{stats.map((s) => (
  <div key={s.label} className={`${styles.statCard} ...`}>
    <span className={styles.statLabel}>{s.label}</span>
    <span className={`${styles.statValue} ...`}>{s.value}</span>
    {s.subText && <span ...>{s.subText}</span>}
  </div>
))}

// After:
{stats.map((s) => {
  const labelId = `stat-label-${s.label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div key={s.label} className={`${styles.statCard} ...`}>
      <span id={labelId} className={styles.statLabel}>{s.label}</span>
      <span
        aria-labelledby={labelId}
        className={`${styles.statValue} ...`}
      >
        {s.value}
      </span>
      {s.subText && <span ...>{s.subText}</span>}
    </div>
  );
})}
```

Keep all the existing className logic unchanged — this only adds `id` to the label span and `aria-labelledby` to the value span.

- [ ] **Step 2: Fix tab ARIA roles (F-12)**

In `src/app/app/components/[componentId]/detail-tabs.tsx`, find the tab bar (around lines 90–102):

```tsx
// Before:
<div className={styles.tabBar}>
  {tabs.map((tab) => (
    <button
      key={tab}
      type="button"
      className={`${styles.tab} ${active === tab ? styles.tabActive : ""}`}
      onClick={() => setActive(tab)}
    >
      {tab === "Suppliers" ? `Suppliers (${supplierCatalog.length})` : tab}
    </button>
  ))}
</div>

// After:
<div className={styles.tabBar} role="tablist">
  {tabs.map((tab) => {
    const tabId = `tab-${tab.toLowerCase().replace(/\s+/g, "-")}`;
    const panelId = `panel-${tab.toLowerCase().replace(/\s+/g, "-")}`;
    return (
      <button
        key={tab}
        id={tabId}
        type="button"
        role="tab"
        aria-selected={active === tab}
        aria-controls={panelId}
        className={`${styles.tab} ${active === tab ? styles.tabActive : ""}`}
        onClick={() => setActive(tab)}
      >
        {tab === "Suppliers" ? `Suppliers (${supplierCatalog.length})` : tab}
      </button>
    );
  })}
</div>
```

Then wrap each tab panel `div` with the matching `id` and `role`. Find each `{active === "Overview" && (` block and add:

```tsx
// Pattern for each tab panel — Overview shown as example:
{active === "Overview" && (
  <div
    id="panel-overview"
    role="tabpanel"
    aria-labelledby="tab-overview"
    className={styles.overviewContent}
  >
    {/* existing content unchanged */}
  </div>
)}
```

Apply the same pattern to all 5 panels:
- `id="panel-movements"`, `aria-labelledby="tab-movements"`
- `id="panel-bom-usage"`, `aria-labelledby="tab-bom-usage"`
- `id="panel-suppliers"`, `aria-labelledby="tab-suppliers"`
- `id="panel-location"`, `aria-labelledby="tab-location"`

- [ ] **Step 3: Fix dialog close button label (F-13)**

In `src/app/app/components/component-create-form.tsx`, find the close button (around line 59):

```tsx
// Before:
<button
  type="button"
  className={styles.dialogClose}
  onClick={() => setOpen(false)}
>
  &times;
</button>

// After:
<button
  type="button"
  className={styles.dialogClose}
  onClick={() => setOpen(false)}
  aria-label="Close dialog"
>
  &times;
</button>
```

The edit modal (`component-edit-form.tsx` created in Task 4) already includes this fix.

- [ ] **Step 4: Add sr-only utility to CSS (F-14)**

In `src/app/app/components/components.module.css`, add:

```css
.srOnly {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border-width: 0;
}
```

- [ ] **Step 5: Add sr-only text to status dots (F-14)**

In `src/app/app/components/page.tsx`, find the status dot span (around line 171):

```tsx
// Before:
<span
  className={`${styles.dot} ${
    component.status === "critical"
      ? styles.dotCritical
      : component.status === "low"
      ? styles.dotLow
      : styles.dotOk
  }`}
/>

// After:
<span
  className={`${styles.dot} ${
    component.status === "critical"
      ? styles.dotCritical
      : component.status === "low"
      ? styles.dotLow
      : styles.dotOk
  }`}
>
  <span className={styles.srOnly}>
    {component.status === "critical" ? "Critical" : component.status === "low" ? "Low" : "OK"}
  </span>
</span>
```

- [ ] **Step 6: Type-check and commit**

```bash
npx tsc --noEmit
git add src/app/app/components/[componentId]/detail-tabs.tsx \
        src/app/app/components/component-create-form.tsx \
        src/app/app/components/page.tsx \
        src/app/app/components/components.module.css
git commit -m "fix(components): accessibility fixes — tab roles, stat labels, sr-only status, close button (F-11–F-14)"
```

---

## Task 8: UX polish — dates, aisle bug, search, ref labels, sort (F-15–F-19)

**Goal:** Fix five UX issues: date format, aisle dropdown bug, search preservation on tab switch, raw enum labels, column sort controls.

**Files:**
- Modify: `src/app/app/components/[componentId]/detail-tabs.tsx`
- Modify: `src/app/app/components/[componentId]/bin-location-select.tsx`
- Modify: `src/app/app/components/page.tsx`

**Acceptance Criteria:**
- [ ] Movements tab dates show "3 Jun 2026" (en-AU, not en-GB)
- [ ] Aisles with no sub-location are selectable when no sub-location is chosen
- [ ] Active search query survives All ↔ Low Stock tab switch
- [ ] Ref Type column shows "Goods Receipt" not `goods_receipt`
- [ ] Name/On Hand/Available/Reorder Point headers are clickable sort toggles
- [ ] Sort direction flips on repeated click of same header; new column defaults to asc

**Verify:** `npx tsc --noEmit` → no errors; all behaviours verified in browser.

**Steps:**

- [ ] **Step 1: Fix date format (F-15)**

In `src/app/app/components/[componentId]/page.tsx`, find the `movementRows` mapping (around line 277):

```ts
// Before:
date: new Date(m.created_at).toLocaleDateString("en-GB"),

// After:
date: new Date(m.created_at).toLocaleDateString("en-AU", {
  day: "numeric",
  month: "short",
  year: "numeric",
}),
```

- [ ] **Step 2: Fix aisle dropdown (F-16)**

In `src/app/app/components/[componentId]/bin-location-select.tsx`, find line 51:

```ts
// Before:
const filteredAisles = slId ? aisles.filter((a) => a.sub_location_id === slId) : [];

// After:
const filteredAisles = slId
  ? aisles.filter((a) => a.sub_location_id === slId)
  : aisles.filter((a) => a.sub_location_id === null);
```

Also remove the `disabled={!slId}` from the Aisle select (around line 99):

```tsx
// Before:
<select
  className={styles.binInput}
  value={aisleId}
  disabled={!slId}
  onChange={(e) => { setAisleId(e.target.value); setBayId(""); }}
>

// After:
<select
  className={styles.binInput}
  value={aisleId}
  disabled={filteredAisles.length === 0}
  onChange={(e) => { setAisleId(e.target.value); setBayId(""); }}
>
```

- [ ] **Step 3: Add ref type label map (F-18)**

In `src/app/app/components/[componentId]/detail-tabs.tsx`, add near the top of the file (after the type definitions):

```ts
const REF_TYPE_LABELS: Record<string, string> = {
  production_order: "Production Order",
  goods_receipt: "Goods Receipt",
  manual_adjustment: "Manual Adjustment",
  stocktake: "Stocktake",
};
```

Then in the Movements tab, find the `{m.refType}` span (after the REF_ROUTES link change from Task 3) and update the fallback label text:

```tsx
// The ref cell now uses REF_TYPE_LABELS for the display text:
<span className={styles.refCell}>
  {m.refId && REF_ROUTES[m.refType] ? (
    <a href={REF_ROUTES[m.refType]!(m.refId)} className={styles.refLink}>
      {REF_TYPE_LABELS[m.refType] ?? m.refType}
    </a>
  ) : (
    REF_TYPE_LABELS[m.refType] ?? m.refType
  )}
</span>
```

- [ ] **Step 4: Preserve search query on tab switch (F-17)**

In `src/app/app/components/page.tsx`, find the two tab links (around lines 104–118):

```tsx
// Before:
<a href="/app/components" className={!filterLowStock ? styles.tabActive : styles.tab}>
  All <span className={styles.tabCount}>{allComponents.length}</span>
</a>
<a href="/app/components?filter=lowstock" className={filterLowStock ? styles.tabActive : styles.tab}>
  Low Stock ...
</a>

// After:
<a
  href={q ? `/app/components?q=${encodeURIComponent(q)}` : "/app/components"}
  className={!filterLowStock ? styles.tabActive : styles.tab}
>
  All <span className={styles.tabCount}>{allComponents.length}</span>
</a>
<a
  href={q ? `/app/components?filter=lowstock&q=${encodeURIComponent(q)}` : "/app/components?filter=lowstock"}
  className={filterLowStock ? styles.tabActive : styles.tab}
>
  Low Stock ...
</a>
```

Note: `q` is already defined at the top of the page as the trimmed, lowercased search string. Use the raw `params.q ?? ""` here (before lowercasing) to preserve original casing in the URL. Update the variable:

```ts
// At top of ComponentsPage:
const params = (await searchParams) ?? {};
const rawQ = params.q ?? "";           // add this
const q = rawQ.trim().toLowerCase();   // keep existing q for filtering

// Then in the tab links:
href={rawQ ? `/app/components?q=${encodeURIComponent(rawQ)}` : "/app/components"}
```

- [ ] **Step 5: Add sort controls (F-19)**

In `src/app/app/components/page.tsx`, update the `Props` type:

```ts
type Props = {
  searchParams?: Promise<{
    q?: string;
    filter?: string;
    sort?: string;
    dir?: string;
  }>;
};
```

Read sort params:

```ts
const sortCol = (params.sort ?? "name") as "name" | "on_hand" | "available" | "reorder_point";
const sortDir = params.dir === "desc" ? "desc" : "asc";
```

Apply server-side sort to the component query (the list query returns all then we sort in JS since available is computed). Update the sort to happen after `withStatus` is built:

```ts
const sortedComponents = [...withStatus].sort((a, b) => {
  let aVal: number | string;
  let bVal: number | string;
  switch (sortCol) {
    case "on_hand":    aVal = a.onHand;          bVal = b.onHand;          break;
    case "available":  aVal = a.available;        bVal = b.available;       break;
    case "reorder_point": aVal = a.reorder_point ?? 0; bVal = b.reorder_point ?? 0; break;
    default:           aVal = a.name.toLowerCase(); bVal = b.name.toLowerCase();
  }
  if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
  if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
  return 0;
});

// Replace the `filtered` derivation to use `sortedComponents` instead of `withStatus`:
const filtered = sortedComponents.filter((c) => { ... });
```

Add a helper to build sort href:

```ts
function sortHref(col: string, currentSort: string, currentDir: string, currentQ: string, isLowStock: boolean) {
  const newDir = currentSort === col && currentDir === "asc" ? "desc" : "asc";
  const params = new URLSearchParams();
  if (isLowStock) params.set("filter", "lowstock");
  if (currentQ) params.set("q", currentQ);
  params.set("sort", col);
  params.set("dir", newDir);
  return `/app/components?${params.toString()}`;
}
```

Update the table `<thead>` to use sortable headers:

```tsx
<thead>
  <tr>
    <th>
      <a href={sortHref("name", sortCol, sortDir, rawQ, filterLowStock)} className={styles.sortHeader}>
        Component {sortCol === "name" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
      </a>
    </th>
    <th>SKU</th>
    <th>
      <a href={sortHref("on_hand", sortCol, sortDir, rawQ, filterLowStock)} className={styles.sortHeader}>
        On hand {sortCol === "on_hand" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
      </a>
    </th>
    <th>
      <a href={sortHref("available", sortCol, sortDir, rawQ, filterLowStock)} className={styles.sortHeader}>
        Available {sortCol === "available" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
      </a>
    </th>
    <th>
      <a href={sortHref("reorder_point", sortCol, sortDir, rawQ, filterLowStock)} className={styles.sortHeader}>
        Reorder point {sortCol === "reorder_point" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
      </a>
    </th>
  </tr>
</thead>
```

Add `.sortHeader` to `components.module.css`:

```css
.sortHeader {
  color: inherit;
  text-decoration: none;
  white-space: nowrap;
}
.sortHeader:hover {
  color: var(--brand-1);
}
```

- [ ] **Step 6: Type-check and commit**

```bash
npx tsc --noEmit
git add src/app/app/components/[componentId]/detail-tabs.tsx \
        src/app/app/components/[componentId]/bin-location-select.tsx \
        src/app/app/components/page.tsx \
        src/app/app/components/components.module.css
git commit -m "fix(components): UX polish — dates, aisle, search, ref labels, sort (F-15–F-19)"
```

---

## Self-Review Checklist

After all tasks are complete, verify each finding before raising the PR:

| F# | Finding | Verified? |
|----|---------|-----------|
| F-01 | Purchasing in sidebar | |
| F-02 | Inventory in sidebar | |
| F-03 | BOM links go to variant page | |
| F-04 | Receive Stock passes component_id | |
| F-05 | Movement refs are linked | |
| F-06 | Edit modal saves changes | |
| F-07 | `<h1>Components</h1>` on list page | |
| F-08 | Archive blocks on conflicts; succeeds when clear | |
| F-09 | Supplier link editable + unlinkable | |
| F-10 | Location tab has copy | |
| F-11 | Stat cards announce label to screen reader | |
| F-12 | Tab widget has correct ARIA roles | |
| F-13 | Close dialog button has aria-label | |
| F-14 | Status dots have sr-only text | |
| F-15 | Movements dates are en-AU format | |
| F-16 | Aisles selectable without sub-location | |
| F-17 | Search preserved on tab switch | |
| F-18 | Ref types show human-readable labels | |
| F-19 | Column headers sort the list | |
