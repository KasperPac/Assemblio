# Housekeeping Deletes — Design Spec

**Date:** 2026-06-19
**Status:** Approved (design)

## Goal

Add three admin-only "hard delete" housekeeping capabilities that let an account clean up obsolete records that today can only be archived or never removed at all:

1. **Delete a warehouse** (only when more than one exists, and not the default).
2. **Delete a non-active BOM** version.
3. **Delete an archived component.**

All three share one safety model: **block the delete with a clear, specific reason** whenever the record is still referenced by stock, financial, or audit data — never silently cascade over meaningful history.

## Shared principles

- **Authorization:** every new server action requires `role === "admin" || role === "super_admin"` (consistent with the existing archive flow). Non-admins get a permission error.
- **Tenant scope:** all queries and deletes are scoped to the caller's `tenantId` from `getServerTenantContext()`.
- **Block-with-reason:** before deleting, the action runs reference checks. If any blocker exists, it returns a structured result describing what blocks the delete; nothing is mutated. The UI shows the reason. It never force-cascades over inventory, financial, or audit rows.
- **Confirm dialog:** each delete is guarded by a confirm step in the UI, reusing the existing dialog patterns in that area (no new dialog component).
- **Activity logging:** every successful delete inserts an `activity_log` row (`event` + `metadata`) via the existing logging helper.
- **Idempotent / safe re-run:** deleting an already-gone record is a no-op, not an error.

## 1. Delete a warehouse

**Surface:** `/app/warehouse/locations` — a delete control on each warehouse card in `locations-tree.tsx`, reusing the existing `SimpleDeleteButton` confirm-dialog pattern.

**Data:** table `location` (`id`, `tenant_id`, `name`, `is_default`, `created_at`).

**Allowed only when:**
- The tenant has **more than one** warehouse (never delete the last remaining warehouse), AND
- The target warehouse is **not** `is_default`.

The delete control is hidden/disabled when either guard fails; the server action re-checks both (defense in depth).

**Blocked-with-reason** if any of these reference the warehouse via `location_id`:
- `inventory` / `inventory_balance` — on-hand stock
- `inventory_movement` — movement history
- `stocktake_session` — any session (open or historical)
- `delivery_receipt` — goods-in records

The returned reason names which categories block it, e.g. *"Can't delete — this warehouse holds stock and has movement history. Move or clear them first."*

**Cascades automatically** via existing FK `ON DELETE CASCADE`: `bin_sub_location`, `bin_aisle`, `bin_bay`. The confirm dialog warns when bins exist (count surfaced like the existing `deleteAisle` cascade confirm).

**New server action:** `deleteWarehouse(id)` in `src/app/app/warehouse/locations/actions.ts`, mirroring the block-on-references shape of `deleteSubLocation`. Adds an admin guard (the existing warehouse actions have none) and `logActivity` on success.

## 2. Delete a non-active BOM

**Surface:** the variant BOM-versions tab — a delete control per version row in `bom-versions-tab.tsx`.

**Data:** table `product_bom` (`version`, `status` `'draft'|'active'|'archived'`, `is_active boolean`). "Non-active" = `is_active = false` (drafts and archived versions). The active BOM can never be deleted.

**Allowed only when** `is_active = false`. The active version shows no delete control; the server action re-checks the guard.

**Blocked-with-reason** if `job_cost_snapshot.source_product_bom_id` references the row (a costed job depends on it) → *"Can't delete — this BOM is referenced by a costed job."*

**Cascades:** `product_bom_labor` via FK cascade; `product_bom_component` has no cascade, so the action deletes those rows manually first, then the `product_bom` row.

**Implementation:** extend the existing `deleteBomDraft` in `src/app/app/bom/actions.ts` (which already guards `is_active`) to also accept archived versions and to add the `job_cost_snapshot` block. Keeps admin gating via `requireBomEditor` and logs activity.

## 3. Delete an archived component

**Surface:** a **new "Archived components" panel** on `/app/trash`. The Trash page does not list archived components today — this adds a panel that lists `component` rows where `archived_at IS NOT NULL`, each with a Delete button, reusing the `archive-button.tsx` confirm/conflicts dialog pattern.

**Data:** `component.archived_at timestamptz` is the archive flag.

**Blocked-with-reason** if any of these 7 tables still reference `component_id`:
- `product_bom_component`
- `bom_template_line`
- `inventory_balance`
- `inventory_movement`
- `order_component_allocation`
- `stocktake_line`
- `purchase_order_line`

The reason lists which dependents still exist.

**Cascades:** `supplier_components` via FK cascade; `component_images` storage objects are cleaned up.

**New server action:** `deleteArchivedComponent(id)` in `src/app/app/trash/actions.ts`, admin-gated, running the 7 reference checks, deleting on success, and logging activity. The component must be archived (`archived_at IS NOT NULL`) to be eligible.

## Out of scope (YAGNI)

- No bulk "delete all" for any of the three (per-row only).
- No undo/restore for hard deletes (these are terminal; archive/restore already covers the reversible path).
- No change to the existing archive flows or the `emptyTrash` bulk action.
- No new generic dialog component — reuse each area's existing confirm UI.

## Verification

- `npx tsc --noEmit` → no new errors under `src/` (baseline: 2 pre-existing `.next/types/validator.ts` errors).
- Unit tests for any pure blocker-evaluation logic extracted (e.g. building the block reason from reference counts).
- Manual: each delete blocked when a dependent exists (with correct reason), succeeds when clean, hidden for non-admins, last/default warehouse not deletable, active BOM not deletable, activity logged.
- `docs/qa-feature-test-plan.md` updated with checklist items + a dated changelog line.
