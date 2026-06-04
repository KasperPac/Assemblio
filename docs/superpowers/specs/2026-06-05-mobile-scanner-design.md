# Mobile Scanner — Design Spec

**Date:** 2026-06-05  
**Status:** Approved

---

## Overview

A mobile-optimised PWA scanner built into the existing Next.js app under `/app/scan/`. Warehouse workers log in with their standard Manuva credentials and use their phone camera to scan location barcodes (the existing Code 128 labels already printed from the Locations Manager). Two modes:

1. **Stocktake mode** — scan a location → see pre-loaded components for that bin → enter counts into an active stocktake session
2. **Location assignment mode** — scan a location → view, add, and remove which components permanently live there

Designed as a PWA for MVP; the route structure and server action interface are intentionally compatible with a future React Native / Expo app.

---

## Scope

**In scope:**
- Five new routes under `/app/scan/`
- Full-screen mobile layout (no sidebar, no topbar)
- Camera barcode scanning via `zxing-wasm` (Code 128, iOS + Android)
- Manual location picker fallback (hierarchical: Warehouse → Aisle → Bay)
- Stocktake mode: session picker → scan → count entry → save
- Location assignment mode: scan → view occupants → add/remove components
- PWA `manifest.json` for home-screen installability
- Reuse of all existing server actions (no new DB schema)

**Out of scope (future):**
- React Native / Expo native app
- Component barcode scanning (scan the component directly, not the location)
- Offline queue / sync
- Push notifications
- Bulk location assignment

---

## Routes

| Route | Purpose |
|---|---|
| `/app/scan` | Home — choose mode |
| `/app/scan/stocktake` | Session picker — list of open/counting sessions |
| `/app/scan/stocktake/[sessionId]` | Scan + count — camera → location → qty inputs |
| `/app/scan/locate` | Scan + assign — camera → component list for location |
| `/app/scan/manifest.json` | PWA web app manifest |

---

## Layout

`src/app/app/scan/layout.tsx` replaces the app shell for its entire subtree via Next.js layout nesting. It renders:

- No sidebar, no topbar
- `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">` (prevents zoom on input focus)
- `<meta name="theme-color">` for PWA chrome colour
- A minimal scan-specific top bar: back chevron + screen title + (on session screens) session reference

This keeps the mobile UI completely free of desktop chrome without touching the existing app layout.

---

## New Files

| Path | Type | Purpose |
|---|---|---|
| `src/app/app/scan/layout.tsx` | Server component | Mobile shell layout |
| `src/app/app/scan/page.tsx` | Server component | Home — two mode cards |
| `src/app/app/scan/scan.module.css` | CSS module | Mobile-first scan layout styles |
| `src/app/app/scan/stocktake/page.tsx` | Server component | Session picker |
| `src/app/app/scan/stocktake/[sessionId]/page.tsx` | Client component | Scan + count |
| `src/app/app/scan/locate/page.tsx` | Client component | Scan + assign |
| `src/app/app/scan/_components/scanner.tsx` | Client component | Camera viewfinder + zxing-wasm |
| `src/app/app/scan/_components/location-picker.tsx` | Client component | Manual hierarchical location picker |
| `src/app/app/scan/_actions/resolve-barcode.ts` | Server action | 6-char code → location entity |
| `src/app/app/scan/_actions/get-session-lines.ts` | Server action | Lines for a session filtered by location |
| `src/app/app/scan/_actions/get-location-components.ts` | Server action | Components assigned to a location entity |
| `src/app/app/scan/manifest.json/route.ts` | Route handler | Serves PWA manifest |

---

## Components

### `Scanner`

Client component. Handles camera permission, `zxing-wasm` decode loop, and torch toggle.

```ts
<Scanner
  onScan={(code: string) => void}  // fires on each successfully decoded barcode
  active={boolean}                  // false pauses the decode loop (between saves)
  label="Scan a location barcode"  // instructional overlay text
/>
```

- Requests camera permission on mount; shows a full-screen permission prompt if denied with browser-specific instructions
- Torch toggle button (flashlight icon, top-right of viewfinder) — uses `MediaTrackConstraints.torch`
- Debounces repeated scans of the same code (500 ms) to avoid double-fires
- Reused identically in both stocktake and location assignment modes

### `LocationPicker`

Client component. Renders as a bottom sheet. Cascading drill-down: Warehouse → Aisle → Bay. User may select at any level (warehouse, aisle, or bay).

```ts
<LocationPicker
  onSelect={(entity: ResolvedLocation) => void}
  onCancel={() => void}
/>
```

- Loads each level lazily on drill-in (server action per level)
- Back button navigates up one level
- Each row shows the entity name; aisles show their sub-location tag if set

---

## Server Actions

### `resolveBarcode(code: string): Promise<ResolvedLocation | null>`

Queries all four location tables in a single `UNION ALL` — `location`, `bin_sub_location`, `bin_aisle`, `bin_bay` — matching on `right(id::text, 6) = code` (case-insensitive). Returns:

```ts
type ResolvedLocation = {
  type: 'warehouse' | 'sub_location' | 'aisle' | 'bay'
  id: string
  name: string
  path: string   // e.g. "Main Warehouse · Aisle 1 · Bay 3"
  warehouseId: string
}
```

Returns `null` if no match. RLS ensures tenant isolation — no tenant_id parameter needed.

### `getSessionLines(sessionId, location: ResolvedLocation)`

Fetches `stocktake_line` rows joined to `component` where the component's bin location FK matches the resolved location entity. Respects the location level:
- `bay` → `component.bin_bay_id = location.id`
- `aisle` → `component.bin_aisle_id = location.id`
- `sub_location` → `component.bin_sub_location_id = location.id`
- `warehouse` → `component.location_id = location.warehouseId` (all components in warehouse)

Returns lines with `component_name`, `sku`, `expected_qty` (null if session `blind_count = true`), `counted_qty`.

### `getLocationComponents(location: ResolvedLocation)`

Fetches components assigned to the given location entity. Same FK logic as above. Returns `id`, `name`, `sku`.

### Reused actions (no changes)

| Action | Location | Used for |
|---|---|---|
| `updateStocktakeLine` | `stocktake/[sessionId]/actions.ts` | Saving counts |
| `updateBinLocation` | `components/actions.ts` | Assigning / clearing component bin |
| Active session query | `stocktake/actions.ts` | Session picker list |

---

## Screen Flows

### Stocktake mode

```
/app/scan/stocktake
  → list of sessions (status = 'open' or 'counting')
  → tap session → /app/scan/stocktake/[sessionId]
     → camera active, "ready to scan" state
     → scan barcode OR tap "Choose location manually →"
        → resolveBarcode() identifies entity
        → getSessionLines() loads component lines
        → lines render below viewfinder with qty inputs
        → blind_count=true: expected qty hidden
        → tap "Save & scan next →"
           → updateStocktakeLine for each changed line
           → camera clears, re-activates
     → progress badge updates: "X / Y counted"
```

### Location assignment mode

```
/app/scan/locate
  → camera active immediately
  → scan barcode OR tap "Choose location manually →"
     → resolveBarcode() identifies entity
     → getLocationComponents() loads assigned components
     → list renders with ✕ remove buttons
        → tap ✕ → updateBinLocation(componentId, { clear: level })
          saves immediately, no confirm
     → tap "+ Add component…" → bottom sheet
        → search field, type-to-filter
        → tap "+ Add" → updateBinLocation(componentId, { [level_id]: entity.id })
        → component appears in list; sheet stays open
  → scan next location to repeat
```

---

## Error States

| Situation | Behaviour |
|---|---|
| Unknown / damaged barcode | Toast: *"Location not found — check the label and try again"* with *"Choose manually →"* link |
| No components at scanned location (stocktake) | Empty state: *"No components assigned to this location"* |
| Camera permission denied | Full-screen prompt with browser-specific instructions to enable camera |
| Session moved to reconciliation while counting | Toast: *"This session is no longer open for counting"* + redirect to session picker |
| Network error saving counts | Toast: *"Failed to save — tap to retry"* with retry callback |

---

## PWA Manifest

`/app/scan/manifest.json` — served by a Next.js route handler:

```json
{
  "name": "Manuva Scanner",
  "short_name": "Scanner",
  "start_url": "/app/scan",
  "display": "standalone",
  "background_color": "#111827",
  "theme_color": "#1e40af",
  "icons": [{ "src": "/manuva.svg", "sizes": "any", "type": "image/svg+xml" }]
}
```

Linked from `scan/layout.tsx` via `<link rel="manifest">`. Users can add to home screen from the browser share sheet.

---

## Barcode Library

**`zxing-wasm`** — WebAssembly port of ZXing. Chosen over the browser `BarcodeDetector` API because `BarcodeDetector` is absent on iOS Safari. `zxing-wasm` decodes Code 128 on both iOS and Android via a `<video>` element feed.

Install: `npm install zxing-wasm`

The `Scanner` component imports the WASM reader lazily (`await import('zxing-wasm')`) to avoid adding it to the main bundle.

---

## Role-Based Access

Follows existing app roles. No new role checks needed:
- Any authenticated tenant member can use both modes
- Stocktake lines can only be saved to sessions the member has access to (existing RLS on `stocktake_line`)
- `updateBinLocation` already requires member-level access

---

## Testing

| Area | Approach |
|---|---|
| `resolveBarcode` | Unit test: known 6-char codes return correct entity type + path; unknown code returns null; cross-tenant code returns null |
| `getSessionLines` | Unit test: fixture session + location returns correct lines; blind count session returns null expected_qty |
| `Scanner` component | Playwright: inject decoded string via `onScan` mock — bypasses camera API unavailable in headless |
| Full flow (stocktake) | Playwright mobile viewport: session picker → manual location select → enter counts → save → verify `stocktake_line.counted_qty` updated |
| Full flow (locate) | Playwright mobile viewport: manual location select → add component → verify `component.bin_bay_id` updated |

---

## Future: Path to Native App

When the team is ready to build the React Native / Expo app:

- `resolveBarcode`, `getSessionLines`, `getLocationComponents` are plain server actions callable from any client — wrap them in API route handlers and call from RN
- `Scanner` component logic maps directly to `expo-camera` + `expo-barcode-scanner`
- `LocationPicker` maps to a React Native `FlatList` with the same drill-down logic
- Screen structure (Home → Session picker → Scan+Count) is identical — only the shell changes
