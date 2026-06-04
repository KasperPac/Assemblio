# F-10 — Component Picker ARIA & Focus Trap Audit

**Priority:** P4 (accessibility polish)  
**Status:** Not started  
**Original finding:** `docs/review/goods-inwards/review.md` → F-10

---

## What to do

Audit and fix the **component picker modal** in `receipt-form.tsx` for accessibility compliance.

> **Note:** The cost update modal mentioned in the original review no longer exists — it was replaced with a persistent card (F-07, June 2026). Only the component picker remains.

### File to fix

`src/app/app/goods-inwards/receipt-form.tsx` — the `<ComponentPicker>` modal, triggered by the "Browse…" button in the lines table.

Also check `src/app/app/goods-inwards/component-picker.tsx` — the modal component itself.

---

## Checklist

### 1. ARIA roles on the modal overlay

The modal container should have:

```tsx
role="dialog"
aria-modal="true"
aria-labelledby="component-picker-title"
```

And the modal heading should have a matching id:

```tsx
<h2 id="component-picker-title">Select component</h2>
```

### 2. Focus trap

When the modal opens, focus should move inside it (to the search input or first focusable element). When the modal closes, focus should return to the "Browse…" button that opened it.

Check whether `component-picker.tsx` uses `useEffect` + `focus()` on open, and restores focus on close. If not, add it.

Libraries to consider if a focus trap utility is needed: the app currently has no focus-trap library installed — use a simple `useEffect` + `querySelectorAll('[tabindex], input, button, select')`approach to keep it dependency-free.

### 3. Escape key to close

The modal should close on `Escape`. Check whether `component-picker.tsx` has a `keydown` listener for `Escape`. If not, add one.

### 4. Tab order through lines table

In the form's lines table, verify Tab moves logically through each row:

```
Component select → Qty delivered → Cost / unit → Note → Batch # → Remove ✕
```

No special code needed if the DOM order is correct — just verify nothing has `tabIndex` values that disrupt it.

---

## Approach

1. Read `component-picker.tsx` fully — understand current structure
2. Brainstorm (or skip if changes are obvious small additions)
3. Add `role`, `aria-modal`, `aria-labelledby`, focus-on-open, focus-restore-on-close, Escape key
4. Verify tab order in lines table manually
5. TypeScript check
6. Commit

---

## Success criteria

- Component picker modal has `role="dialog" aria-modal="true" aria-labelledby="..."`
- Focus moves into the modal when it opens
- Focus returns to the "Browse…" button when modal closes
- `Escape` closes the modal
- Tab order through form lines is logical (no skips or inversions)
- `npx tsc --noEmit` passes
