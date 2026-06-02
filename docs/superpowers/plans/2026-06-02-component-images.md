# Component Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single image per component — uploadable by any user or auto-fetched from the Nexar parts API using the preferred supplier part number — surfaced on the component detail page info card and as a thumbnail in the Goods Inwards receive screen.

**Architecture:** A new `component-images` Supabase Storage bucket holds images at `{tenantId}/{componentId}` (no extension, always upserted so there are no orphaned files). Three server actions handle upload, Nexar auto-fetch, and removal. A new `ComponentImage` client component owns all image interaction UI and renders inline in the existing info card `aside`. Goods Inwards gets a read-only thumbnail column added to its lines table.

**Tech Stack:** Next.js 15 App Router server actions, Supabase Storage, Nexar GraphQL API (OAuth2 client credentials), Vitest for unit tests.

---

## File Map

**New files:**

| File | Purpose |
|---|---|
| `supabase/patches/component_images.sql` | `image_url` column, `component-images` bucket, RLS policies |
| `src/lib/nexar/client.ts` | Nexar OAuth2 token cache + `searchComponentImage` GraphQL helper |
| `src/lib/nexar/client.test.ts` | Vitest unit tests for the Nexar client |
| `src/app/app/components/[componentId]/component-image.tsx` | Client component: image slot, upload, find, remove |
| `src/app/app/components/[componentId]/component-image.module.css` | Styles for the image section |

**Modified files:**

| File | Change |
|---|---|
| `src/app/app/components/actions.ts` | Add `uploadComponentImage`, `fetchComponentImageFromNexar`, `removeComponentImage` |
| `src/app/app/components/[componentId]/page.tsx` | Add `image_url` to type + select + render `<ComponentImage>` |
| `src/app/app/components/[componentId]/page.module.css` | Add `.imageRow` flex layout |
| `src/app/app/goods-inwards/receipt-form.tsx` | Add `image_url` to Component type + `ComponentThumbnail` helper + thumbnail column |
| `src/app/app/goods-inwards/new/page.tsx` | Add `image_url` to components select |
| `src/app/app/goods-inwards/[id]/page.tsx` | Add `image_url` to components select |

---

### Task 1: Database migration and storage bucket

**Goal:** Add `image_url` to the `component` table and provision the `component-images` Supabase Storage bucket with RLS policies that mirror the existing `tenant-logos` pattern.

**Files:**
- Create: `supabase/patches/component_images.sql`

**Acceptance Criteria:**
- [ ] `component` table has a nullable `image_url text` column
- [ ] `component-images` bucket exists and is public (SELECT policy open to all)
- [ ] Any authenticated tenant member can INSERT/UPDATE/DELETE to paths starting with their tenant ID
- [ ] `is_super_admin()` bypasses tenant check (matches logo policy pattern)

**Verify:** In Supabase Studio → Table Editor, confirm `component.image_url` column exists. In Storage, confirm `component-images` bucket exists with the 4 policies.

**Steps:**

- [ ] **Step 1: Create the SQL patch**

Create `supabase/patches/component_images.sql`:

```sql
-- Component images: image_url column + storage bucket + RLS policies

-- 1. Column on component table
alter table public.component
  add column if not exists image_url text;

-- 2. Public storage bucket
insert into storage.buckets (id, name, public)
values ('component-images', 'component-images', true)
on conflict (id) do nothing;

-- 3. Public read (anyone can load <img src>)
drop policy if exists component_images_read on storage.objects;
create policy component_images_read on storage.objects
  for select
  using (bucket_id = 'component-images');

-- 4. Tenant member insert (all roles, not just admin — unlike logos)
drop policy if exists component_images_insert on storage.objects;
create policy component_images_insert on storage.objects
  for insert
  with check (
    bucket_id = 'component-images'
    and (
      public.is_super_admin()
      or (
        (storage.foldername(name))[1] = public.current_tenant_id()::text
        and public.current_profile_role() is not null
      )
    )
  );

-- 5. Tenant member update
drop policy if exists component_images_update on storage.objects;
create policy component_images_update on storage.objects
  for update
  using (
    bucket_id = 'component-images'
    and (
      public.is_super_admin()
      or (
        (storage.foldername(name))[1] = public.current_tenant_id()::text
        and public.current_profile_role() is not null
      )
    )
  );

-- 6. Tenant member delete
drop policy if exists component_images_delete on storage.objects;
create policy component_images_delete on storage.objects
  for delete
  using (
    bucket_id = 'component-images'
    and (
      public.is_super_admin()
      or (
        (storage.foldername(name))[1] = public.current_tenant_id()::text
        and public.current_profile_role() is not null
      )
    )
  );
```

- [ ] **Step 2: Apply the patch**

```bash
# Paste the SQL into Supabase Studio → SQL Editor and Run
# OR, if using the Supabase CLI with local dev:
npx supabase db push
```

- [ ] **Step 3: Commit**

```bash
git add supabase/patches/component_images.sql
git commit -m "feat(db): add component.image_url column and component-images storage bucket"
```

---

### Task 2: Nexar API client

**Goal:** A server-only module that fetches an OAuth2 token from Nexar (cached in module memory until 60s before expiry) and exposes `searchComponentImage(q)` which queries the `supSearch` GraphQL endpoint.

**Files:**
- Create: `src/lib/nexar/client.ts`
- Create: `src/lib/nexar/client.test.ts`

**Acceptance Criteria:**
- [ ] `searchComponentImage("part supplier")` returns `{ found: true, imageUrl, mpn, manufacturer }` when Nexar has results
- [ ] Returns `{ found: false, reason: "no_results" }` when `results` array is empty or `bestImage` is missing
- [ ] Returns `{ found: false, reason: "api_error" }` on HTTP failure or thrown exception
- [ ] All 3 Vitest tests pass

**Verify:** `npx vitest run src/lib/nexar/client.test.ts` → 3 tests passing

**Steps:**

- [ ] **Step 1: Write the failing tests**

Create `src/lib/nexar/client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Reset modules between tests to clear the module-level token cache
beforeEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

describe("searchComponentImage", () => {
  it("returns found:true with image data when Nexar returns a matching part", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).includes("identity.nexar.com")) {
        return new Response(
          JSON.stringify({ access_token: "test-token", expires_in: 86400 }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({
          data: {
            supSearch: {
              results: [
                {
                  part: {
                    bestImage: { url: "https://cdn.nexar.com/images/part.jpg" },
                    manufacturer: { name: "YAGEO" },
                    mpn: "RC0402FR-0710KL",
                  },
                },
              ],
            },
          },
        }),
        { status: 200 }
      );
    });

    const { searchComponentImage } = await import("./client");
    const result = await searchComponentImage("RC0402FR-0710KL YAGEO");

    expect(result.found).toBe(true);
    if (result.found) {
      expect(result.imageUrl).toBe("https://cdn.nexar.com/images/part.jpg");
      expect(result.manufacturer).toBe("YAGEO");
      expect(result.mpn).toBe("RC0402FR-0710KL");
    }
  });

  it("returns found:false / no_results when supSearch returns empty results", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).includes("identity.nexar.com")) {
        return new Response(
          JSON.stringify({ access_token: "test-token", expires_in: 86400 }),
          { status: 200 }
        );
      }
      return new Response(
        JSON.stringify({ data: { supSearch: { results: [] } } }),
        { status: 200 }
      );
    });

    const { searchComponentImage } = await import("./client");
    const result = await searchComponentImage("NONEXISTENT-PART-XYZ");

    expect(result.found).toBe(false);
    if (!result.found) {
      expect(result.reason).toBe("no_results");
    }
  });

  it("returns found:false / api_error when the token request fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("Unauthorized", { status: 401 })
    );

    const { searchComponentImage } = await import("./client");
    const result = await searchComponentImage("anything");

    expect(result.found).toBe(false);
    if (!result.found) {
      expect(result.reason).toBe("api_error");
    }
  });
});
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
npx vitest run src/lib/nexar/client.test.ts
```

Expected: FAIL with `Cannot find module './client'`

- [ ] **Step 3: Implement the Nexar client**

Create `src/lib/nexar/client.ts`:

```typescript
// Server-only module — never import from client components.

interface CachedToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

let cachedToken: CachedToken | null = null;

async function getToken(): Promise<string> {
  // Reuse token until 60 s before expiry
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.accessToken;
  }

  const clientId = process.env.NEXAR_CLIENT_ID;
  const clientSecret = process.env.NEXAR_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("NEXAR_CLIENT_ID and NEXAR_CLIENT_SECRET are required");
  }

  const resp = await fetch("https://identity.nexar.com/connect/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!resp.ok) {
    throw new Error(`Nexar token request failed: HTTP ${resp.status}`);
  }

  const data = (await resp.json()) as {
    access_token: string;
    expires_in: number;
  };
  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.accessToken;
}

const SUP_SEARCH_QUERY = `
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
`;

export type NexarImageResult =
  | { found: true; imageUrl: string; mpn: string; manufacturer: string }
  | { found: false; reason: "no_results" | "api_error"; message?: string };

export async function searchComponentImage(q: string): Promise<NexarImageResult> {
  try {
    const token = await getToken();

    const resp = await fetch("https://api.nexar.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query: SUP_SEARCH_QUERY, variables: { q } }),
    });

    if (!resp.ok) {
      return { found: false, reason: "api_error", message: `HTTP ${resp.status}` };
    }

    const body = (await resp.json()) as {
      data?: {
        supSearch?: {
          results?: Array<{
            part?: {
              bestImage?: { url: string };
              manufacturer?: { name: string };
              mpn?: string;
            };
          }>;
        };
      };
      errors?: Array<{ message: string }>;
    };

    if (body.errors?.length) {
      return { found: false, reason: "api_error", message: body.errors[0].message };
    }

    const part = body.data?.supSearch?.results?.[0]?.part;
    if (!part?.bestImage?.url) {
      return { found: false, reason: "no_results" };
    }

    return {
      found: true,
      imageUrl: part.bestImage.url,
      mpn: part.mpn ?? q,
      manufacturer: part.manufacturer?.name ?? "",
    };
  } catch (err) {
    return { found: false, reason: "api_error", message: String(err) };
  }
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
npx vitest run src/lib/nexar/client.test.ts
```

Expected: 3 tests passing

- [ ] **Step 5: Add env var stubs to `.env.local`**

Add to `.env.local` (already git-ignored — do not commit these values):

```bash
NEXAR_CLIENT_ID=your-client-id-here
NEXAR_CLIENT_SECRET=your-client-secret-here
```

Get credentials at [https://nexar.com/api](https://nexar.com/api) → Create Application (free tier available).

- [ ] **Step 6: Commit**

```bash
git add src/lib/nexar/client.ts src/lib/nexar/client.test.ts
git commit -m "feat(nexar): add Nexar API client with OAuth2 token cache and supSearch query"
```

---

### Task 3: Component image server actions

**Goal:** Three server actions added to the existing `actions.ts` — upload a user file, auto-fetch from Nexar and store, remove — all following the `uploadLogo` pattern from `src/app/app/settings/company/actions.ts`.

**Files:**
- Modify: `src/app/app/components/actions.ts`

**Acceptance Criteria:**
- [ ] `uploadComponentImage` validates type (PNG/JPEG/WebP) and size (≤ 5 MB), uploads to `component-images/{tenantId}/{componentId}`, updates `component.image_url`, logs `component.image_uploaded`
- [ ] `fetchComponentImageFromNexar` queries preferred supplier part number, calls `searchComponentImage`, downloads image, stores it, logs `component.image_fetched` or `component.image_fetch_failed`
- [ ] `removeComponentImage` deletes from storage, clears `image_url`, logs `component.image_removed`
- [ ] `npx tsc --noEmit` passes with no new errors

**Verify:** TypeScript compiles clean. Manual testing via the UI in Tasks 5 & 6.

**Steps:**

- [ ] **Step 1: Add the Nexar client import at the top of `actions.ts`**

Open `src/app/app/components/actions.ts`. After the existing imports (look for `revalidatePath`, `getServerTenantContext`, etc.), add:

```typescript
import { searchComponentImage } from "@/lib/nexar/client";
```

- [ ] **Step 2: Add `uploadComponentImage`**

Append after the last existing exported function in `actions.ts`:

```typescript
// ── Component image actions ──────────────────────────────────────────────────

export async function uploadComponentImage(
  componentId: string,
  formData: FormData
): Promise<{ imageUrl?: string; error?: string }> {
  const ctx = await getServerTenantContext();
  if (!ctx) return { error: "Not authenticated" };

  const file = formData.get("image") as File | null;
  if (!file || file.size === 0) return { error: "No file selected" };
  if (file.size > 5 * 1024 * 1024) return { error: "Image must be under 5 MB" };

  const allowed = ["image/png", "image/jpeg", "image/webp"];
  if (!allowed.includes(file.type)) return { error: "Use PNG, JPEG, or WebP" };

  // Confirm this component belongs to the caller's tenant
  const { data: comp, error: fetchErr } = await ctx.supabase
    .from("component")
    .select("id")
    .eq("id", componentId)
    .eq("tenant_id", ctx.tenantId)
    .single();
  if (fetchErr || !comp) return { error: "Component not found" };

  // Fixed path (no extension) so re-uploads always overwrite cleanly
  const storagePath = `${ctx.tenantId}/${componentId}`;
  const bytes = await file.arrayBuffer();

  const { error: uploadErr } = await ctx.supabase.storage
    .from("component-images")
    .upload(storagePath, bytes, { contentType: file.type, upsert: true });
  if (uploadErr) return { error: uploadErr.message };

  const {
    data: { publicUrl },
  } = ctx.supabase.storage.from("component-images").getPublicUrl(storagePath);
  const versioned = `${publicUrl}?v=${Date.now()}`;

  const { error: dbErr } = await ctx.supabase
    .from("component")
    .update({ image_url: versioned })
    .eq("id", componentId)
    .eq("tenant_id", ctx.tenantId);
  if (dbErr) return { error: dbErr.message };

  await ctx.supabase.from("activity_log").insert({
    tenant_id: ctx.tenantId,
    actor_id: ctx.userId,
    event: "component.image_uploaded",
    metadata: { component_id: componentId },
  });

  revalidatePath(`/app/components/${componentId}`);
  return { imageUrl: versioned };
}
```

- [ ] **Step 3: Add `fetchComponentImageFromNexar`**

Append immediately after `uploadComponentImage`:

```typescript
export async function fetchComponentImageFromNexar(componentId: string): Promise<
  | { found: true; imageUrl: string }
  | { found: false; reason: "no_part_number" | "no_results" | "api_error" }
> {
  const ctx = await getServerTenantContext();
  if (!ctx) return { found: false, reason: "api_error" };

  // Look up preferred supplier part number
  const { data: sc } = await ctx.supabase
    .from("supplier_components")
    .select("supplier_part_number, suppliers(name)")
    .eq("component_id", componentId)
    .eq("tenant_id", ctx.tenantId)
    .eq("is_preferred", true)
    .maybeSingle();

  const partNumber = sc?.supplier_part_number?.trim();
  if (!partNumber) return { found: false, reason: "no_part_number" };

  // suppliers may be returned as an object or array depending on join shape
  const supplierName = Array.isArray(sc.suppliers)
    ? (sc.suppliers[0] as { name: string } | undefined)?.name ?? ""
    : (sc.suppliers as { name: string } | null)?.name ?? "";

  const nexarResult = await searchComponentImage(
    `${partNumber} ${supplierName}`.trim()
  );

  if (!nexarResult.found) {
    await ctx.supabase.from("activity_log").insert({
      tenant_id: ctx.tenantId,
      actor_id: ctx.userId,
      event: "component.image_fetch_failed",
      metadata: { component_id: componentId, reason: nexarResult.reason },
    });
    return { found: false, reason: nexarResult.reason };
  }

  // Download from Nexar CDN and store in our bucket
  let imageBytes: ArrayBuffer;
  let contentType = "image/jpeg";
  try {
    const imgResp = await fetch(nexarResult.imageUrl);
    if (!imgResp.ok) throw new Error(`Download failed: ${imgResp.status}`);
    contentType = imgResp.headers.get("content-type") ?? "image/jpeg";
    imageBytes = await imgResp.arrayBuffer();
  } catch {
    return { found: false, reason: "api_error" };
  }

  const storagePath = `${ctx.tenantId}/${componentId}`;
  const { error: uploadErr } = await ctx.supabase.storage
    .from("component-images")
    .upload(storagePath, imageBytes, { contentType, upsert: true });
  if (uploadErr) return { found: false, reason: "api_error" };

  const {
    data: { publicUrl },
  } = ctx.supabase.storage.from("component-images").getPublicUrl(storagePath);
  const versioned = `${publicUrl}?v=${Date.now()}`;

  await ctx.supabase
    .from("component")
    .update({ image_url: versioned })
    .eq("id", componentId)
    .eq("tenant_id", ctx.tenantId);

  await ctx.supabase.from("activity_log").insert({
    tenant_id: ctx.tenantId,
    actor_id: ctx.userId,
    event: "component.image_fetched",
    metadata: {
      component_id: componentId,
      mpn: nexarResult.mpn,
      manufacturer: nexarResult.manufacturer,
    },
  });

  revalidatePath(`/app/components/${componentId}`);
  return { found: true, imageUrl: versioned };
}
```

- [ ] **Step 4: Add `removeComponentImage`**

Append after `fetchComponentImageFromNexar`:

```typescript
export async function removeComponentImage(
  componentId: string
): Promise<{ error?: string }> {
  const ctx = await getServerTenantContext();
  if (!ctx) return { error: "Not authenticated" };

  const storagePath = `${ctx.tenantId}/${componentId}`;
  // Ignore storage delete errors — file may not exist
  await ctx.supabase.storage.from("component-images").remove([storagePath]);

  const { error: dbErr } = await ctx.supabase
    .from("component")
    .update({ image_url: null })
    .eq("id", componentId)
    .eq("tenant_id", ctx.tenantId);
  if (dbErr) return { error: dbErr.message };

  await ctx.supabase.from("activity_log").insert({
    tenant_id: ctx.tenantId,
    actor_id: ctx.userId,
    event: "component.image_removed",
    metadata: { component_id: componentId },
  });

  revalidatePath(`/app/components/${componentId}`);
  return {};
}
```

- [ ] **Step 5: Confirm TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors relating to the new actions

- [ ] **Step 6: Commit**

```bash
git add src/app/app/components/actions.ts
git commit -m "feat(components): add uploadComponentImage, fetchComponentImageFromNexar, removeComponentImage server actions"
```

---

### Task 4: ComponentImage client component

**Goal:** A self-contained `"use client"` component that owns all image interaction — display, upload, find, remove — using `useTransition` for loading state and inline error text for feedback (the codebase has no toast library).

**Files:**
- Create: `src/app/app/components/[componentId]/component-image.tsx`
- Create: `src/app/app/components/[componentId]/component-image.module.css`

**Acceptance Criteria:**
- [ ] 96×96 image displays when `initialImageUrl` is set; grey placeholder with camera SVG when not
- [ ] Upload button opens file picker; validates type and size client-side before calling server action
- [ ] "Find image" button shown only when `hasSupplierPartNumber && !imageUrl`; spins during `isPending`
- [ ] Remove button shown only when `imageUrl` is set
- [ ] All buttons disabled during `isPending`
- [ ] Inline `<p>` error message below controls; clears on next action attempt
- [ ] Uses design system tokens only — no hardcoded colours

**Verify:** Run `npm run dev`, open a component detail page, confirm image slot and controls render. Test upload + remove manually.

**Steps:**

- [ ] **Step 1: Create the CSS module**

Create `src/app/app/components/[componentId]/component-image.module.css`:

```css
.imageSection {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  flex-shrink: 0;
}

.imageSlot {
  width: 96px;
  height: 96px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--stroke-card);
  background: var(--surface-1);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.image {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.placeholder {
  color: var(--ink-faint);
  display: flex;
  align-items: center;
  justify-content: center;
}

.controls {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.controlBtn {
  composes: secondary from "../../_ui/buttons.module.css";
  font-size: var(--fs-xs);
}

.errorMsg {
  font-size: var(--fs-xs);
  color: var(--danger);
  margin-top: 2px;
}
```

- [ ] **Step 2: Create the client component**

Create `src/app/app/components/[componentId]/component-image.tsx`:

```tsx
"use client";

import { useRef, useState, useTransition } from "react";
import {
  uploadComponentImage,
  fetchComponentImageFromNexar,
  removeComponentImage,
} from "../actions";
import styles from "./component-image.module.css";

interface Props {
  componentId: string;
  initialImageUrl: string | null;
  /** True when the component has a preferred supplier_components row with a non-empty supplier_part_number */
  hasSupplierPartNumber: boolean;
}

export default function ComponentImage({
  componentId,
  initialImageUrl,
  hasSupplierPartNumber,
}: Props) {
  const [imageUrl, setImageUrl] = useState<string | null>(initialImageUrl);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowed = ["image/png", "image/jpeg", "image/webp"];
    if (!allowed.includes(file.type)) {
      setError("Use PNG, JPEG, or WebP");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be under 5 MB");
      return;
    }

    setError(null);
    const formData = new FormData();
    formData.append("image", file);

    startTransition(async () => {
      const result = await uploadComponentImage(componentId, formData);
      if (result.error) {
        setError(result.error);
      } else if (result.imageUrl) {
        setImageUrl(result.imageUrl);
      }
      // Reset so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    });
  }

  function handleFind() {
    setError(null);
    startTransition(async () => {
      const result = await fetchComponentImageFromNexar(componentId);
      if (result.found) {
        setImageUrl(result.imageUrl);
      } else if (result.reason === "no_results") {
        setError("No image found — try uploading one manually");
      } else {
        setError("Image lookup failed — try again or upload your own");
      }
    });
  }

  function handleRemove() {
    setError(null);
    startTransition(async () => {
      const result = await removeComponentImage(componentId);
      if (result.error) {
        setError(result.error);
      } else {
        setImageUrl(null);
      }
    });
  }

  return (
    <div className={styles.imageSection}>
      <div className={styles.imageSlot}>
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt="Component" className={styles.image} />
        ) : (
          <div className={styles.placeholder} aria-hidden="true">
            {/* Camera icon */}
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </div>
        )}
      </div>

      {/* Hidden file input triggered by Upload button */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFileChange}
        style={{ display: "none" }}
        aria-hidden="true"
      />

      <div className={styles.controls}>
        <button
          type="button"
          className={styles.controlBtn}
          onClick={() => fileInputRef.current?.click()}
          disabled={isPending}
          aria-label={imageUrl ? "Replace component image" : "Upload component image"}
        >
          ↑ Upload
        </button>

        {!imageUrl && hasSupplierPartNumber && (
          <button
            type="button"
            className={styles.controlBtn}
            onClick={handleFind}
            disabled={isPending}
            aria-label="Find image from supplier catalog"
          >
            {isPending ? "Searching…" : "🔍 Find image"}
          </button>
        )}

        {imageUrl && (
          <button
            type="button"
            className={styles.controlBtn}
            onClick={handleRemove}
            disabled={isPending}
            aria-label="Remove component image"
          >
            🗑 Remove
          </button>
        )}
      </div>

      {error && <p className={styles.errorMsg}>{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Confirm TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/app/app/components/[componentId]/component-image.tsx \
        src/app/app/components/[componentId]/component-image.module.css
git commit -m "feat(components): add ComponentImage client component"
```

---

### Task 5: Wire into component detail page

**Goal:** Include `image_url` in the server-side data fetch, compute `hasPreferredPartNumber` from the existing supplier catalog query, add an `imageRow` layout class, and render `<ComponentImage>` at the top-left of the info card.

**Files:**
- Modify: `src/app/app/components/[componentId]/page.tsx`
- Modify: `src/app/app/components/[componentId]/page.module.css`

**Acceptance Criteria:**
- [ ] `image_url` is selected in the Supabase query and present on the component object
- [ ] `hasPreferredPartNumber` is `true` when any preferred `supplier_components` row has a non-empty `supplier_part_number`
- [ ] `<ComponentImage>` renders above the component name in the `aside.infoCard`
- [ ] No TypeScript errors; `npm run dev` starts cleanly

**Verify:** `npm run dev` → open `/app/components/{any-id}` → confirm image slot appears at the top of the info card.

**Steps:**

- [ ] **Step 1: Add `image_url` to the `ComponentRecord` type**

In `page.tsx`, find the `ComponentRecord` type (around line 15 — it has fields like `id`, `name`, `sku`, `unit`, etc.). Add `image_url`:

```typescript
type ComponentRecord = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  cost_per_unit: number;
  reorder_point: number;
  low_stock_level: number;
  archived_at: string | null;
  supplier_id: string | null;
  group_id: string | null;
  created_at: string | null;
  bin_sub_location_id: string | null;
  bin_aisle_id: string | null;
  bin_bay_id: string | null;
  tenant_id: string;
  image_url: string | null;   // ← add
  supplier: { name: string } | Array<{ name: string }> | null;
  location: { name: string } | Array<{ name: string }> | null;
  group: { name: string } | Array<{ name: string }> | null;
};
```

- [ ] **Step 2: Add `image_url` to the Supabase select**

Find the `.from("component").select(...)` call in the data fetch. It will be a long template string. Add `image_url` to it (alongside `sku`, `unit`, etc.):

```typescript
// Find the select string and add image_url. The existing string looks like:
//   "id, name, sku, unit, cost_per_unit, reorder_point, low_stock_level,
//    archived_at, supplier_id, group_id, created_at, tenant_id,
//    bin_sub_location_id, bin_aisle_id, bin_bay_id,
//    supplier:suppliers(name), location:location(name), group:component_group(name)"
//
// Add image_url before the relational joins:
`id, name, sku, unit, cost_per_unit, reorder_point, low_stock_level,
 archived_at, supplier_id, group_id, created_at, tenant_id,
 bin_sub_location_id, bin_aisle_id, bin_bay_id,
 image_url,
 supplier:suppliers(name), location:location(name), group:component_group(name)`
```

- [ ] **Step 3: Compute `hasPreferredPartNumber` from the existing supplier catalog**

The page fetches a `supplierCatalog` array (the `supplier_components` rows for this component). Find that fetch and ensure `supplier_part_number` is included in its select. Then add the derived boolean after the fetch:

```typescript
// Find the query for supplier_components, e.g.:
//   const { data: supplierCatalog } = await ctx.supabase
//     .from("supplier_components")
//     .select("id, supplier_id, unit_cost, ...")
//     .eq("component_id", componentId)
//
// Make sure "supplier_part_number, is_preferred" are in the select.
// Then after the parallel fetches resolve, compute:

const hasPreferredPartNumber = (supplierCatalog ?? []).some(
  (sc: { is_preferred: boolean; supplier_part_number: string | null }) =>
    sc.is_preferred && !!sc.supplier_part_number?.trim()
);
```

- [ ] **Step 4: Import `ComponentImage` and add `.imageRow` to CSS**

Add the import at the top of `page.tsx`:

```typescript
import ComponentImage from "./component-image";
```

In `page.module.css`, add the layout class:

```css
.imageRow {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}
```

- [ ] **Step 5: Render `<ComponentImage>` in the info card**

In the JSX, find `<aside className={styles.infoCard}>`. The current structure starts with `<h1 className={styles.componentName}>`. Wrap the `h1`, SKU badge, and alarm banner in an `imageRow` div alongside `<ComponentImage>`:

```tsx
<aside className={styles.infoCard}>
  {/* Image + name row */}
  <div className={styles.imageRow}>
    <ComponentImage
      componentId={componentId}
      initialImageUrl={c.image_url}
      hasSupplierPartNumber={hasPreferredPartNumber}
    />
    <div>
      <h1 className={styles.componentName}>{c.name}</h1>
      {c.sku && <span className={styles.skuBadge}>{c.sku}</span>}
      {status !== "ok" && (
        <div className={styles.alarmBanner}>
          {/* existing alarm banner content — keep as-is */}
        </div>
      )}
    </div>
  </div>

  {/* Everything below this line is unchanged */}
  <div className={styles.metaGrid}>
    {/* ... */}
  </div>
  {/* ... cardActions, tabs, etc. ... */}
</aside>
```

- [ ] **Step 6: Verify and commit**

```bash
npx tsc --noEmit
npm run dev
# Open http://localhost:3000/app/components/{any-id}
# Confirm: image slot visible, controls present, no console errors
```

```bash
git add src/app/app/components/[componentId]/page.tsx \
        src/app/app/components/[componentId]/page.module.css
git commit -m "feat(components): render ComponentImage in detail page info card"
```

---

### Task 6: Goods Inwards thumbnail column

**Goal:** Add `image_url` to the components fetch in both goods-inwards page files, add a `ComponentThumbnail` helper to `receipt-form.tsx`, and render a thumbnail as the first column in the receive lines table.

**Files:**
- Modify: `src/app/app/goods-inwards/receipt-form.tsx`
- Modify: `src/app/app/goods-inwards/new/page.tsx`
- Modify: `src/app/app/goods-inwards/[id]/page.tsx`

**Acceptance Criteria:**
- [ ] A 40px-wide thumbnail column is the first column in the receive lines table
- [ ] Components with `image_url` show a 36×36 `<img>` with `object-fit: contain`
- [ ] Components without an image show a grey placeholder box with a camera SVG icon
- [ ] Table header for the thumbnail column is blank (no text label)
- [ ] No upload controls — this view is read-only for images

**Verify:** `npm run dev` → open Goods Inwards → create or open a receipt with lines → confirm thumbnail column appears on each line row.

**Steps:**

- [ ] **Step 1: Add `image_url` to the `Component` type in `receipt-form.tsx`**

Near the top of `receipt-form.tsx`, find the `Component` interface (it has at minimum `id`, `name`, `sku`). Add `image_url`:

```typescript
interface Component {
  id: string;
  name: string;
  sku: string | null;
  image_url: string | null;   // ← add
  // keep any other existing fields
}
```

- [ ] **Step 2: Update the components fetch in `new/page.tsx`**

Open `src/app/app/goods-inwards/new/page.tsx`. Find the Supabase query that fetches components for the form (look for `.from("component").select(...)`). Add `image_url`:

```typescript
// Before (example — actual field list may vary):
.from("component").select("id, name, sku, unit, cost_per_unit, ...")

// After:
.from("component").select("id, name, sku, unit, cost_per_unit, image_url, ...")
```

- [ ] **Step 3: Update the components fetch in `[id]/page.tsx`**

Open `src/app/app/goods-inwards/[id]/page.tsx`. Apply the same `image_url` addition to the components select as in Step 2.

- [ ] **Step 4: Add `ComponentThumbnail` helper to `receipt-form.tsx`**

After the imports and before the `componentLabel` function, add:

```tsx
function ComponentThumbnail({
  imageUrl,
  name,
}: {
  imageUrl: string | null;
  name: string;
}) {
  const slotStyle: React.CSSProperties = {
    width: 36,
    height: 36,
    borderRadius: 6,
    background: "var(--surface-1)",
    border: "1px solid var(--stroke-card)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
  };

  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={name}
        style={{ ...slotStyle, objectFit: "contain" }}
      />
    );
  }

  return (
    <div style={slotStyle} aria-hidden="true">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--ink-faint)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
    </div>
  );
}
```

- [ ] **Step 5: Add blank column header to the lines table `<thead>`**

Find the `<thead>` of the receive lines table. Add a blank `<th>` as the first column:

```tsx
<thead>
  <tr>
    <th style={{ width: 40 }} aria-label="Image" />   {/* ← add */}
    <th>Component</th>
    {/* ... existing headers unchanged ... */}
  </tr>
</thead>
```

- [ ] **Step 6: Add thumbnail `<td>` as first cell in each line row**

In the `lines.map((line) => ...)` block, add a `<td>` as the first cell of each `<tr>`:

```tsx
{lines.map((line) => (
  <tr key={line.key}>
    {/* Thumbnail — first cell */}
    <td style={{ width: 40, paddingRight: 0, verticalAlign: "middle" }}>
      {(() => {
        const c = components.find((c) => c.id === line.component_id);
        return (
          <ComponentThumbnail
            imageUrl={c?.image_url ?? null}
            name={c?.name ?? ""}
          />
        );
      })()}
    </td>

    {/* Component name/select cell — unchanged */}
    <td>
      {/* ... existing component cell content ... */}
    </td>
    {/* ... rest of cells unchanged ... */}
  </tr>
))}
```

- [ ] **Step 7: Verify and commit**

```bash
npx tsc --noEmit
npm run dev
# Open Goods Inwards → create or open a receipt with lines
# Confirm thumbnail column present; components with images show them
```

```bash
git add src/app/app/goods-inwards/receipt-form.tsx \
        src/app/app/goods-inwards/new/page.tsx \
        src/app/app/goods-inwards/[id]/page.tsx
git commit -m "feat(goods-inwards): add component image thumbnail column to receive lines table"
```
