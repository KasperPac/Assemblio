# Locations Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three free-text bin location fields on `component` with a managed hierarchy (warehouse → sub-location → aisle → bay), add a Locations Manager UI under a new Warehouse nav section, and generate scannable Code 128 barcodes per location entity.

**Architecture:** Three new Supabase tables (`bin_sub_location`, `bin_aisle`, `bin_bay`) hang off the existing `location` table (warehouse level). Component bin fields become FK references instead of free text. The Locations Manager at `/app/warehouse/locations` renders a flat tree with CRUD server actions. Barcodes use JsBarcode client-side; the encoded value is the last 6 hex chars of the entity UUID.

**Tech Stack:** Next.js 14 App Router (server components + server actions), Supabase PostgREST, `jsbarcode`, TypeScript, CSS Modules.

**Spec:** `docs/superpowers/specs/2026-05-06-locations-manager-design.md`

---

### Task 1: Schema migration

**Goal:** Create `bin_sub_location`, `bin_aisle`, `bin_bay` tables; migrate `component` to FK columns.

**Files:**
- Create: `supabase/patches/locations_manager_schema.sql`

**Acceptance Criteria:**
- [ ] Three new tables exist with RLS enabled and tenant isolation policy
- [ ] `component` has `bin_sub_location_id`, `bin_aisle_id`, `bin_bay_id` UUID FK columns
- [ ] Old `bin_sub_location`, `bin_row`, `bin_bay` text columns are dropped
- [ ] Unique constraints prevent duplicate names within the same parent scope

**Verify:** Run migration via Supabase MCP (`apply_migration`). In the Supabase dashboard, confirm the three tables exist and `component` has the three new UUID columns.

**Steps:**

- [ ] **Step 1: Create the patch file**

```sql
-- supabase/patches/locations_manager_schema.sql

-- bin_sub_location: sub-areas within a warehouse (e.g. Mezzanine)
CREATE TABLE IF NOT EXISTS bin_sub_location (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  warehouse_id  UUID NOT NULL REFERENCES location(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, warehouse_id, name)
);
ALTER TABLE bin_sub_location ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_iso" ON bin_sub_location
  FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

-- bin_aisle: aisles within a warehouse, optionally tagged to a sub-location
CREATE TABLE IF NOT EXISTS bin_aisle (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  warehouse_id     UUID NOT NULL REFERENCES location(id) ON DELETE CASCADE,
  sub_location_id  UUID REFERENCES bin_sub_location(id) ON DELETE SET NULL,
  name             TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, warehouse_id, name)
);
ALTER TABLE bin_aisle ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_iso" ON bin_aisle
  FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

-- bin_bay: bays within an aisle
CREATE TABLE IF NOT EXISTS bin_bay (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  aisle_id   UUID NOT NULL REFERENCES bin_aisle(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, aisle_id, name)
);
ALTER TABLE bin_bay ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant_iso" ON bin_bay
  FOR ALL USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

-- Migrate component: drop old text fields, add FK references
ALTER TABLE component
  DROP COLUMN IF EXISTS bin_sub_location,
  DROP COLUMN IF EXISTS bin_row,
  DROP COLUMN IF EXISTS bin_bay;

ALTER TABLE component
  ADD COLUMN IF NOT EXISTS bin_sub_location_id UUID REFERENCES bin_sub_location(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bin_aisle_id        UUID REFERENCES bin_aisle(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bin_bay_id          UUID REFERENCES bin_bay(id) ON DELETE SET NULL;
```

- [ ] **Step 2: Apply the migration**

Use the Supabase MCP tool `apply_migration` with the SQL content above, or run:
```bash
supabase db push
```

- [ ] **Step 3: Commit**

```bash
git add supabase/patches/locations_manager_schema.sql
git commit -m "feat(db): bin_sub_location, bin_aisle, bin_bay tables; migrate component FK columns"
```

---

### Task 2: Warehouse nav section + Locations Manager page scaffold

**Goal:** Add a "Warehouse" nav section and render the location tree (read-only display) at `/app/warehouse/locations`.

**Files:**
- Modify: `src/app/app/sidebar-nav.tsx`
- Modify: `src/app/app/route-meta.ts`
- Create: `src/app/app/warehouse/locations/page.tsx`
- Create: `src/app/app/warehouse/locations/page.module.css`

**Acceptance Criteria:**
- [ ] "Warehouse" nav section appears in the sidebar with a "Locations" link
- [ ] `/app/warehouse/locations` renders a page showing the warehouse tree
- [ ] Each warehouse shows its sub-locations and aisles; each aisle shows its bays
- [ ] TypeScript compiles with no errors: `npx tsc --noEmit`

**Verify:** `npm run dev`, open `/app/warehouse/locations`. Confirm nav shows "Warehouse > Locations". Confirm page renders (even if no data yet).

**Steps:**

- [ ] **Step 1: Add Warehouse section to sidebar-nav.tsx**

In `src/app/app/sidebar-nav.tsx`, add a new section between Operations and Planning:

```tsx
  {
    label: "Warehouse",
    items: [
      {
        label: "Locations",
        href: "/app/warehouse/locations",
        icon: (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <polyline points="9 22 9 12 15 12 15 22" />
          </svg>
        ),
      },
    ],
  },
```

Insert this after the closing `},` of the Operations section (after line 111) and before the Planning section.

- [ ] **Step 2: Add route metadata**

In `src/app/app/route-meta.ts`, add before the final `/app` entry:

```ts
  {
    prefix: "/app/warehouse/locations",
    title: "Locations",
    subtitle: "Manage warehouse locations, aisles, and bays.",
    crumbs: ["Warehouse", "Locations"],
  },
  {
    prefix: "/app/warehouse",
    title: "Warehouse",
    subtitle: "Manage physical warehouse structure and bin locations.",
    crumbs: ["Warehouse"],
  },
```

- [ ] **Step 3: Create the page**

```tsx
// src/app/app/warehouse/locations/page.tsx
import { notFound } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import styles from "./page.module.css";

type Bay = { id: string; name: string; aisle_id: string };
type Aisle = {
  id: string;
  name: string;
  sub_location_id: string | null;
  bays: Bay[] | null;
};
type SubLocation = { id: string; name: string };
type Warehouse = {
  id: string;
  name: string;
  is_default: boolean;
  sub_locations: SubLocation[] | null;
  aisles: Aisle[] | null;
};

function shortCode(id: string) {
  return id.replace(/-/g, "").slice(-6).toUpperCase();
}

export default async function LocationsPage() {
  const context = await getServerTenantContext();
  if (!context) return null;
  const { supabase, tenantId } = context;

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

  const wh = (warehouses ?? []) as Warehouse[];

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Locations</h1>
        <p className={styles.subtitle}>Manage warehouses, aisles, and bays.</p>
      </div>

      {wh.length === 0 && (
        <p className={styles.empty}>No warehouses configured. Add one below.</p>
      )}

      {wh.map((warehouse) => {
        const subLocMap = new Map((warehouse.sub_locations ?? []).map((s) => [s.id, s.name]));
        const aisles = (warehouse.aisles ?? []).sort((a, b) => a.name.localeCompare(b.name));
        const subLocs = (warehouse.sub_locations ?? []).sort((a, b) => a.name.localeCompare(b.name));

        return (
          <div key={warehouse.id} className={styles.warehouseBlock}>
            {/* Warehouse row */}
            <div className={styles.warehouseRow}>
              <span className={styles.typeTag}>Warehouse</span>
              <span className={styles.warehouseName}>{warehouse.name}</span>
              <span className={styles.countTag}>{subLocs.length} sub-locations</span>
              <span className={styles.countTag}>{aisles.length} aisles</span>
              <span className={styles.shortCode}>{shortCode(warehouse.id)}</span>
            </div>

            {/* Sub-location rows */}
            {subLocs.map((sl) => (
              <div key={sl.id} className={styles.subLocRow}>
                <span className={styles.indent}>└</span>
                <span className={styles.typeTag}>Sub-loc</span>
                <span className={styles.entityName}>{sl.name}</span>
                <span className={styles.shortCode}>{shortCode(sl.id)}</span>
              </div>
            ))}

            {/* Aisle rows + bay rows */}
            {aisles.map((aisle) => {
              const bays = (aisle.bays ?? []).sort((a, b) => a.name.localeCompare(b.name));
              const slName = aisle.sub_location_id ? subLocMap.get(aisle.sub_location_id) : null;
              return (
                <div key={aisle.id}>
                  <div className={styles.aisleRow}>
                    <span className={styles.indent}>└</span>
                    <span className={styles.typeTag}>Aisle</span>
                    <span className={styles.entityName}>
                      {aisle.name}
                      {slName && <span className={styles.slTag}> · {slName}</span>}
                      <span className={styles.bayCount}> · {bays.length} bays</span>
                    </span>
                    <span className={styles.shortCode}>{shortCode(aisle.id)}</span>
                  </div>
                  {bays.map((bay) => (
                    <div key={bay.id} className={styles.bayRow}>
                      <span className={styles.indent2}>└</span>
                      <span className={styles.typeTag}>Bay</span>
                      <span className={styles.entityName}>{bay.name}</span>
                      <span className={styles.pathHint}>{aisle.name} · {bay.name}</span>
                      <span className={styles.shortCode}>{shortCode(bay.id)}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        );
      })}

      <div className={styles.addWarehouseRow}>
        <span className={styles.addHint}>Multi-warehouse supported — add more any time</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create CSS module**

```css
/* src/app/app/warehouse/locations/page.module.css */
.page { padding: 24px; max-width: 860px; }
.header { margin-bottom: 24px; }
.title { font-size: 22px; font-weight: 700; margin: 0 0 4px; }
.subtitle { font-size: 14px; color: var(--muted); margin: 0; }
.error { color: var(--danger, #ef4444); }
.empty { color: var(--muted); font-size: 14px; }

.warehouseBlock { border: 1px solid var(--border); border-radius: 8px; margin-bottom: 20px; overflow: hidden; }

.warehouseRow {
  display: flex; align-items: center; gap: 10px;
  padding: 14px 16px; background: var(--surface-2);
  border-bottom: 1px solid var(--border);
}
.subLocRow, .aisleRow {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 16px 10px 28px;
  border-bottom: 1px solid var(--border);
}
.bayRow {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 16px 8px 48px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
}
.warehouseRow:last-child, .subLocRow:last-child, .aisleRow:last-child, .bayRow:last-child {
  border-bottom: none;
}

.typeTag {
  font-size: 11px; text-transform: uppercase; letter-spacing: .05em;
  color: var(--muted); width: 68px; flex-shrink: 0;
}
.warehouseName { font-size: 15px; font-weight: 600; flex: 1; }
.entityName { font-size: 14px; font-weight: 500; flex: 1; }
.slTag { font-weight: 400; color: var(--muted); }
.bayCount { font-weight: 400; color: var(--muted); font-size: 12px; }
.pathHint { font-size: 11px; color: var(--muted); }
.countTag {
  font-size: 11px; background: #dbeafe; color: #1d4ed8;
  padding: 2px 8px; border-radius: 4px;
}
.shortCode {
  font-family: monospace; font-size: 13px; font-weight: 600;
  color: var(--muted); letter-spacing: .1em; margin-left: auto;
}
.indent { color: var(--muted); font-size: 13px; width: 12px; flex-shrink: 0; }
.indent2 { color: var(--muted); font-size: 13px; width: 12px; flex-shrink: 0; }
.addWarehouseRow {
  padding: 12px 16px;
  border-top: 2px dashed var(--border);
  display: flex; align-items: center; gap: 12px;
}
.addHint { font-size: 12px; color: var(--muted); }
```

- [ ] **Step 5: Type-check and commit**

```bash
npx tsc --noEmit
git add src/app/app/sidebar-nav.tsx src/app/app/route-meta.ts src/app/app/warehouse/
git commit -m "feat(warehouse): locations page scaffold and nav section"
```

---

### Task 3: CRUD for all entity types

**Goal:** Add, edit, and delete functionality for warehouse names, sub-locations, aisles, and bays with inline forms and delete guards.

**Files:**
- Create: `src/app/app/warehouse/locations/actions.ts`
- Modify: `src/app/app/warehouse/locations/page.tsx`
- Modify: `src/app/app/warehouse/locations/page.module.css`

**Acceptance Criteria:**
- [ ] Can add a new warehouse (new `location` row)
- [ ] Can edit a warehouse name
- [ ] Can add, edit, delete sub-locations (delete blocked if components reference them)
- [ ] Can add, edit, delete aisles (delete shows bay count warning, delete blocked if components assigned)
- [ ] Can add, edit, delete bays (delete blocked if components assigned)
- [ ] Duplicate name within the same parent scope shows a user-facing error
- [ ] TypeScript compiles clean

**Verify:** `npm run dev`. Create a warehouse. Add an aisle. Add a bay under that aisle. Edit the bay name. Try deleting the aisle — should warn about the bay. Delete the bay, then delete the aisle. Confirm the delete-blocked error by assigning a component to a bay and trying to delete it.

**Steps:**

- [ ] **Step 1: Create server actions**

```ts
// src/app/app/warehouse/locations/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";

const REVALIDATE = "/app/warehouse/locations";

async function ctx() {
  const context = await getServerTenantContext();
  if (!context) throw new Error("Unauthorized");
  return context;
}

// ── Warehouse ────────────────────────────────────────────────

export async function addWarehouse(formData: FormData) {
  const name = formData.get("name")?.toString().trim();
  if (!name) return;
  const { supabase, tenantId } = await ctx();
  const { error } = await supabase.from("location").insert({ tenant_id: tenantId, name, is_default: false });
  if (error) throw new Error(error.message);
  revalidatePath(REVALIDATE);
}

export async function editWarehouse(formData: FormData) {
  const id = formData.get("id")?.toString();
  const name = formData.get("name")?.toString().trim();
  if (!id || !name) return;
  const { supabase, tenantId } = await ctx();
  const { error } = await supabase.from("location").update({ name }).eq("id", id).eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
  revalidatePath(REVALIDATE);
}

// ── Sub-location ─────────────────────────────────────────────

export async function addSubLocation(formData: FormData) {
  const warehouseId = formData.get("warehouse_id")?.toString();
  const name = formData.get("name")?.toString().trim();
  if (!warehouseId || !name) return;
  const { supabase, tenantId } = await ctx();
  const { error } = await supabase.from("bin_sub_location").insert({ tenant_id: tenantId, warehouse_id: warehouseId, name });
  if (error) throw new Error(error.message);
  revalidatePath(REVALIDATE);
}

export async function editSubLocation(formData: FormData) {
  const id = formData.get("id")?.toString();
  const name = formData.get("name")?.toString().trim();
  if (!id || !name) return;
  const { supabase, tenantId } = await ctx();
  const { error } = await supabase.from("bin_sub_location").update({ name }).eq("id", id).eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
  revalidatePath(REVALIDATE);
}

export async function deleteSubLocation(formData: FormData): Promise<{ error?: string }> {
  const id = formData.get("id")?.toString();
  if (!id) return {};
  const { supabase, tenantId } = await ctx();

  const { count } = await supabase
    .from("component")
    .select("id", { count: "exact", head: true })
    .eq("bin_sub_location_id", id)
    .eq("tenant_id", tenantId);

  if ((count ?? 0) > 0) return { error: `${count} component(s) assigned — reassign before deleting.` };

  const { error } = await supabase.from("bin_sub_location").delete().eq("id", id).eq("tenant_id", tenantId);
  if (error) return { error: error.message };
  revalidatePath(REVALIDATE);
  return {};
}

// ── Aisle ────────────────────────────────────────────────────

export async function addAisle(formData: FormData) {
  const warehouseId = formData.get("warehouse_id")?.toString();
  const name = formData.get("name")?.toString().trim();
  const subLocationId = formData.get("sub_location_id")?.toString() || null;
  if (!warehouseId || !name) return;
  const { supabase, tenantId } = await ctx();
  const { error } = await supabase.from("bin_aisle").insert({
    tenant_id: tenantId, warehouse_id: warehouseId, name, sub_location_id: subLocationId,
  });
  if (error) throw new Error(error.message);
  revalidatePath(REVALIDATE);
}

export async function editAisle(formData: FormData) {
  const id = formData.get("id")?.toString();
  const name = formData.get("name")?.toString().trim();
  const subLocationId = formData.get("sub_location_id")?.toString() || null;
  if (!id || !name) return;
  const { supabase, tenantId } = await ctx();
  const { error } = await supabase.from("bin_aisle")
    .update({ name, sub_location_id: subLocationId })
    .eq("id", id).eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
  revalidatePath(REVALIDATE);
}

export async function deleteAisle(formData: FormData): Promise<{ error?: string; bayCount?: number }> {
  const id = formData.get("id")?.toString();
  if (!id) return {};
  const { supabase, tenantId } = await ctx();

  const { count: compCount } = await supabase
    .from("component")
    .select("id", { count: "exact", head: true })
    .eq("bin_aisle_id", id)
    .eq("tenant_id", tenantId);
  if ((compCount ?? 0) > 0) return { error: `${compCount} component(s) assigned — reassign before deleting.` };

  const { count: bayCount } = await supabase
    .from("bin_bay")
    .select("id", { count: "exact", head: true })
    .eq("aisle_id", id);

  // If called with confirm=true, proceed; otherwise return bayCount for client confirmation
  const confirmed = formData.get("confirmed")?.toString() === "true";
  if ((bayCount ?? 0) > 0 && !confirmed) return { bayCount: bayCount ?? 0 };

  const { error } = await supabase.from("bin_aisle").delete().eq("id", id).eq("tenant_id", tenantId);
  if (error) return { error: error.message };
  revalidatePath(REVALIDATE);
  return {};
}

// ── Bay ──────────────────────────────────────────────────────

export async function addBay(formData: FormData) {
  const aisleId = formData.get("aisle_id")?.toString();
  const name = formData.get("name")?.toString().trim();
  if (!aisleId || !name) return;
  const { supabase, tenantId } = await ctx();
  const { error } = await supabase.from("bin_bay").insert({ tenant_id: tenantId, aisle_id: aisleId, name });
  if (error) throw new Error(error.message);
  revalidatePath(REVALIDATE);
}

export async function editBay(formData: FormData) {
  const id = formData.get("id")?.toString();
  const name = formData.get("name")?.toString().trim();
  if (!id || !name) return;
  const { supabase, tenantId } = await ctx();
  const { error } = await supabase.from("bin_bay").update({ name }).eq("id", id).eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
  revalidatePath(REVALIDATE);
}

export async function deleteBay(formData: FormData): Promise<{ error?: string }> {
  const id = formData.get("id")?.toString();
  if (!id) return {};
  const { supabase, tenantId } = await ctx();

  const { count } = await supabase
    .from("component")
    .select("id", { count: "exact", head: true })
    .eq("bin_bay_id", id)
    .eq("tenant_id", tenantId);
  if ((count ?? 0) > 0) return { error: `${count} component(s) assigned — reassign before deleting.` };

  const { error } = await supabase.from("bin_bay").delete().eq("id", id).eq("tenant_id", tenantId);
  if (error) return { error: error.message };
  revalidatePath(REVALIDATE);
  return {};
}
```

- [ ] **Step 2: Add inline CRUD forms to the page**

The page needs to be converted to use a mix of server-rendered forms and client-side toggle state for showing/hiding inline add/edit forms. Because showing an inline form requires client state (toggling visibility), extract the interactive portions to a client component `locations-tree.tsx`.

Create `src/app/app/warehouse/locations/locations-tree.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import styles from "./page.module.css";
import {
  addWarehouse, editWarehouse,
  addSubLocation, editSubLocation, deleteSubLocation,
  addAisle, editAisle, deleteAisle,
  addBay, editBay, deleteBay,
} from "./actions";

type Bay = { id: string; name: string; aisle_id: string };
type Aisle = { id: string; name: string; sub_location_id: string | null; bays: Bay[] };
type SubLocation = { id: string; name: string };
export type Warehouse = {
  id: string; name: string; is_default: boolean;
  sub_locations: SubLocation[];
  aisles: Aisle[];
};

function shortCode(id: string) {
  return id.replace(/-/g, "").slice(-6).toUpperCase();
}

function InlineForm({ action, fields, onDone }: {
  action: (fd: FormData) => Promise<unknown>;
  fields: React.ReactNode;
  onDone: () => void;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit(fd: FormData) {
    setErr(null);
    try {
      const result = (await action(fd)) as { error?: string } | undefined;
      if (result?.error) { setErr(result.error); return; }
      onDone();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Error");
    }
  }

  return (
    <form ref={ref} action={submit} className={styles.inlineForm}>
      {fields}
      {err && <span className={styles.formError}>{err}</span>}
      <button type="submit" className={styles.btnSave}>Save</button>
      <button type="button" className={styles.btnCancel} onClick={onDone}>Cancel</button>
    </form>
  );
}

function DeleteButton({ action, label }: { action: (fd: FormData) => Promise<{ error?: string }>; label: string }) {
  const [err, setErr] = useState<string | null>(null);

  async function submit(fd: FormData) {
    setErr(null);
    const result = await action(fd);
    if (result?.error) setErr(result.error);
  }

  return (
    <span>
      <form action={submit} style={{ display: "inline" }}>
        {label && <input type="hidden" name="id" value={label} />}
        <button type="submit" className={styles.btnDelete}>✕ Delete</button>
      </form>
      {err && <span className={styles.deleteError}>{err}</span>}
    </span>
  );
}

export function LocationsTree({ warehouses }: { warehouses: Warehouse[] }) {
  const [addingWh, setAddingWh] = useState(false);
  const [editingWh, setEditingWh] = useState<string | null>(null);
  const [addingSl, setAddingSl] = useState<string | null>(null);       // warehouse id
  const [editingSl, setEditingSl] = useState<string | null>(null);     // sub-location id
  const [addingAisle, setAddingAisle] = useState<string | null>(null); // warehouse id
  const [editingAisle, setEditingAisle] = useState<string | null>(null);
  const [addingBay, setAddingBay] = useState<string | null>(null);     // aisle id
  const [editingBay, setEditingBay] = useState<string | null>(null);

  return (
    <div>
      {warehouses.map((wh) => {
        const subLocMap = new Map(wh.sub_locations.map((s) => [s.id, s.name]));
        const aisles = [...wh.aisles].sort((a, b) => a.name.localeCompare(b.name));
        const subLocs = [...wh.sub_locations].sort((a, b) => a.name.localeCompare(b.name));

        return (
          <div key={wh.id} className={styles.warehouseBlock}>
            {/* Warehouse row */}
            {editingWh === wh.id ? (
              <div className={styles.warehouseRow}>
                <InlineForm
                  action={editWarehouse}
                  onDone={() => setEditingWh(null)}
                  fields={<>
                    <input type="hidden" name="id" value={wh.id} />
                    <input name="name" defaultValue={wh.name} className={styles.inlineInput} autoFocus />
                  </>}
                />
              </div>
            ) : (
              <div className={styles.warehouseRow}>
                <span className={styles.typeTag}>Warehouse</span>
                <span className={styles.warehouseName}>{wh.name}</span>
                <span className={styles.countTag}>{subLocs.length} sub-loc</span>
                <span className={styles.countTag}>{aisles.length} aisles</span>
                <span className={styles.shortCode}>{shortCode(wh.id)}</span>
                <button className={styles.btnIcon} onClick={() => setAddingSl(wh.id)} title="Add sub-location">⊕ Sub-loc</button>
                <button className={styles.btnIcon} onClick={() => setAddingAisle(wh.id)} title="Add aisle">⊕ Aisle</button>
                <button className={styles.btnIcon} onClick={() => setEditingWh(wh.id)}>✎ Edit</button>
              </div>
            )}

            {/* Add sub-location inline form */}
            {addingSl === wh.id && (
              <div className={styles.subLocRow}>
                <InlineForm
                  action={addSubLocation}
                  onDone={() => setAddingSl(null)}
                  fields={<>
                    <input type="hidden" name="warehouse_id" value={wh.id} />
                    <input name="name" placeholder="Sub-location name" className={styles.inlineInput} autoFocus />
                  </>}
                />
              </div>
            )}

            {/* Sub-location rows */}
            {subLocs.map((sl) => (
              <div key={sl.id} className={styles.subLocRow}>
                {editingSl === sl.id ? (
                  <InlineForm
                    action={editSubLocation}
                    onDone={() => setEditingSl(null)}
                    fields={<>
                      <input type="hidden" name="id" value={sl.id} />
                      <input name="name" defaultValue={sl.name} className={styles.inlineInput} autoFocus />
                    </>}
                  />
                ) : (
                  <>
                    <span className={styles.indent}>└</span>
                    <span className={styles.typeTag}>Sub-loc</span>
                    <span className={styles.entityName}>{sl.name}</span>
                    <span className={styles.shortCode}>{shortCode(sl.id)}</span>
                    <button className={styles.btnIcon} onClick={() => setEditingSl(sl.id)}>✎ Edit</button>
                    <DeleteButton action={deleteSubLocation} label={sl.id} />
                  </>
                )}
              </div>
            ))}

            {/* Add aisle inline form */}
            {addingAisle === wh.id && (
              <div className={styles.aisleRow}>
                <InlineForm
                  action={addAisle}
                  onDone={() => setAddingAisle(null)}
                  fields={<>
                    <input type="hidden" name="warehouse_id" value={wh.id} />
                    <input name="name" placeholder="Aisle name" className={styles.inlineInput} autoFocus />
                    <select name="sub_location_id" className={styles.inlineSelect}>
                      <option value="">— No sub-location —</option>
                      {subLocs.map((sl) => <option key={sl.id} value={sl.id}>{sl.name}</option>)}
                    </select>
                  </>}
                />
              </div>
            )}

            {/* Aisle rows */}
            {aisles.map((aisle) => {
              const bays = [...(aisle.bays ?? [])].sort((a, b) => a.name.localeCompare(b.name));
              const slName = aisle.sub_location_id ? subLocMap.get(aisle.sub_location_id) : null;

              return (
                <div key={aisle.id}>
                  {editingAisle === aisle.id ? (
                    <div className={styles.aisleRow}>
                      <InlineForm
                        action={editAisle}
                        onDone={() => setEditingAisle(null)}
                        fields={<>
                          <input type="hidden" name="id" value={aisle.id} />
                          <input name="name" defaultValue={aisle.name} className={styles.inlineInput} autoFocus />
                          <select name="sub_location_id" className={styles.inlineSelect} defaultValue={aisle.sub_location_id ?? ""}>
                            <option value="">— No sub-location —</option>
                            {subLocs.map((sl) => <option key={sl.id} value={sl.id}>{sl.name}</option>)}
                          </select>
                        </>}
                      />
                    </div>
                  ) : (
                    <div className={styles.aisleRow}>
                      <span className={styles.indent}>└</span>
                      <span className={styles.typeTag}>Aisle</span>
                      <span className={styles.entityName}>
                        {aisle.name}
                        {slName && <span className={styles.slTag}> · {slName}</span>}
                        <span className={styles.bayCount}> · {bays.length} bays</span>
                      </span>
                      <span className={styles.shortCode}>{shortCode(aisle.id)}</span>
                      <button className={styles.btnIcon} onClick={() => setAddingBay(aisle.id)}>⊕ Bay</button>
                      <button className={styles.btnIcon} onClick={() => setEditingAisle(aisle.id)}>✎ Edit</button>
                      <DeleteButton action={deleteAisle} label={aisle.id} />
                    </div>
                  )}

                  {/* Add bay inline form */}
                  {addingBay === aisle.id && (
                    <div className={styles.bayRow}>
                      <InlineForm
                        action={addBay}
                        onDone={() => setAddingBay(null)}
                        fields={<>
                          <input type="hidden" name="aisle_id" value={aisle.id} />
                          <input name="name" placeholder="Bay name" className={styles.inlineInput} autoFocus />
                        </>}
                      />
                    </div>
                  )}

                  {/* Bay rows */}
                  {bays.map((bay) => (
                    <div key={bay.id} className={styles.bayRow}>
                      {editingBay === bay.id ? (
                        <InlineForm
                          action={editBay}
                          onDone={() => setEditingBay(null)}
                          fields={<>
                            <input type="hidden" name="id" value={bay.id} />
                            <input name="name" defaultValue={bay.name} className={styles.inlineInput} autoFocus />
                          </>}
                        />
                      ) : (
                        <>
                          <span className={styles.indent2}>└</span>
                          <span className={styles.typeTag}>Bay</span>
                          <span className={styles.entityName}>{bay.name}</span>
                          <span className={styles.pathHint}>{aisle.name} · {bay.name}</span>
                          <span className={styles.shortCode}>{shortCode(bay.id)}</span>
                          <button className={styles.btnIcon} onClick={() => setEditingBay(bay.id)}>✎ Edit</button>
                          <DeleteButton action={deleteBay} label={bay.id} />
                        </>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Add warehouse */}
      <div className={styles.addWarehouseRow}>
        {addingWh ? (
          <InlineForm
            action={addWarehouse}
            onDone={() => setAddingWh(false)}
            fields={<input name="name" placeholder="Warehouse name" className={styles.inlineInput} autoFocus />}
          />
        ) : (
          <>
            <button className={styles.btnAddWarehouse} onClick={() => setAddingWh(true)}>⊕ Add Warehouse</button>
            <span className={styles.addHint}>Multi-warehouse supported — add more any time</span>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Update page.tsx to use LocationsTree**

Replace the render body in `page.tsx` with:

```tsx
import { LocationsTree, type Warehouse } from "./locations-tree";
// ... keep existing imports and data fetch ...

return (
  <div className={styles.page}>
    <div className={styles.header}>
      <h1 className={styles.title}>Locations</h1>
      <p className={styles.subtitle}>Manage warehouses, aisles, and bays.</p>
    </div>
    {error && <p className={styles.error}>Failed to load locations: {error.message}</p>}
    <LocationsTree warehouses={(warehouses ?? []) as Warehouse[]} />
  </div>
);
```

- [ ] **Step 4: Add CSS for interactive elements to page.module.css**

```css
/* Append to page.module.css */
.btnIcon {
  font-size: 12px; padding: 3px 10px;
  border: 1px solid var(--border); border-radius: 4px;
  background: var(--surface); cursor: pointer;
  white-space: nowrap;
}
.btnIcon:hover { background: var(--surface-2); }
.btnDelete { font-size: 12px; padding: 3px 10px; border: 1px solid #fca5a5; border-radius: 4px; background: var(--surface); color: #ef4444; cursor: pointer; }
.btnDelete:hover { background: #fee2e2; }
.btnSave { font-size: 12px; padding: 4px 12px; border: 1px solid var(--primary, #3b82f6); border-radius: 4px; background: var(--primary, #3b82f6); color: white; cursor: pointer; }
.btnCancel { font-size: 12px; padding: 4px 10px; border: 1px solid var(--border); border-radius: 4px; background: var(--surface); cursor: pointer; }
.btnAddWarehouse { font-size: 13px; padding: 6px 16px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); cursor: pointer; }
.inlineForm { display: flex; align-items: center; gap: 8px; flex: 1; }
.inlineInput { font-size: 13px; padding: 4px 8px; border: 1px solid var(--border); border-radius: 4px; background: var(--surface); flex: 1; min-width: 0; }
.inlineSelect { font-size: 13px; padding: 4px 8px; border: 1px solid var(--border); border-radius: 4px; background: var(--surface); }
.formError { font-size: 12px; color: #ef4444; }
.deleteError { font-size: 12px; color: #ef4444; margin-left: 6px; }
```

- [ ] **Step 5: Type-check and commit**

```bash
npx tsc --noEmit
git add src/app/app/warehouse/
git commit -m "feat(warehouse): full CRUD for warehouses, sub-locations, aisles, bays"
```

---

### Task 4: Barcode modal

**Goal:** Show a Code 128 barcode + short code in a modal when clicking the ▦ Barcode button on any entity row, with print label support.

**Files:**
- Create: `src/app/app/warehouse/locations/barcode-modal.tsx`
- Modify: `src/app/app/warehouse/locations/locations-tree.tsx`
- Modify: `src/app/app/warehouse/locations/page.module.css`

**Acceptance Criteria:**
- [ ] `jsbarcode` is installed
- [ ] Clicking ▦ Barcode on any row opens a modal
- [ ] Modal shows entity type, name, full path breadcrumb, Code 128 barcode, and 6-char short code
- [ ] Print Label triggers a print dialog that renders only the label content
- [ ] Closing the modal works (Escape key or ✕ button)

**Verify:** `npm run dev`. Open Locations page. Click ▦ Barcode on a bay row. Confirm barcode renders. Click Print Label — confirm a print dialog shows with just the label content.

**Steps:**

- [ ] **Step 1: Install JsBarcode**

```bash
npm install jsbarcode
npm install --save-dev @types/jsbarcode
```

- [ ] **Step 2: Create BarcodeModal component**

```tsx
// src/app/app/warehouse/locations/barcode-modal.tsx
"use client";

import { useEffect, useRef } from "react";
import styles from "./page.module.css";

declare global {
  interface Window { JsBarcode: (el: SVGSVGElement, value: string, opts: object) => void; }
}

interface Props {
  entityId: string;
  entityType: string;
  entityName: string;
  path: string;
  onClose: () => void;
}

export function BarcodeModal({ entityId, entityType, entityName, path, onClose }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const shortCode = entityId.replace(/-/g, "").slice(-6).toUpperCase();

  useEffect(() => {
    import("jsbarcode").then((mod) => {
      const JsBarcode = mod.default;
      if (svgRef.current) {
        JsBarcode(svgRef.current, shortCode, {
          format: "CODE128",
          displayValue: false,
          margin: 0,
          width: 2.5,
          height: 64,
        });
      }
    });
  }, [shortCode]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className={styles.modalOverlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={styles.modal}>
        <button className={styles.modalClose} onClick={onClose}>✕</button>
        <div className={styles.modalType}>{entityType}</div>
        <div className={styles.modalName}>{entityName}</div>
        <div className={styles.modalPath}>{path}</div>

        <div className={styles.barcodeBox}>
          <svg ref={svgRef} />
          <div className={styles.shortCode2}>{shortCode}</div>
          <div className={styles.shortCodeLabel}>location code</div>
        </div>

        <div className={styles.modalActions}>
          <button className={styles.btnSave} onClick={() => window.print()}>🖨 Print Label</button>
        </div>

        {/* Print-only label */}
        <div className={styles.printLabel}>
          <div className={styles.printPath}>{path}</div>
          <div className={styles.printName}>{entityName}</div>
          <svg ref={undefined} id="print-barcode" />
          <div className={styles.printCode}>{shortCode}</div>
        </div>
      </div>
    </div>
  );
}
```

Note: the print-only label uses a separate SVG. Add a second `useEffect` to populate it:

```tsx
  const printSvgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    import("jsbarcode").then((mod) => {
      const JsBarcode = mod.default;
      if (svgRef.current) JsBarcode(svgRef.current, shortCode, { format: "CODE128", displayValue: false, margin: 0, width: 2.5, height: 64 });
      if (printSvgRef.current) JsBarcode(printSvgRef.current, shortCode, { format: "CODE128", displayValue: false, margin: 0, width: 2, height: 40 });
    });
  }, [shortCode]);
```

Update `<svg ref={undefined} id="print-barcode" />` → `<svg ref={printSvgRef} />`.

- [ ] **Step 3: Add modal CSS**

```css
/* Append to page.module.css */
.modalOverlay {
  position: fixed; inset: 0; background: rgba(0,0,0,.45);
  display: flex; align-items: center; justify-content: center; z-index: 100;
}
.modal {
  background: var(--surface, #fff); border-radius: 10px;
  padding: 28px 32px; min-width: 320px; max-width: 420px;
  position: relative; box-shadow: 0 8px 32px rgba(0,0,0,.18);
}
.modalClose {
  position: absolute; top: 12px; right: 14px;
  background: none; border: none; font-size: 16px; cursor: pointer; color: var(--muted);
}
.modalType { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin-bottom: 4px; }
.modalName { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
.modalPath { font-size: 13px; color: var(--muted); margin-bottom: 20px; }
.barcodeBox { text-align: center; background: #fff; border: 1px solid var(--border); border-radius: 6px; padding: 16px; margin-bottom: 16px; }
.shortCode2 { font-size: 24px; font-weight: 700; font-family: monospace; letter-spacing: .2em; margin-top: 8px; }
.shortCodeLabel { font-size: 11px; color: var(--muted); }
.modalActions { display: flex; gap: 10px; justify-content: center; }

/* Print label — hidden on screen, shown only on print */
.printLabel { display: none; }
@media print {
  body > * { display: none !important; }
  .printLabel { display: block !important; font-family: sans-serif; padding: 12px; width: 60mm; }
  .printPath { font-size: 9px; color: #6b7280; margin-bottom: 4px; }
  .printName { font-size: 20px; font-weight: 700; margin-bottom: 8px; }
  .printCode { font-size: 13px; font-weight: 700; font-family: monospace; letter-spacing: .2em; margin-top: 4px; }
}
```

- [ ] **Step 4: Wire barcode button into LocationsTree**

Add state to `LocationsTree`:
```tsx
const [barcode, setBarcode] = useState<{
  id: string; type: string; name: string; path: string;
} | null>(null);
```

Add `BarcodeModal` import and render it when `barcode !== null`:
```tsx
{barcode && (
  <BarcodeModal
    entityId={barcode.id}
    entityType={barcode.type}
    entityName={barcode.name}
    path={barcode.path}
    onClose={() => setBarcode(null)}
  />
)}
```

Add barcode buttons to each row. Example for warehouse row:
```tsx
<button className={styles.btnIcon} onClick={() => setBarcode({ id: wh.id, type: "Warehouse", name: wh.name, path: wh.name })}>
  ▦ Barcode
</button>
```

For aisle row:
```tsx
<button className={styles.btnIcon} onClick={() => setBarcode({ id: aisle.id, type: "Aisle", name: aisle.name, path: `${wh.name} · ${aisle.name}` })}>
  ▦ Barcode
</button>
```

For bay row:
```tsx
<button className={styles.btnIcon} onClick={() => setBarcode({ id: bay.id, type: "Bay", name: bay.name, path: `${wh.name} · ${aisle.name} · ${bay.name}` })}>
  ▦ Barcode
</button>
```

For sub-location row:
```tsx
<button className={styles.btnIcon} onClick={() => setBarcode({ id: sl.id, type: "Sub-location", name: sl.name, path: `${wh.name} · ${sl.name}` })}>
  ▦ Barcode
</button>
```

- [ ] **Step 5: Type-check and commit**

```bash
npx tsc --noEmit
git add src/app/app/warehouse/ package.json package-lock.json
git commit -m "feat(warehouse): barcode modal with Code 128 and print label"
```

---

### Task 5: Component bin location — cascading dropdowns

**Goal:** Replace the three free-text bin location inputs on the component detail page with cascading dropdowns backed by the managed location entities.

**Files:**
- Create: `src/app/app/components/[componentId]/bin-location-select.tsx`
- Modify: `src/app/app/components/[componentId]/page.tsx`
- Modify: `src/app/app/components/actions.ts`

**Acceptance Criteria:**
- [ ] Component detail page loads all warehouses, sub-locations, aisles, bays for the tenant
- [ ] Selecting a warehouse filters sub-locations and aisles to that warehouse
- [ ] Selecting an aisle filters the bay dropdown to only bays in that aisle; selecting no aisle hides/disables bay
- [ ] Clearing aisle also clears bay
- [ ] Saving persists the FK IDs to the component row
- [ ] Assigned location summary shows full path and short code
- [ ] TypeScript compiles clean

**Verify:** `npm run dev`. Open a component detail page. Select a warehouse and aisle. Confirm bay list filters. Save. Reload — confirm values persist. Clear aisle — confirm bay clears.

**Steps:**

- [ ] **Step 1: Update updateBinLocation server action**

Replace the existing `updateBinLocation` in `src/app/app/components/actions.ts`:

```ts
export async function updateBinLocation(formData: FormData): Promise<void> {
  const componentId = formData.get("component_id")?.toString().trim() ?? "";
  const binSubLocationId = formData.get("bin_sub_location_id")?.toString().trim() || null;
  const binAisleId = formData.get("bin_aisle_id")?.toString().trim() || null;
  const binBayId = formData.get("bin_bay_id")?.toString().trim() || null;

  if (!componentId) return;

  const context = await getServerTenantContext();
  if (!context) return;
  const { supabase, tenantId } = context;

  const { error } = await supabase
    .from("component")
    .update({
      bin_sub_location_id: binSubLocationId,
      bin_aisle_id: binAisleId,
      bin_bay_id: binBayId,
    })
    .eq("id", componentId)
    .eq("tenant_id", tenantId);

  if (error) {
    console.error("[updateBinLocation]", error.message);
    return;
  }

  revalidatePath(`/app/components/${componentId}`);
}
```

- [ ] **Step 2: Create BinLocationSelect client component**

```tsx
// src/app/app/components/[componentId]/bin-location-select.tsx
"use client";

import { useState } from "react";
import { updateBinLocation } from "../actions";
import styles from "./page.module.css"; // reuses existing page styles

type Warehouse = { id: string; name: string };
type SubLocation = { id: string; name: string; warehouse_id: string };
type Aisle = { id: string; name: string; warehouse_id: string; sub_location_id: string | null };
type Bay = { id: string; name: string; aisle_id: string };

interface Props {
  componentId: string;
  warehouses: Warehouse[];
  subLocations: SubLocation[];
  aisles: Aisle[];
  bays: Bay[];
  currentWarehouseId: string | null;
  currentSubLocationId: string | null;
  currentAisleId: string | null;
  currentBayId: string | null;
}

function shortCode(id: string | null) {
  if (!id) return null;
  return id.replace(/-/g, "").slice(-6).toUpperCase();
}

export function BinLocationSelect({
  componentId, warehouses, subLocations, aisles, bays,
  currentWarehouseId, currentSubLocationId, currentAisleId, currentBayId,
}: Props) {
  const [whId, setWhId] = useState(currentWarehouseId ?? "");
  const [slId, setSlId] = useState(currentSubLocationId ?? "");
  const [aisleId, setAisleId] = useState(currentAisleId ?? "");
  const [bayId, setBayId] = useState(currentBayId ?? "");

  const filteredSl = subLocations.filter((s) => s.warehouse_id === whId);
  const filteredAisles = aisles.filter((a) => {
    if (a.warehouse_id !== whId) return false;
    if (slId) return a.sub_location_id === slId || a.sub_location_id === null;
    return true;
  });
  const filteredBays = bays.filter((b) => b.aisle_id === aisleId);

  const currentAisle = aisles.find((a) => a.id === aisleId);
  const currentBay = bays.find((b) => b.id === bayId);
  const currentWh = warehouses.find((w) => w.id === whId);
  const assignedPath = [currentWh?.name, currentAisle?.name, currentBay?.name].filter(Boolean).join(" · ") || null;
  const assignedCode = shortCode(bayId || aisleId || slId || whId || null);

  return (
    <form action={updateBinLocation}>
      <input type="hidden" name="component_id" value={componentId} />
      <input type="hidden" name="bin_sub_location_id" value={slId} />
      <input type="hidden" name="bin_aisle_id" value={aisleId} />
      <input type="hidden" name="bin_bay_id" value={bayId} />

      <div className={styles.binFieldRow}>
        <label className={styles.binField}>
          <span className={styles.binLabel}>Warehouse</span>
          <select
            className={styles.binInput}
            value={whId}
            onChange={(e) => { setWhId(e.target.value); setSlId(""); setAisleId(""); setBayId(""); }}
          >
            <option value="">— None —</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </label>

        <label className={styles.binField}>
          <span className={styles.binLabel}>Sub-location <span style={{ fontWeight: 400 }}>(optional)</span></span>
          <select
            className={styles.binInput}
            value={slId}
            disabled={!whId}
            onChange={(e) => { setSlId(e.target.value); }}
          >
            <option value="">— None —</option>
            {filteredSl.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>

        <label className={styles.binField}>
          <span className={styles.binLabel}>Aisle <span style={{ fontWeight: 400 }}>(optional)</span></span>
          <select
            className={styles.binInput}
            value={aisleId}
            disabled={!whId}
            onChange={(e) => { setAisleId(e.target.value); setBayId(""); }}
          >
            <option value="">— None —</option>
            {filteredAisles.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>

        <label className={styles.binField}>
          <span className={styles.binLabel}>Bay <span style={{ fontWeight: 400 }}>(optional)</span></span>
          <select
            className={styles.binInput}
            value={bayId}
            disabled={!aisleId}
            onChange={(e) => setBayId(e.target.value)}
          >
            <option value="">— None —</option>
            {filteredBays.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
      </div>

      {assignedPath && (
        <div className={styles.binSummary}>
          <div>
            <div className={styles.binSummaryLabel}>Assigned location</div>
            <div className={styles.binSummaryPath}>{assignedPath}</div>
          </div>
          {assignedCode && <div className={styles.binSummaryCode}>{assignedCode}</div>}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
        <button type="submit" className={styles.binSaveBtn}>Save location</button>
        {(whId || slId || aisleId || bayId) && (
          <button
            type="button"
            className={styles.binClearBtn}
            onClick={() => { setWhId(""); setSlId(""); setAisleId(""); setBayId(""); }}
          >
            Clear
          </button>
        )}
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Update the component detail page to fetch location data and use BinLocationSelect**

In `src/app/app/components/[componentId]/page.tsx`, add location data queries alongside the existing queries:

```tsx
// Add to imports
import { BinLocationSelect } from "./bin-location-select";

// Add to ComponentRecord type (replace old bin_ fields):
type ComponentRecord = {
  // ... existing fields ...
  bin_sub_location_id: string | null;
  bin_aisle_id: string | null;
  bin_bay_id: string | null;
  // Remove: bin_sub_location, bin_row, bin_bay
};
```

Add location queries in the existing `Promise.all` block (or a separate one after):

```tsx
const [whRes, slRes, aisleRes, bayRes] = await Promise.all([
  supabase.from("location").select("id, name").eq("tenant_id", tenantId).order("name"),
  supabase.from("bin_sub_location").select("id, name, warehouse_id").eq("tenant_id", tenantId).order("name"),
  supabase.from("bin_aisle").select("id, name, warehouse_id, sub_location_id").eq("tenant_id", tenantId).order("name"),
  supabase.from("bin_bay").select("id, name, aisle_id").eq("tenant_id", tenantId).order("name"),
]);
```

Replace the existing `<section className={styles.binSection}>` block with:

```tsx
<section className={styles.binSection}>
  <h3 className={styles.binSectionTitle}>Bin location</h3>
  <p className={styles.binSectionDesc}>
    Where this component lives in the warehouse. Used to group items in stocktake sheets.
  </p>
  <BinLocationSelect
    componentId={c.id}
    warehouses={whRes.data ?? []}
    subLocations={slRes.data ?? []}
    aisles={aisleRes.data ?? []}
    bays={bayRes.data ?? []}
    currentWarehouseId={null}
    currentSubLocationId={c.bin_sub_location_id}
    currentAisleId={c.bin_aisle_id}
    currentBayId={c.bin_bay_id}
  />
</section>
```

Note: `currentWarehouseId` is derived from the aisle or sub-location. Resolve it:

```tsx
const currentAisle = (aisleRes.data ?? []).find((a) => a.id === c.bin_aisle_id);
const currentSubLoc = (slRes.data ?? []).find((s) => s.id === c.bin_sub_location_id);
const currentWarehouseId = currentAisle?.warehouse_id ?? currentSubLoc?.warehouse_id ?? null;
```

Pass `currentWarehouseId` to the component.

- [ ] **Step 4: Add summary CSS to component page.module.css**

```css
/* Append to src/app/app/components/[componentId]/page.module.css */
.binSummary {
  display: flex; align-items: center; justify-content: space-between;
  background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 6px;
  padding: 10px 14px; margin-top: 10px;
}
.binSummaryLabel { font-size: 11px; color: #0369a1; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 2px; }
.binSummaryPath { font-size: 14px; font-weight: 600; color: #0c4a6e; }
.binSummaryCode { font-size: 20px; font-weight: 700; font-family: monospace; color: #0369a1; letter-spacing: .15em; }
.binClearBtn { font-size: 13px; padding: 6px 14px; border: 1px solid #fca5a5; border-radius: 6px; background: var(--surface); color: #ef4444; cursor: pointer; }
```

- [ ] **Step 5: Type-check and commit**

```bash
npx tsc --noEmit
git add src/app/app/components/
git commit -m "feat(components): cascading bin location dropdowns replace free-text inputs"
```

---

### Task 6: Stocktake and CSV export FK updates

**Goal:** Update the stocktake session page, counting sheet, and CSV export route to resolve bin location names via FK joins instead of the dropped text columns.

**Files:**
- Modify: `src/app/app/stocktake/[sessionId]/page.tsx`
- Modify: `src/app/app/stocktake/[sessionId]/counting-sheet.tsx`
- Modify: `src/app/api/stocktake/[sessionId]/export/route.ts`

**Acceptance Criteria:**
- [ ] Stocktake session page groups lines by resolved bin location names
- [ ] Counting sheet renders location group headers with resolved names
- [ ] CSV export includes resolved sub-location, aisle, bay names (not IDs)
- [ ] "No location set" group still appears for unassigned components
- [ ] TypeScript compiles clean

**Verify:** `npm run dev`. Open a stocktake session. Confirm groups appear with the location names from the managed entities. Download the CSV and confirm sub_location/aisle/bay columns contain names, not UUIDs or empty strings.

**Steps:**

- [ ] **Step 1: Update LineRow type and query in stocktake page**

In `src/app/app/stocktake/[sessionId]/page.tsx`, replace the `LineRow` type:

```tsx
type BinRef = { name: string } | Array<{ name: string }> | null;

type LineRow = {
  id: string;
  expected_on_hand: number;
  counted: number | null;
  notes: string | null;
  variance_reason_id: string | null;
  component: {
    id: string;
    name: string | null;
    sku: string | null;
    cost_per_unit: number;
    bin_sub_location: BinRef;
    bin_aisle: BinRef;
    bin_bay: BinRef;
  } | Array<{
    id: string;
    name: string | null;
    sku: string | null;
    cost_per_unit: number;
    bin_sub_location: BinRef;
    bin_aisle: BinRef;
    bin_bay: BinRef;
  }> | null;
};
```

Update the query select string (line ~108):

```tsx
supabase
  .from("stocktake_line")
  .select(`id,expected_on_hand,counted,notes,variance_reason_id,component:component_id(
    id,name,sku,cost_per_unit,
    bin_sub_location:bin_sub_location_id(name),
    bin_aisle:bin_aisle_id(name),
    bin_bay:bin_bay_id(name)
  )`)
  .eq("tenant_id", tenantId)
  .eq("session_id", sessionId)
```

- [ ] **Step 2: Update binKey and groupByBin helper functions**

Helper to unwrap a BinRef to its name string:

```tsx
function binName(ref: BinRef): string | null {
  if (!ref) return null;
  const obj = Array.isArray(ref) ? ref[0] : ref;
  return obj?.name ?? null;
}
```

Replace `binKey`:

```tsx
function binKey(l: LineRow): string {
  const c = Array.isArray(l.component) ? l.component[0] : l.component;
  if (!c) return "__none";
  return [
    binName(c.bin_sub_location) ?? "",
    binName(c.bin_aisle) ?? "",
    binName(c.bin_bay) ?? "",
  ].join("|");
}
```

Replace `groupByBin`:

```tsx
function groupByBin(lines: LineRow[]): BinGroup[] {
  const map = new Map<string, BinGroup>();
  for (const l of lines) {
    const c = Array.isArray(l.component) ? l.component[0] : l.component;
    const key = binKey(l);
    if (!map.has(key)) {
      map.set(key, {
        key,
        subLocation: c ? binName(c.bin_sub_location) : null,
        row: c ? binName(c.bin_aisle) : null,
        bay: c ? binName(c.bin_bay) : null,
        lines: [],
      });
    }
    (map.get(key)!.lines as LineRow[]).push(l);
  }
  return [...map.values()].sort((a, b) => {
    if (a.subLocation === null && b.subLocation !== null) return 1;
    if (a.subLocation !== null && b.subLocation === null) return -1;
    const sl = (a.subLocation ?? "").localeCompare(b.subLocation ?? "");
    if (sl !== 0) return sl;
    const r = (a.row ?? "").localeCompare(b.row ?? "");
    if (r !== 0) return r;
    return (a.bay ?? "").localeCompare(b.bay ?? "");
  });
}
```

- [ ] **Step 3: Update counting-sheet.tsx CompData type**

In `src/app/app/stocktake/[sessionId]/counting-sheet.tsx`, replace `CompData`:

```tsx
type BinRef = { name: string } | Array<{ name: string }> | null;

type CompData = {
  id: string;
  name: string | null;
  sku: string | null;
  cost_per_unit: number;
  bin_sub_location: BinRef;
  bin_aisle: BinRef;
  bin_bay: BinRef;
};

function binName(ref: BinRef): string | null {
  if (!ref) return null;
  const obj = Array.isArray(ref) ? ref[0] : ref;
  return obj?.name ?? null;
}
```

Find all usages of `c.bin_sub_location`, `c.bin_row`, `c.bin_bay` in the file and replace with `binName(c.bin_sub_location)`, `binName(c.bin_aisle)`, `binName(c.bin_bay)`.

The `BinGroup` type stays the same (it uses `string | null` for subLocation, row, bay — the resolved names map to these fields directly).

Also update `DeleteButton` in `locations-tree.tsx` to handle `bayCount` for aisles: when `deleteAisle` returns `{ bayCount }`, prompt `window.confirm(\`This aisle has ${bayCount} bay(s) that will also be deleted. Continue?\`)` and if confirmed, resubmit with an extra `confirmed=true` hidden input.

- [ ] **Step 4: Update CSV export route**

In `src/app/api/stocktake/[sessionId]/export/route.ts`, replace the `LineRow` type:

```ts
type BinRef = { name: string } | Array<{ name: string }> | null;

type LineRow = {
  id: string;
  expected_on_hand: number;
  counted: number | null;
  notes: string | null;
  component: {
    id: string;
    name: string | null;
    sku: string | null;
    bin_sub_location: BinRef;
    bin_aisle: BinRef;
    bin_bay: BinRef;
  } | Array<{
    id: string;
    name: string | null;
    sku: string | null;
    bin_sub_location: BinRef;
    bin_aisle: BinRef;
    bin_bay: BinRef;
  }> | null;
};

function binName(ref: BinRef): string | null {
  if (!ref) return null;
  const obj = Array.isArray(ref) ? ref[0] : ref;
  return obj?.name ?? null;
}
```

Update the query select string:

```ts
supabase
  .from("stocktake_line")
  .select(`id,expected_on_hand,counted,notes,component:component_id(
    id,name,sku,
    bin_sub_location:bin_sub_location_id(name),
    bin_aisle:bin_aisle_id(name),
    bin_bay:bin_bay_id(name)
  )`)
  .eq("tenant_id", tenantId)
  .eq("session_id", sessionId)
```

Update the CSV row generation:

```ts
const body = rows.map((l) => {
  const c = Array.isArray(l.component) ? l.component[0] : l.component;
  return [
    csvEscape(c?.id),
    csvEscape(c?.name),
    csvEscape(c?.sku),
    csvEscape(binName(c?.bin_sub_location ?? null)),
    csvEscape(binName(c?.bin_aisle ?? null)),
    csvEscape(binName(c?.bin_bay ?? null)),
    String(Number(l.expected_on_hand).toFixed(0)),
    l.counted !== null ? String(Number(l.counted).toFixed(0)) : "",
    csvEscape(l.notes),
  ].join(",");
}).join("\r\n");
```

- [ ] **Step 5: Type-check and commit**

```bash
npx tsc --noEmit
git add src/app/app/stocktake/ src/app/api/stocktake/
git commit -m "feat(stocktake): resolve bin location names via FK joins"
```
