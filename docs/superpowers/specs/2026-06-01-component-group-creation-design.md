# Component Group Inline Creation — Design Spec

## Goal

Allow users to create component groups (e.g. "Electrical", "Fasteners", "Pneumatics") directly from the Add Component and Edit Component dialogs, without leaving the form or navigating to a separate page.

## Background

The `component_group` table exists and the Group dropdown is already rendered in both forms. However, there is no UI anywhere in the app to create groups — they can only be inserted directly into the database. This blocks users from organising their components by group at all.

## Approach

Inline creation: a `+ New group` link sits below the Group `<select>`. Clicking it reveals a mini inline form (name input + Create button + cancel). On success, the new group is appended to the dropdown and auto-selected. No navigation away, no page reload.

Rename and delete of groups are out of scope for this change (YAGNI — can be added later as a settings page if needed).

---

## Architecture

### New server action: `createComponentGroup`

**File:** `src/app/app/components/actions.ts`

```ts
export async function createComponentGroup(
  name: string
): Promise<{ group: { id: string; name: string } } | { error: string }>
```

- Admin-only (same role check as `updateComponent`: `role !== "admin" && role !== "super_admin"`)
- Trims the name; returns `{ error: "Group name is required." }` if empty after trim
- Inserts into `component_group` with `tenant_id` and `name`
- Logs `component_group_created` to `activity_log` with `metadata: { name }`
- Calls `revalidatePath("/app/components")` so the server page reflects new groups on next load
- Returns `{ group: { id, name } }` on success, `{ error: message }` on DB failure

### Form changes (both create and edit forms)

**Files:** `src/app/app/components/component-create-form.tsx`, `src/app/app/components/component-edit-form.tsx`

State additions:

| State var | Type | Purpose |
|---|---|---|
| `groups` | `LookupItem[]` | Groups list — seeded from `lookups.groups`, new groups appended after creation |
| `selectedGroupId` | `string` | Controlled value for the `<select>` — replaces uncontrolled `defaultValue` |
| `showNewGroup` | `boolean` | Whether the mini inline form is visible |
| `newGroupName` | `string` | Controlled input value for the new group name |
| `newGroupPending` | `boolean` | True while the server action is in-flight |
| `newGroupError` | `string \| null` | Error message from the server action, shown below the input |

The `<select name="group_id">` becomes controlled (`value={selectedGroupId}`, `onChange`). It still submits correctly via `FormData` — the `name` attribute is preserved.

### Interaction flow

1. User opens Add/Edit Component dialog — Group dropdown shows existing groups as normal
2. User clicks `+ New group` link below the select
3. Mini inline form appears (name input autofocused, Create button, cancel link)
4. User types a name and clicks Create (or presses Enter)
5. Button shows pending state; `createComponentGroup(name)` is called
6. **Success:** new group appended to `groups` state; `selectedGroupId` set to new ID; mini form closes; `newGroupName` cleared
7. **Error:** `newGroupError` shown inline below the input; mini form stays open
8. User clicks cancel → mini form closes, `newGroupName` cleared, no state changes

### Client-side validation

- Empty name → guarded client-side (button disabled or early return) — never calls the server

### Error messages

| Scenario | Message |
|---|---|
| Empty name | (button disabled — no message needed) |
| Not admin | "Only managers and above can create groups." |
| DB error | Raw Supabase error message |

---

## Files Changed

| File | Change |
|---|---|
| `src/app/app/components/actions.ts` | Add `createComponentGroup` function |
| `src/app/app/components/component-create-form.tsx` | Add group creation state + mini form JSX |
| `src/app/app/components/component-edit-form.tsx` | Same as create form |
| `src/app/app/components/components.module.css` | Add `.newGroupForm`, `.newGroupInput`, `.newGroupActions`, `.newGroupLink`, `.newGroupError` CSS classes |

No DB migration required — `component_group` table already exists.

---

## CSS

New classes in `components.module.css` (all using design system tokens):

```css
.newGroupLink {
  font-size: var(--fs-sm);
  color: var(--brand-1);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  margin-top: 4px;
}

.newGroupForm {
  margin-top: 8px;
  background: var(--brand-dim);
  border: 1px solid var(--brand-1);
  border-radius: var(--radius-lg);
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.newGroupInput {
  /* inherits from existing .field input styles */
}

.newGroupActions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.newGroupError {
  font-size: var(--fs-sm);
  color: var(--danger);
}
```

---

## Out of Scope

- Renaming groups
- Deleting groups
- Reordering groups
- Group management settings page

These can be added in a follow-up if needed.
