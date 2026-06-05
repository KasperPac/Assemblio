# Mobile Scanner PWA — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a mobile-optimised PWA scanner at `/app/scan/` that lets warehouse workers scan location barcodes to enter stocktake counts or assign components to locations.

**Architecture:** Dedicated Next.js route group `src/app/app/scan/` with its own layout that opts out of the desktop sidebar. A shared `Scanner` client component wraps `@zxing/browser` for camera + Code 128 decoding. A new Supabase RPC `resolve_location_barcode` looks up any location entity by its 6-char short code.

**Tech Stack:** Next.js 15 App Router, `@zxing/browser` (camera/barcode), Supabase RLS + RPC, Vitest (unit tests), CSS Modules, TypeScript.

---

## File Map

| Path | Action | Purpose |
|---|---|---|
| `supabase/patches/2026-06-05-resolve-location-barcode-rpc.sql` | Create | RPC to look up location by 6-char code |
| `src/app/app/layout.tsx` | Modify | Bypass scan routes (same pattern as print) |
| `src/app/app/scan/layout.tsx` | Create | Full-screen mobile shell, PWA meta tags |
| `src/app/app/scan/scan.module.css` | Create | Mobile layout styles |
| `src/app/app/scan/page.tsx` | Create | Home — two mode cards |
| `src/app/app/scan/manifest.json/route.ts` | Create | PWA web app manifest |
| `src/app/app/scan/_actions/resolve-barcode.ts` | Create | Server action wrapping RPC |
| `src/app/app/scan/_actions/get-location-picker-data.ts` | Create | Hierarchical location data for manual picker |
| `src/app/app/scan/_actions/get-session-lines.ts` | Create | Stocktake lines filtered by location |
| `src/app/app/scan/_actions/get-location-components.ts` | Create | Components assigned to a location |
| `src/app/app/scan/_actions/assign-component.ts` | Create | Set/clear component bin FK |
| `src/app/app/scan/_actions/search-components.ts` | Create | Search components for add sheet |
| `src/app/app/scan/_components/scanner.tsx` | Create | Camera viewfinder + zxing decode loop |
| `src/app/app/scan/_components/location-picker.tsx` | Create | Hierarchical location browser (bottom sheet) |
| `src/app/app/scan/stocktake/page.tsx` | Create | Session picker |
| `src/app/app/scan/stocktake/[sessionId]/page.tsx` | Create | Scan + count (client) |
| `src/app/app/scan/locate/page.tsx` | Create | Scan + assign (client) |

---

## Task 1: DB patch + app shell bypass + scan layout + home

**Goal:** Land everything needed to reach `/app/scan` in a browser: the RPC, mobile shell, and home page.

**Files:**
- Create: `supabase/patches/2026-06-05-resolve-location-barcode-rpc.sql`
- Modify: `src/app/app/layout.tsx`
- Create: `src/app/app/scan/layout.tsx`
- Create: `src/app/app/scan/scan.module.css`
- Create: `src/app/app/scan/page.tsx`
- Create: `src/app/app/scan/manifest.json/route.ts`

**Acceptance Criteria:**
- [ ] `GET /app/scan` renders without sidebar or topbar
- [ ] Page shows two cards: "Count Stock" and "Set Locations"
- [ ] `GET /app/scan/manifest.json` returns valid PWA manifest JSON
- [ ] `resolve_location_barcode` RPC exists in Supabase and returns null for unknown codes

**Verify:** `npx vitest run src/app/app/scan` → no test files yet, exits 0. Visit http://localhost:3000/app/scan in browser.

**Steps:**

- [ ] **Step 1: Create the RPC patch**

Create `supabase/patches/2026-06-05-resolve-location-barcode-rpc.sql`:

```sql
-- Mobile scanner: look up any location entity by its 6-char short code.
-- Short code = last 6 chars of UUID with hyphens stripped, uppercased.
-- Used by resolve_location_barcode server action.

CREATE OR REPLACE FUNCTION resolve_location_barcode(p_code text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH matches AS (
    SELECT
      'bay'                        AS type,
      b.id::text                   AS id,
      b.name,
      a.warehouse_id::text         AS warehouse_id,
      concat_ws(' · ', l.name, sl.name, a.name, b.name) AS path
    FROM   bin_bay b
    JOIN   bin_aisle a ON a.id = b.aisle_id
    JOIN   location l  ON l.id = a.warehouse_id
    LEFT JOIN bin_sub_location sl ON sl.id = a.sub_location_id
    WHERE  upper(right(replace(b.id::text, '-', ''), 6)) = upper(p_code)
      AND  b.tenant_id = (auth.jwt()->>'tenant_id')::uuid

    UNION ALL

    SELECT
      'aisle'                      AS type,
      a.id::text                   AS id,
      a.name,
      a.warehouse_id::text         AS warehouse_id,
      concat_ws(' · ', l.name, sl.name, a.name) AS path
    FROM   bin_aisle a
    JOIN   location l ON l.id = a.warehouse_id
    LEFT JOIN bin_sub_location sl ON sl.id = a.sub_location_id
    WHERE  upper(right(replace(a.id::text, '-', ''), 6)) = upper(p_code)
      AND  a.tenant_id = (auth.jwt()->>'tenant_id')::uuid

    UNION ALL

    SELECT
      'sub_location'               AS type,
      sl.id::text                  AS id,
      sl.name,
      sl.warehouse_id::text        AS warehouse_id,
      concat_ws(' · ', l.name, sl.name) AS path
    FROM   bin_sub_location sl
    JOIN   location l ON l.id = sl.warehouse_id
    WHERE  upper(right(replace(sl.id::text, '-', ''), 6)) = upper(p_code)
      AND  sl.tenant_id = (auth.jwt()->>'tenant_id')::uuid

    UNION ALL

    SELECT
      'warehouse'                  AS type,
      loc.id::text                 AS id,
      loc.name,
      loc.id::text                 AS warehouse_id,
      loc.name                     AS path
    FROM   location loc
    WHERE  upper(right(replace(loc.id::text, '-', ''), 6)) = upper(p_code)
      AND  loc.tenant_id = (auth.jwt()->>'tenant_id')::uuid
  )
  SELECT row_to_json(m)::jsonb FROM matches m LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION resolve_location_barcode(text) TO authenticated;
```

Apply to Supabase: paste into the SQL editor and run.

- [ ] **Step 2: Bypass scan routes in app layout**

In `src/app/app/layout.tsx`, line 19, add `isScanRoute` to the early-return guard:

```tsx
// existing:
const isBillingShell = pathname.startsWith("/app/billing");
const isPrintRoute = pathname.endsWith("/print");
if (isBillingShell || isPrintRoute) return <>{children}</>;

// replace with:
const isBillingShell = pathname.startsWith("/app/billing");
const isPrintRoute = pathname.endsWith("/print");
const isScanRoute = pathname.startsWith("/app/scan");
if (isBillingShell || isPrintRoute || isScanRoute) return <>{children}</>;
```

- [ ] **Step 3: Create scan layout**

Create `src/app/app/scan/layout.tsx`:

```tsx
import type { ReactNode } from "react";
import styles from "./scan.module.css";

export const metadata = {
  title: "Manuva Scanner",
  description: "Warehouse barcode scanner",
  manifest: "/app/scan/manifest.json",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#111827",
};

export default function ScanLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      {children}
    </div>
  );
}
```

- [ ] **Step 4: Create CSS module**

Create `src/app/app/scan/scan.module.css`:

```css
/* ── Shell ──────────────────────────────────────────────────── */
.shell {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--bg-card);
  font-size: var(--fs-base);
  color: var(--ink-strong);
}

/* ── Top bar used by child pages ────────────────────────────── */
.topBar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--stroke-card);
  background: var(--bg-card);
}

.topBarTitle {
  flex: 1;
  font-size: var(--fs-base);
  font-weight: var(--fw-semibold);
  color: var(--ink-strong);
}

.backBtn {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--fs-sm);
  color: var(--ink-muted);
  text-decoration: none;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 0;
}

.backBtn:hover { color: var(--ink-strong); }

/* ── Home page ──────────────────────────────────────────────── */
.homePage {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 24px 16px;
  gap: 16px;
}

.homeHeader {
  text-align: center;
  margin-bottom: 8px;
}

.homeTitle {
  font-size: 1.25rem;
  font-weight: var(--fw-semibold);
  color: var(--ink-strong);
}

.homeSubtitle {
  font-size: var(--fs-sm);
  color: var(--ink-muted);
  margin-top: 2px;
}

.modeCard {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 20px;
  border: 1px solid var(--stroke-card);
  border-radius: var(--radius-xl);
  background: var(--bg-card);
  box-shadow: var(--shadow-card);
  text-decoration: none;
  color: var(--ink-strong);
  transition: box-shadow 0.15s;
}

.modeCard:active {
  box-shadow: none;
  background: var(--surface-1);
}

.modeCardIcon {
  font-size: 2rem;
  line-height: 1;
}

.modeCardTitle {
  font-size: 1.1rem;
  font-weight: var(--fw-semibold);
  color: var(--ink-strong);
}

.modeCardDesc {
  font-size: var(--fs-sm);
  color: var(--ink-muted);
}

.homeFooter {
  text-align: center;
  margin-top: auto;
  padding-top: 24px;
}

.desktopLink {
  font-size: var(--fs-sm);
  color: var(--ink-muted);
  text-decoration: none;
}
.desktopLink:hover { color: var(--ink-strong); }

/* ── Camera / scanner ───────────────────────────────────────── */
.scannerWrap {
  position: relative;
  width: 100%;
  background: #111827;
  aspect-ratio: 4/3;
  overflow: hidden;
}

.scanVideo {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.scanOverlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  pointer-events: none;
}

.scanTarget {
  width: 200px;
  height: 80px;
  border: 2px solid var(--brand-1);
  border-radius: 6px;
  box-shadow: 0 0 0 4000px rgba(0,0,0,0.4);
}

.scanLabel {
  font-size: var(--fs-sm);
  color: rgba(255,255,255,0.85);
  text-align: center;
  padding: 4px 12px;
  background: rgba(0,0,0,0.5);
  border-radius: 999px;
}

.torchBtn {
  position: absolute;
  top: 10px;
  right: 10px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: none;
  background: rgba(0,0,0,0.5);
  color: white;
  font-size: 1.2rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.permissionDenied {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 32px 24px;
  text-align: center;
  color: var(--ink-muted);
  font-size: var(--fs-sm);
  background: var(--surface-1);
  border-radius: var(--radius-xl);
  margin: 16px;
}

/* ── Content area below scanner ─────────────────────────────── */
.scanContent {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.locationBadge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--brand-dim);
  border-radius: var(--radius-xl);
  font-size: var(--fs-sm);
  color: var(--brand-1);
  font-weight: var(--fw-semibold);
}

.manualBtn {
  font-size: var(--fs-sm);
  color: var(--brand-1);
  background: none;
  border: none;
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
  text-align: center;
  width: 100%;
}

/* ── Line rows (stocktake count entry) ──────────────────────── */
.lineList {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.lineRow {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--surface-1);
  border-radius: var(--radius-lg);
}

.lineName {
  flex: 1;
  font-size: var(--fs-sm);
  color: var(--ink-strong);
}

.lineExpected {
  font-size: var(--fs-xs);
  color: var(--ink-muted);
  min-width: 40px;
  text-align: right;
}

.lineInput {
  width: 64px;
  padding: 6px 8px;
  border: 1px solid var(--stroke-strong);
  border-radius: var(--radius-lg);
  font-size: var(--fs-sm);
  text-align: center;
  background: var(--bg-card);
  color: var(--ink-strong);
}

.lineInput:focus {
  outline: 2px solid var(--brand-1);
  outline-offset: 1px;
}

.lineSaved {
  border-color: var(--ok);
}

/* ── Save button ────────────────────────────────────────────── */
.saveBtn {
  composes: primary from "../_ui/buttons.module.css";
  width: 100%;
  justify-content: center;
}

/* ── Session list ───────────────────────────────────────────── */
.sessionList {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
}

.sessionCard {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;
  border: 1px solid var(--stroke-card);
  border-radius: var(--radius-xl);
  background: var(--bg-card);
  box-shadow: var(--shadow-card);
  text-decoration: none;
  color: var(--ink-strong);
}

.sessionRef {
  font-weight: var(--fw-semibold);
  font-size: var(--fs-base);
}

.sessionMeta {
  font-size: var(--fs-sm);
  color: var(--ink-muted);
}

.sessionProgress {
  font-size: var(--fs-xs);
  color: var(--ok);
  font-weight: var(--fw-semibold);
  text-transform: uppercase;
  letter-spacing: var(--ls-caps);
}

/* ── Component rows (location assignment) ───────────────────── */
.compRow {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--surface-1);
  border-radius: var(--radius-lg);
}

.compName {
  flex: 1;
  font-size: var(--fs-sm);
  color: var(--ink-strong);
}

.compSku {
  font-size: var(--fs-xs);
  color: var(--ink-muted);
}

.removeBtn {
  background: none;
  border: none;
  color: var(--danger);
  font-size: 1rem;
  cursor: pointer;
  padding: 4px;
  line-height: 1;
}

.addCompBtn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 12px;
  border: 1px dashed var(--stroke-strong);
  border-radius: var(--radius-xl);
  background: none;
  color: var(--ink-muted);
  font-size: var(--fs-sm);
  cursor: pointer;
  width: 100%;
}

.addCompBtn:hover { background: var(--surface-hover); }

/* ── Bottom sheet (component search) ────────────────────────── */
.sheetBackdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.4);
  z-index: 100;
  display: flex;
  align-items: flex-end;
}

.sheet {
  width: 100%;
  max-height: 70dvh;
  background: var(--bg-card);
  border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  display: flex;
  flex-direction: column;
  padding: 16px;
  gap: 12px;
  overflow: hidden;
}

.sheetTitle {
  font-weight: var(--fw-semibold);
  font-size: var(--fs-base);
  color: var(--ink-strong);
}

.sheetSearch {
  padding: 10px 14px;
  border: 1px solid var(--stroke-strong);
  border-radius: var(--radius-xl);
  font-size: var(--fs-base);
  background: var(--bg-card);
  color: var(--ink-strong);
  width: 100%;
  box-sizing: border-box;
}

.sheetSearch:focus {
  outline: 2px solid var(--brand-1);
  outline-offset: 1px;
}

.sheetResults {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sheetRow {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--surface-1);
  border-radius: var(--radius-lg);
}

.sheetRowName {
  flex: 1;
  font-size: var(--fs-sm);
  color: var(--ink-strong);
}

.addBtn {
  font-size: var(--fs-sm);
  font-weight: var(--fw-semibold);
  color: var(--brand-1);
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 8px;
}

/* ── Location picker (bottom sheet) ─────────────────────────── */
.pickerRow {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: var(--surface-1);
  border-radius: var(--radius-lg);
  cursor: pointer;
  font-size: var(--fs-sm);
  color: var(--ink-strong);
  border: none;
  width: 100%;
  text-align: left;
}

.pickerRow:hover { background: var(--surface-hover); }

.pickerRowName { flex: 1; }

.pickerBack {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: var(--fs-sm);
  color: var(--ink-muted);
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 0;
  margin-bottom: 4px;
}

/* ── Empty / status states ──────────────────────────────────── */
.emptyState {
  text-align: center;
  padding: 32px 16px;
  color: var(--ink-muted);
  font-size: var(--fs-sm);
}

.toastWrap {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 200;
  pointer-events: none;
}

.toast {
  background: var(--ink-strong);
  color: white;
  padding: 10px 16px;
  border-radius: 999px;
  font-size: var(--fs-sm);
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}

.progressBadge {
  font-size: var(--fs-xs);
  font-weight: var(--fw-semibold);
  color: var(--ink-muted);
  text-align: right;
  text-transform: uppercase;
  letter-spacing: var(--ls-caps);
}
```

- [ ] **Step 5: Create home page**

Create `src/app/app/scan/page.tsx`:

```tsx
import Link from "next/link";
import { getServerTenantContext } from "@/lib/tenant/context";
import styles from "./scan.module.css";

export default async function ScanHomePage() {
  const ctx = await getServerTenantContext();
  const tenantName = ctx?.tenantName ?? "Manuva";

  return (
    <main className={styles.homePage}>
      <div className={styles.homeHeader}>
        <div className={styles.homeTitle}>{tenantName}</div>
        <div className={styles.homeSubtitle}>Warehouse Scanner</div>
      </div>

      <Link href="/app/scan/stocktake" className={styles.modeCard}>
        <div className={styles.modeCardIcon}>📦</div>
        <div className={styles.modeCardTitle}>Count Stock</div>
        <div className={styles.modeCardDesc}>
          Scan a location barcode and enter counts into an active stocktake session
        </div>
      </Link>

      <Link href="/app/scan/locate" className={styles.modeCard}>
        <div className={styles.modeCardIcon}>📍</div>
        <div className={styles.modeCardTitle}>Set Locations</div>
        <div className={styles.modeCardDesc}>
          Scan a location and manage which components live there
        </div>
      </Link>

      <div className={styles.homeFooter}>
        <Link href="/app" className={styles.desktopLink}>
          ↗ Open desktop app
        </Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 6: Create manifest route**

Create `src/app/app/scan/manifest.json/route.ts`:

```ts
import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    name: "Manuva Scanner",
    short_name: "Scanner",
    start_url: "/app/scan",
    display: "standalone",
    background_color: "#111827",
    theme_color: "#1e40af",
    icons: [
      { src: "/manuva.svg", sizes: "any", type: "image/svg+xml" },
    ],
  });
}
```

- [ ] **Step 7: Check `getServerTenantContext` exports `tenantName`**

Run:
```
grep -n "tenantName" src/lib/tenant/context.ts
```

If `tenantName` is not in the returned object, replace `ctx?.tenantName` with a fallback:
```tsx
// In scan/page.tsx, replace:
const tenantName = ctx?.tenantName ?? "Manuva";
// with:
const tenantName = "Manuva"; // simplified until we know the exact field
```

(The tenant name is cosmetic — not a blocker.)

- [ ] **Step 8: Commit**

```bash
git add supabase/patches/2026-06-05-resolve-location-barcode-rpc.sql \
        src/app/app/layout.tsx \
        src/app/app/scan/
git commit -m "feat(scan): mobile shell, home page, PWA manifest, barcode RPC"
```

---

## Task 2: `resolveBarcode` server action + tests

**Goal:** A typed server action that calls the RPC and returns a `ResolvedLocation` or `null`.

**Files:**
- Create: `src/app/app/scan/_actions/resolve-barcode.ts`
- Create: `src/app/app/scan/_actions/resolve-barcode.test.ts`

**Acceptance Criteria:**
- [ ] Returns `{ type, id, name, path, warehouseId }` for a known code
- [ ] Returns `null` for an unknown code
- [ ] Input is uppercased before passing to RPC
- [ ] Unit tests pass with mocked Supabase

**Verify:** `npx vitest run src/app/app/scan/_actions/resolve-barcode.test.ts` → all tests pass

**Steps:**

- [ ] **Step 1: Write failing tests**

Create `src/app/app/scan/_actions/resolve-barcode.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the tenant context module
vi.mock("@/lib/tenant/context", () => ({
  getServerTenantContext: vi.fn(),
}));

import { getServerTenantContext } from "@/lib/tenant/context";
import { resolveBarcode } from "./resolve-barcode";

function makeSupabase(rpcData: unknown) {
  return {
    rpc: vi.fn().mockResolvedValue({ data: rpcData, error: null }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveBarcode", () => {
  it("returns null when tenant context is missing", async () => {
    vi.mocked(getServerTenantContext).mockResolvedValue(null);
    const result = await resolveBarcode("ABC123");
    expect(result).toBeNull();
  });

  it("returns null when RPC returns null", async () => {
    vi.mocked(getServerTenantContext).mockResolvedValue({
      supabase: makeSupabase(null) as any,
      tenantId: "t1",
    } as any);
    const result = await resolveBarcode("ABC123");
    expect(result).toBeNull();
  });

  it("returns parsed location for a known bay code", async () => {
    const rpcResult = {
      type: "bay",
      id: "bay-uuid",
      name: "Bay 3",
      path: "Main · Aisle 1 · Bay 3",
      warehouse_id: "wh-uuid",
    };
    vi.mocked(getServerTenantContext).mockResolvedValue({
      supabase: makeSupabase(rpcResult) as any,
      tenantId: "t1",
    } as any);
    const result = await resolveBarcode("abc123"); // lowercase input
    expect(result).toEqual({
      type: "bay",
      id: "bay-uuid",
      name: "Bay 3",
      path: "Main · Aisle 1 · Bay 3",
      warehouseId: "wh-uuid",
    });
  });

  it("passes uppercased code to RPC", async () => {
    const supabase = makeSupabase(null);
    vi.mocked(getServerTenantContext).mockResolvedValue({
      supabase: supabase as any,
      tenantId: "t1",
    } as any);
    await resolveBarcode("abc123");
    expect(supabase.rpc).toHaveBeenCalledWith("resolve_location_barcode", { p_code: "ABC123" });
  });
});
```

Run: `npx vitest run src/app/app/scan/_actions/resolve-barcode.test.ts`
Expected: FAIL — "Cannot find module './resolve-barcode'"

- [ ] **Step 2: Implement the action**

Create `src/app/app/scan/_actions/resolve-barcode.ts`:

```ts
"use server";

import { getServerTenantContext } from "@/lib/tenant/context";

export type ResolvedLocation = {
  type: "warehouse" | "sub_location" | "aisle" | "bay";
  id: string;
  name: string;
  path: string;
  warehouseId: string;
};

export async function resolveBarcode(code: string): Promise<ResolvedLocation | null> {
  const context = await getServerTenantContext();
  if (!context) return null;

  const { supabase } = context;
  const { data, error } = await supabase.rpc("resolve_location_barcode", {
    p_code: code.toUpperCase(),
  });

  if (error || !data) return null;

  return {
    type: data.type as ResolvedLocation["type"],
    id: data.id as string,
    name: data.name as string,
    path: data.path as string,
    warehouseId: data.warehouse_id as string,
  };
}
```

- [ ] **Step 3: Run tests — expect pass**

```bash
npx vitest run src/app/app/scan/_actions/resolve-barcode.test.ts
```
Expected: 4 tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/app/scan/_actions/
git commit -m "feat(scan): resolveBarcode server action + tests"
```

---

## Task 3: Location picker data action + `LocationPicker` component

**Goal:** Server action to load warehouse hierarchy level by level; client component rendering a bottom-sheet drill-down picker.

**Files:**
- Create: `src/app/app/scan/_actions/get-location-picker-data.ts`
- Create: `src/app/app/scan/_components/location-picker.tsx`

**Acceptance Criteria:**
- [ ] `getWarehouses()` returns all tenant warehouses
- [ ] `getAislesForWarehouse(warehouseId)` returns aisles with sub-location tag
- [ ] `getBaysForAisle(aisleId)` returns bays for an aisle
- [ ] `LocationPicker` renders warehouses on open, drills into aisles on tap, drills into bays on tap
- [ ] Calls `onSelect` with a `ResolvedLocation` when user taps a level
- [ ] "Choose manually" back button works at every level

**Verify:** `npx vitest run src/app/app/scan/_actions/get-location-picker-data.test.ts` → passes (write tests in step 1)

**Steps:**

- [ ] **Step 1: Write failing tests**

Create `src/app/app/scan/_actions/get-location-picker-data.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/tenant/context", () => ({
  getServerTenantContext: vi.fn(),
}));

import { getServerTenantContext } from "@/lib/tenant/context";
import { getWarehouses, getAislesForWarehouse, getBaysForAisle } from "./get-location-picker-data";

function makeSupabase(data: unknown) {
  return {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockResolvedValue({ data, error: null }),
  };
}

beforeEach(() => vi.clearAllMocks());

describe("getWarehouses", () => {
  it("returns empty array when no context", async () => {
    vi.mocked(getServerTenantContext).mockResolvedValue(null);
    expect(await getWarehouses()).toEqual([]);
  });

  it("returns warehouses from DB", async () => {
    const rows = [{ id: "wh1", name: "Main Warehouse" }];
    vi.mocked(getServerTenantContext).mockResolvedValue({
      supabase: makeSupabase(rows) as any,
      tenantId: "t1",
    } as any);
    expect(await getWarehouses()).toEqual(rows);
  });
});

describe("getAislesForWarehouse", () => {
  it("returns aisles with optional sub_location name", async () => {
    const rows = [
      { id: "a1", name: "Aisle 1", sub_location: { name: "Mezzanine" } },
      { id: "a2", name: "Aisle 2", sub_location: null },
    ];
    vi.mocked(getServerTenantContext).mockResolvedValue({
      supabase: makeSupabase(rows) as any,
      tenantId: "t1",
    } as any);
    const result = await getAislesForWarehouse("wh1");
    expect(result[0].subLocationName).toBe("Mezzanine");
    expect(result[1].subLocationName).toBeNull();
  });
});

describe("getBaysForAisle", () => {
  it("returns bays for an aisle", async () => {
    const rows = [{ id: "b1", name: "Bay 1" }];
    vi.mocked(getServerTenantContext).mockResolvedValue({
      supabase: makeSupabase(rows) as any,
      tenantId: "t1",
    } as any);
    expect(await getBaysForAisle("a1")).toEqual([{ id: "b1", name: "Bay 1" }]);
  });
});
```

Run: `npx vitest run src/app/app/scan/_actions/get-location-picker-data.test.ts`
Expected: FAIL

- [ ] **Step 2: Implement the action**

Create `src/app/app/scan/_actions/get-location-picker-data.ts`:

```ts
"use server";

import { getServerTenantContext } from "@/lib/tenant/context";

export type WarehouseItem = { id: string; name: string };
export type AisleItem = { id: string; name: string; subLocationName: string | null; warehouseId: string };
export type BayItem = { id: string; name: string };

export async function getWarehouses(): Promise<WarehouseItem[]> {
  const context = await getServerTenantContext();
  if (!context) return [];
  const { supabase, tenantId } = context;
  const { data } = await supabase
    .from("location")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .order("name");
  return (data ?? []) as WarehouseItem[];
}

export async function getAislesForWarehouse(warehouseId: string): Promise<AisleItem[]> {
  const context = await getServerTenantContext();
  if (!context) return [];
  const { supabase, tenantId } = context;
  const { data } = await supabase
    .from("bin_aisle")
    .select("id, name, warehouse_id, sub_location:sub_location_id(name)")
    .eq("tenant_id", tenantId)
    .eq("warehouse_id", warehouseId)
    .order("name");
  return (data ?? []).map((row: any) => ({
    id: row.id as string,
    name: row.name as string,
    warehouseId: row.warehouse_id as string,
    subLocationName: (Array.isArray(row.sub_location) ? row.sub_location[0] : row.sub_location)?.name ?? null,
  }));
}

export async function getBaysForAisle(aisleId: string): Promise<BayItem[]> {
  const context = await getServerTenantContext();
  if (!context) return [];
  const { supabase, tenantId } = context;
  const { data } = await supabase
    .from("bin_bay")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .eq("aisle_id", aisleId)
    .order("name");
  return (data ?? []) as BayItem[];
}
```

- [ ] **Step 3: Run tests — expect pass**

```bash
npx vitest run src/app/app/scan/_actions/get-location-picker-data.test.ts
```
Expected: all pass.

- [ ] **Step 4: Implement `LocationPicker` component**

Create `src/app/app/scan/_components/location-picker.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import {
  getWarehouses,
  getAislesForWarehouse,
  getBaysForAisle,
  type WarehouseItem,
  type AisleItem,
  type BayItem,
} from "../_actions/get-location-picker-data";
import type { ResolvedLocation } from "../_actions/resolve-barcode";
import styles from "../scan.module.css";

type Level = "warehouse" | "aisle" | "bay";

interface Props {
  onSelect: (loc: ResolvedLocation) => void;
  onCancel: () => void;
}

export function LocationPicker({ onSelect, onCancel }: Props) {
  const [level, setLevel] = useState<Level>("warehouse");
  const [warehouses, setWarehouses] = useState<WarehouseItem[]>([]);
  const [aisles, setAisles] = useState<AisleItem[]>([]);
  const [bays, setBays] = useState<BayItem[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState<WarehouseItem | null>(null);
  const [selectedAisle, setSelectedAisle] = useState<AisleItem | null>(null);
  const [isPending, startTransition] = useTransition();

  // Load warehouses on mount
  useState(() => {
    startTransition(async () => {
      const data = await getWarehouses();
      setWarehouses(data);
    });
  });

  function handleSelectWarehouse(wh: WarehouseItem) {
    onSelect({
      type: "warehouse",
      id: wh.id,
      name: wh.name,
      path: wh.name,
      warehouseId: wh.id,
    });
  }

  function handleDrillAisle(wh: WarehouseItem) {
    setSelectedWarehouse(wh);
    startTransition(async () => {
      const data = await getAislesForWarehouse(wh.id);
      setAisles(data);
      setLevel("aisle");
    });
  }

  function handleSelectAisle(a: AisleItem) {
    onSelect({
      type: "aisle",
      id: a.id,
      name: a.name,
      path: [selectedWarehouse?.name, a.subLocationName, a.name].filter(Boolean).join(" · "),
      warehouseId: a.warehouseId,
    });
  }

  function handleDrillBay(a: AisleItem) {
    setSelectedAisle(a);
    startTransition(async () => {
      const data = await getBaysForAisle(a.id);
      setBays(data);
      setLevel("bay");
    });
  }

  function handleSelectBay(b: BayItem) {
    if (!selectedAisle) return;
    onSelect({
      type: "bay",
      id: b.id,
      name: b.name,
      path: [selectedWarehouse?.name, selectedAisle.subLocationName, selectedAisle.name, b.name]
        .filter(Boolean)
        .join(" · "),
      warehouseId: selectedAisle.warehouseId,
    });
  }

  function goBack() {
    if (level === "bay") { setLevel("aisle"); setSelectedAisle(null); }
    else if (level === "aisle") { setLevel("warehouse"); setSelectedWarehouse(null); }
    else onCancel();
  }

  const title =
    level === "warehouse" ? "Select warehouse" :
    level === "aisle" ? `${selectedWarehouse?.name} — select aisle` :
    `${selectedAisle?.name} — select bay`;

  return (
    <div className={styles.sheetBackdrop} onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className={styles.sheet} role="dialog" aria-modal aria-label="Choose a location">
        <button className={styles.pickerBack} onClick={goBack}>
          ← {level === "warehouse" ? "Cancel" : "Back"}
        </button>
        <div className={styles.sheetTitle}>{title}</div>
        {isPending && <div className={styles.emptyState}>Loading…</div>}

        {!isPending && level === "warehouse" && (
          <div className={styles.sheetResults}>
            {warehouses.map((wh) => (
              <div key={wh.id} style={{ display: "flex", gap: 6 }}>
                <button
                  className={styles.pickerRow}
                  style={{ flex: 1 }}
                  onClick={() => handleSelectWarehouse(wh)}
                >
                  <span className={styles.pickerRowName}>{wh.name}</span>
                </button>
                <button
                  className={styles.pickerRow}
                  style={{ flex: "none", padding: "12px 8px", fontSize: "var(--fs-xs)", color: "var(--ink-muted)" }}
                  onClick={() => handleDrillAisle(wh)}
                  aria-label={`Browse aisles in ${wh.name}`}
                >
                  Aisles →
                </button>
              </div>
            ))}
            {warehouses.length === 0 && (
              <div className={styles.emptyState}>No warehouses found. Add them in the desktop app first.</div>
            )}
          </div>
        )}

        {!isPending && level === "aisle" && (
          <div className={styles.sheetResults}>
            {aisles.map((a) => (
              <div key={a.id} style={{ display: "flex", gap: 6 }}>
                <button
                  className={styles.pickerRow}
                  style={{ flex: 1 }}
                  onClick={() => handleSelectAisle(a)}
                >
                  <span className={styles.pickerRowName}>
                    {a.name}
                    {a.subLocationName && (
                      <span style={{ color: "var(--ink-muted)", marginLeft: 6 }}>· {a.subLocationName}</span>
                    )}
                  </span>
                </button>
                <button
                  className={styles.pickerRow}
                  style={{ flex: "none", padding: "12px 8px", fontSize: "var(--fs-xs)", color: "var(--ink-muted)" }}
                  onClick={() => handleDrillBay(a)}
                  aria-label={`Browse bays in ${a.name}`}
                >
                  Bays →
                </button>
              </div>
            ))}
            {aisles.length === 0 && (
              <div className={styles.emptyState}>No aisles in this warehouse yet.</div>
            )}
          </div>
        )}

        {!isPending && level === "bay" && (
          <div className={styles.sheetResults}>
            {bays.map((b) => (
              <button
                key={b.id}
                className={styles.pickerRow}
                onClick={() => handleSelectBay(b)}
              >
                <span className={styles.pickerRowName}>{b.name}</span>
              </button>
            ))}
            {bays.length === 0 && (
              <div className={styles.emptyState}>No bays in this aisle yet.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/app/scan/_actions/ src/app/app/scan/_components/
git commit -m "feat(scan): location picker action + component"
```

---

## Task 4: `Scanner` client component

**Goal:** A reusable camera viewfinder that decodes Code 128 barcodes and fires `onScan` with the 6-char short code.

**Files:**
- Modify: `package.json` (add `@zxing/browser`)
- Create: `src/app/app/scan/_components/scanner.tsx`

**Acceptance Criteria:**
- [ ] `npm install` succeeds with `@zxing/browser`
- [ ] Component renders a `<video>` element with `playsInline muted`
- [ ] Shows permission-denied fallback when camera is unavailable
- [ ] Fires `onScan` with the 6-char short code (last 6 chars of decoded text, uppercased)
- [ ] Pauses decode loop when `active={false}`
- [ ] Torch toggle button renders (gracefully fails if device doesn't support torch)

**Verify:** Load `/app/scan/stocktake` in mobile browser — camera activates, aims at a label, decodes.

**Steps:**

- [ ] **Step 1: Install zxing**

```bash
npm install @zxing/browser
```

Expected: `@zxing/browser` added to `package.json` dependencies, no peer dependency errors.

- [ ] **Step 2: Create `Scanner` component**

Create `src/app/app/scan/_components/scanner.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import styles from "../scan.module.css";

interface ScannerProps {
  onScan: (code: string) => void;
  active: boolean;
  label?: string;
}

export function Scanner({ onScan, active, label = "Scan a location barcode" }: ScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const lastCodeRef = useRef<string | null>(null);
  const lastTimeRef = useRef<number>(0);
  const [permission, setPermission] = useState<"pending" | "granted" | "denied">("pending");
  const [torchOn, setTorchOn] = useState(false);
  const onScanRef = useRef(onScan);
  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  // Start camera stream on mount
  useEffect(() => {
    let stopped = false;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { exact: "environment" } },
        });
        if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setPermission("granted");
      } catch {
        // Fall back to any camera (works on desktops without rear camera)
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          if (stopped) { stream.getTracks().forEach(t => t.stop()); return; }
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
          }
          setPermission("granted");
        } catch {
          setPermission("denied");
        }
      }
    }

    start();
    return () => {
      stopped = true;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    };
  }, []);

  // Decode loop — runs only when active and camera is granted
  useEffect(() => {
    if (!active || permission !== "granted" || !videoRef.current || !streamRef.current) return;

    let stopped = false;

    async function startDecoding() {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      if (stopped || !videoRef.current || !streamRef.current) return;

      const reader = new BrowserMultiFormatReader();
      try {
        const controls = await reader.decodeFromStream(
          streamRef.current,
          videoRef.current,
          (result) => {
            if (!result) return;
            // The barcode encodes the 6-char short code directly
            const code = result.getText().replace(/-/g, "").slice(-6).toUpperCase();
            const now = Date.now();
            // Debounce: same code within 1.5s is ignored
            if (code === lastCodeRef.current && now - lastTimeRef.current < 1500) return;
            lastCodeRef.current = code;
            lastTimeRef.current = now;
            onScanRef.current(code);
          }
        );
        controlsRef.current = controls;
      } catch {
        // Stream ended or not ready — ignore
      }
    }

    startDecoding();
    return () => {
      stopped = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [active, permission]);

  const toggleTorch = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      // Torch not supported on this device — silently ignore
    }
  }, [torchOn]);

  if (permission === "denied") {
    return (
      <div className={styles.permissionDenied}>
        <p>📷 Camera access required</p>
        <p>
          Open your browser settings, allow camera access for this site, then reload the page.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.scannerWrap}>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video ref={videoRef} className={styles.scanVideo} playsInline muted />
      <div className={styles.scanOverlay} aria-hidden>
        <div className={styles.scanTarget} />
        <span className={styles.scanLabel}>{label}</span>
      </div>
      <button
        type="button"
        className={styles.torchBtn}
        onClick={toggleTorch}
        aria-label={torchOn ? "Turn off flashlight" : "Turn on flashlight"}
      >
        {torchOn ? "🔦" : "💡"}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json src/app/app/scan/_components/scanner.tsx
git commit -m "feat(scan): Scanner camera component with zxing decode"
```

---

## Task 5: `getSessionLines` action + stocktake session picker

**Goal:** Server action to fetch stocktake lines for a given location; session picker page listing open sessions.

**Files:**
- Create: `src/app/app/scan/_actions/get-session-lines.ts`
- Create: `src/app/app/scan/_actions/get-session-lines.test.ts`
- Create: `src/app/app/scan/stocktake/page.tsx`

**Acceptance Criteria:**
- [ ] `getSessionLines` returns lines with `id`, `componentId`, `name`, `sku`, `expectedOnHand`, `counted` for each component at the location
- [ ] When `session.blind_count = true`, `expectedOnHand` is returned as `null`
- [ ] Returns `[]` when no components are assigned to the location
- [ ] Session picker page shows open/counting sessions with reference, location name, and count progress

**Verify:** `npx vitest run src/app/app/scan/_actions/get-session-lines.test.ts` → passes

**Steps:**

- [ ] **Step 1: Write failing tests**

Create `src/app/app/scan/_actions/get-session-lines.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/tenant/context", () => ({
  getServerTenantContext: vi.fn(),
}));

import { getServerTenantContext } from "@/lib/tenant/context";
import { getSessionLines } from "./get-session-lines";
import type { ResolvedLocation } from "./resolve-barcode";

const BAY_LOC: ResolvedLocation = {
  type: "bay", id: "bay1", name: "Bay 1", path: "Wh · A1 · Bay 1", warehouseId: "wh1",
};

function makeSupabasePipeline(responses: Array<{ data: unknown; error: null }>) {
  let callIndex = 0;
  const chain: any = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockImplementation(() => Promise.resolve(responses[callIndex++])),
  };
  // Make the terminal call (no method) return the next response
  chain.eq.mockImplementation(() => {
    return {
      ...chain,
      // When used as a promise (awaited without terminal method), resolve with next response
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(responses[callIndex++]).then(resolve),
    };
  });
  return chain;
}

// Simpler mock: two separate supabase calls
function makeCtx(sessionData: unknown, componentIds: string[], lineData: unknown) {
  let callCount = 0;
  const supabase = {
    from: vi.fn((table: string) => {
      callCount++;
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: sessionData, error: null }),
        // Awaitable - returns component or line data depending on call order
        then: (resolve: (v: unknown) => unknown) => {
          if (callCount === 1) return Promise.resolve({ data: sessionData, error: null }).then(resolve);
          if (callCount === 2) return Promise.resolve({ data: componentIds.map(id => ({ id })), error: null }).then(resolve);
          return Promise.resolve({ data: lineData, error: null }).then(resolve);
        },
      };
    }),
  };
  return { supabase, tenantId: "t1" };
}

beforeEach(() => vi.clearAllMocks());

describe("getSessionLines", () => {
  it("returns empty array when tenant context is missing", async () => {
    vi.mocked(getServerTenantContext).mockResolvedValue(null);
    expect(await getSessionLines("s1", BAY_LOC)).toEqual([]);
  });
});
```

Run: `npx vitest run src/app/app/scan/_actions/get-session-lines.test.ts`
Expected: FAIL — "Cannot find module './get-session-lines'"

- [ ] **Step 2: Implement the action**

Create `src/app/app/scan/_actions/get-session-lines.ts`:

```ts
"use server";

import { getServerTenantContext } from "@/lib/tenant/context";
import type { ResolvedLocation } from "./resolve-barcode";

export type SessionLine = {
  id: string;
  componentId: string;
  name: string;
  sku: string | null;
  expectedOnHand: number | null; // null when session has blind_count = true
  counted: number | null;
};

export async function getSessionLines(
  sessionId: string,
  location: ResolvedLocation
): Promise<SessionLine[]> {
  const context = await getServerTenantContext();
  if (!context) return [];
  const { supabase, tenantId } = context;

  // Fetch session to check blind_count flag
  const { data: session } = await supabase
    .from("stocktake_session")
    .select("id, blind_count")
    .eq("id", sessionId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!session) return [];
  const isBlind = (session as { blind_count: boolean }).blind_count;

  // Find component IDs at this location
  let compQuery = supabase
    .from("component")
    .select("id")
    .eq("tenant_id", tenantId);

  if (location.type === "bay") {
    compQuery = compQuery.eq("bin_bay_id", location.id);
  } else if (location.type === "aisle") {
    compQuery = compQuery.eq("bin_aisle_id", location.id);
  } else if (location.type === "sub_location") {
    compQuery = compQuery.eq("bin_sub_location_id", location.id);
  } else {
    // warehouse: components with this location_id and no bin set
    compQuery = compQuery
      .eq("location_id", location.warehouseId)
      .is("bin_bay_id", null)
      .is("bin_aisle_id", null)
      .is("bin_sub_location_id", null);
  }

  const { data: components } = await compQuery;
  const componentIds = (components ?? []).map((c: { id: string }) => c.id);
  if (componentIds.length === 0) return [];

  // Fetch stocktake lines for those components in this session
  const { data: lines } = await supabase
    .from("stocktake_line")
    .select("id, component_id, expected_on_hand, counted, component:component_id(id, name, sku)")
    .eq("session_id", sessionId)
    .eq("tenant_id", tenantId)
    .in("component_id", componentIds);

  return (lines ?? []).map((l: any) => {
    const comp = Array.isArray(l.component) ? l.component[0] : l.component;
    return {
      id: l.id as string,
      componentId: l.component_id as string,
      name: (comp?.name ?? "Unknown") as string,
      sku: (comp?.sku ?? null) as string | null,
      expectedOnHand: isBlind ? null : (l.expected_on_hand as number),
      counted: l.counted as number | null,
    };
  });
}
```

- [ ] **Step 3: Run tests — expect pass**

```bash
npx vitest run src/app/app/scan/_actions/get-session-lines.test.ts
```

Expected: 1 test passes (the context-missing case).

- [ ] **Step 4: Create session picker page**

Create `src/app/app/scan/stocktake/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import styles from "../scan.module.css";

export default async function ScanSessionPickerPage() {
  const context = await getServerTenantContext();
  if (!context) return notFound();
  const { supabase, tenantId } = context;

  const { data: sessions } = await supabase
    .from("stocktake_session")
    .select(`
      id,
      reference_number,
      status,
      blind_count,
      location:location_id(name),
      counted_lines:stocktake_line(counted),
      total_lines:stocktake_line(id)
    `)
    .eq("tenant_id", tenantId)
    .in("status", ["open", "counting"])
    .order("created_at", { ascending: false });

  // Compute progress counts for each session
  const enriched = (sessions ?? []).map((s: any) => {
    const location = Array.isArray(s.location) ? s.location[0] : s.location;
    const total: number = Array.isArray(s.total_lines) ? s.total_lines.length : 0;
    const counted: number = Array.isArray(s.counted_lines)
      ? s.counted_lines.filter((l: any) => l.counted !== null).length
      : 0;
    return {
      id: s.id as string,
      reference: (s.reference_number ?? "—") as string,
      status: s.status as string,
      blindCount: s.blind_count as boolean,
      locationName: (location?.name ?? "—") as string,
      total,
      counted,
    };
  });

  return (
    <main>
      <div className={styles.topBar}>
        <Link href="/app/scan" className={styles.backBtn}>← Back</Link>
        <span className={styles.topBarTitle}>Count Stock</span>
      </div>

      {enriched.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No active stocktake sessions.</p>
          <p>Create one from the desktop app first.</p>
        </div>
      ) : (
        <div className={styles.sessionList}>
          {enriched.map((s) => (
            <Link key={s.id} href={`/app/scan/stocktake/${s.id}`} className={styles.sessionCard}>
              <span className={styles.sessionRef}>{s.reference}</span>
              <span className={styles.sessionMeta}>{s.locationName}{s.blindCount ? " · Blind count" : ""}</span>
              <span className={styles.sessionProgress}>
                {s.counted}/{s.total} counted
              </span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/app/app/scan/_actions/get-session-lines* src/app/app/scan/stocktake/
git commit -m "feat(scan): session picker + getSessionLines action"
```

---

## Task 6: Stocktake scan + count page

**Goal:** The full scan-and-count UI: camera → decode → fetch lines → enter quantities → save.

**Files:**
- Create: `src/app/app/scan/stocktake/[sessionId]/page.tsx`

**Acceptance Criteria:**
- [ ] Camera activates immediately on page load
- [ ] Scanning a known barcode shows the location name and component lines below the viewfinder
- [ ] Scanning an unknown barcode shows a toast and a "Choose manually →" button
- [ ] Each line has a numeric input; entering a value saves via `saveLineCountClient`
- [ ] "Save & scan next →" button saves all dirty inputs and resets camera to ready state
- [ ] Progress badge shows "X / Y counted" updated after each save
- [ ] Blind count sessions hide the "expected" column

**Verify:** Navigate to `/app/scan/stocktake/[a real session id]` on a mobile browser, scan a label.

**Steps:**

- [ ] **Step 1: Create the client page**

Create `src/app/app/scan/stocktake/[sessionId]/page.tsx`:

```tsx
"use client";

import { use, useState, useCallback, useTransition, useRef } from "react";
import Link from "next/link";
import { Scanner } from "../../_components/scanner";
import { LocationPicker } from "../../_components/location-picker";
import { resolveBarcode, type ResolvedLocation } from "../../_actions/resolve-barcode";
import { getSessionLines, type SessionLine } from "../../_actions/get-session-lines";
import { saveLineCountClient } from "@/app/app/stocktake/[sessionId]/actions";
import styles from "../../scan.module.css";

interface Props {
  params: Promise<{ sessionId: string }>;
}

type ScanState = "scanning" | "showing" | "saving";

export default function StocktakeScanPage({ params }: Props) {
  const { sessionId } = use(params);
  const [scanState, setScanState] = useState<ScanState>("scanning");
  const [location, setLocation] = useState<ResolvedLocation | null>(null);
  const [lines, setLines] = useState<SessionLine[]>([]);
  const [counts, setCounts] = useState<Map<string, string>>(new Map());
  const [toast, setToast] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [totalCounted, setTotalCounted] = useState(0);
  const [isPending, startTransition] = useTransition();
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }

  const handleScan = useCallback((code: string) => {
    if (scanState !== "scanning") return;
    startTransition(async () => {
      const resolved = await resolveBarcode(code);
      if (!resolved) {
        showToast("Location not found — check the label");
        return;
      }
      const sessionLines = await getSessionLines(sessionId, resolved);
      setLocation(resolved);
      setLines(sessionLines);
      setCounts(new Map());
      setScanState("showing");
    });
  }, [scanState, sessionId]);

  function handlePickerSelect(loc: ResolvedLocation) {
    setShowPicker(false);
    startTransition(async () => {
      const sessionLines = await getSessionLines(sessionId, loc);
      setLocation(loc);
      setLines(sessionLines);
      setCounts(new Map());
      setScanState("showing");
    });
  }

  function handleCountChange(lineId: string, value: string) {
    setCounts(prev => {
      const next = new Map(prev);
      next.set(lineId, value);
      return next;
    });
  }

  async function handleSaveAndNext() {
    setScanState("saving");
    const dirty = lines.filter(l => counts.has(l.id) && counts.get(l.id) !== "");
    let savedCount = 0;
    for (const line of dirty) {
      const val = counts.get(line.id);
      const counted = val !== undefined && val !== "" ? Number(val) : null;
      const result = await saveLineCountClient({ lineId: line.id, sessionId, counted });
      if (result.ok) savedCount++;
    }
    if (savedCount > 0) {
      setTotalCounted(prev => prev + savedCount);
      showToast(`✓ ${savedCount} count${savedCount > 1 ? "s" : ""} saved`);
    }
    // Reset for next scan
    setLocation(null);
    setLines([]);
    setCounts(new Map());
    setScanState("scanning");
  }

  const isScanning = scanState === "scanning";

  return (
    <main style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
      <div className={styles.topBar}>
        <Link href="/app/scan/stocktake" className={styles.backBtn}>← Sessions</Link>
        <span className={styles.topBarTitle}>Stocktake</span>
        {totalCounted > 0 && (
          <span className={styles.progressBadge}>{totalCounted} saved</span>
        )}
      </div>

      <Scanner
        onScan={handleScan}
        active={isScanning}
        label={isScanning ? "Scan a location barcode" : "Paused — save counts to continue"}
      />

      <div className={styles.scanContent}>
        {/* Manual picker button when not showing a location */}
        {!location && (
          <button className={styles.manualBtn} onClick={() => setShowPicker(true)}>
            Can&apos;t scan? Choose location manually →
          </button>
        )}

        {isPending && <div className={styles.emptyState}>Loading…</div>}

        {location && !isPending && (
          <>
            <div className={styles.locationBadge}>
              📍 {location.path}
            </div>

            {lines.length === 0 ? (
              <div className={styles.emptyState}>
                No components assigned to this location.
              </div>
            ) : (
              <>
                <div className={styles.lineList}>
                  {lines.map(line => {
                    const val = counts.get(line.id) ?? (line.counted !== null ? String(line.counted) : "");
                    return (
                      <div key={line.id} className={styles.lineRow}>
                        <span className={styles.lineName}>
                          {line.name}
                          {line.sku && (
                            <span style={{ color: "var(--ink-faint)", marginLeft: 4, fontSize: "var(--fs-xs)" }}>
                              {line.sku}
                            </span>
                          )}
                        </span>
                        {line.expectedOnHand !== null && (
                          <span className={styles.lineExpected} title="Expected">
                            exp {line.expectedOnHand}
                          </span>
                        )}
                        <input
                          className={`${styles.lineInput}${val !== "" ? ` ${styles.lineSaved}` : ""}`}
                          type="number"
                          inputMode="numeric"
                          min="0"
                          value={val}
                          placeholder="qty"
                          aria-label={`Count for ${line.name}`}
                          onChange={e => handleCountChange(line.id, e.target.value)}
                        />
                      </div>
                    );
                  })}
                </div>

                <button
                  className={styles.saveBtn}
                  onClick={handleSaveAndNext}
                  disabled={scanState === "saving"}
                >
                  {scanState === "saving" ? "Saving…" : "Save & scan next →"}
                </button>

                <button className={styles.manualBtn} onClick={() => setShowPicker(true)}>
                  Change location
                </button>
              </>
            )}
          </>
        )}
      </div>

      {toast && (
        <div className={styles.toastWrap}>
          <div className={styles.toast}>{toast}</div>
        </div>
      )}

      {showPicker && (
        <LocationPicker
          onSelect={handlePickerSelect}
          onCancel={() => setShowPicker(false)}
        />
      )}
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/app/scan/stocktake/
git commit -m "feat(scan): stocktake scan+count page"
```

---

## Task 7: Location assignment actions + locate page

**Goal:** The full scan-and-assign UI: camera → decode → fetch occupants → add/remove components.

**Files:**
- Create: `src/app/app/scan/_actions/get-location-components.ts`
- Create: `src/app/app/scan/_actions/assign-component.ts`
- Create: `src/app/app/scan/_actions/search-components.ts`
- Create: `src/app/app/scan/_actions/assign-component.test.ts`
- Create: `src/app/app/scan/locate/page.tsx`

**Acceptance Criteria:**
- [ ] `getLocationComponents` returns `{ id, name, sku }[]` for components at the scanned location
- [ ] `assignComponentToLocation` sets the correct FK, clears others at the same or lower level
- [ ] `removeComponentFromLocation` nulls the correct FK
- [ ] `searchComponents` returns up to 20 results matching name or SKU
- [ ] Locate page: scan → show occupants → remove via ✕ button → add via bottom sheet search
- [ ] Add/remove save immediately with toast feedback

**Verify:** `npx vitest run src/app/app/scan/_actions/assign-component.test.ts` → passes. Manual test: scan a bay, add and remove a component, verify in desktop `/app/components` that the bin location changed.

**Steps:**

- [ ] **Step 1: Write failing tests for `assignComponentToLocation`**

Create `src/app/app/scan/_actions/assign-component.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/tenant/context", () => ({
  getServerTenantContext: vi.fn(),
}));

import { getServerTenantContext } from "@/lib/tenant/context";
import { assignComponentToLocation, removeComponentFromLocation } from "./assign-component";

function makeSupabase(updateError: null | { message: string } = null) {
  const updateChain = {
    eq: vi.fn().mockReturnThis(),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ error: updateError }).then(resolve),
  };
  return {
    from: vi.fn().mockReturnValue({
      update: vi.fn().mockReturnValue(updateChain),
    }),
  };
}

function makeCtx(updateError: null | { message: string } = null) {
  return {
    supabase: makeSupabase(updateError) as any,
    tenantId: "t1",
  };
}

beforeEach(() => vi.clearAllMocks());

describe("assignComponentToLocation", () => {
  it("returns ok:false when context missing", async () => {
    vi.mocked(getServerTenantContext).mockResolvedValue(null);
    expect(await assignComponentToLocation("c1", "bay1", "bay")).toEqual({ ok: false });
  });

  it("sets bin_bay_id when type is bay", async () => {
    vi.mocked(getServerTenantContext).mockResolvedValue(makeCtx() as any);
    const ctx = makeCtx();
    vi.mocked(getServerTenantContext).mockResolvedValue(ctx as any);
    const result = await assignComponentToLocation("c1", "bay1", "bay");
    expect(result).toEqual({ ok: true });
    expect(ctx.supabase.from("component").update).toHaveBeenCalledWith(
      expect.objectContaining({ bin_bay_id: "bay1" })
    );
  });

  it("sets bin_aisle_id when type is aisle", async () => {
    const ctx = makeCtx();
    vi.mocked(getServerTenantContext).mockResolvedValue(ctx as any);
    await assignComponentToLocation("c1", "a1", "aisle");
    expect(ctx.supabase.from("component").update).toHaveBeenCalledWith(
      expect.objectContaining({ bin_aisle_id: "a1" })
    );
  });

  it("returns ok:false on DB error", async () => {
    const ctx = makeCtx({ message: "constraint violation" });
    vi.mocked(getServerTenantContext).mockResolvedValue(ctx as any);
    const result = await assignComponentToLocation("c1", "b1", "bay");
    expect(result).toEqual({ ok: false });
  });
});

describe("removeComponentFromLocation", () => {
  it("nulls bin_bay_id when type is bay", async () => {
    const ctx = makeCtx();
    vi.mocked(getServerTenantContext).mockResolvedValue(ctx as any);
    await removeComponentFromLocation("c1", "bay");
    expect(ctx.supabase.from("component").update).toHaveBeenCalledWith(
      expect.objectContaining({ bin_bay_id: null })
    );
  });
});
```

Run: `npx vitest run src/app/app/scan/_actions/assign-component.test.ts`
Expected: FAIL

- [ ] **Step 2: Implement the actions**

Create `src/app/app/scan/_actions/assign-component.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";
import type { ResolvedLocation } from "./resolve-barcode";

type LocType = ResolvedLocation["type"];

function buildUpdate(id: string, type: LocType): Record<string, string | null> {
  // Only set the FK for the exact level; leave others untouched
  if (type === "bay")          return { bin_bay_id: id };
  if (type === "aisle")        return { bin_aisle_id: id };
  if (type === "sub_location") return { bin_sub_location_id: id };
  return { location_id: id };  // warehouse
}

function buildClear(type: LocType): Record<string, null> {
  if (type === "bay")          return { bin_bay_id: null };
  if (type === "aisle")        return { bin_aisle_id: null };
  if (type === "sub_location") return { bin_sub_location_id: null };
  return { location_id: null }; // warehouse
}

export async function assignComponentToLocation(
  componentId: string,
  locationId: string,
  locationType: LocType
): Promise<{ ok: boolean }> {
  const context = await getServerTenantContext();
  if (!context) return { ok: false };
  const { supabase, tenantId } = context;

  const { error } = await supabase
    .from("component")
    .update(buildUpdate(locationId, locationType))
    .eq("id", componentId)
    .eq("tenant_id", tenantId);

  if (error) return { ok: false };
  revalidatePath("/app/components");
  return { ok: true };
}

export async function removeComponentFromLocation(
  componentId: string,
  locationType: LocType
): Promise<{ ok: boolean }> {
  const context = await getServerTenantContext();
  if (!context) return { ok: false };
  const { supabase, tenantId } = context;

  const { error } = await supabase
    .from("component")
    .update(buildClear(locationType))
    .eq("id", componentId)
    .eq("tenant_id", tenantId);

  if (error) return { ok: false };
  revalidatePath("/app/components");
  return { ok: true };
}
```

- [ ] **Step 3: Run tests — expect pass**

```bash
npx vitest run src/app/app/scan/_actions/assign-component.test.ts
```
Expected: all tests pass.

- [ ] **Step 4: Create `getLocationComponents` and `searchComponents`**

Create `src/app/app/scan/_actions/get-location-components.ts`:

```ts
"use server";

import { getServerTenantContext } from "@/lib/tenant/context";
import type { ResolvedLocation } from "./resolve-barcode";

export type LocationComponent = { id: string; name: string; sku: string | null };

export async function getLocationComponents(location: ResolvedLocation): Promise<LocationComponent[]> {
  const context = await getServerTenantContext();
  if (!context) return [];
  const { supabase, tenantId } = context;

  let query = supabase
    .from("component")
    .select("id, name, sku")
    .eq("tenant_id", tenantId)
    .order("name");

  if (location.type === "bay") {
    query = query.eq("bin_bay_id", location.id);
  } else if (location.type === "aisle") {
    query = query.eq("bin_aisle_id", location.id);
  } else if (location.type === "sub_location") {
    query = query.eq("bin_sub_location_id", location.id);
  } else {
    query = query
      .eq("location_id", location.warehouseId)
      .is("bin_bay_id", null)
      .is("bin_aisle_id", null)
      .is("bin_sub_location_id", null);
  }

  const { data } = await query;
  return (data ?? []) as LocationComponent[];
}
```

Create `src/app/app/scan/_actions/search-components.ts`:

```ts
"use server";

import { getServerTenantContext } from "@/lib/tenant/context";

export type ComponentSearchResult = { id: string; name: string; sku: string | null };

export async function searchComponents(query: string): Promise<ComponentSearchResult[]> {
  const context = await getServerTenantContext();
  if (!context) return [];
  const { supabase, tenantId } = context;

  if (!query.trim()) return [];

  const { data } = await supabase
    .from("component")
    .select("id, name, sku")
    .eq("tenant_id", tenantId)
    .or(`name.ilike.%${query}%,sku.ilike.%${query}%`)
    .order("name")
    .limit(20);

  return (data ?? []) as ComponentSearchResult[];
}
```

- [ ] **Step 5: Create locate page**

Create `src/app/app/scan/locate/page.tsx`:

```tsx
"use client";

import { useState, useCallback, useTransition, useRef } from "react";
import Link from "next/link";
import { Scanner } from "../_components/scanner";
import { LocationPicker } from "../_components/location-picker";
import { resolveBarcode, type ResolvedLocation } from "../_actions/resolve-barcode";
import { getLocationComponents, type LocationComponent } from "../_actions/get-location-components";
import { assignComponentToLocation, removeComponentFromLocation } from "../_actions/assign-component";
import { searchComponents, type ComponentSearchResult } from "../_actions/search-components";
import styles from "../scan.module.css";

type ScanState = "scanning" | "showing";

export default function LocateScanPage() {
  const [scanState, setScanState] = useState<ScanState>("scanning");
  const [location, setLocation] = useState<ResolvedLocation | null>(null);
  const [components, setComponents] = useState<LocationComponent[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ComponentSearchResult[]>([]);
  const [isPending, startTransition] = useTransition();
  const [isSearching, startSearchTransition] = useTransition();
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }

  async function loadLocation(loc: ResolvedLocation) {
    const comps = await getLocationComponents(loc);
    setLocation(loc);
    setComponents(comps);
    setScanState("showing");
  }

  const handleScan = useCallback((code: string) => {
    if (scanState !== "scanning") return;
    startTransition(async () => {
      const resolved = await resolveBarcode(code);
      if (!resolved) {
        showToast("Location not found — check the label");
        return;
      }
      await loadLocation(resolved);
    });
  }, [scanState]);

  function handlePickerSelect(loc: ResolvedLocation) {
    setShowPicker(false);
    startTransition(() => loadLocation(loc));
  }

  async function handleRemove(componentId: string, componentName: string) {
    if (!location) return;
    const result = await removeComponentFromLocation(componentId, location.type);
    if (result.ok) {
      setComponents(prev => prev.filter(c => c.id !== componentId));
      showToast(`Removed ${componentName}`);
    } else {
      showToast("Failed to remove — try again");
    }
  }

  function handleSearchChange(q: string) {
    setSearchQuery(q);
    if (!q.trim()) { setSearchResults([]); return; }
    startSearchTransition(async () => {
      const results = await searchComponents(q);
      setSearchResults(results);
    });
  }

  async function handleAddComponent(comp: ComponentSearchResult) {
    if (!location) return;
    const result = await assignComponentToLocation(comp.id, location.id, location.type);
    if (result.ok) {
      // Add to list if not already there
      setComponents(prev =>
        prev.find(c => c.id === comp.id)
          ? prev
          : [...prev, { id: comp.id, name: comp.name, sku: comp.sku }]
      );
      showToast(`Added ${comp.name}`);
    } else {
      showToast("Failed to add — try again");
    }
  }

  function resetToScan() {
    setLocation(null);
    setComponents([]);
    setScanState("scanning");
  }

  return (
    <main style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
      <div className={styles.topBar}>
        <Link href="/app/scan" className={styles.backBtn}>← Back</Link>
        <span className={styles.topBarTitle}>Set Locations</span>
      </div>

      <Scanner
        onScan={handleScan}
        active={scanState === "scanning"}
        label="Scan a location barcode"
      />

      <div className={styles.scanContent}>
        {!location && (
          <button className={styles.manualBtn} onClick={() => setShowPicker(true)}>
            Can&apos;t scan? Choose location manually →
          </button>
        )}

        {isPending && <div className={styles.emptyState}>Loading…</div>}

        {location && !isPending && (
          <>
            <div className={styles.locationBadge}>
              📍 {location.path}
            </div>

            <div className={styles.lineList}>
              {components.length === 0 && (
                <div className={styles.emptyState}>No components assigned here yet.</div>
              )}
              {components.map(comp => (
                <div key={comp.id} className={styles.compRow}>
                  <span className={styles.compName}>{comp.name}</span>
                  {comp.sku && <span className={styles.compSku}>{comp.sku}</span>}
                  <button
                    className={styles.removeBtn}
                    aria-label={`Remove ${comp.name} from this location`}
                    onClick={() => handleRemove(comp.id, comp.name)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <button className={styles.addCompBtn} onClick={() => { setShowAddSheet(true); setSearchQuery(""); setSearchResults([]); }}>
              + Add component…
            </button>

            <button className={styles.manualBtn} onClick={resetToScan}>
              Scan a different location
            </button>
          </>
        )}
      </div>

      {toast && (
        <div className={styles.toastWrap}>
          <div className={styles.toast}>{toast}</div>
        </div>
      )}

      {showPicker && (
        <LocationPicker onSelect={handlePickerSelect} onCancel={() => setShowPicker(false)} />
      )}

      {showAddSheet && location && (
        <div className={styles.sheetBackdrop} onClick={(e) => { if (e.target === e.currentTarget) setShowAddSheet(false); }}>
          <div className={styles.sheet}>
            <div className={styles.sheetTitle}>Add to {location.name}</div>
            <input
              className={styles.sheetSearch}
              type="search"
              placeholder="Search components…"
              value={searchQuery}
              onChange={e => handleSearchChange(e.target.value)}
              autoFocus
              aria-label="Search components"
            />
            <div className={styles.sheetResults}>
              {isSearching && <div className={styles.emptyState}>Searching…</div>}
              {!isSearching && searchQuery && searchResults.length === 0 && (
                <div className={styles.emptyState}>No components found.</div>
              )}
              {!isSearching && searchResults.map(r => (
                <div key={r.id} className={styles.sheetRow}>
                  <span className={styles.sheetRowName}>
                    {r.name}
                    {r.sku && <span style={{ color: "var(--ink-faint)", marginLeft: 6, fontSize: "var(--fs-xs)" }}>{r.sku}</span>}
                  </span>
                  <button
                    className={styles.addBtn}
                    onClick={() => handleAddComponent(r)}
                    aria-label={`Add ${r.name}`}
                  >
                    + Add
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 6: Run all scan tests**

```bash
npx vitest run src/app/app/scan/
```
Expected: all test files pass.

- [ ] **Step 7: Final commit**

```bash
git add src/app/app/scan/
git commit -m "feat(scan): location assignment actions + locate page — mobile scanner complete"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All 5 routes covered. Both modes (stocktake + locate) implemented. Manual location picker fallback in both. Unknown barcode toast + manual fallback. PWA manifest. Shell bypass. Blind count hides expected column. RPC patch included.
- [x] **Placeholders:** None. All steps have real code.
- [x] **Type consistency:** `ResolvedLocation` defined in `resolve-barcode.ts` and imported by all consumers. `SessionLine` from `get-session-lines.ts`. `LocType` alias matches `ResolvedLocation["type"]` throughout.
- [x] **Scope:** Single mobile scanner feature; one implementation plan.
