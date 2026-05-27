# BOM Builder Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the BOM authoring experience across three surfaces: product detail page (variant coverage table), variant detail page (tab structure + BOM editor with cost rollup), and component picker (category sidebar + split layout).

**Architecture:** Server components fetch data, pass to client components for interactivity. Tab state managed locally in `variant-tabs.tsx`. Inline BOM editing uses per-line forms with server actions. Version comparison is pure client-side computation over props. Product detail page uses a single server query joining variants, BOMs, and component costs.

**Tech Stack:** Next.js 15 App Router, React 19, Supabase PostgREST + RLS, TypeScript, CSS Modules

**Spec:** `docs/superpowers/specs/2026-05-07-bom-builder-redesign-design.md`

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `supabase/patches/bom_builder_redesign_schema.sql` | Create | Add `yield_pct` to `product_bom_component`; add `price` to `shopify_variant` |
| `src/app/app/bom/actions.ts` | Modify | Fix revalidation paths; add `updateBomComponentYieldPct`, `removeBomComponentLine`, `addComponentsToBom` |
| `src/app/app/products/actions.ts` | Modify | Fix `copyBomToDraft` to copy `yield_pct`; add `duplicateBomAsDraft`; update `createBomWithComponents` for `yield_pct` |
| `src/lib/shopify/sync.ts` | Modify | Add `price` to GraphQL variant query and upsert |
| `src/app/app/products/bom-lightbox.tsx` | Modify | Remove options screen; add category sidebar + split layout (browse top, BOM preview bottom) |
| `src/app/app/products/bom-lightbox.module.css` | Modify | Styles for new split layout |
| `src/app/app/products/bom-seed-panel.tsx` | Modify | Replace 4-card grid with focused empty state |
| `src/app/app/products/variant-tabs.tsx` | Create | Client tab switcher (Overview / Bill of Materials / Labour & Routing / Versions) |
| `src/app/app/products/bom-editor.tsx` | Create | BOM table with inline qty/yield editing + cost rollup footer |
| `src/app/app/products/bom-editor.module.css` | Create | Styles for BOM editor |
| `src/app/app/products/bom-versions-tab.tsx` | Create | Version list sidebar + side-by-side comparison |
| `src/app/app/products/variants/[variantId]/page.tsx` | Modify | Tab structure; new query includes cost_per_unit, unit, yield_pct, price |
| `src/app/app/products/[productId]/page.tsx` | Modify | Rewrite as variant coverage table with BOM status, cost, margin |

---

### Task 0: Schema Migration

**Goal:** Add `yield_pct` to `product_bom_component` and `price` to `shopify_variant` so subsequent tasks can read and write these columns.

**Files:**
- Create: `supabase/patches/bom_builder_redesign_schema.sql`

**Acceptance Criteria:**
- [ ] `product_bom_component.yield_pct` column exists: `numeric not null default 1.0 check (yield_pct > 0 and yield_pct <= 1.0)`
- [ ] `shopify_variant.price` column exists: `numeric` (nullable)
- [ ] Existing rows unaffected (default 1.0 for yield_pct, NULL for price)

**Verify:** Apply patch against local Supabase, then `npx tsc --noEmit` → no errors

**Steps:**

- [ ] **Step 1: Write the SQL patch**

Create `supabase/patches/bom_builder_redesign_schema.sql`:

```sql
-- Add yield_pct to product_bom_component
-- Stored as decimal (0 < yield_pct <= 1.0), displayed as % in UI
-- Line cost formula: unit_cost × quantity ÷ yield_pct
alter table public.product_bom_component
  add column if not exists yield_pct numeric not null default 1.0
    check (yield_pct > 0 and yield_pct <= 1.0);

-- Add price to shopify_variant for margin calculations
-- Populated by Shopify sync; NULL until first sync after this patch
alter table public.shopify_variant
  add column if not exists price numeric;
```

- [ ] **Step 2: Apply against local Supabase**

```bash
npx supabase db reset
# or apply manually via psql / Supabase Studio SQL editor
```

- [ ] **Step 3: Commit**

```bash
git add supabase/patches/bom_builder_redesign_schema.sql
git commit -m "feat(schema): add yield_pct to product_bom_component, price to shopify_variant"
```

---

### Task 1: Server Actions

**Goal:** Update existing server actions to revalidate variant pages, add yield_pct support, add new actions for remove/bulk-add/duplicate, and update Shopify sync to capture variant prices.

**Files:**
- Modify: `src/app/app/bom/actions.ts`
- Modify: `src/app/app/products/actions.ts`
- Modify: `src/lib/shopify/sync.ts`

**Acceptance Criteria:**
- [ ] `updateBomComponentQuantity` revalidates the variant page (accepts `variant_id` form field)
- [ ] `setBomActive` revalidates the variant page
- [ ] `updateBomComponentYieldPct` exists and updates `yield_pct`, revalidates variant page
- [ ] `removeBomComponentLine` exists and deletes the line, revalidates variant page
- [ ] `addComponentsToBom` exists and bulk-inserts lines into an existing BOM
- [ ] `duplicateBomAsDraft` exists and copies the variant's latest BOM to a new draft
- [ ] `copyBomToDraft` copies `yield_pct` alongside `component_id` and `quantity`
- [ ] `createBomWithComponents` accepts `yield_pct` per line in the JSON payload
- [ ] Shopify sync includes `price` in variant GraphQL query and upsert

**Verify:** `npx tsc --noEmit` → no errors

**Steps:**

- [ ] **Step 1: Fix `bom/actions.ts` — revalidation + new actions**

Replace the entire `src/app/app/bom/actions.ts` with:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";

type BomState = {
  error?: string;
  success?: string;
};

function parseNumber(value: FormDataEntryValue | null) {
  if (!value) return null;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

export async function createBom(
  _prevState: BomState,
  formData: FormData
): Promise<BomState> {
  const variantId = formData.get("variant_id")?.toString() ?? "";
  const status = formData.get("status")?.toString() ?? "draft";
  const requestedVersion = parseNumber(formData.get("version"));
  const isActive = formData.get("is_active") === "on";

  if (!variantId) return { error: "Variant is required." };

  const context = await getServerTenantContext();
  if (!context) return { error: "Missing tenant context." };
  const { supabase, tenantId } = context;

  let version = requestedVersion;
  if (!version || version <= 0) {
    const { data: latestBom } = await supabase
      .from("product_bom")
      .select("version")
      .eq("tenant_id", tenantId)
      .eq("variant_id", variantId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    version = Number(latestBom?.version ?? 0) + 1;
  }

  if (isActive) {
    await supabase
      .from("product_bom")
      .update({ is_active: false })
      .eq("variant_id", variantId)
      .eq("tenant_id", tenantId);
  }

  const { error } = await supabase.from("product_bom").insert({
    tenant_id: tenantId,
    variant_id: variantId,
    version,
    status,
    is_active: isActive,
  });
  if (error) return { error: error.message };

  revalidatePath("/app/bom");
  revalidatePath("/app");
  return { success: "BOM created." };
}

export async function updateBomStatus(formData: FormData) {
  const bomId = formData.get("bom_id")?.toString() ?? "";
  const status = formData.get("status")?.toString() ?? "";
  if (!bomId || !status) return;

  const context = await getServerTenantContext();
  if (!context) return;
  const { supabase, tenantId } = context;

  if (status === "archived") {
    await supabase
      .from("product_bom")
      .update({ status, is_active: false })
      .eq("tenant_id", tenantId)
      .eq("id", bomId);
  } else {
    await supabase
      .from("product_bom")
      .update({ status })
      .eq("tenant_id", tenantId)
      .eq("id", bomId);
  }

  revalidatePath("/app/bom");
  revalidatePath("/app");
  revalidatePath("/app/trash");
}

export async function setBomActive(formData: FormData) {
  const bomId = formData.get("bom_id")?.toString() ?? "";
  if (!bomId) return;

  const context = await getServerTenantContext();
  if (!context) return;
  const { supabase, tenantId } = context;

  const { data: bom } = await supabase
    .from("product_bom")
    .select("id,variant_id")
    .eq("tenant_id", tenantId)
    .eq("id", bomId)
    .maybeSingle();
  if (!bom?.variant_id) return;

  await supabase
    .from("product_bom")
    .update({ is_active: false })
    .eq("tenant_id", tenantId)
    .eq("variant_id", bom.variant_id);
  await supabase
    .from("product_bom")
    .update({ is_active: true, status: "active" })
    .eq("tenant_id", tenantId)
    .eq("id", bom.id);

  revalidatePath("/app/bom");
  revalidatePath("/app");
  revalidatePath(`/app/products/variants/${bom.variant_id}`);
}

export async function createBomComponentLine(
  _prevState: BomState,
  formData: FormData
): Promise<BomState> {
  const productBomId = formData.get("product_bom_id")?.toString() ?? "";
  const componentId = formData.get("component_id")?.toString() ?? "";
  const quantity = parseNumber(formData.get("quantity"));
  if (!productBomId || !componentId || quantity === null) {
    return { error: "BOM, component, and quantity are required." };
  }

  const context = await getServerTenantContext();
  if (!context) return { error: "Missing tenant context." };
  const { supabase, tenantId } = context;

  const { error } = await supabase.from("product_bom_component").insert({
    tenant_id: tenantId,
    product_bom_id: productBomId,
    component_id: componentId,
    quantity,
  });
  if (error) return { error: error.message };

  revalidatePath("/app/bom");
  return { success: "BOM component line added." };
}

export async function updateBomComponentQuantity(formData: FormData) {
  const lineId = formData.get("line_id")?.toString() ?? "";
  const variantId = formData.get("variant_id")?.toString() ?? "";
  const quantity = parseNumber(formData.get("quantity"));
  if (!lineId || quantity === null) return;

  const context = await getServerTenantContext();
  if (!context) return;
  const { supabase, tenantId } = context;

  await supabase
    .from("product_bom_component")
    .update({ quantity })
    .eq("tenant_id", tenantId)
    .eq("id", lineId);

  revalidatePath("/app/bom");
  if (variantId) revalidatePath(`/app/products/variants/${variantId}`);
}

export async function updateBomComponentYieldPct(formData: FormData) {
  const lineId = formData.get("line_id")?.toString() ?? "";
  const variantId = formData.get("variant_id")?.toString() ?? "";
  const raw = parseNumber(formData.get("yield_pct"));
  if (!lineId || raw === null) return;

  // Accept either a decimal (0.85) or a percentage (85) — normalise to decimal
  const yieldPct = raw > 1 ? raw / 100 : raw;
  if (yieldPct <= 0 || yieldPct > 1) return;

  const context = await getServerTenantContext();
  if (!context) return;
  const { supabase, tenantId } = context;

  await supabase
    .from("product_bom_component")
    .update({ yield_pct: yieldPct })
    .eq("tenant_id", tenantId)
    .eq("id", lineId);

  revalidatePath("/app/bom");
  if (variantId) revalidatePath(`/app/products/variants/${variantId}`);
}

export async function removeBomComponentLine(formData: FormData) {
  const lineId = formData.get("line_id")?.toString() ?? "";
  const variantId = formData.get("variant_id")?.toString() ?? "";
  if (!lineId) return;

  const context = await getServerTenantContext();
  if (!context) return;
  const { supabase, tenantId } = context;

  await supabase
    .from("product_bom_component")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("id", lineId);

  revalidatePath("/app/bom");
  if (variantId) revalidatePath(`/app/products/variants/${variantId}`);
}

export async function addComponentsToBom(
  _prevState: BomState,
  formData: FormData
): Promise<BomState> {
  const bomId = formData.get("bom_id")?.toString() ?? "";
  const variantId = formData.get("variant_id")?.toString() ?? "";
  const linesJson = formData.get("lines")?.toString() ?? "[]";

  if (!bomId) return { error: "BOM is required." };

  let lines: Array<{ component_id: string; quantity: number; yield_pct?: number }>;
  try {
    lines = JSON.parse(linesJson);
  } catch {
    return { error: "Invalid component data." };
  }

  if (lines.length === 0) return { error: "Select at least one component." };

  const context = await getServerTenantContext();
  if (!context) return { error: "Missing tenant context." };
  const { supabase, tenantId } = context;

  const rows = lines
    .filter((l) => l.quantity > 0)
    .map((l) => ({
      tenant_id: tenantId,
      product_bom_id: bomId,
      component_id: l.component_id,
      quantity: l.quantity,
      yield_pct: l.yield_pct ?? 1.0,
    }));

  const { error } = await supabase.from("product_bom_component").insert(rows);
  if (error) return { error: error.message };

  revalidatePath("/app/bom");
  if (variantId) revalidatePath(`/app/products/variants/${variantId}`);
  return { success: `Added ${rows.length} component(s).` };
}
```

- [ ] **Step 2: Fix `products/actions.ts` — yield_pct in copyBomToDraft + createBomWithComponents + add duplicateBomAsDraft**

In `copyBomToDraft`, change the select and insert to include `yield_pct`:

```typescript
// Change this select:
.select("component_id,quantity")
// To:
.select("component_id,quantity,yield_pct")

// Change the map to include yield_pct:
const rowsToInsert = (sourceLines ?? []).map((line) => ({
  tenant_id: tenantId,
  product_bom_id: insertedBom.id,
  component_id: line.component_id,
  quantity: line.quantity,
  yield_pct: line.yield_pct ?? 1.0,
}));
```

In `createBomWithComponents`, update the lines type and insert to support `yield_pct`:

```typescript
// Change the lines type:
let lines: Array<{ component_id: string; quantity: number; yield_pct?: number }>;

// Change the rows map:
const rows = lines
  .filter((l) => l.quantity > 0)
  .map((l) => ({
    tenant_id: tenantId,
    product_bom_id: insertedBom.id,
    component_id: l.component_id,
    quantity: l.quantity,
    yield_pct: l.yield_pct ?? 1.0,
  }));
```

Add `duplicateBomAsDraft` at the end of `products/actions.ts`:

```typescript
export async function duplicateBomAsDraft(
  _prevState: BomActionState,
  formData: FormData
): Promise<BomActionState> {
  const variantId = formData.get("variant_id")?.toString() ?? "";
  const sourceBomId = formData.get("source_bom_id")?.toString() ?? "";

  if (!variantId || !sourceBomId) {
    return { error: "Variant and source BOM are required." };
  }

  const context = await requireBomEditor();
  if ("error" in context) return { error: context.error };
  const { supabase, tenantId } = context;

  const { data: sourceLines, error: linesError } = await supabase
    .from("product_bom_component")
    .select("component_id,quantity,yield_pct")
    .eq("tenant_id", tenantId)
    .eq("product_bom_id", sourceBomId);

  if (linesError) return { error: linesError.message };

  const version = await getNextBomVersion(tenantId, variantId, supabase);

  const { data: newBom, error: bomError } = await supabase
    .from("product_bom")
    .insert({
      tenant_id: tenantId,
      variant_id: variantId,
      version,
      status: "draft",
      is_active: false,
    })
    .select("id")
    .single();

  if (bomError || !newBom?.id) {
    return { error: bomError?.message ?? "Failed to create draft BOM." };
  }

  const rows = (sourceLines ?? []).map((l) => ({
    tenant_id: tenantId,
    product_bom_id: newBom.id,
    component_id: l.component_id,
    quantity: l.quantity,
    yield_pct: l.yield_pct ?? 1.0,
  }));

  if (rows.length > 0) {
    const { error: insertError } = await supabase
      .from("product_bom_component")
      .insert(rows);
    if (insertError) {
      await supabase.from("product_bom").delete().eq("id", newBom.id);
      return { error: insertError.message };
    }
  }

  revalidatePath(`/app/products/variants/${variantId}`);
  revalidatePath("/app/bom");
  return { success: `Draft BOM v${version} created (${rows.length} lines).` };
}
```

- [ ] **Step 3: Update Shopify sync to include variant price**

In `src/lib/shopify/sync.ts`, make these changes:

Update `ShopifyProductNode` type:
```typescript
variants: { nodes: Array<{ id: string; title: string | null; sku: string | null; price: string | null }> };
```

Update the GraphQL query in `fetchProducts`:
```graphql
variants(first: 100) {
  nodes { id title sku price }
}
```

Update `variantRows` map:
```typescript
const variantRows = products.flatMap((product) =>
  product.variants.nodes
    .map((variant) => ({
      tenant_id: tenantId,
      product_id: productMap.get(product.id) ?? "",
      shopify_id: variant.id,
      title: variant.title ?? "",
      sku: variant.sku,
      price: variant.price ? parseFloat(variant.price) : null,
    }))
    .filter((variant) => variant.product_id)
);
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/app/app/bom/actions.ts src/app/app/products/actions.ts src/lib/shopify/sync.ts
git commit -m "feat(bom): add yield_pct/price actions, fix revalidation, add duplicateBomAsDraft"
```

---

### Task 2: Component Picker Redesign

**Goal:** Remove the 4-card options screen from `bom-lightbox.tsx`; open directly to the picker. Redesign the picker with a category sidebar (left), component list with inline qty steppers (right top), and a BOM preview table (bottom).

**Files:**
- Modify: `src/app/app/products/bom-lightbox.tsx`
- Modify: `src/app/app/products/bom-lightbox.module.css`

**Acceptance Criteria:**
- [ ] Opening the lightbox goes straight to the component picker — no options screen
- [ ] Category sidebar lists all component groups with component counts; "All" selected by default
- [ ] Search bar filters by name or SKU; works together with category filter
- [ ] Selecting a component reveals an inline +/− qty stepper in the same row
- [ ] Bottom table mirrors current selection in real time (read-only qty)
- [ ] Footer shows running material cost total + "Save BOM (N items)" button
- [ ] ✕ in bottom table removes the row and unticks it in the browse panel
- [ ] `onSuccess` callback fires after successful BOM save so the parent can close/refresh

**Verify:** `npx tsc --noEmit` → no errors; open picker in browser, select components, verify split layout renders correctly

**Steps:**

- [ ] **Step 1: Update the ComponentOption type and Props**

The picker now needs `cost_per_unit` to show running cost. Update the types at the top of `bom-lightbox.tsx`:

```typescript
type ComponentOption = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  group: string | null;
  cost_per_unit: number | null;
};

type Props = {
  variantId: string;
  variantLabel: string;
  // If bomId provided, adds to existing BOM; otherwise creates new BOM
  bomId?: string;
  components: ComponentOption[];
  buttonLabel?: string;
  buttonClassName: string;
  // Template/copy options still available as secondary actions
  templates: TemplateOption[];
  sourceBoms: SourceBomOption[];
};
```

- [ ] **Step 2: Rewrite BomLightbox — skip options, open to picker**

Replace the existing `BomLightbox` component body. The key change: `view` no longer starts at `"options"` — we remove the options grid entirely and open directly to the picker.

```typescript
export default function BomLightbox({
  variantId,
  variantLabel,
  bomId,
  components,
  buttonLabel = "Add / Modify BOM",
  buttonClassName,
  templates,
  sourceBoms,
}: Props) {
  const [open, setOpen] = useState(false);
  const [subView, setSubView] = useState<"picker" | "template" | "copy">("picker");
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open) { setSubView("picker"); d.showModal(); }
    else d.close();
  }, [open]);

  return (
    <>
      <button type="button" className={buttonClassName} onClick={() => setOpen(true)}>
        {buttonLabel}
      </button>

      <dialog ref={dialogRef} className={styles.overlay} onClose={() => setOpen(false)}>
        <div className={styles.backdrop} onClick={() => setOpen(false)} />
        <div className={styles.panelSplit}>
          <div className={styles.panelHeader}>
            <div>
              <h2>Add Components</h2>
              <p className={styles.panelSub}>{variantLabel}</p>
            </div>
            <button type="button" className={styles.closeBtn} onClick={() => setOpen(false)}>
              &times;
            </button>
          </div>

          {subView === "picker" && (
            <ComponentPicker
              variantId={variantId}
              bomId={bomId}
              components={components}
              onDone={() => setOpen(false)}
              onShowTemplate={() => setSubView("template")}
              onShowCopy={() => setSubView("copy")}
            />
          )}

          {subView === "template" && (
            <div className={styles.innerPanel}>
              <button type="button" className={styles.backBtn} onClick={() => setSubView("picker")}>
                &larr; Back
              </button>
              <form action={templateAction}>
                <input type="hidden" name="target_variant_id" value={variantId} />
                <h3>From Template</h3>
                {templates.length === 0 ? (
                  <span className={styles.muted}>No templates yet.</span>
                ) : (
                  <>
                    <select name="template_id" required className={styles.select}>
                      <option value="">Select template</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>{t.name} ({t.lineCount})</option>
                      ))}
                    </select>
                    <button type="submit" className={styles.btnPrimary}>Create from Template</button>
                  </>
                )}
                {templateState.error && <span className={styles.err}>{templateState.error}</span>}
                {templateState.success && <span className={styles.ok}>{templateState.success}</span>}
              </form>
            </div>
          )}

          {subView === "copy" && (
            <div className={styles.innerPanel}>
              <button type="button" className={styles.backBtn} onClick={() => setSubView("picker")}>
                &larr; Back
              </button>
              <form action={copyAction}>
                <input type="hidden" name="target_variant_id" value={variantId} />
                <h3>Copy from another variant</h3>
                {sourceBoms.length === 0 ? (
                  <span className={styles.muted}>No BOMs to copy from.</span>
                ) : (
                  <>
                    <select name="source_bom_id" required className={styles.select}>
                      <option value="">Select source BOM</option>
                      {sourceBoms.map((b) => (
                        <option key={b.id} value={b.id}>{b.label}</option>
                      ))}
                    </select>
                    <button type="submit" className={styles.btnSecondary}>Copy to Draft</button>
                  </>
                )}
                {copyState.error && <span className={styles.err}>{copyState.error}</span>}
                {copyState.success && <span className={styles.ok}>{copyState.success}</span>}
              </form>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}
```

- [ ] **Step 3: Rewrite ComponentPicker with category sidebar + split layout**

Replace the existing `ComponentPicker` function inside `bom-lightbox.tsx`:

```typescript
type PickerProps = {
  variantId: string;
  bomId?: string;
  components: ComponentOption[];
  onDone: () => void;
  onShowTemplate: () => void;
  onShowCopy: () => void;
};

type Selection = Record<string, { quantity: number }>;

function ComponentPicker({ variantId, bomId, components, onDone, onShowTemplate, onShowCopy }: PickerProps) {
  const [selection, setSelection] = useState<Selection>({});
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Build category list with counts
  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of components) {
      const g = c.group ?? "Uncategorised";
      map.set(g, (map.get(g) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [components]);

  // Filter by category + search
  const filtered = useMemo(() => {
    return components.filter((c) => {
      const inCategory = !category || (c.group ?? "Uncategorised") === category;
      const q = search.toLowerCase();
      const matchesSearch = !q || c.name.toLowerCase().includes(q) || (c.sku ?? "").toLowerCase().includes(q);
      return inCategory && matchesSearch;
    });
  }, [components, category, search]);

  // Selected rows for the bottom preview table
  const selectedComponents = useMemo(() => {
    return components.filter((c) => selection[c.id]?.quantity > 0);
  }, [components, selection]);

  // Running cost (null if any selected component has no cost)
  const runningCost = useMemo(() => {
    let total = 0;
    for (const c of selectedComponents) {
      const qty = selection[c.id]?.quantity ?? 0;
      if (c.cost_per_unit === null) return null;
      total += c.cost_per_unit * qty;
    }
    return total;
  }, [selectedComponents, selection]);

  function toggleComponent(id: string) {
    setSelection((prev) => {
      if (prev[id]) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: { quantity: 1 } };
    });
  }

  function setQty(id: string, qty: number) {
    if (qty <= 0) {
      setSelection((prev) => { const next = { ...prev }; delete next[id]; return next; });
      return;
    }
    setSelection((prev) => ({ ...prev, [id]: { quantity: qty } }));
  }

  async function handleSave() {
    const selected = Object.entries(selection).filter(([, v]) => v.quantity > 0);
    if (selected.length === 0) { setError("Select at least one component."); return; }

    setSaving(true);
    setError(null);

    const lines = selected.map(([component_id, { quantity }]) => ({ component_id, quantity }));
    const linesJson = JSON.stringify(lines);

    const formData = new FormData();
    formData.set("lines", linesJson);

    let result: { error?: string; success?: string };
    if (bomId) {
      formData.set("bom_id", bomId);
      formData.set("variant_id", variantId);
      result = await addComponentsToBom(undefined as never, formData);
    } else {
      formData.set("target_variant_id", variantId);
      result = await createBomWithComponents(undefined as never, formData);
    }

    setSaving(false);
    if (result.error) { setError(result.error); return; }
    onDone();
  }

  const selectionCount = Object.keys(selection).length;

  return (
    <div className={styles.splitLayout}>
      {/* Top: browse panel */}
      <div className={styles.browsePanel}>
        {/* Search bar */}
        <div className={styles.searchRow}>
          <input
            type="search"
            placeholder="Search by name or SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.searchInput}
          />
        </div>

        <div className={styles.browseBody}>
          {/* Category sidebar */}
          <div className={styles.categorySidebar}>
            <button
              type="button"
              className={`${styles.catBtn} ${!category ? styles.catBtnActive : ""}`}
              onClick={() => setCategory(null)}
            >
              All <span className={styles.catCount}>{components.length}</span>
            </button>
            {categories.map(([name, count]) => (
              <button
                key={name}
                type="button"
                className={`${styles.catBtn} ${category === name ? styles.catBtnActive : ""}`}
                onClick={() => setCategory(name)}
              >
                {name} <span className={styles.catCount}>{count}</span>
              </button>
            ))}
          </div>

          {/* Component list */}
          <div className={styles.componentList}>
            {filtered.length === 0 && (
              <p className={styles.emptyList}>
                {search || category ? "No components match your search." : "No components in catalogue."}
              </p>
            )}
            {filtered.map((c) => {
              const sel = selection[c.id];
              return (
                <div key={c.id} className={`${styles.componentRow} ${sel ? styles.componentRowSelected : ""}`}>
                  <input
                    type="checkbox"
                    checked={!!sel}
                    onChange={() => toggleComponent(c.id)}
                    className={styles.componentCheck}
                  />
                  <div className={styles.componentInfo}>
                    <span className={styles.componentName}>{c.name}</span>
                    {c.sku && <span className={styles.componentSku}>{c.sku}</span>}
                  </div>
                  <span className={styles.componentUnit}>{c.unit ?? "—"}</span>
                  <span className={styles.componentCost}>
                    {c.cost_per_unit !== null ? `$${c.cost_per_unit.toFixed(2)}` : <span className={styles.noCost}>no cost</span>}
                  </span>
                  {sel && (
                    <div className={styles.qtyStepper}>
                      <button type="button" onClick={() => setQty(c.id, sel.quantity - 1)}>−</button>
                      <input
                        type="number"
                        min={1}
                        value={sel.quantity}
                        onChange={(e) => setQty(c.id, Number(e.target.value))}
                        className={styles.qtyInput}
                      />
                      <button type="button" onClick={() => setQty(c.id, sel.quantity + 1)}>+</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom: BOM preview table */}
      <div className={styles.previewPanel}>
        <div className={styles.previewHeader}>Selected components</div>
        {selectedComponents.length === 0 ? (
          <p className={styles.previewEmpty}>No components selected yet.</p>
        ) : (
          <table className={styles.previewTable}>
            <thead>
              <tr>
                <th>Component</th>
                <th>SKU</th>
                <th>Unit</th>
                <th>Qty</th>
                <th>Line cost</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {selectedComponents.map((c) => {
                const qty = selection[c.id]?.quantity ?? 0;
                const lineCost = c.cost_per_unit !== null ? c.cost_per_unit * qty : null;
                return (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.sku ?? "—"}</td>
                    <td>{c.unit ?? "—"}</td>
                    <td>{qty}</td>
                    <td>{lineCost !== null ? `$${lineCost.toFixed(2)}` : "—"}</td>
                    <td>
                      <button type="button" onClick={() => toggleComponent(c.id)} className={styles.removeBtn}>
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <div className={styles.previewFooter}>
          <span className={styles.costTotal}>
            {runningCost !== null ? `Material cost: $${runningCost.toFixed(2)}` : "Cost incomplete — missing prices"}
          </span>
          <div className={styles.footerActions}>
            {!bomId && (
              <>
                <button type="button" onClick={onShowTemplate} className={styles.linkBtn}>
                  start from a template
                </button>
                <span className={styles.separator}>·</span>
                <button type="button" onClick={onShowCopy} className={styles.linkBtn}>
                  copy another variant's BOM
                </button>
              </>
            )}
            <button type="button" onClick={handleSave} disabled={saving || selectionCount === 0} className={styles.btnPrimary}>
              {saving ? "Saving…" : `Save BOM (${selectionCount} item${selectionCount !== 1 ? "s" : ""})`}
            </button>
          </div>
          {error && <p className={styles.err}>{error}</p>}
        </div>
      </div>
    </div>
  );
}
```

Add the missing import at the top of the file:
```typescript
import { addComponentsToBom } from "@/app/app/bom/actions";
```

- [ ] **Step 4: Update CSS for split layout**

Add to `src/app/app/products/bom-lightbox.module.css`:

```css
.panelSplit {
  display: flex;
  flex-direction: column;
  width: min(900px, 95vw);
  max-height: 90vh;
  background: var(--surface, #1a1a1a);
  border-radius: 10px;
  overflow: hidden;
}

.splitLayout {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.browsePanel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  border-bottom: 1px solid #2a2a2a;
}

.searchRow {
  padding: 10px 16px;
  border-bottom: 1px solid #2a2a2a;
}

.searchInput {
  width: 100%;
  padding: 6px 10px;
  background: #111;
  border: 1px solid #333;
  border-radius: 5px;
  color: #eee;
  font-size: 13px;
}

.browseBody {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.categorySidebar {
  width: 150px;
  flex-shrink: 0;
  border-right: 1px solid #2a2a2a;
  overflow-y: auto;
  padding: 6px 0;
}

.catBtn {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 6px 12px;
  background: none;
  border: none;
  color: #aaa;
  font-size: 12px;
  cursor: pointer;
  text-align: left;
}

.catBtn:hover { background: #1e1e1e; color: #eee; }

.catBtnActive { background: #1a2332; color: #4a9eff; }

.catCount {
  font-size: 10px;
  color: #555;
  background: #222;
  border-radius: 8px;
  padding: 1px 5px;
}

.componentList {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0;
}

.componentRow {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  border-bottom: 1px solid #1a1a1a;
  font-size: 13px;
}

.componentRow:hover { background: #161b22; }
.componentRowSelected { background: #1a2332; }

.componentCheck { flex-shrink: 0; cursor: pointer; }

.componentInfo { flex: 1; min-width: 0; }

.componentName { display: block; color: #eee; }

.componentSku { display: block; font-size: 11px; color: #666; }

.componentUnit { color: #666; font-size: 12px; min-width: 40px; }

.componentCost { color: #888; font-size: 12px; min-width: 60px; text-align: right; }

.noCost { color: #e53e3e; font-size: 10px; background: #2a0a0a; border-radius: 3px; padding: 1px 4px; }

.qtyStepper {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.qtyStepper button {
  width: 22px;
  height: 22px;
  background: #222;
  border: 1px solid #333;
  border-radius: 4px;
  color: #aaa;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
}

.qtyInput {
  width: 40px;
  text-align: center;
  background: #111;
  border: 1px solid #333;
  border-radius: 4px;
  color: #eee;
  font-size: 13px;
  padding: 2px 4px;
}

.previewPanel {
  max-height: 220px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.previewHeader {
  padding: 6px 16px;
  font-size: 11px;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  border-bottom: 1px solid #1e1e1e;
  background: #111;
}

.previewEmpty {
  padding: 12px 16px;
  color: #555;
  font-size: 13px;
  font-style: italic;
}

.previewTable {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  overflow-y: auto;
}

.previewTable th {
  padding: 5px 12px;
  text-align: left;
  color: #555;
  font-weight: 400;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  border-bottom: 1px solid #1e1e1e;
}

.previewTable td {
  padding: 6px 12px;
  border-bottom: 1px solid #1a1a1a;
  color: #aaa;
}

.removeBtn {
  background: none;
  border: none;
  color: #555;
  cursor: pointer;
  font-size: 12px;
}
.removeBtn:hover { color: #e53e3e; }

.previewFooter {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  border-top: 1px solid #2a2a2a;
  background: #0d1117;
  flex-wrap: wrap;
  margin-top: auto;
}

.costTotal {
  font-size: 13px;
  color: #aaa;
  flex: 1;
}

.footerActions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.linkBtn {
  background: none;
  border: none;
  color: #4a9eff;
  font-size: 12px;
  cursor: pointer;
  text-decoration: underline;
}

.separator { color: #444; font-size: 12px; }

.emptyList {
  padding: 16px;
  color: #555;
  font-size: 13px;
  text-align: center;
}
```

- [ ] **Step 5: Verify and commit**

```bash
npx tsc --noEmit
git add src/app/app/products/bom-lightbox.tsx src/app/app/products/bom-lightbox.module.css
git commit -m "feat(bom): redesign component picker with category sidebar + split layout"
```

---

### Task 3: BOM Empty State

**Goal:** Replace the 4-card grid in `bom-seed-panel.tsx` with a focused empty state: one primary CTA that opens the picker, and two secondary text links for template and copy paths.

**Files:**
- Modify: `src/app/app/products/bom-seed-panel.tsx`

**Acceptance Criteria:**
- [ ] Empty state shows a large + icon, "No bill of materials yet" heading, and a description
- [ ] "+ Add Components" button opens the component picker directly (via BomLightbox)
- [ ] "start from a template" and "copy another variant's BOM" appear as text links below
- [ ] The 4-card grid is removed entirely

**Verify:** `npx tsc --noEmit` → no errors; navigate to a variant with no BOM and confirm the new empty state renders

**Steps:**

- [ ] **Step 1: Rewrite `bom-seed-panel.tsx`**

```typescript
"use client";

import BomLightbox from "../bom-lightbox";
import styles from "../variant-detail.module.css";

type TemplateOption = {
  id: string;
  name: string;
  description: string | null;
  lineCount: number;
};

type SourceBomOption = {
  id: string;
  label: string;
};

type ComponentOption = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  group: string | null;
  cost_per_unit: number | null;
};

type Props = {
  targetVariantId: string;
  variantLabel: string;
  sourceBoms: SourceBomOption[];
  templates: TemplateOption[];
  components: ComponentOption[];
};

export default function BomSeedPanel({
  targetVariantId,
  variantLabel,
  sourceBoms,
  templates,
  components,
}: Props) {
  return (
    <div className={styles.emptyState}>
      <div className={styles.emptyIcon}>+</div>
      <h3 className={styles.emptyHeading}>No bill of materials yet</h3>
      <p className={styles.emptyDescription}>
        Add components to define what goes into making this variant.
      </p>
      <BomLightbox
        variantId={targetVariantId}
        variantLabel={variantLabel}
        components={components}
        templates={templates}
        sourceBoms={sourceBoms}
        buttonLabel="+ Add Components"
        buttonClassName={styles.primaryButton}
      />
      <p className={styles.emptySecondary}>
        or{" "}
        <BomLightbox
          variantId={targetVariantId}
          variantLabel={variantLabel}
          components={components}
          templates={templates}
          sourceBoms={sourceBoms}
          buttonLabel="start from a template"
          buttonClassName={styles.linkButton}
        />
        {" · "}
        <BomLightbox
          variantId={targetVariantId}
          variantLabel={variantLabel}
          components={components}
          templates={templates}
          sourceBoms={sourceBoms}
          buttonLabel="copy another variant's BOM"
          buttonClassName={styles.linkButton}
        />
      </p>
    </div>
  );
}
```

Add these CSS classes to `src/app/app/products/variant-detail.module.css`:

```css
.emptyState {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 24px;
  text-align: center;
}

.emptyIcon {
  width: 56px;
  height: 56px;
  border: 2px dashed #333;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  color: #444;
  margin-bottom: 16px;
}

.emptyHeading {
  font-size: 18px;
  color: #eee;
  font-weight: 600;
  margin: 0 0 8px;
}

.emptyDescription {
  font-size: 14px;
  color: #666;
  margin: 0 0 20px;
  max-width: 360px;
}

.emptySecondary {
  font-size: 13px;
  color: #555;
  margin-top: 12px;
}

.linkButton {
  background: none;
  border: none;
  color: #4a9eff;
  font-size: 13px;
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
}
```

- [ ] **Step 2: Verify and commit**

```bash
npx tsc --noEmit
git add src/app/app/products/bom-seed-panel.tsx src/app/app/products/variant-detail.module.css
git commit -m "feat(bom): replace 4-card seed panel with focused empty state"
```

---

### Task 4: Variant Page — Tab Structure + BOM Editor

**Goal:** Add a 4-tab layout (Overview / Bill of Materials / Labour & Routing / Versions) to the variant detail page. The Bill of Materials tab shows the BOM editor with inline qty/yield editing and a live cost rollup footer.

**Files:**
- Create: `src/app/app/products/variant-tabs.tsx`
- Create: `src/app/app/products/bom-editor.tsx`
- Create: `src/app/app/products/bom-editor.module.css`
- Modify: `src/app/app/products/variants/[variantId]/page.tsx`

**Acceptance Criteria:**
- [ ] Tabs render with correct active state; tab selection persists in URL (`?tab=bom`)
- [ ] Bill of Materials tab shows the BOM toolbar: status badge, version info, "+ Add component" button, "Set Active" button
- [ ] Component lines table shows name, SKU, unit, qty stepper, yield % input, unit cost, line cost, ✕ remove
- [ ] Components with no `cost_per_unit` show a red "no cost" badge
- [ ] Yield % < 100% highlighted amber; scrap cost shown as subline
- [ ] Cost rollup footer shows materials, labour (—), total, sell price, gross margin
- [ ] Changing qty or yield updates cost rollup live (client-side state)
- [ ] Blur on qty/yield input submits the update server action

**Verify:** `npx tsc --noEmit` → no errors; navigate to a variant with a BOM, change a qty, verify rollup updates instantly and persists on refresh

**Steps:**

- [ ] **Step 1: Create `variant-tabs.tsx`**

Create `src/app/app/products/variant-tabs.tsx`:

```typescript
"use client";

import { useState } from "react";
import styles from "./variant-detail.module.css";

type Tab = "overview" | "bom" | "routing" | "versions";

type Props = {
  initialTab?: Tab;
  children: (activeTab: Tab) => React.ReactNode;
};

const TAB_LABELS: Record<Tab, string> = {
  overview: "Overview",
  bom: "Bill of Materials",
  routing: "Labour & Routing",
  versions: "Versions",
};

export default function VariantTabs({ initialTab = "bom", children }: Props) {
  const [active, setActive] = useState<Tab>(initialTab);

  return (
    <div>
      <div className={styles.tabs}>
        {(Object.keys(TAB_LABELS) as Tab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            className={`${styles.tab} ${active === tab ? styles.tabActive : ""}`}
            onClick={() => setActive(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>
      <div className={styles.tabContent}>{children(active)}</div>
    </div>
  );
}
```

Add to `variant-detail.module.css`:

```css
.tabs {
  display: flex;
  border-bottom: 1px solid #2a2a2a;
  padding: 0 16px;
  gap: 2px;
}

.tab {
  padding: 10px 16px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: #aaa;
  font-size: 13px;
  cursor: pointer;
  margin-bottom: -1px;
}

.tab:hover { color: #eee; }

.tabActive {
  color: #4a9eff;
  border-bottom-color: #4a9eff;
  font-weight: 600;
}

.tabContent {
  padding: 20px;
}
```

- [ ] **Step 2: Create `bom-editor.tsx`**

Create `src/app/app/products/bom-editor.tsx`:

```typescript
"use client";

import { useState, useCallback, useTransition } from "react";
import {
  updateBomComponentQuantity,
  updateBomComponentYieldPct,
  removeBomComponentLine,
  setBomActive,
} from "@/app/app/bom/actions";
import BomLightbox from "./bom-lightbox";
import styles from "./bom-editor.module.css";

type ComponentLine = {
  id: string;
  component_id: string;
  quantity: number;
  yield_pct: number;
  component: {
    name: string;
    sku: string | null;
    unit: string | null;
    cost_per_unit: number | null;
  };
};

type BomData = {
  id: string;
  version: number;
  status: string;
  is_active: boolean;
  created_at: string;
  lines: ComponentLine[];
};

type ComponentOption = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  group: string | null;
  cost_per_unit: number | null;
};

type TemplateOption = { id: string; name: string; description: string | null; lineCount: number };
type SourceBomOption = { id: string; label: string };

type Props = {
  bom: BomData;
  variantId: string;
  variantLabel: string;
  sellPrice: number | null;
  labourCost: number | null;
  allComponents: ComponentOption[];
  templates: TemplateOption[];
  sourceBoms: SourceBomOption[];
};

function lineCost(qty: number, yieldPct: number, costPerUnit: number | null): number | null {
  if (costPerUnit === null) return null;
  return (costPerUnit * qty) / yieldPct;
}

function formatCost(cost: number | null): string {
  if (cost === null) return "—";
  return `$${cost.toFixed(2)}`;
}

export default function BomEditor({
  bom,
  variantId,
  variantLabel,
  sellPrice,
  labourCost,
  allComponents,
  templates,
  sourceBoms,
}: Props) {
  type LocalLine = { quantity: number; yieldPct: number };
  const [localState, setLocalState] = useState<Map<string, LocalLine>>(
    () => new Map(bom.lines.map((l) => [l.id, { quantity: l.quantity, yieldPct: l.yield_pct }]))
  );
  const [, startTransition] = useTransition();

  const updateLocal = useCallback((lineId: string, patch: Partial<LocalLine>) => {
    setLocalState((prev) => {
      const next = new Map(prev);
      const existing = next.get(lineId);
      if (existing) next.set(lineId, { ...existing, ...patch });
      return next;
    });
  }, []);

  // Compute rollup from local state
  let materialCost: number | null = 0;
  let hasAllCosts = true;
  for (const line of bom.lines) {
    const local = localState.get(line.id);
    if (!local) continue;
    const cost = lineCost(local.quantity, local.yieldPct, line.component.cost_per_unit);
    if (cost === null) { hasAllCosts = false; materialCost = null; }
    else if (materialCost !== null) materialCost += cost;
  }

  const totalCost =
    materialCost !== null && labourCost !== null
      ? materialCost + labourCost
      : materialCost ?? (labourCost ?? null);

  const grossMargin =
    totalCost !== null && sellPrice !== null && sellPrice > 0
      ? ((sellPrice - totalCost) / sellPrice) * 100
      : null;

  const statusLabel = bom.is_active ? "ACTIVE" : bom.status.toUpperCase();
  const statusClass = bom.is_active ? styles.badgeActive : styles.badgeDraft;

  return (
    <div className={styles.editor}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <span className={`${styles.badge} ${statusClass}`}>{statusLabel}</span>
          <span className={styles.versionInfo}>v{bom.version}</span>
        </div>
        <div className={styles.toolbarRight}>
          <BomLightbox
            variantId={variantId}
            variantLabel={variantLabel}
            bomId={bom.id}
            components={allComponents}
            templates={templates}
            sourceBoms={sourceBoms}
            buttonLabel="+ Add component"
            buttonClassName={styles.btnSecondary}
          />
          {!bom.is_active && (
            <form action={setBomActive}>
              <input type="hidden" name="bom_id" value={bom.id} />
              <button type="submit" className={styles.btnPrimary}>Set Active</button>
            </form>
          )}
        </div>
      </div>

      {/* Component lines table */}
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Component</th>
              <th>SKU</th>
              <th>Unit</th>
              <th>Qty</th>
              <th>Yield %</th>
              <th>Unit cost</th>
              <th>Line cost</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {bom.lines.map((line) => {
              const local = localState.get(line.id) ?? { quantity: line.quantity, yieldPct: line.yield_pct };
              const cost = lineCost(local.quantity, local.yieldPct, line.component.cost_per_unit);
              const scrapCost =
                local.yieldPct < 1 && line.component.cost_per_unit !== null
                  ? (line.component.cost_per_unit * local.quantity * (1 - local.yieldPct)) / local.yieldPct
                  : null;

              return (
                <tr key={line.id}>
                  <td>
                    <span>{line.component.name}</span>
                    {line.component.cost_per_unit === null && (
                      <span className={styles.noCostBadge}>no cost</span>
                    )}
                  </td>
                  <td className={styles.dimText}>{line.component.sku ?? "—"}</td>
                  <td className={styles.dimText}>{line.component.unit ?? "—"}</td>
                  <td>
                    <form
                      action={updateBomComponentQuantity}
                      onSubmit={(e) => e.preventDefault()}
                    >
                      <input type="hidden" name="line_id" value={line.id} />
                      <input type="hidden" name="variant_id" value={variantId} />
                      <div className={styles.stepper}>
                        <button
                          type="button"
                          onClick={() => {
                            const newQty = Math.max(1, local.quantity - 1);
                            updateLocal(line.id, { quantity: newQty });
                            const fd = new FormData();
                            fd.set("line_id", line.id);
                            fd.set("variant_id", variantId);
                            fd.set("quantity", String(newQty));
                            startTransition(() => { updateBomComponentQuantity(fd); });
                          }}
                        >−</button>
                        <input
                          type="number"
                          name="quantity"
                          min={1}
                          value={local.quantity}
                          className={styles.stepperInput}
                          onChange={(e) => updateLocal(line.id, { quantity: Number(e.target.value) })}
                          onBlur={(e) => {
                            const fd = new FormData();
                            fd.set("line_id", line.id);
                            fd.set("variant_id", variantId);
                            fd.set("quantity", e.target.value);
                            startTransition(() => { updateBomComponentQuantity(fd); });
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const newQty = local.quantity + 1;
                            updateLocal(line.id, { quantity: newQty });
                            const fd = new FormData();
                            fd.set("line_id", line.id);
                            fd.set("variant_id", variantId);
                            fd.set("quantity", String(newQty));
                            startTransition(() => { updateBomComponentQuantity(fd); });
                          }}
                        >+</button>
                      </div>
                    </form>
                  </td>
                  <td>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      step={1}
                      value={Math.round(local.yieldPct * 100)}
                      className={`${styles.yieldInput} ${local.yieldPct < 1 ? styles.yieldLow : ""}`}
                      onChange={(e) => updateLocal(line.id, { yieldPct: Number(e.target.value) / 100 })}
                      onBlur={(e) => {
                        const fd = new FormData();
                        fd.set("line_id", line.id);
                        fd.set("variant_id", variantId);
                        fd.set("yield_pct", e.target.value);
                        startTransition(() => { updateBomComponentYieldPct(fd); });
                      }}
                    />
                    {scrapCost !== null && (
                      <div className={styles.scrapCost}>+{formatCost(scrapCost)} scrap</div>
                    )}
                  </td>
                  <td className={styles.dimText}>{formatCost(line.component.cost_per_unit)}</td>
                  <td>{formatCost(cost)}</td>
                  <td>
                    <form action={removeBomComponentLine}>
                      <input type="hidden" name="line_id" value={line.id} />
                      <input type="hidden" name="variant_id" value={variantId} />
                      <button type="submit" className={styles.removeBtn}>✕</button>
                    </form>
                  </td>
                </tr>
              );
            })}
            {bom.lines.length === 0 && (
              <tr>
                <td colSpan={8} className={styles.emptyRow}>No components yet — use + Add component above.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Cost rollup footer */}
      <div className={styles.rollup}>
        <div className={styles.rollupCell}>
          <span className={styles.rollupLabel}>Materials</span>
          <span className={styles.rollupValue}>{formatCost(materialCost)}</span>
          {materialCost !== null && <span className={styles.rollupSub}>incl. scrap</span>}
        </div>
        <div className={styles.rollupCell}>
          <span className={styles.rollupLabel}>Labour</span>
          <span className={styles.rollupValue}>{labourCost !== null ? formatCost(labourCost) : "—"}</span>
        </div>
        <div className={styles.rollupCell}>
          <span className={styles.rollupLabel}>Total BOM cost</span>
          <span className={styles.rollupValue}>{formatCost(totalCost)}</span>
        </div>
        <div className={styles.rollupCell}>
          <span className={styles.rollupLabel}>Sell price</span>
          <span className={styles.rollupValue}>{sellPrice !== null ? `$${sellPrice.toFixed(2)}` : "—"}</span>
          {sellPrice !== null && <span className={styles.rollupSub}>from Shopify</span>}
        </div>
        <div className={styles.rollupCell}>
          <span className={styles.rollupLabel}>Gross margin</span>
          <span className={`${styles.rollupValue} ${grossMargin !== null && grossMargin < 20 ? styles.marginLow : ""}`}>
            {grossMargin !== null ? `${grossMargin.toFixed(1)}%` : "—"}
          </span>
          {!hasAllCosts && <span className={styles.rollupWarning}>⚠ estimate — missing costs</span>}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `bom-editor.module.css`**

Create `src/app/app/products/bom-editor.module.css`:

```css
.editor {
  display: flex;
  flex-direction: column;
  gap: 0;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  overflow: hidden;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-bottom: 1px solid #2a2a2a;
  background: #111;
}

.toolbarLeft { display: flex; align-items: center; gap: 10px; }
.toolbarRight { display: flex; align-items: center; gap: 8px; }

.badge {
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 700;
}

.badgeActive { background: #4caf5022; color: #4caf50; border: 1px solid #4caf5044; }
.badgeDraft { background: #f59e0b22; color: #f59e0b; border: 1px solid #f59e0b44; }

.versionInfo { color: #666; font-size: 13px; }

.btnPrimary {
  background: #4a9eff;
  color: #fff;
  border: none;
  border-radius: 5px;
  padding: 5px 14px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.btnSecondary {
  background: none;
  border: 1px solid #333;
  color: #aaa;
  border-radius: 5px;
  padding: 5px 12px;
  font-size: 13px;
  cursor: pointer;
}

.tableWrapper { overflow-x: auto; }

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.table th {
  padding: 7px 12px;
  text-align: left;
  font-size: 10px;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  border-bottom: 1px solid #1e1e1e;
  background: #111;
  font-weight: 400;
}

.table td {
  padding: 10px 12px;
  border-bottom: 1px solid #1a1a1a;
  color: #ddd;
  vertical-align: middle;
}

.dimText { color: #666; }

.noCostBadge {
  margin-left: 6px;
  background: #2a0a0a;
  color: #e53e3e;
  border-radius: 3px;
  padding: 1px 5px;
  font-size: 10px;
}

.stepper {
  display: flex;
  align-items: center;
  gap: 4px;
}

.stepper button {
  width: 24px;
  height: 24px;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 4px;
  color: #aaa;
  cursor: pointer;
  font-size: 14px;
}

.stepperInput {
  width: 44px;
  text-align: center;
  background: #111;
  border: 1px solid #333;
  border-radius: 4px;
  color: #eee;
  font-size: 13px;
  padding: 3px 4px;
}

.yieldInput {
  width: 52px;
  text-align: center;
  background: #111;
  border: 1px solid #333;
  border-radius: 4px;
  color: #eee;
  font-size: 13px;
  padding: 3px 4px;
}

.yieldLow { border-color: #f59e0b; color: #f59e0b; }

.scrapCost {
  font-size: 10px;
  color: #f59e0b;
  margin-top: 2px;
}

.removeBtn {
  background: none;
  border: none;
  color: #444;
  cursor: pointer;
  font-size: 12px;
}
.removeBtn:hover { color: #e53e3e; }

.emptyRow {
  text-align: center;
  color: #555;
  padding: 24px;
  font-style: italic;
}

.rollup {
  display: flex;
  gap: 0;
  border-top: 2px solid #2a2a2a;
  background: #0d1117;
}

.rollupCell {
  flex: 1;
  padding: 12px 16px;
  border-right: 1px solid #1e1e1e;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.rollupCell:last-child { border-right: none; }

.rollupLabel {
  font-size: 10px;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.rollupValue {
  font-size: 16px;
  font-weight: 700;
  color: #eee;
}

.rollupSub { font-size: 10px; color: #444; }

.marginLow { color: #e53e3e; }

.rollupWarning {
  font-size: 10px;
  color: #f59e0b;
}
```

- [ ] **Step 4: Update `variants/[variantId]/page.tsx` with new query + tab structure**

Replace `src/app/app/products/variants/[variantId]/page.tsx`. The key changes are: include `price`, `cost_per_unit`, `unit`, `yield_pct` in the BOM query; wrap content in `VariantTabs`; render `BomEditor` or `BomSeedPanel` in the BOM tab.

The server component should query:

```typescript
// Variant with price
const { data: variant } = await supabase
  .from("shopify_variant")
  .select("id,title,sku,shopify_id,price,product:shopify_product(id,title)")
  .eq("id", variantId)
  .maybeSingle();

// All BOMs for this variant, ordered newest first
const { data: boms } = await supabase
  .from("product_bom")
  .select("id,version,status,is_active,created_at")
  .eq("tenant_id", tenantId)
  .eq("variant_id", variantId)
  .order("version", { ascending: false });

// Component lines for the draft or active BOM (the one to show in editor)
// Priority: draft first, then active
const editorBom = (boms ?? []).find((b) => b.status === "draft") ?? (boms ?? []).find((b) => b.is_active);

let bomLines = [];
if (editorBom) {
  const { data: lines } = await supabase
    .from("product_bom_component")
    .select("id,component_id,quantity,yield_pct,component:component_id(name,sku,unit,cost_per_unit)")
    .eq("tenant_id", tenantId)
    .eq("product_bom_id", editorBom.id);
  bomLines = lines ?? [];
}

// All components (for picker)
const { data: allComponents } = await supabase
  .from("component")
  .select("id,name,sku,unit,group,cost_per_unit")
  .eq("tenant_id", tenantId)
  .order("name");

// Labour cost from the editor BOM
let labourCost: number | null = null;
if (editorBom) {
  const { data: laborLines } = await supabase
    .from("product_bom_labor")
    .select("run_hours_per_unit,department:department_id(hourly_rate)")
    .eq("tenant_id", tenantId)
    .eq("product_bom_id", editorBom.id);
  // ... compute labour cost if labour data available
}
```

Wrap the page body in `<VariantTabs>` and render:
- **Overview tab**: variant metadata (title, SKU, price, shopify_id)
- **BOM tab**: `<BomEditor>` if `editorBom` exists, else `<BomSeedPanel>`
- **Labour & Routing tab**: existing labour content (moved from current flat layout)
- **Versions tab**: `<BomVersionsTab>` (added in Task 5)

- [ ] **Step 5: TypeScript check and commit**

```bash
npx tsc --noEmit
git add src/app/app/products/variant-tabs.tsx src/app/app/products/bom-editor.tsx src/app/app/products/bom-editor.module.css src/app/app/products/variants/
git commit -m "feat(bom): variant page tab structure + BOM editor with live cost rollup"
```

---

### Task 5: Versions Tab

**Goal:** Create the Versions tab component with a version list sidebar and a side-by-side comparison view. Clicking one version shows its component list; clicking a second enters comparison mode.

**Files:**
- Create: `src/app/app/products/bom-versions-tab.tsx`

**Acceptance Criteria:**
- [ ] Version list shows version number, status badge, date, author (if available), material cost
- [ ] Active version has blue left border; archived versions have reduced opacity
- [ ] "+ New draft" button duplicates the active BOM via `duplicateBomAsDraft`
- [ ] Clicking one version shows its full component list on the right
- [ ] Clicking a second version enters comparison mode (side-by-side)
- [ ] Comparison shows: unchanged (greyed), qty changed (amber, "was X"), added (green, "New in vN"), removed (red, "Removed in vN")
- [ ] Footer shows material cost for each version, delta, and margin impact if activated

**Verify:** `npx tsc --noEmit` → no errors; create two BOM versions, open Versions tab, click both to trigger comparison

**Steps:**

- [ ] **Step 1: Create `bom-versions-tab.tsx`**

Create `src/app/app/products/bom-versions-tab.tsx`:

```typescript
"use client";

import { useState, useMemo } from "react";
import { useActionState } from "react";
import { duplicateBomAsDraft } from "./actions";
import { setBomActive } from "@/app/app/bom/actions";
import styles from "./variant-detail.module.css";

type ComponentLine = {
  id: string;
  component_id: string;
  quantity: number;
  yield_pct: number;
  component: {
    name: string;
    sku: string | null;
    unit: string | null;
    cost_per_unit: number | null;
  };
};

type BomVersion = {
  id: string;
  version: number;
  status: string;
  is_active: boolean;
  created_at: string;
  lines: ComponentLine[];
};

type DiffRow = {
  componentId: string;
  name: string;
  sku: string | null;
  unit: string | null;
  costPerUnit: number | null;
  leftQty: number | null;
  rightQty: number | null;
  change: "unchanged" | "changed" | "added" | "removed";
};

function diffVersions(left: BomVersion, right: BomVersion): DiffRow[] {
  const leftMap = new Map(left.lines.map((l) => [l.component_id, l]));
  const rightMap = new Map(right.lines.map((l) => [l.component_id, l]));
  const allIds = new Set([...leftMap.keys(), ...rightMap.keys()]);

  return Array.from(allIds).map((id) => {
    const l = leftMap.get(id);
    const r = rightMap.get(id);
    const ref = (l ?? r)!;
    const change =
      !l ? "added" : !r ? "removed" : l.quantity !== r.quantity ? "changed" : "unchanged";
    return {
      componentId: id,
      name: ref.component.name,
      sku: ref.component.sku,
      unit: ref.component.unit,
      costPerUnit: ref.component.cost_per_unit,
      leftQty: l?.quantity ?? null,
      rightQty: r?.quantity ?? null,
      change,
    };
  });
}

function versionMaterialCost(v: BomVersion): number | null {
  let total = 0;
  for (const l of v.lines) {
    if (l.component.cost_per_unit === null) return null;
    total += (l.component.cost_per_unit * l.quantity) / l.yield_pct;
  }
  return total;
}

function statusBadgeClass(v: BomVersion, styles: Record<string, string>): string {
  if (v.is_active) return styles.badgeActive;
  if (v.status === "archived") return styles.badgeArchived;
  return styles.badgeDraft;
}

type Props = {
  versions: BomVersion[];
  variantId: string;
  sellPrice: number | null;
};

const initialState = { error: undefined, success: undefined };

export default function BomVersionsTab({ versions, variantId, sellPrice }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [dupState, dupAction] = useActionState(duplicateBomAsDraft, initialState);

  const activeVersion = versions.find((v) => v.is_active);

  function handleVersionClick(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  }

  const leftVersion = versions.find((v) => v.id === selected[0]);
  const rightVersion = versions.find((v) => v.id === selected[1]);

  const diff = useMemo(
    () => (leftVersion && rightVersion ? diffVersions(leftVersion, rightVersion) : null),
    [leftVersion, rightVersion]
  );

  const leftCost = leftVersion ? versionMaterialCost(leftVersion) : null;
  const rightCost = rightVersion ? versionMaterialCost(rightVersion) : null;
  const costDelta = leftCost !== null && rightCost !== null ? rightCost - leftCost : null;

  const leftMargin =
    leftCost !== null && sellPrice !== null && sellPrice > 0
      ? ((sellPrice - leftCost) / sellPrice) * 100
      : null;
  const rightMargin =
    rightCost !== null && sellPrice !== null && sellPrice > 0
      ? ((sellPrice - rightCost) / sellPrice) * 100
      : null;

  function formatCost(v: number | null) {
    return v !== null ? `$${v.toFixed(2)}` : "—";
  }

  return (
    <div className={styles.versionsLayout}>
      {/* Left: version list */}
      <div className={styles.versionsList}>
        <div className={styles.versionsListHeader}>
          <span className={styles.versionsListLabel}>History</span>
          {activeVersion && (
            <form action={dupAction}>
              <input type="hidden" name="variant_id" value={variantId} />
              <input type="hidden" name="source_bom_id" value={activeVersion.id} />
              <button type="submit" className={styles.newDraftBtn}>+ New draft</button>
            </form>
          )}
        </div>
        {dupState.error && <p className={styles.versionsError}>{dupState.error}</p>}
        {dupState.success && <p className={styles.versionsSuccess}>{dupState.success}</p>}

        {versions.map((v) => {
          const cost = versionMaterialCost(v);
          const isSelected = selected.includes(v.id);
          return (
            <div
              key={v.id}
              className={`${styles.versionItem} ${isSelected ? styles.versionItemSelected : ""} ${v.status === "archived" ? styles.versionItemArchived : ""}`}
              onClick={() => handleVersionClick(v.id)}
              role="button"
              tabIndex={0}
            >
              <div className={styles.versionItemRow}>
                <span className={styles.versionNum}>v{v.version}</span>
                <span className={`${styles.badge} ${statusBadgeClass(v, styles)}`}>
                  {v.is_active ? "ACTIVE" : v.status.toUpperCase()}
                </span>
              </div>
              <div className={styles.versionMeta}>
                {new Date(v.created_at).toLocaleDateString()}
              </div>
              <div className={styles.versionCost}>
                {v.lines.length} components · {formatCost(cost)}
              </div>
            </div>
          );
        })}

        <p className={styles.versionHint}>
          {selected.length === 0 && "Click a version to view"}
          {selected.length === 1 && "Click another version to compare"}
          {selected.length === 2 && "Click a version to deselect"}
        </p>
      </div>

      {/* Right: single view or comparison */}
      <div className={styles.versionsDetail}>
        {selected.length === 0 && (
          <p className={styles.versionsPlaceholder}>Select a version to view its components.</p>
        )}

        {selected.length === 1 && leftVersion && !rightVersion && (
          <div>
            <div className={styles.singleVersionHeader}>
              <span className={`${styles.badge} ${statusBadgeClass(leftVersion, styles)}`}>
                v{leftVersion.version} {leftVersion.is_active ? "ACTIVE" : leftVersion.status}
              </span>
              {!leftVersion.is_active && leftVersion.status !== "archived" && (
                <form action={setBomActive}>
                  <input type="hidden" name="bom_id" value={leftVersion.id} />
                  <button type="submit" className={styles.setActiveBtn}>Make this the active version</button>
                </form>
              )}
            </div>
            <table className={styles.versionTable}>
              <thead>
                <tr><th>Component</th><th>SKU</th><th>Unit</th><th>Qty</th><th>Line cost</th></tr>
              </thead>
              <tbody>
                {leftVersion.lines.map((l) => {
                  const cost = l.component.cost_per_unit !== null
                    ? (l.component.cost_per_unit * l.quantity) / l.yield_pct
                    : null;
                  return (
                    <tr key={l.id}>
                      <td>{l.component.name}</td>
                      <td>{l.component.sku ?? "—"}</td>
                      <td>{l.component.unit ?? "—"}</td>
                      <td>{l.quantity}</td>
                      <td>{cost !== null ? `$${cost.toFixed(2)}` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {selected.length === 2 && diff && leftVersion && rightVersion && (
          <div>
            {/* Comparison header */}
            <div className={styles.compareHeader}>
              <div className={styles.compareHeaderCell}>
                <span className={styles.compareLabel}>Current (Active)</span>
                <span className={`${styles.badge} ${statusBadgeClass(leftVersion, styles)}`}>v{leftVersion.version}</span>
              </div>
              <div className={styles.compareHeaderCell}>
                <span className={styles.compareLabel}>New version</span>
                <span className={`${styles.badge} ${statusBadgeClass(rightVersion, styles)}`}>v{rightVersion.version}</span>
                {!rightVersion.is_active && rightVersion.status !== "archived" && (
                  <form action={setBomActive}>
                    <input type="hidden" name="bom_id" value={rightVersion.id} />
                    <button type="submit" className={styles.setActiveBtn}>Make this the active version</button>
                  </form>
                )}
              </div>
            </div>

            {/* Diff rows */}
            {diff.length === 0 || diff.every((r) => r.change === "unchanged") ? (
              <p className={styles.versionsPlaceholder}>These versions are identical.</p>
            ) : (
              diff.map((row) => (
                <div
                  key={row.componentId}
                  className={`${styles.diffRow} ${styles[`diffRow_${row.change}`]}`}
                >
                  <div className={styles.diffCell}>
                    {row.change === "added" ? (
                      <span className={styles.notIncluded}>Not included</span>
                    ) : (
                      <span className={row.change === "removed" ? styles.removedName : ""}>
                        {row.name}
                        {row.change === "removed" && (
                          <span className={styles.changeLabel + " " + styles.removedLabel}>Removed in v{rightVersion.version}</span>
                        )}
                      </span>
                    )}
                    <span className={styles.diffQty}>{row.leftQty ?? "—"}</span>
                  </div>
                  <div className={styles.diffCell}>
                    {row.change === "removed" ? (
                      <span className={styles.notIncluded}>Not included</span>
                    ) : (
                      <span>
                        {row.name}
                        {row.change === "added" && (
                          <span className={styles.changeLabel + " " + styles.addedLabel}>New in v{rightVersion.version}</span>
                        )}
                      </span>
                    )}
                    <div>
                      <span className={row.change === "changed" ? styles.changedQty : styles.diffQty}>
                        {row.rightQty ?? "—"}
                      </span>
                      {row.change === "changed" && row.leftQty !== null && (
                        <span className={styles.wasLabel}>was {row.leftQty}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}

            {/* Footer */}
            <div className={styles.compareFooter}>
              <div>
                <div className={styles.rollupLabel}>v{leftVersion.version} total cost</div>
                <div className={styles.rollupValue}>{formatCost(leftCost)}</div>
                {leftMargin !== null && (
                  <div className={styles.rollupSub}>Margin: {leftMargin.toFixed(1)}%</div>
                )}
              </div>
              <div>
                <div className={styles.rollupLabel}>v{rightVersion.version} total cost</div>
                <div className={styles.rollupValue}>{formatCost(rightCost)}</div>
                {costDelta !== null && (
                  <span className={costDelta > 0 ? styles.deltaUp : styles.deltaDown}>
                    {costDelta > 0 ? "+" : ""}{formatCost(costDelta)}
                  </span>
                )}
                {rightMargin !== null && leftMargin !== null && rightMargin < leftMargin && (
                  <div className={styles.marginWarning}>
                    Margin drops to {rightMargin.toFixed(1)}% if activated
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Add Versions tab CSS to `variant-detail.module.css`**

```css
.versionsLayout {
  display: flex;
  min-height: 400px;
  border: 1px solid #2a2a2a;
  border-radius: 8px;
  overflow: hidden;
}

.versionsList {
  width: 220px;
  flex-shrink: 0;
  border-right: 1px solid #222;
  overflow-y: auto;
}

.versionsListHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid #1e1e1e;
}

.versionsListLabel {
  font-size: 11px;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.newDraftBtn {
  background: #4a9eff22;
  color: #4a9eff;
  border: 1px solid #4a9eff44;
  border-radius: 4px;
  padding: 3px 8px;
  font-size: 11px;
  cursor: pointer;
}

.versionItem {
  padding: 12px 14px;
  border-bottom: 1px solid #1e1e1e;
  cursor: pointer;
  border-left: 3px solid transparent;
}

.versionItem:hover { background: #161b22; }

.versionItemSelected { background: #1a2332; border-left-color: #4a9eff; }

.versionItemArchived { opacity: 0.55; }

.versionItemRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.versionNum { color: #eee; font-size: 13px; font-weight: 600; }

.versionMeta { font-size: 11px; color: #666; }

.versionCost { font-size: 11px; color: #888; margin-top: 3px; }

.versionHint {
  padding: 10px 14px;
  font-size: 11px;
  color: #555;
  text-align: center;
}

.versionsError { padding: 6px 14px; font-size: 12px; color: #e53e3e; }
.versionsSuccess { padding: 6px 14px; font-size: 12px; color: #4caf50; }

.versionsDetail {
  flex: 1;
  overflow-y: auto;
  padding: 0;
}

.versionsPlaceholder {
  padding: 24px;
  color: #555;
  font-style: italic;
  font-size: 13px;
}

.singleVersionHeader {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid #1e1e1e;
}

.setActiveBtn {
  background: #4a9eff;
  color: #fff;
  border: none;
  border-radius: 5px;
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.versionTable {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.versionTable th {
  padding: 6px 16px;
  text-align: left;
  font-size: 10px;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  border-bottom: 1px solid #1e1e1e;
  background: #111;
  font-weight: 400;
}

.versionTable td {
  padding: 9px 16px;
  border-bottom: 1px solid #1a1a1a;
  color: #aaa;
}

.compareHeader {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border-bottom: 2px solid #2a2a2a;
}

.compareHeaderCell {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-right: 1px solid #2a2a2a;
}

.compareHeaderCell:last-child { border-right: none; }

.compareLabel { font-size: 11px; color: #555; text-transform: uppercase; letter-spacing: 0.4px; }

.diffRow {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border-bottom: 1px solid #1a1a1a;
}

.diffRow_unchanged { opacity: 0.5; }
.diffRow_changed { background: #f59e0b08; }
.diffRow_added { background: #4caf5008; }
.diffRow_removed { background: #e53e3e08; }

.diffCell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  border-right: 1px solid #1e1e1e;
  font-size: 13px;
  color: #aaa;
}

.diffCell:last-child { border-right: none; }

.diffQty { color: #666; }

.changedQty { color: #f59e0b; font-weight: 600; }

.wasLabel { font-size: 10px; color: #f59e0b; opacity: 0.7; display: block; }

.notIncluded { font-style: italic; color: #444; }

.removedName { text-decoration: line-through; }

.changeLabel {
  font-size: 10px;
  border-radius: 3px;
  padding: 1px 5px;
  margin-left: 6px;
}

.addedLabel { background: #4caf5022; color: #4caf50; }
.removedLabel { background: #e53e3e22; color: #e53e3e; }

.badgeArchived { background: #33333322; color: #666; border: 1px solid #444; }

.compareFooter {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border-top: 2px solid #2a2a2a;
  background: #0d1117;
}

.compareFooter > div {
  padding: 12px 16px;
  border-right: 1px solid #222;
}

.compareFooter > div:last-child { border-right: none; }

.deltaUp { color: #f59e0b; font-size: 12px; margin-left: 6px; }
.deltaDown { color: #4caf50; font-size: 12px; margin-left: 6px; }

.marginWarning { font-size: 11px; color: #e53e3e; margin-top: 4px; }
```

- [ ] **Step 3: Wire Versions tab into the variant page**

In `variants/[variantId]/page.tsx`, pass all versions (with their lines) to `<BomVersionsTab>`. Each version needs its lines loaded. Extend the server query:

```typescript
// Load all BOM versions with their lines for the Versions tab
const bomsWithLines = await Promise.all(
  (boms ?? []).map(async (bom) => {
    const { data: lines } = await supabase
      .from("product_bom_component")
      .select("id,component_id,quantity,yield_pct,component:component_id(name,sku,unit,cost_per_unit)")
      .eq("tenant_id", tenantId)
      .eq("product_bom_id", bom.id);
    return { ...bom, lines: lines ?? [] };
  })
);
```

Then in the Versions tab render:
```tsx
<BomVersionsTab versions={bomsWithLines} variantId={variantId} sellPrice={variant.price} />
```

- [ ] **Step 4: Commit**

```bash
npx tsc --noEmit
git add src/app/app/products/bom-versions-tab.tsx src/app/app/products/variant-detail.module.css src/app/app/products/variants/
git commit -m "feat(bom): versions tab with side-by-side comparison"
```

---

### Task 6: Product Detail Page — Variant Coverage Table

**Goal:** Replace the dropdown picker on the product detail page with a variant coverage table showing BOM status, component count, material cost, and margin per variant row, plus a BOM coverage bar and footer summary.

**Files:**
- Modify: `src/app/app/products/[productId]/page.tsx`

**Acceptance Criteria:**
- [ ] BOM coverage bar shows `X / Y variants` with amber badge for missing BOMs
- [ ] Variant table shows: Variant name, SKU, BOM status badge, component count, material cost, margin
- [ ] Variants without BOMs have amber left border + "⚠ low" style; "+ Create BOM" is the primary CTA
- [ ] Margin < 20% shown in red with "⚠ low" label
- [ ] Footer shows average margin across active BOMs and the worst-performing variant
- [ ] Row click navigates to `/app/products/variants/[variantId]`

**Verify:** `npx tsc --noEmit` → no errors; open a product with multiple variants and verify the table renders with correct statuses

**Steps:**

- [ ] **Step 1: Write the new query**

The page needs: product, all variants, each variant's active/draft BOM status, component count, and material cost (sum of `cost_per_unit × quantity ÷ yield_pct`). Sell price comes from `shopify_variant.price`.

```typescript
// Variants with their most relevant BOM
const { data: variants } = await supabase
  .from("shopify_variant")
  .select("id,title,sku,price")
  .eq("product_id", productId)
  .order("created_at", { ascending: true });

// For each variant, fetch its active or draft BOM + line cost data
type VariantSummary = {
  id: string;
  title: string | null;
  sku: string | null;
  price: number | null;
  bom: {
    id: string;
    version: number;
    status: string;
    is_active: boolean;
    componentCount: number;
    materialCost: number | null;
  } | null;
};

const summaries: VariantSummary[] = await Promise.all(
  (variants ?? []).map(async (v) => {
    const { data: boms } = await supabase
      .from("product_bom")
      .select("id,version,status,is_active")
      .eq("tenant_id", tenantId)
      .eq("variant_id", v.id)
      .or("is_active.eq.true,status.eq.draft")
      .order("is_active", { ascending: false })
      .limit(1);

    const bom = boms?.[0] ?? null;
    if (!bom) return { ...v, bom: null };

    const { data: lines } = await supabase
      .from("product_bom_component")
      .select("quantity,yield_pct,component:component_id(cost_per_unit)")
      .eq("tenant_id", tenantId)
      .eq("product_bom_id", bom.id);

    let materialCost: number | null = 0;
    for (const l of lines ?? []) {
      const cpu = (l.component as { cost_per_unit: number | null } | null)?.cost_per_unit ?? null;
      if (cpu === null) { materialCost = null; break; }
      if (materialCost !== null) materialCost += (cpu * l.quantity) / (l.yield_pct ?? 1);
    }

    return {
      ...v,
      bom: {
        id: bom.id,
        version: bom.version,
        status: bom.status,
        is_active: bom.is_active,
        componentCount: (lines ?? []).length,
        materialCost,
      },
    };
  })
);
```

- [ ] **Step 2: Render the coverage bar and variant table**

The product detail page becomes a server component that renders:

```tsx
export default async function ProductDetailPage({ params }: Props) {
  const { productId } = await params;
  // ... fetch summaries (above)

  const variantsWithBom = summaries.filter((s) => s.bom !== null);
  const variantsWithActiveBom = summaries.filter((s) => s.bom?.is_active);
  const coveragePct = summaries.length > 0 ? (variantsWithBom.length / summaries.length) * 100 : 0;

  const marginsWithData = variantsWithActiveBom
    .filter((s) => s.bom?.materialCost !== null && s.price !== null && s.price > 0)
    .map((s) => ({ ...s, margin: ((s.price! - s.bom!.materialCost!) / s.price!) * 100 }));

  const avgMargin = marginsWithData.length > 0
    ? marginsWithData.reduce((sum, s) => sum + s.margin, 0) / marginsWithData.length
    : null;

  const worstMargin = marginsWithData.length > 0
    ? marginsWithData.reduce((worst, s) => s.margin < worst.margin ? s : worst)
    : null;

  return (
    <div>
      {/* Product header with BOM coverage bar */}
      <div className={styles.productHeader}>
        <h1>{product.title}</h1>
        <div className={styles.coverageRow}>
          <span>BOM coverage</span>
          <div className={styles.coverageBar}>
            <div className={styles.coverageFill} style={{ width: `${coveragePct}%` }} />
          </div>
          <span>{variantsWithBom.length} / {summaries.length} variants</span>
          {summaries.length - variantsWithBom.length > 0 && (
            <span className={styles.missingBadge}>
              {summaries.length - variantsWithBom.length} need BOMs
            </span>
          )}
        </div>
      </div>

      {/* Variants table */}
      <div className={styles.variantsTable}>
        <div className={styles.tableHeader}>
          <span>Variant</span>
          <span>SKU</span>
          <span>BOM status</span>
          <span>Components</span>
          <span>Mat. cost</span>
          <span>Margin</span>
          <span>Actions</span>
        </div>
        {summaries.map((s) => {
          const margin = s.bom?.is_active && s.bom.materialCost !== null && s.price !== null && s.price > 0
            ? ((s.price - s.bom.materialCost) / s.price) * 100
            : null;
          const isLowMargin = margin !== null && margin < 20;
          const hasNoBom = s.bom === null;

          return (
            <Link
              key={s.id}
              href={`/app/products/variants/${s.id}`}
              className={`${styles.variantRow} ${hasNoBom ? styles.variantRowNoBom : ""}`}
            >
              <div>
                <div className={styles.variantName}>{s.title ?? "—"}</div>
                {s.bom && (
                  <div className={styles.variantSub}>
                    v{s.bom.version} {s.bom.is_active ? "active" : "draft"}
                  </div>
                )}
                {!s.bom && <div className={styles.variantSub}>No BOM created yet</div>}
              </div>
              <span className={styles.variantSku}>{s.sku ?? "—"}</span>
              <span>
                {!s.bom && <span className={styles.badgeNone}>No BOM</span>}
                {s.bom?.is_active && <span className={styles.badgeActive}>Active BOM</span>}
                {s.bom && !s.bom.is_active && <span className={styles.badgeDraft}>Draft BOM</span>}
              </span>
              <span className={styles.center}>{s.bom ? s.bom.componentCount : "—"}</span>
              <span className={`${styles.right} ${isLowMargin ? styles.costRed : s.bom?.materialCost !== null ? styles.costGreen : ""}`}>
                {s.bom?.materialCost !== null && s.bom?.materialCost !== undefined ? `$${s.bom.materialCost.toFixed(2)}` : "—"}
              </span>
              <div className={styles.right}>
                {margin !== null ? (
                  <>
                    <span className={isLowMargin ? styles.marginRed : styles.marginGreen}>
                      {margin.toFixed(1)}%
                    </span>
                    {isLowMargin && <div className={styles.lowMarginLabel}>⚠ low</div>}
                  </>
                ) : "—"}
              </div>
              <div className={styles.actions} onClick={(e) => e.preventDefault()}>
                {s.bom ? (
                  <Link href={`/app/products/variants/${s.id}`} className={styles.editBtn}>Edit BOM</Link>
                ) : (
                  <Link href={`/app/products/variants/${s.id}`} className={styles.createBtn}>+ Create BOM</Link>
                )}
              </div>
            </Link>
          );
        })}
      </div>

      {/* Footer */}
      {avgMargin !== null && (
        <div className={styles.tableFooter}>
          <div>
            <div className={styles.footerLabel}>Avg. margin</div>
            <div className={styles.footerValue}>{avgMargin.toFixed(1)}% across active BOMs</div>
          </div>
          {worstMargin && (
            <div>
              <div className={styles.footerLabel}>Lowest margin</div>
              <div className={styles.footerValueRed}>
                {worstMargin.title} {worstMargin.margin.toFixed(1)}%
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add product detail CSS to `product-detail.module.css`**

```css
.productHeader {
  padding: 20px;
  border-bottom: 1px solid #2a2a2a;
}

.coverageRow {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  font-size: 12px;
  color: #888;
}

.coverageBar {
  width: 180px;
  height: 6px;
  background: #222;
  border-radius: 3px;
  overflow: hidden;
}

.coverageFill {
  height: 100%;
  background: #4caf50;
  border-radius: 3px;
  transition: width 0.3s;
}

.missingBadge {
  background: #f59e0b22;
  color: #f59e0b;
  border: 1px solid #f59e0b44;
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 11px;
}

.tableHeader {
  display: grid;
  grid-template-columns: 1fr 110px 130px 90px 90px 90px 120px;
  padding: 7px 20px;
  font-size: 10px;
  color: #555;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  border-bottom: 1px solid #1e1e1e;
  background: #111;
}

.variantRow {
  display: grid;
  grid-template-columns: 1fr 110px 130px 90px 90px 90px 120px;
  padding: 12px 20px;
  border-bottom: 1px solid #1a1a1a;
  align-items: center;
  text-decoration: none;
  color: inherit;
}

.variantRow:hover { background: #161b22; }

.variantRowNoBom {
  background: #f59e0b06;
  border-left: 3px solid #f59e0b;
}

.variantRowNoBom:hover { background: #1e1a0e; }

.variantName { color: #eee; font-size: 13px; font-weight: 500; }
.variantSub { font-size: 11px; color: #555; margin-top: 1px; }
.variantSku { color: #666; font-size: 12px; }

.badgeNone { background: #33333322; color: #666; border: 1px solid #444; border-radius: 4px; padding: 2px 8px; font-size: 11px; }
.badgeActive { background: #4caf5022; color: #4caf50; border: 1px solid #4caf5044; border-radius: 4px; padding: 2px 8px; font-size: 11px; font-weight: 600; }
.badgeDraft { background: #f59e0b22; color: #f59e0b; border: 1px solid #f59e0b44; border-radius: 4px; padding: 2px 8px; font-size: 11px; font-weight: 600; }

.center { text-align: center; color: #aaa; font-size: 13px; }
.right { text-align: right; font-size: 13px; }

.costGreen { color: #4caf50; }
.costRed { color: #e53e3e; }
.marginGreen { color: #4caf50; }
.marginRed { color: #e53e3e; font-weight: 600; }
.lowMarginLabel { font-size: 10px; color: #e53e3e; }

.actions { text-align: right; display: flex; gap: 6px; justify-content: flex-end; }

.editBtn {
  background: none;
  border: 1px solid #333;
  color: #aaa;
  border-radius: 4px;
  padding: 3px 10px;
  font-size: 11px;
  text-decoration: none;
}

.createBtn {
  background: #4a9eff;
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 3px 10px;
  font-size: 11px;
  font-weight: 600;
  text-decoration: none;
}

.tableFooter {
  padding: 12px 20px;
  background: #0d1117;
  display: flex;
  gap: 24px;
  align-items: center;
}

.footerLabel { font-size: 11px; color: #555; text-transform: uppercase; letter-spacing: 0.4px; }
.footerValue { color: #eee; font-size: 15px; font-weight: 600; margin-top: 2px; }
.footerValueRed { color: #e53e3e; font-size: 15px; font-weight: 600; margin-top: 2px; }
```

- [ ] **Step 4: Remove now-unused components**

The old `ProductVariantPicker` dropdown component is no longer used on the product detail page. Remove its import from `page.tsx`. Do not delete the file itself until confirmed it is not used elsewhere.

```bash
grep -r "ProductVariantPicker" src/
# If only referenced in products/[productId]/page.tsx, safe to delete:
# rm src/app/app/products/product-variant-picker.tsx
```

- [ ] **Step 5: TypeScript check and commit**

```bash
npx tsc --noEmit
git add src/app/app/products/[productId]/page.tsx src/app/app/products/product-detail.module.css
git commit -m "feat(products): variant coverage table with BOM status, cost, and margin"
```
