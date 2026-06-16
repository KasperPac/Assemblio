# Templates BOM-Editor Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the expanded component template rows to match the variant BOM editor — proper table with drag handles, SKU, unit cost, line cost columns, stepper qty, materials total, and drag-and-drop reorder.

**Architecture:** Keep the inline expansion pattern on the templates list page. Replace the CSS-grid `ComponentExpansion` with a `<table>`-based layout matching `bom-editor.tsx`. Add a `sort_order` column to `bom_template_line` for drag-and-drop reordering. Thread `cost_per_unit` from the server query through to the expansion component.

**Tech Stack:** Next.js 15, React, `@dnd-kit/core` + `@dnd-kit/sortable` (already installed), CSS Modules, Supabase

---

### Task 1: SQL Patch — Add `sort_order` to `bom_template_line`

**Goal:** Add a `sort_order integer` column to `bom_template_line` so template lines can be reordered via drag-and-drop.

**Files:**
- Create: `supabase/patches/bom_template_line_sort_order.sql`

**Acceptance Criteria:**
- [ ] Patch is idempotent (uses `add column if not exists`)
- [ ] Existing rows get `sort_order` defaulting to 0

**Verify:** Read the patch file and confirm SQL is valid.

**Steps:**

- [ ] **Step 1: Create the SQL patch**

```sql
-- Add sort_order to bom_template_line for drag-and-drop reordering.
-- Idempotent. Apply manually before deploying.

alter table public.bom_template_line
  add column if not exists sort_order integer not null default 0;
```

Write to `supabase/patches/bom_template_line_sort_order.sql`.

- [ ] **Step 2: Commit**

```bash
git add supabase/patches/bom_template_line_sort_order.sql
git commit -m "chore(db): add sort_order column to bom_template_line"
```

---

### Task 2: Server Action — `reorderTemplateLines`

**Goal:** Add a server action that persists drag-and-drop reorder of template lines.

**Files:**
- Modify: `src/app/app/templates/actions.ts`

**Acceptance Criteria:**
- [ ] `reorderTemplateLines(templateId, orderedLineIds)` updates `sort_order` on each line
- [ ] Touches `lines_updated_at` on the template (for unpublished-changes detection)
- [ ] Revalidates `/app/templates`

**Verify:** `npx tsc --noEmit 2>&1 | grep -c "src/"` → `0`

**Steps:**

- [ ] **Step 1: Add `reorderTemplateLines` to `actions.ts`**

Add after the existing `setTemplateLines` function:

```typescript
export async function reorderTemplateLines(
  templateId: string,
  orderedLineIds: string[]
): Promise<{ error?: string }> {
  const context = await getServerTenantContext();
  if (!context) return { error: "Missing tenant context." };
  const { supabase, tenantId } = context;

  const updates = orderedLineIds.map((id, index) =>
    supabase
      .from("bom_template_line")
      .update({ sort_order: index + 1 } as any)
      .eq("tenant_id", tenantId)
      .eq("id", id)
      .eq("template_id", templateId)
  );

  await Promise.all(updates);

  const touchError = await touchTemplate(supabase, "bom_template", tenantId, templateId);
  revalidatePath("/app/templates");
  if (touchError) return { error: touchError };
  return {};
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/app/templates/actions.ts
git commit -m "feat(templates): add reorderTemplateLines server action"
```

---

### Task 3: Data — Thread `cost_per_unit` Through Template Lines

**Goal:** Include `cost_per_unit` in the template line data so the expansion can display unit cost and compute line cost.

**Files:**
- Modify: `src/app/app/templates/page.tsx` (query + mapping)
- Modify: `src/app/app/templates/template-table.tsx` (type)

**Acceptance Criteria:**
- [ ] `TemplateLine` type includes `cost_per_unit` from component join
- [ ] `ComponentTemplateRowData.lines[].costPerUnit` is populated
- [ ] Query orders lines by `sort_order` ascending (with `created_at` fallback)

**Verify:** `npx tsc --noEmit 2>&1 | grep -c "src/"` → `0`

**Steps:**

- [ ] **Step 1: Update the Supabase query in `page.tsx`**

Change the `bom_template_line` select (line ~94) from:

```typescript
.select("id,template_id,quantity,component:component_id(id,name,sku,unit)")
.eq("tenant_id", tenantId)
.order("created_at", { ascending: true }),
```

to:

```typescript
.select("id,template_id,quantity,sort_order,component:component_id(id,name,sku,unit,cost_per_unit)")
.eq("tenant_id", tenantId)
.order("sort_order", { ascending: true })
.order("created_at", { ascending: true }),
```

- [ ] **Step 2: Update the `TemplateLine` type in `page.tsx`**

```typescript
type TemplateLine = {
  id: string;
  template_id: string;
  quantity: number;
  sort_order: number;
  component:
    | { id: string; name: string; sku: string | null; unit: string | null; cost_per_unit: number | null }
    | Array<{ id: string; name: string; sku: string | null; unit: string | null; cost_per_unit: number | null }>
    | null;
};
```

- [ ] **Step 3: Update the line mapping in `page.tsx`**

In the `componentRows` mapping (~line 171-181), add `costPerUnit`:

```typescript
lines: lines.map((line) => {
  const comp = unwrap(line.component);
  return {
    id: line.id,
    componentId: comp?.id ?? "",
    componentName: comp?.name ?? "Unknown",
    sku: comp?.sku ?? null,
    unit: comp?.unit ?? null,
    quantity: line.quantity,
    costPerUnit: comp?.cost_per_unit ?? null,
  };
}),
```

- [ ] **Step 4: Update `ComponentTemplateRowData` type in `template-table.tsx`**

Add `costPerUnit` to the `lines` item type:

```typescript
lines: {
  id: string;
  componentId: string;
  componentName: string;
  sku: string | null;
  unit: string | null;
  quantity: number;
  costPerUnit: number | null;
}[];
```

- [ ] **Step 5: Commit**

```bash
git add src/app/app/templates/page.tsx src/app/app/templates/template-table.tsx
git commit -m "feat(templates): thread cost_per_unit and sort_order into template line data"
```

---

### Task 4: UI — BOM-Editor-Style Expansion with DnD

**Goal:** Rewrite `ComponentExpansion` to render a `<table>` with drag handles, SKU, unit cost, line cost, stepper qty, mini toolbar, and materials total — matching the BOM editor.

**Files:**
- Modify: `src/app/app/templates/template-table.tsx` (rewrite `ComponentExpansion`)
- Modify: `src/app/app/templates/templates.module.css` (add new styles, remove old grid styles)

**Acceptance Criteria:**
- [ ] Table columns: drag handle, component name (linked), SKU, unit, qty (stepper), unit cost, line cost, remove button
- [ ] Mini toolbar above table with component count + "+ Add component" button
- [ ] Materials total row below table
- [ ] Drag-and-drop reorder using `@dnd-kit` (same pattern as `bom-editor.tsx`)
- [ ] Stepper qty pattern (−/input/+) with `parseQtyInput` on blur
- [ ] Empty state when no lines: "No components yet — click + Add component above."
- [ ] Footer unchanged: link controls, used by count, delete button

**Verify:** `npx tsc --noEmit 2>&1 | grep -c "src/"` → `0`; visually inspect in browser.

**Steps:**

- [ ] **Step 1: Add new CSS classes to `templates.module.css`**

Add the BOM-editor-style classes. Remove old `.expLineGrid` (no longer used after this task).

```css
/* ── BOM-editor-style expansion ──────────────────── */

.expToolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px 8px 30px;
  border-bottom: 1px solid var(--stroke);
  background: var(--bg-card-alt);
  gap: 8px;
}

.expToolbarCount {
  font-size: var(--fs-xs);
  color: var(--ink-muted);
}

.expTable {
  composes: table from "../_ui/table.module.css";
}

.expDragHandleHeader {
  width: 28px;
  padding: 0 4px;
}

.expDragHandle {
  width: 28px;
  padding: 0 4px;
  cursor: grab;
  color: var(--ink-faint);
  text-align: center;
  user-select: none;
}

.expDragHandle:active {
  cursor: grabbing;
}

.expGripIcon {
  font-size: 14px;
  line-height: 1;
  letter-spacing: 1px;
}

.expDimText {
  color: var(--ink-muted);
  font-size: 12px;
}

.expStepper {
  display: flex;
  align-items: center;
  gap: 4px;
}

.expStepper button {
  width: 24px;
  height: 24px;
  background: var(--bg-card-alt);
  border: 1px solid var(--stroke-strong);
  border-radius: var(--radius-xs);
  color: var(--ink-faint);
  cursor: pointer;
  font-size: 14px;
  font-family: inherit;
}

.expStepperInput {
  width: 44px;
  text-align: center;
  background: var(--bg-input);
  border: 1px solid var(--stroke-strong);
  border-radius: var(--radius-xs);
  color: var(--ink-strong);
  font-size: 13px;
  padding: 3px 4px;
}

.expRemoveBtn {
  background: none;
  border: none;
  color: var(--stroke-strong);
  cursor: pointer;
  font-size: 12px;
  padding: 2px 4px;
}
.expRemoveBtn:hover {
  color: var(--danger);
}

.expNoCostBadge {
  margin-left: 6px;
  background: var(--danger-dim);
  color: var(--danger);
  border-radius: 3px;
  padding: 1px 5px;
  font-size: 10px;
}

.expEmptyRow {
  text-align: center;
  color: var(--ink-muted);
  padding: 24px;
  font-style: italic;
}

.expMaterialsTotal {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  padding: 8px 14px;
  border-top: 1px solid var(--stroke);
  background: var(--bg-card-alt);
  gap: 16px;
}

.expTotalLabel {
  font-size: 10px;
  color: var(--ink-muted);
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.expTotalValue {
  font-size: 14px;
  font-weight: 700;
  color: var(--ink-strong);
}
```

- [ ] **Step 2: Add imports to `template-table.tsx`**

Add at the top of the file:

```typescript
import { useCallback, useTransition } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { reorderTemplateLines } from "./actions";
```

- [ ] **Step 3: Add `SortableLineRow` helper component**

Add before `ComponentExpansion`:

```typescript
function SortableLineRow({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr ref={setNodeRef} style={style} {...attributes}>
      <td className={styles.expDragHandle} {...listeners}>
        <span className={styles.expGripIcon}>⠿</span>
      </td>
      {children}
    </tr>
  );
}
```

- [ ] **Step 4: Add `fmt` helper**

```typescript
function fmt(cost: number | null): string {
  return cost !== null ? `$${cost.toFixed(2)}` : "—";
}
```

- [ ] **Step 5: Rewrite `ComponentExpansion`**

Replace the entire `ComponentExpansion` function body with the BOM-editor-style table:

```typescript
function ComponentExpansion({
  template,
  components,
}: {
  template: ComponentTemplateRowData;
  components: ComponentOption[];
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lines, setLines] = useState(template.lines);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Sync lines when server data changes (e.g. after add/remove)
  useEffect(() => {
    setLines(template.lines);
  }, [template.lines]);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      setLines((prev) => {
        const oldIndex = prev.findIndex((l) => l.id === active.id);
        const newIndex = prev.findIndex((l) => l.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return prev;

        const next = [...prev];
        const [moved] = next.splice(oldIndex, 1);
        next.splice(newIndex, 0, moved);

        startTransition(async () => {
          await reorderTemplateLines(template.id, next.map((l) => l.id));
        });

        return next;
      });
    },
    [template.id, startTransition]
  );

  async function commitQty(lineId: string) {
    const raw = drafts[lineId];
    if (raw === undefined) return;
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[lineId];
      return next;
    });
    const parsed = parseQtyInput(raw);
    const line = lines.find((l) => l.id === lineId);
    if (!line || parsed === null || parsed === line.quantity) return;
    setBusy(true);
    setError(null);
    try {
      const result = await setTemplateLines(
        template.id,
        lines
          .filter((l) => l.componentId !== "")
          .map((l) => ({
            component_id: l.componentId,
            quantity: l.id === lineId ? parsed : l.quantity,
          }))
      );
      if (result.error) setError(result.error);
    } catch {
      setError("Something went wrong saving the quantity. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  function handleStepperClick(lineId: string, delta: number) {
    const line = lines.find((l) => l.id === lineId);
    if (!line) return;
    const newQty = line.quantity + delta;
    if (newQty <= 0) return;
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[lineId];
      return next;
    });
    // Optimistic local update
    setLines((prev) => prev.map((l) => l.id === lineId ? { ...l, quantity: newQty } : l));
    // Persist
    setBusy(true);
    setError(null);
    setTemplateLines(
      template.id,
      lines
        .filter((l) => l.componentId !== "")
        .map((l) => ({
          component_id: l.componentId,
          quantity: l.id === lineId ? newQty : l.quantity,
        }))
    )
      .then((result) => { if (result.error) setError(result.error); })
      .catch(() => setError("Something went wrong."))
      .finally(() => setBusy(false));
  }

  let materialCost: number | null = 0;
  for (const line of lines) {
    if (line.costPerUnit === null) {
      materialCost = null;
    } else if (materialCost !== null) {
      materialCost += line.costPerUnit * line.quantity;
    }
  }

  return (
    <div>
      {template.description ? <p className={styles.expDesc}>{template.description}</p> : null}

      {/* Mini toolbar */}
      <div className={styles.expToolbar}>
        <span className={styles.expToolbarCount}>
          {lines.length} component{lines.length !== 1 ? "s" : ""}
        </span>
        <TemplatePickerLightbox
          templateId={template.id}
          templateName={template.name}
          existingLines={lines.map((l) => ({
            component_id: l.componentId,
            quantity: l.quantity,
          }))}
          components={components}
        />
      </div>

      {/* Table */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <table className={styles.expTable}>
          <thead>
            <tr>
              <th className={styles.expDragHandleHeader}></th>
              <th>Component</th>
              <th>SKU</th>
              <th>Unit</th>
              <th>Qty</th>
              <th>Unit cost</th>
              <th>Line cost</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <SortableContext items={lines.map((l) => l.id)} strategy={verticalListSortingStrategy}>
              {lines.map((line) => {
                const cost = line.costPerUnit !== null ? line.costPerUnit * line.quantity : null;
                return (
                  <SortableLineRow key={line.id} id={line.id}>
                    <td>
                      {line.componentId !== "" ? (
                        <Link
                          href={`/app/components/${line.componentId}`}
                          className={styles.componentLink}
                        >
                          {line.componentName}
                        </Link>
                      ) : (
                        <span>{line.componentName}</span>
                      )}
                      {line.costPerUnit === null ? (
                        <span className={styles.expNoCostBadge}>no cost</span>
                      ) : null}
                    </td>
                    <td className={styles.expDimText}>{line.sku ?? "—"}</td>
                    <td className={styles.expDimText}>{line.unit ?? "ea"}</td>
                    <td>
                      <div className={styles.expStepper}>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleStepperClick(line.id, -1)}
                        >
                          −
                        </button>
                        <input
                          type="number"
                          step="any"
                          inputMode="decimal"
                          value={drafts[line.id] ?? String(line.quantity)}
                          className={styles.expStepperInput}
                          disabled={busy}
                          onChange={(e) =>
                            setDrafts((prev) => ({ ...prev, [line.id]: e.target.value }))
                          }
                          onBlur={() => commitQty(line.id)}
                          aria-label={`Quantity for ${line.componentName}`}
                        />
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleStepperClick(line.id, 1)}
                        >
                          +
                        </button>
                      </div>
                    </td>
                    <td className={styles.expDimText}>{fmt(line.costPerUnit)}</td>
                    <td>{fmt(cost)}</td>
                    <td>
                      <RemoveLineButton lineId={line.id} templateId={template.id} disabled={busy} />
                    </td>
                  </SortableLineRow>
                );
              })}
            </SortableContext>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={8} className={styles.expEmptyRow}>
                  No components yet — click + Add component above.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </DndContext>

      {/* Materials total */}
      {lines.length > 0 ? (
        <div className={styles.expMaterialsTotal}>
          <span className={styles.expTotalLabel}>Materials total</span>
          <span className={styles.expTotalValue}>{fmt(materialCost)}</span>
        </div>
      ) : null}

      {error ? <p className={styles.expError}>{error}</p> : null}

      {/* Footer */}
      <div className={styles.expFooter}>
        <LinkControls
          templateType="component"
          templateId={template.id}
          isLinked={template.isLinked}
          hasUnpublished={template.hasUnpublished}
          affectedBoms={template.affected}
        />
        <span className={styles.usedBy}>{usedByFooter(template.affected)}</span>
        <DeleteTemplateButton templateId={template.id} usedByCount={template.affected.length} />
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Add `useEffect` to the existing imports**

Update the React import at the top of `template-table.tsx`:

```typescript
import { Fragment, useCallback, useEffect, useState, useTransition } from "react";
```

(Remove the separate `useCallback, useTransition` import from step 2 since they'll be in this line.)

- [ ] **Step 7: Remove the old `expAddRow` div and unused grid styles**

Remove from CSS:
- `.expLineGrid` (replaced by `.expTable`)
- `.expComponent` (replaced by table cells)
- `.expSku` (replaced by `.expDimText`)
- `.expUnit` (replaced by `.expDimText`)
- `.qtyInput` (replaced by `.expStepperInput`)
- `.expEmpty` (replaced by `.expEmptyRow`)
- `.expAddRow` (button moved to toolbar)

Keep: `.expDesc`, `.expError`, `.expFooter`, `.expCell`, `.expRow` (still used by the outer expansion row).

- [ ] **Step 8: Verify and commit**

```bash
npx tsc --noEmit 2>&1 | grep -c "src/"
# Expected: 0
git add src/app/app/templates/template-table.tsx src/app/app/templates/templates.module.css
git commit -m "feat(templates): BOM-editor-style expansion with DnD, stepper, cost columns"
```
