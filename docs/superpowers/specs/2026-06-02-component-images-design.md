# Component Images Design

**Date:** 2026-06-02  
**Status:** Approved  
**Scope:** Upload + Nexar auto-fetch for component images; surface on detail page and goods-inwards receive screen.

---

## 1. Overview

Components in Manuva currently have no visual representation. This feature adds a single image per component, supporting two input methods:

1. **Manual upload** — user uploads a PNG/JPEG/WebP file
2. **Auto-fetch** — user clicks "Find image", which queries the Nexar API using the component's preferred supplier part number

Images surface in two places:
- **Component detail page** — large image inline in the info card, with upload and find controls beneath it
- **Goods Inwards receive screen** — small thumbnail column in the line rows for visual part verification

---

## 2. Data Model

### Database

Add a single nullable column to the existing `component` table:

```sql
alter table public.component add column image_url text;
```

Delivered as a new patch file: `supabase/patches/component_images.sql`.

### Storage

New Supabase Storage bucket: **`component-images`**

| Property | Value |
|---|---|
| Visibility | Public |
| Path pattern | `{tenant_id}/{component_id}.webp` |
| Allowed types | PNG, JPEG, WebP (all converted to WebP server-side) |
| Max file size | 5 MB |
| On re-upload | Overwrite in place — fixed path means no orphaned files |

RLS policies follow the same pattern as `tenant-logos`:
- **Public read** — `<img src>` works without auth headers
- **Tenant-scoped write** — users can only write to paths starting with their `tenant_id`

---

## 3. Server Actions

All three actions live in `src/app/app/components/actions.ts`, alongside the existing `updateComponent` and `updateComponentSupplier`.

### `uploadComponentImage(componentId, formData)`

1. Extract file from `formData`
2. Validate type (PNG, JPEG, WebP) and size (≤ 5 MB)
3. Convert to WebP server-side, upload to `component-images/{tenant_id}/{component_id}.webp` via service-role client
4. Get public URL, append `?v={timestamp}` cache-buster
5. Update `component.image_url`
6. Log `"component.image_uploaded"` to `activity_log`

### `fetchComponentImageFromNexar(componentId)`

1. Look up the preferred `supplier_components` row (`is_preferred = true`) for the component — get `supplier_part_number` and the linked `supplier.name`
2. If no preferred supplier or no `supplier_part_number` → return `{ found: false, reason: "no_part_number" }`
3. Call Nexar GraphQL API (see §5) with `q = "{supplier_part_number} {supplier_name}"`
4. If `bestImage.url` is returned:
   - `fetch()` the image server-side
   - Upload bytes to `component-images/{tenant_id}/{component_id}.webp` (converted to WebP)
   - Update `component.image_url`
   - Log `"component.image_fetched"`
   - Return `{ found: true, imageUrl }`
5. If no results → return `{ found: false, reason: "no_results" }`
6. On API/network error → log `"component.image_fetch_failed"`, return `{ found: false, reason: "api_error" }`

### `removeComponentImage(componentId)`

1. Delete file from `component-images/{tenant_id}/{component_id}.*` in storage
2. Set `component.image_url = null`
3. Log `"component.image_removed"`

---

## 4. Component Detail Page UI

**Files:** `src/app/app/components/[componentId]/page.tsx` (server component, passes `image_url` as prop) + a new `component-image.tsx` client component (handles upload state, find-image transition, toasts)

The image sits **inline in the existing info card**, top-left corner — no new card added.

### Layout (with image present)

```
┌─────────────────────────────────────────────┐
│  [96×96 image]   Component                  │
│  [Upload][Find]  10K Resistor               │
│                  SKU-001  ·  pcs            │
│                  On Hand: 1,200             │
│                  Reorder at: 200            │
└─────────────────────────────────────────────┘
```

### Layout (no image)

Same structure, but the image slot shows a grey placeholder (camera icon via CSS, no `<img>` tag).

### Controls beneath the image

| State | Controls shown |
|---|---|
| No image, no supplier part number | "↑ Upload" only |
| No image, has supplier part number | "↑ Upload" + "🔍 Find image" |
| Image present | "↑ Upload" (replace) + "🗑 Remove" |

**"Find image" button states:**
- Default: enabled, labelled "🔍 Find image"
- Loading: spinner, disabled
- Success: button disappears (image now shown)
- Not found: toast "No image found — try uploading one manually"
- Error: toast "Image lookup failed — try again or upload your own"

### Implementation notes

- Image upload uses a hidden `<input type="file">` triggered by the Upload button, submitted via a client-side `fetch` to the server action (matches the avatar/logo pattern)
- "Find image" calls `fetchComponentImageFromNexar` as a server action via `useTransition`
- Image display uses `next/image` with `unoptimized` (external Supabase Storage URLs are already CDN-served)

---

## 5. Goods Inwards UI

**File:** `src/app/app/goods-inwards/receipt-form.tsx` (the line rows table within the receive form)

A fixed-width thumbnail column is added to the left of the receive lines table.

| Column | Width |
|---|---|
| Thumbnail | 40px |
| Component name + SKU | flex |
| Expected qty | 80px |
| Received qty (input) | 80px |

**Thumbnail rendering:**
- If `component.image_url` is set: `<img>` at 36×36px, `border-radius: 6px`, `object-fit: contain`, light grey background
- If not set: grey placeholder box with a small image icon (no broken-image state)

The thumbnail column is read-only — no upload controls in this view.

---

## 6. Nexar API Integration

**File:** `src/lib/nexar/client.ts` (new)

### Auth

OAuth2 client credentials flow:

```
POST https://identity.nexar.com/connect/token
  grant_type=client_credentials
  client_id=$NEXAR_CLIENT_ID
  client_secret=$NEXAR_CLIENT_SECRET
```

Returns a bearer token valid for 24 hours. Cache in module-level memory; re-fetch on expiry.

### GraphQL query

```graphql
query SupSearch($q: String!) {
  supSearch(q: $q, limit: 1) {
    results {
      part {
        bestImage { url }
        manufacturer { name }
        mpn
      }
    }
  }
}
```

Endpoint: `https://api.nexar.com/graphql`  
Variable: `q = "{supplier_part_number} {supplier_name}"`

### Environment variables

| Variable | Purpose |
|---|---|
| `NEXAR_CLIENT_ID` | Nexar OAuth2 client ID |
| `NEXAR_CLIENT_SECRET` | Nexar OAuth2 client secret |

Both are server-only (no `NEXT_PUBLIC_` prefix). Add to `.env.local` for development; set via Vercel env vars for production.

---

## 7. Error Handling Summary

| Scenario | Behaviour |
|---|---|
| No preferred supplier / no part number | "Find image" button hidden; "↑ Upload" only |
| Nexar returns no results | Toast: "No image found — try uploading one manually" |
| Nexar API / network error | Toast: "Image lookup failed — try again or upload your own" |
| Upload: wrong file type | Client-side validation, inline error below button |
| Upload: file too large (> 5 MB) | Client-side validation, inline error below button |
| Storage write failure | Server action returns error, toast shown |

---

## 8. Out of Scope (this iteration)

- Component list table thumbnail column — future pass
- Pick list thumbnails — future pass
- Multiple images per component — one image is sufficient for all current use cases
- Image from non-Nexar sources (Google, DigiKey API directly) — Nexar aggregates these already
- Automatic trigger on part number save — manual "Find image" button only
