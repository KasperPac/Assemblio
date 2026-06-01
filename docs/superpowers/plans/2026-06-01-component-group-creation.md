# Component Group Inline Creation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users create component groups (e.g. "Electrical", "Fasteners") inline from the Add/Edit Component dialogs, without leaving the form.

**Architecture:** A new `createComponentGroup` server action inserts into the existing `component_group` table and returns the new `{id, name}`. Both client-side forms (create and edit) maintain a local `groups` state list and a controlled `group_id` select. A `+ New group` link below the select reveals a mini inline form; on success the new group is appended to the local list and auto-selected. No DB migration needed — the table already exists.

**Tech Stack:** Next.js 15 App Router, React `useState`/`useActionState`, CSS Modules, Supabase, Vitest (unit tests for pure helper only)

---

## File Map

| File | Action |
|------|--------|
| `src/app/app/components/helpers.ts` | Add `validateGroupName` pure helper |
| `src/app/app/components/helpers.test.ts` | Add tests for `validateGroupName` |
| `src/app/app/components/actions.ts` | Add `createComponentGroup` server action |
| `src/app/app/components/components.module.css` | Add 4 CSS classes for the inline form |
| `src/app/app/components/component-create-form.tsx` | Add controlled group select + inline creation UI |
| `src/app/app/components/component-edit-form.tsx` | Same changes as create form |

---

## Task 1 — `validateGroupName` helper + tests

**Files:**
- Modify: `src/app/app/components/helpers.ts`
- Modify: `src/app/app/components/helpers.test.ts`

The server action and client guard both need the same name validation. Extract it as a pure function so it can be unit tested.

- [ ] **Step 1: Write the failing tests**

Open `src/app/app/components/helpers.test.ts`. The file currently has tests for `getStockStatus`. Append these new tests:

```typescript
import { describe, it, expect } from "vitest";
import { getStockStatus, validateGroupName } from "./helpers";

// ... existing getStockStatus tests stay unchanged ...

describe("validateGroupName", () => {
  it("returns null for a valid name", () => {
    expect(validateGroupName("Electrical")).toBeNull();
  });

  it("returns null for a name with surrounding spaces (valid after trim)", () => {
    expect(validateGroupName("  Electrical  ")).toBeNull();
  });

  it("returns error message for empty string", () => {
    expect(validateGroupName("")).toBe("Group name is required.");
  });

  it("returns error message for whitespace-only string", () => {
    expect(validateGroupName("   ")).toBe("Group name is required.");
  });
});
```

- [ ] **Step 2: Run the tests — expect FAIL**

```powershell
cd C:\dev\assemblio; npx vitest run src/app/app/components/helpers.test.ts
```

Expected: 4 new tests FAIL with "validateGroupName is not a function" (or similar import error).

- [ ] **Step 3: Implement `validateGroupName` in helpers.ts**

Current `src/app/app/components/helpers.ts`:
```typescript
export type StockStatus = "ok" | "low" | "critical";

export function getStockStatus(available: number, reorderPoint: number): StockStatus {
  if (available <= 0) return "critical";
  if (reorderPoint > 0 && available < reorderPoint) return "low";
  return "ok";
}
```

Add the new export below `getStockStatus`:
```typescript
export type StockStatus = "ok" | "low" | "critical";

export function getStockStatus(available: number, reorderPoint: number): StockStatus {
  if (available <= 0) return "critical";
  if (reorderPoint > 0 && available < reorderPoint) return "low";
  return "ok";
}

/** Returns an error message if the group name is invalid, otherwise null. */
export function validateGroupName(name: string): string | null {
  if (!name.trim()) return "Group name is required.";
  return null;
}
```

- [ ] **Step 4: Run the tests — expect PASS**

```powershell
cd C:\dev\assemblio; npx vitest run src/app/app/components/helpers.test.ts
```

Expected: all 11 tests pass (7 existing + 4 new).

- [ ] **Step 5: Commit**

```powershell
cd C:\dev\assemblio
git add src/app/app/components/helpers.ts src/app/app/components/helpers.test.ts
git commit -m "feat(components): add validateGroupName pure helper"
```

---

## Task 2 — `createComponentGroup` server action

**Files:**
- Modify: `src/app/app/components/actions.ts`

- [ ] **Step 1: Add the import and function**

Open `src/app/app/components/actions.ts`. It currently starts with:
```typescript
"use server";

import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";
```

Add the import for the helper:
```typescript
"use server";

import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";
import { validateGroupName } from "./helpers";
```

Then append `createComponentGroup` at the end of the file (after `archiveComponent`):

```typescript
export async function createComponentGroup(
  name: string
): Promise<{ group: { id: string; name: string } } | { error: string }> {
  const validationError = validateGroupName(name);
  if (validationError) return { error: validationError };

  const context = await getServerTenantContext();
  if (!context) return { error: "Missing tenant context." };
  const { supabase, tenantId, role } = context;

  if (role !== "admin" && role !== "super_admin") {
    return { error: "Only managers and above can create groups." };
  }

  const { data, error } = await supabase
    .from("component_group")
    .insert({ tenant_id: tenantId, name: name.trim() })
    .select("id, name")
    .single();

  if (error) return { error: error.message };

  await supabase.from("activity_log").insert({
    tenant_id: tenantId,
    event: "component_group_created",
    metadata: { name: name.trim() },
  });

  revalidatePath("/app/components");
  return { group: { id: data.id, name: data.name } };
}
```

- [ ] **Step 2: TypeScript check**

```powershell
cd C:\dev\assemblio; npx tsc --noEmit 2>&1 | Select-String "actions|helpers"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```powershell
cd C:\dev\assemblio
git add src/app/app/components/actions.ts
git commit -m "feat(components): add createComponentGroup server action"
```

---

## Task 3 — CSS classes for the inline group form

**Files:**
- Modify: `src/app/app/components/components.module.css`

- [ ] **Step 1: Append the new CSS classes**

Open `src/app/app/components/components.module.css`. Append these classes at the end of the file:

```css
/* ── Inline group creation ─── */

.newGroupLink {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-size: var(--fs-sm);
  color: var(--brand-1);
  text-align: left;
}
.newGroupLink:hover {
  text-decoration: underline;
}

.newGroupForm {
  background: var(--brand-dim);
  border: 1px solid var(--brand-1);
  border-radius: var(--radius-lg);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.newGroupActions {
  display: flex;
  gap: 8px;
}

.newGroupError {
  font-size: var(--fs-sm);
  color: var(--danger);
}
```

- [ ] **Step 2: TypeScript check (catches CSS module reference errors)**

```powershell
cd C:\dev\assemblio; npx tsc --noEmit 2>&1 | Select-String "components.module"
```

Expected: no errors.

- [ ] **Step 3: Commit**

```powershell
cd C:\dev\assemblio
git add src/app/app/components/components.module.css
git commit -m "feat(components): add CSS for inline group creation form"
```

---

## Task 4 — Inline group creation in the Add Component form

**Files:**
- Modify: `src/app/app/components/component-create-form.tsx`

**Context:** This is a `"use client"` React component. It renders an `<dialog>` with a form that uses `useActionState`. The group field is currently an uncontrolled `<select name="group_id">` with options from `lookups.groups` props.

**Changes needed:**
1. Import `createComponentGroup` from `./actions`
2. Add 6 new state variables
3. Add `handleCreateGroup` async function
4. Add `resetNewGroupForm` helper
5. Change the Group `<label>` → `<div>` and make the select controlled
6. Add `+ New group` link + mini form below the select
7. Reset new group state when the outer dialog closes

- [ ] **Step 1: Replace the full file**

Replace the entire `src/app/app/components/component-create-form.tsx` with:

```typescript
"use client";

import * as React from "react";
import { useState, useEffect, useRef } from "react";
import { createComponentGroup } from "./actions";
import styles from "./components.module.css";

type FormState = {
  error?: string;
  success?: string;
};

type LookupItem = { id: string; name: string };

type Props = {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  lookups: {
    suppliers: LookupItem[];
    locations: LookupItem[];
    groups: LookupItem[];
  };
};

const initialState: FormState = {};

export default function ComponentCreateForm({ action, lookups }: Props) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = React.useActionState(action, initialState);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // Group state
  const [groups, setGroups] = useState<LookupItem[]>(lookups.groups);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupPending, setNewGroupPending] = useState(false);
  const [newGroupError, setNewGroupError] = useState<string | null>(null);

  useEffect(() => {
    if (state.success) {
      setOpen(false);
      resetNewGroupForm();
    }
  }, [state.success]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) dialog.showModal();
    else dialog.close();
  }, [open]);

  function resetNewGroupForm() {
    setShowNewGroup(false);
    setNewGroupName("");
    setNewGroupError(null);
  }

  function handleClose() {
    setOpen(false);
    resetNewGroupForm();
  }

  async function handleCreateGroup() {
    const trimmed = newGroupName.trim();
    if (!trimmed) return;
    setNewGroupPending(true);
    setNewGroupError(null);
    const result = await createComponentGroup(trimmed);
    setNewGroupPending(false);
    if ("error" in result) {
      setNewGroupError(result.error);
    } else {
      setGroups((prev) => [...prev, result.group]);
      setSelectedGroupId(result.group.id);
      resetNewGroupForm();
    }
  }

  return (
    <>
      <button
        type="button"
        className={styles.addButton}
        onClick={() => setOpen(true)}
      >
        + Add Component
      </button>

      <dialog
        ref={dialogRef}
        className={styles.dialog}
        onClose={handleClose}
      >
        <div className={styles.dialogInner}>
          <div className={styles.dialogHeader}>
            <h2>Add Component</h2>
            <button
              type="button"
              className={styles.dialogClose}
              aria-label="Close dialog"
              onClick={handleClose}
            >
              &times;
            </button>
          </div>

          <form action={formAction} className={styles.dialogForm}>
            <label className={styles.field}>
              <span>Name *</span>
              <input name="name" required placeholder="e.g. Safety Laser Scanner" />
            </label>

            <div className={styles.fieldRow}>
              <label className={styles.field}>
                <span>SKU</span>
                <input name="sku" placeholder="e.g. CMP-LASER-001" />
              </label>
              <label className={styles.field}>
                <span>Unit</span>
                <input name="unit" placeholder="ea" />
              </label>
            </div>

            <div className={styles.fieldRow}>
              <label className={styles.field}>
                <span>Supplier</span>
                <select name="supplier_id">
                  <option value="">-- None --</option>
                  {lookups.suppliers.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
              <div className={styles.field}>
                <span>Group</span>
                <select
                  name="group_id"
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                >
                  <option value="">-- None --</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
                {!showNewGroup ? (
                  <button
                    type="button"
                    className={styles.newGroupLink}
                    onClick={() => setShowNewGroup(true)}
                  >
                    + New group
                  </button>
                ) : (
                  <div className={styles.newGroupForm}>
                    <input
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder="e.g. Pneumatics"
                      autoFocus
                    />
                    {newGroupError && (
                      <p className={styles.newGroupError}>{newGroupError}</p>
                    )}
                    <div className={styles.newGroupActions}>
                      <button
                        type="button"
                        className={styles.btnSubmit}
                        disabled={newGroupPending || !newGroupName.trim()}
                        onClick={handleCreateGroup}
                      >
                        {newGroupPending ? "Creating…" : "Create"}
                      </button>
                      <button
                        type="button"
                        className={styles.btnCancel}
                        onClick={resetNewGroupForm}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <label className={styles.field}>
              <span>Location</span>
              <select name="location_id">
                <option value="">-- None --</option>
                {lookups.locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </label>

            <div className={styles.fieldRow}>
              <label className={styles.field}>
                <span>Cost per Unit</span>
                <input
                  name="cost_per_unit"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue="0"
                />
              </label>
              <label className={styles.field}>
                <span>Reorder Point</span>
                <input
                  name="reorder_point"
                  type="number"
                  step="1"
                  min="0"
                  defaultValue="0"
                />
              </label>
            </div>

            <label className={styles.field}>
              <span>Low Stock Level</span>
              <input
                name="low_stock_level"
                type="number"
                step="1"
                min="0"
                defaultValue="0"
              />
              <span className={styles.fieldHint}>
                Triggers a low stock alarm. Should be lower than the reorder point.
              </span>
            </label>

            {state.error && <p className={styles.error}>{state.error}</p>}

            <div className={styles.dialogActions}>
              <button
                type="button"
                className={styles.btnCancel}
                onClick={handleClose}
              >
                Cancel
              </button>
              <button type="submit" className={styles.btnSubmit}>
                Create Component
              </button>
            </div>
          </form>
        </div>
      </dialog>
    </>
  );
}
```

- [ ] **Step 2: TypeScript check**

```powershell
cd C:\dev\assemblio; npx tsc --noEmit 2>&1 | Select-String "component-create"
```

Expected: no errors.

- [ ] **Step 3: Manual smoke test**

Start the dev server (`npm run dev`), open `/app/components`, click **+ Add Component**, open the Group field area, and verify:
- The "+ New group" link is visible below the Group select
- Clicking it shows the mini form with an autofocused input
- Clicking Cancel collapses the form
- Typing a name and clicking Create sends the request (check browser network tab for the server action call)

- [ ] **Step 4: Commit**

```powershell
cd C:\dev\assemblio
git add src/app/app/components/component-create-form.tsx
git commit -m "feat(components): inline group creation in Add Component form"
```

---

## Task 5 — Inline group creation in the Edit Component form

**Files:**
- Modify: `src/app/app/components/component-edit-form.tsx`

**Context:** Identical changes to Task 4 but for the edit form. The key difference: `selectedGroupId` is initialised from `initialValues.groupId ?? ""` (not `""`).

- [ ] **Step 1: Replace the full file**

Replace the entire `src/app/app/components/component-edit-form.tsx` with:

```typescript
"use client";

import * as React from "react";
import { useState, useEffect, useRef } from "react";
import { updateComponent, createComponentGroup } from "./actions";
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

  // Group state — seeded from current value
  const [groups, setGroups] = useState<LookupItem[]>(lookups.groups);
  const [selectedGroupId, setSelectedGroupId] = useState(initialValues.groupId ?? "");
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupPending, setNewGroupPending] = useState(false);
  const [newGroupError, setNewGroupError] = useState<string | null>(null);

  useEffect(() => {
    if (state.success) {
      setOpen(false);
      resetNewGroupForm();
    }
  }, [state.success]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) dialog.showModal();
    else if (dialog.open) dialog.close();
  }, [open]);

  function resetNewGroupForm() {
    setShowNewGroup(false);
    setNewGroupName("");
    setNewGroupError(null);
  }

  function handleClose() {
    setOpen(false);
    resetNewGroupForm();
  }

  async function handleCreateGroup() {
    const trimmed = newGroupName.trim();
    if (!trimmed) return;
    setNewGroupPending(true);
    setNewGroupError(null);
    const result = await createComponentGroup(trimmed);
    setNewGroupPending(false);
    if ("error" in result) {
      setNewGroupError(result.error);
    } else {
      setGroups((prev) => [...prev, result.group]);
      setSelectedGroupId(result.group.id);
      resetNewGroupForm();
    }
  }

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
        onClose={handleClose}
      >
        <div className={styles.dialogInner}>
          <div className={styles.dialogHeader}>
            <h2>Edit Component</h2>
            <button
              type="button"
              className={styles.dialogClose}
              onClick={handleClose}
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
              <div className={styles.field}>
                <span>Group</span>
                <select
                  name="group_id"
                  value={selectedGroupId}
                  onChange={(e) => setSelectedGroupId(e.target.value)}
                >
                  <option value="">-- None --</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
                {!showNewGroup ? (
                  <button
                    type="button"
                    className={styles.newGroupLink}
                    onClick={() => setShowNewGroup(true)}
                  >
                    + New group
                  </button>
                ) : (
                  <div className={styles.newGroupForm}>
                    <input
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder="e.g. Pneumatics"
                      autoFocus
                    />
                    {newGroupError && (
                      <p className={styles.newGroupError}>{newGroupError}</p>
                    )}
                    <div className={styles.newGroupActions}>
                      <button
                        type="button"
                        className={styles.btnSubmit}
                        disabled={newGroupPending || !newGroupName.trim()}
                        onClick={handleCreateGroup}
                      >
                        {newGroupPending ? "Creating…" : "Create"}
                      </button>
                      <button
                        type="button"
                        className={styles.btnCancel}
                        onClick={resetNewGroupForm}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
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
              <button type="button" className={styles.btnCancel} onClick={handleClose}>
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

- [ ] **Step 2: TypeScript check**

```powershell
cd C:\dev\assemblio; npx tsc --noEmit 2>&1 | Select-String "component-edit"
```

Expected: no errors.

- [ ] **Step 3: Run all tests**

```powershell
cd C:\dev\assemblio; npx vitest run src/app/app/components/
```

Expected: all tests pass (the `helpers.test.ts` suite).

- [ ] **Step 4: Commit**

```powershell
cd C:\dev\assemblio
git add src/app/app/components/component-edit-form.tsx
git commit -m "feat(components): inline group creation in Edit Component form"
```

---

## Self-review

**Spec coverage:**
- ✅ `createComponentGroup` server action — Task 2
- ✅ Admin-only role check — Task 2
- ✅ Empty name validation (via `validateGroupName`) — Tasks 1 & 2
- ✅ Groups list moves to local React state — Tasks 4 & 5
- ✅ Controlled `group_id` select — Tasks 4 & 5
- ✅ `+ New group` link — Tasks 4 & 5
- ✅ Mini inline form (input, Create, cancel, error) — Tasks 4 & 5
- ✅ New group auto-selected on success — Tasks 4 & 5
- ✅ CSS classes — Task 3
- ✅ `revalidatePath("/app/components")` — Task 2
- ✅ Activity log entry — Task 2

**Placeholder scan:** No TBD, TODO, or vague steps found.

**Type consistency:** `LookupItem = { id: string; name: string }` used in Task 4 and Task 5 — consistent with existing type in both files. `createComponentGroup` returns `{ group: { id: string; name: string } } | { error: string }` — consumed correctly in `handleCreateGroup` in both tasks.
