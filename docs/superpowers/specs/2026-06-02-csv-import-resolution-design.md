# CSV Import — Unknown Supplier/Group Resolution

**Date:** 2026-06-02  
**Scope:** Components CSV import (`/app/components/import`)  
**Status:** Approved for implementation

---

## Overview

When a components CSV contains a supplier or group name that doesn't exist in the database, the import currently fails with a hard error and forces the user to fix the CSV. This design replaces that behaviour with an interactive **Resolve step** that lets users map unknown values to existing records or create new ones — with fuzzy matching to catch common typos.

Locations remain a hard fail (warehouse bins should not be created ad-hoc from a CSV).

---

## Step Flow

The wizard gains a 4th step: **Upload → Preview → Resolve → Done**.

The Resolve step only appears when needed:

| Scenario | Preview shows | Action available |
|---|---|---|
| Hard errors only (missing name, bad numbers, unknown location, duplicate SKU) | ✗ red errors | Re-upload CSV only |
| Soft mismatches only (unknown supplier / group) | ⚠ amber warnings | "Next: Resolve →" |
| Hard errors **and** soft mismatches | both | Re-upload CSV only — fix hard errors first |
| No errors, no mismatches | ✓ green | "Import N components →" (Resolve step skipped) |

A "soft" mismatch is resolvable interactively. A "hard" error requires the user to fix the CSV.

---

## Fuzzy Matching

A new pure utility (`src/lib/csv/fuzzy.ts`) computes the best candidate match for an unknown value:

- Algorithm: Levenshtein edit distance
- Threshold: distance ≤ 2 **and** distance ÷ max(len(query), len(candidate)) ≤ 0.30
- Matching is case-insensitive
- Returns the single closest candidate, or `null` if no candidate meets the threshold
- Examples: `"Bunings"` → `"Bunnings"` (1 edit, 12.5%) ✓ · `"Electonics"` → `"Electronics"` (1 edit, 9%) ✓ · `"xyz"` → `"Bunnings"` → `null` (too far)

---

## Server-side Changes

### `src/lib/csv/validate-components.ts`

`ValidatedRow.error` changes from `string` to a structured object:

```ts
error?: {
  message: string;
  type: "hard" | "soft";
};
```

- `supplier_name` not found → `{ message: "Supplier not found: X", type: "soft" }`
- `group_name` not found → `{ message: "Group not found: X", type: "soft" }`
- All other errors (missing name, bad numbers, duplicate SKU, unknown location) → `type: "hard"`

### `src/lib/csv/fuzzy.ts` (new)

```ts
export function bestMatch(query: string, candidates: string[]): string | null
```

Pure function, no dependencies. Used by the route to compute suggestions at dry-run time.

### `src/app/api/import/components/route.ts`

**Dry-run response** gains an `unknowns` field:

```ts
{
  rows: ValidatedRow[];
  unknowns: {
    suppliers: Array<{ csvValue: string; suggestion: string | null; rowCount: number }>;
    groups:    Array<{ csvValue: string; suggestion: string | null; rowCount: number }>;
  };
}
```

`unknowns` is built by collecting all unique CSV values that produced soft errors, running `bestMatch` against the known names, and counting affected rows.

**Commit request** accepts an optional `resolutions` JSON string in FormData:

```ts
resolutions: {
  suppliers: Record<string, { type: "use_existing"; id: string } | { type: "create_new"; name: string }>;
  groups:    Record<string, { type: "use_existing"; id: string } | { type: "create_new"; name: string }>;
}
```

On commit:
1. Parse and validate `resolutions` (must cover every soft-mismatch CSV value; if any are missing, return 400)
2. Create any `create_new` suppliers/groups in the DB, collecting their new IDs
3. Merge resolved IDs into the supplier/group id-maps
4. Insert components as before

If there are any hard errors, the commit is rejected regardless of resolutions.

---

## Client-side Changes

### `src/app/app/components/import/page.tsx`

**New state:**

```ts
type Step = "upload" | "preview" | "resolve" | "done";

type UnknownValue = { csvValue: string; suggestion: string | null; rowCount: number };

type Resolution =
  | { type: "use_existing"; id: string; displayName: string }
  | { type: "create_new"; name: string };

const [unknowns, setUnknowns] = useState<{ suppliers: UnknownValue[]; groups: UnknownValue[] }>({
  suppliers: [], groups: []
});
const [resolutions, setResolutions] = useState<{
  suppliers: Record<string, Resolution>;
  groups: Record<string, Resolution>;
}>({ suppliers: {}, groups: {} });
```

**Preview step changes:**
- Soft-mismatch rows render `⚠ Supplier 'X' needs resolution` in `--warning` colour (not `--danger`)
- Bottom action bar logic:
  - Hard errors present → "Re-upload CSV" only
  - Only soft mismatches → "Next: Resolve →" (primary)
  - All clean → "Import N components →" (primary, skips Resolve)

**Resolve step (new `step === "resolve"` branch):**

Groups unknowns into two cards (Suppliers, Groups). For each unique unknown value:

1. If `suggestion` is non-null: show a suggestion chip — *"Did you mean 'Bunnings'?"* with a **Use Bunnings** button (one click resolves)
2. An "or" divider
3. A **pick-existing dropdown** listing all DB records of that type
4. A **+ Create new** button — clicking it expands an editable text field pre-filled with the CSV value; user can rename before confirming with "Create supplier / Create group"

Once resolved, the row shows a green chip: *"Will use 'Bunnings' for all 12 rows"* with an undo link.

Import button:
- Disabled until `resolvedCount === totalUnknownCount` (suppliers + groups)
- Shows progress: *"1 of 3 resolved"*

**On commit:** `resolutions` is JSON-serialised and appended to the FormData as `"resolutions"` before the POST.

### `src/app/app/_ui/import-page.module.css`

New classes: `.resolveCard`, `.mismatchRow`, `.csvValueChip`, `.suggestionChip`, `.resolvedChip`, `.createExpanded`, `.warningLabel` (amber variant of existing `.errorLabel`).

---

## Testing

### `src/lib/csv/fuzzy.test.ts` (new)

- Exact match returns the candidate
- 1-edit typo returns candidate (`"Bunings"` → `"Bunnings"`)
- 2-edit typo returns candidate
- 3-edit typo beyond threshold returns `null`
- No candidates returns `null`
- Case-insensitive matching works

### `src/lib/csv/validate-components.test.ts` (updated)

- Supplier-not-found error asserts `error.type === "soft"`
- Group-not-found error asserts `error.type === "soft"`
- Location-not-found error asserts `error.type === "hard"`
- All existing error message assertions updated for new shape

---

## Out of Scope

- Fuzzy matching or resolution for the **location** field — stays hard fail
- Resolution UX for the **suppliers CSV import** (`/api/import/suppliers`) — separate feature
- Bulk "ignore all" or "skip rows with mismatches" — YAGNI
