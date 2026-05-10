# Shopify Install Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Shopify App Store install pipeline — a flow that lets a merchant who may not have a Manuva account install the app, sign in or create a trial account inline, and end up with their Shopify store linked and webhooks registered.

**Architecture:** The existing `auth/route.ts` → `callback/route.ts` flow handles "connect Shopify from within Manuva settings" and requires the user to be logged in. This plan adds a parallel "install from Shopify App Store" path: a new `install/route.ts` entry point (which Shopify hits when a merchant clicks Install) initiates OAuth with a possibly-null `tenantId` in state; the callback detects the null case and, after exchanging the code for an access token, stores it in a short-lived HMAC-signed cookie and redirects to a new `shopify-connect` page where the merchant signs in or creates a trial account, after which a server action completes the DB writes and webhook registration.

**Tech Stack:** Next.js 15 App Router, Supabase (admin client for auth user creation), `@shopify/shopify-api`-free (we use the existing raw crypto helpers in `src/lib/shopify/auth.ts` and `src/lib/shopify/client.ts`), Vitest.

---

## Context: What Already Exists

Before touching anything, read these files:

- `src/lib/shopify/auth.ts` — `isValidShopDomain`, `normalizeShopDomain`, `buildShopifyAuthUrl`, `generateStateNonce`, `signPayload`, `verifySignedPayload`, `verifyShopifyCallbackHmac`, `verifyWebhookHmac`, `getShopifyOAuthConfig`
- `src/lib/shopify/client.ts` — `shopifyGraphqlRequest`, `registerRequiredWebhooks`
- `src/app/api/shopify/auth/route.ts` — existing in-app connect flow (always has tenantId, do NOT modify)
- `src/app/api/shopify/callback/route.ts` — OAuth callback (needs modification in Task 2)
- `src/app/api/shopify/webhooks/route.ts` — webhook handler (no changes)
- `supabase/schema.sql` and `supabase/patches/shopify_app_patch.sql` — DB tables

The `shopify_store` table has `tenant_id uuid not null` — we cannot store a store without a tenant. Pending state lives in a signed cookie, not in the DB.

## File Structure

| Action | Path | Responsibility |
|---|---|---|
| Create | `src/lib/shopify/pending-install.ts` | Sign/verify pending install cookie |
| Create | `src/lib/shopify/pending-install.test.ts` | Tests for pending install helpers |
| Create | `src/app/api/shopify/install/route.ts` | Shopify App Store install entry point |
| Modify | `src/app/api/shopify/callback/route.ts` | Add null-tenantId branch |
| Create | `src/app/app/shopify-connect/page.tsx` | Server-rendered page (checks cookie, renders client UI) |
| Create | `src/app/app/shopify-connect/shopify-connect-content.tsx` | Client component with sign-in/sign-up forms |
| Create | `src/app/app/shopify-connect/actions.ts` | Server actions: sign-in+link, sign-up+create+link |
| Create | `src/app/app/shopify-connect/shopify-connect.module.css` | Page styles |

---

## Task 0: Pending Install Cookie Helpers

**Goal:** Create `signPendingInstall` and `verifyPendingInstall` — pure functions that encode/decode a short-lived, HMAC-signed, HttpOnly cookie carrying the pending Shopify access token.

**Files:**
- Create: `src/lib/shopify/pending-install.ts`
- Create: `src/lib/shopify/pending-install.test.ts`

**Acceptance Criteria:**
- [ ] `signPendingInstall` returns a string in `base64url(JSON).HMAC` format
- [ ] `verifyPendingInstall` returns `PendingInstall` for a valid, unexpired cookie
- [ ] `verifyPendingInstall` returns `null` for tampered, expired, or malformed cookies
- [ ] Tests pass: `npm test -- pending-install`

**Verify:** `npm test -- pending-install` → all tests PASS, no type errors from `npx tsc --noEmit`

**Steps:**

- [ ] **Step 1: Write the failing tests**

Create `src/lib/shopify/pending-install.test.ts`:

```typescript
import { describe, expect, it, beforeAll } from "vitest";
import { signPendingInstall, verifyPendingInstall } from "./pending-install";

beforeAll(() => {
  process.env.SHOPIFY_API_SECRET = "test-secret-32-chars-long-abcdef";
});

describe("signPendingInstall / verifyPendingInstall", () => {
  it("round-trips a valid pending install", () => {
    const cookie = signPendingInstall("mystore.myshopify.com", "tok_abc123", "read_orders,write_orders");
    const result = verifyPendingInstall(cookie);
    expect(result).toEqual({
      shop: "mystore.myshopify.com",
      accessToken: "tok_abc123",
      scopes: "read_orders,write_orders",
    });
  });

  it("returns null for a tampered cookie", () => {
    const cookie = signPendingInstall("mystore.myshopify.com", "tok_abc123", "read_orders");
    const tampered = cookie.slice(0, -4) + "xxxx";
    expect(verifyPendingInstall(tampered)).toBeNull();
  });

  it("returns null for a malformed cookie (no dot)", () => {
    expect(verifyPendingInstall("nodothere")).toBeNull();
  });

  it("returns null for an expired cookie", () => {
    // Mock Date.now to be 11 minutes in the future after signing
    const cookie = signPendingInstall("mystore.myshopify.com", "tok_abc", "");
    const realNow = Date.now;
    Date.now = () => realNow() + 11 * 60 * 1000;
    const result = verifyPendingInstall(cookie);
    Date.now = realNow;
    expect(result).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(verifyPendingInstall("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- pending-install`
Expected: FAIL — `pending-install` module not found

- [ ] **Step 3: Write the implementation**

Create `src/lib/shopify/pending-install.ts`:

```typescript
import { createHmac, timingSafeEqual } from "crypto";

export type PendingInstall = {
  shop: string;
  accessToken: string;
  scopes: string;
};

const TTL_MS = 10 * 60 * 1000;

export function signPendingInstall(shop: string, accessToken: string, scopes: string): string {
  const payload = { shop, accessToken, scopes, exp: Date.now() + TTL_MS };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const secret = process.env.SHOPIFY_API_SECRET ?? "";
  const sig = createHmac("sha256", secret).update(encoded).digest("hex");
  return `${encoded}.${sig}`;
}

export function verifyPendingInstall(cookie: string): PendingInstall | null {
  const dotIndex = cookie.lastIndexOf(".");
  if (dotIndex === -1) return null;

  const encoded = cookie.slice(0, dotIndex);
  const receivedSig = cookie.slice(dotIndex + 1);
  if (!encoded || !receivedSig) return null;

  const secret = process.env.SHOPIFY_API_SECRET ?? "";
  const expectedSig = createHmac("sha256", secret).update(encoded).digest("hex");

  const a = Buffer.from(expectedSig, "hex");
  const b = Buffer.from(receivedSig, "hex");
  if (a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;

  let payload: { shop?: string; accessToken?: string; scopes?: string; exp?: number };
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof payload.shop !== "string" || !payload.shop) return null;
  if (typeof payload.accessToken !== "string" || !payload.accessToken) return null;
  if (typeof payload.exp !== "number") return null;
  if (payload.exp < Date.now()) return null;

  return {
    shop: payload.shop,
    accessToken: payload.accessToken,
    scopes: payload.scopes ?? "",
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- pending-install`
Expected: all 5 tests PASS

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/lib/shopify/pending-install.ts src/lib/shopify/pending-install.test.ts
git commit -m "feat(shopify): add pending install cookie helpers"
```

---

## Task 1: Install Route — Shopify App Store Entry Point

**Goal:** Create `GET /api/shopify/install` — the URL Shopify hits when a merchant clicks "Install". Validates the shop and HMAC, then initiates OAuth with a `tenantId` (if the merchant is already logged into Manuva) or `null` (if not).

**Files:**
- Create: `src/app/api/shopify/install/route.ts`

**Acceptance Criteria:**
- [ ] Returns 503 if Shopify env vars are not set
- [ ] Returns 403 if `hmac` param is present but invalid
- [ ] Returns 400 if `shop` param is missing or malformed
- [ ] Sets `shopify_oauth_state` cookie with `tenantId: null` when user is not logged in
- [ ] Sets `shopify_oauth_state` cookie with the correct `tenantId` when user is logged in
- [ ] Redirects to `https://<shop>/admin/oauth/authorize` with correct params
- [ ] Type-checks cleanly

**Verify:** `npx tsc --noEmit` → no errors. Manual test via dev server: visiting `/api/shopify/install?shop=test.myshopify.com` (without valid HMAC) should return 403.

**Steps:**

- [ ] **Step 1: Create the route**

Create `src/app/api/shopify/install/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildShopifyAuthUrl,
  generateStateNonce,
  getShopifyOAuthConfig,
  isValidShopDomain,
  normalizeShopDomain,
  signPayload,
  verifyShopifyCallbackHmac,
} from "@/lib/shopify/auth";

type OAuthState = {
  nonce: string;
  shop: string;
  tenantId: string | null;
  exp: number;
};

export async function GET(request: NextRequest) {
  const oauthConfig = getShopifyOAuthConfig();
  if (!oauthConfig.ok) {
    return new NextResponse("Shopify app is not configured.", { status: 503 });
  }

  // Shopify sends hmac on install requests — same algorithm as callbacks.
  // If present, it must be valid. If absent (e.g. manual testing), allow through.
  if (
    request.nextUrl.searchParams.has("hmac") &&
    !verifyShopifyCallbackHmac(request.nextUrl)
  ) {
    return new NextResponse("Invalid HMAC.", { status: 403 });
  }

  const shopParam = request.nextUrl.searchParams.get("shop") ?? "";
  const shop = normalizeShopDomain(shopParam);
  if (!isValidShopDomain(shop)) {
    return new NextResponse("Invalid shop domain.", { status: 400 });
  }

  // Determine tenantId if the merchant is already logged into Manuva.
  let tenantId: string | null = null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .maybeSingle();
    tenantId = profile?.tenant_id ?? null;
  }

  const state: OAuthState = {
    nonce: generateStateNonce(),
    shop,
    tenantId,
    exp: Date.now() + 10 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(state)).toString("base64url");
  const sig = signPayload(encoded);
  const cookieValue = `${encoded}.${sig}`;

  const redirectUrl = buildShopifyAuthUrl(shop, state.nonce);
  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set("shopify_oauth_state", cookieValue, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
  return response;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/api/shopify/install/route.ts
git commit -m "feat(shopify): add install route for Shopify App Store entry"
```

---

## Task 2: Callback — Add Null-TenantId (Pending Install) Path

**Goal:** Modify `src/app/api/shopify/callback/route.ts` to handle the case where `tenantId` is `null` in the OAuth state. In this case, after exchanging the code for a token: if the user is now logged in, complete inline; otherwise sign a pending install cookie and redirect to `/app/shopify-connect`.

**Files:**
- Modify: `src/app/api/shopify/callback/route.ts`

**Acceptance Criteria:**
- [ ] Existing path (tenantId present) is completely unchanged
- [ ] When `tenantId` is null and user is now logged in: completes store upsert and redirects to `/api/shopify/auth` success path
- [ ] When `tenantId` is null and user is not logged in: sets `shopify_pending_install` cookie and redirects to `/app/shopify-connect?shop=<shop>`
- [ ] Clears `shopify_oauth_state` cookie on all paths out
- [ ] Type-checks cleanly

**Verify:** `npx tsc --noEmit` → no errors.

**Steps:**

- [ ] **Step 1: Read the full current file**

Read `src/app/api/shopify/callback/route.ts` completely before making changes.

- [ ] **Step 2: Replace the file with the updated version**

The full updated `src/app/api/shopify/callback/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getShopifyOAuthConfig,
  isValidShopDomain,
  normalizeShopDomain,
  verifyShopifyCallbackHmac,
  verifySignedPayload,
} from "@/lib/shopify/auth";
import { registerRequiredWebhooks } from "@/lib/shopify/client";
import { signPendingInstall } from "@/lib/shopify/pending-install";

type OAuthState = {
  nonce: string;
  shop: string;
  tenantId: string | null;
  exp: number;
};

function clearStateCookie(response: NextResponse) {
  response.cookies.set("shopify_oauth_state", "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

async function upsertStoreAndToken(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  tenantId: string,
  shop: string,
  accessToken: string,
  scopes: string
): Promise<"ok" | "conflict" | "store-save-failed" | "token-save-failed"> {
  const { data: conflict } = await admin
    .from("shopify_store")
    .select("id,tenant_id")
    .eq("store_domain", shop)
    .neq("tenant_id", tenantId)
    .limit(1);
  if ((conflict ?? []).length > 0) return "conflict";

  const { data: store, error: storeError } = await admin
    .from("shopify_store")
    .upsert(
      { tenant_id: tenantId, store_domain: shop, status: "active" },
      { onConflict: "tenant_id,store_domain" }
    )
    .select("id")
    .single();
  if (storeError || !store) return "store-save-failed";

  const { error: tokenError } = await admin.from("shopify_install_tokens").upsert(
    {
      tenant_id: tenantId,
      shopify_store_id: store.id,
      access_token: accessToken,
      scopes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "shopify_store_id" }
  );
  if (tokenError) return "token-save-failed";

  return "ok";
}

export async function GET(request: NextRequest) {
  const oauthConfig = getShopifyOAuthConfig();
  if (!oauthConfig.ok) {
    return NextResponse.redirect(
      new URL("/app/settings?shopify=config-missing", request.url)
    );
  }

  if (!verifyShopifyCallbackHmac(request.nextUrl)) {
    return NextResponse.redirect(
      new URL("/app/settings?shopify=invalid-hmac", request.url)
    );
  }

  const shop = normalizeShopDomain(
    request.nextUrl.searchParams.get("shop") ?? ""
  );
  const code = request.nextUrl.searchParams.get("code") ?? "";
  const state = request.nextUrl.searchParams.get("state") ?? "";
  if (!isValidShopDomain(shop) || !code || !state) {
    return NextResponse.redirect(
      new URL("/app/settings?shopify=invalid-callback", request.url)
    );
  }

  // Verify and decode the state cookie.
  const signedCookie = request.cookies.get("shopify_oauth_state")?.value ?? "";
  const dotIndex = signedCookie.lastIndexOf(".");
  if (dotIndex === -1) {
    return NextResponse.redirect(
      new URL("/app/settings?shopify=state-missing", request.url)
    );
  }
  const encoded = signedCookie.slice(0, dotIndex);
  const sig = signedCookie.slice(dotIndex + 1);
  if (!encoded || !sig || !verifySignedPayload(encoded, sig)) {
    return NextResponse.redirect(
      new URL("/app/settings?shopify=state-missing", request.url)
    );
  }

  let parsed: OAuthState;
  try {
    parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    return NextResponse.redirect(
      new URL("/app/settings?shopify=state-invalid", request.url)
    );
  }
  if (parsed.exp < Date.now()) {
    return NextResponse.redirect(
      new URL("/app/settings?shopify=state-expired", request.url)
    );
  }
  if (parsed.nonce !== state) {
    return NextResponse.redirect(
      new URL("/app/settings?shopify=state-nonce-mismatch", request.url)
    );
  }
  if (parsed.shop !== shop) {
    const mismatchUrl = new URL("/app/settings", request.url);
    mismatchUrl.searchParams.set("shopify", "state-shop-mismatch");
    mismatchUrl.searchParams.set("expected_shop", parsed.shop);
    mismatchUrl.searchParams.set("returned_shop", shop);
    return NextResponse.redirect(mismatchUrl);
  }

  // ── PATH A: tenantId was embedded at install time (user was logged in) ──────
  if (parsed.tenantId !== null) {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.redirect(
        new URL("/login?redirect=/app/settings", request.url)
      );
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .maybeSingle();
    if (!profile?.tenant_id || profile.tenant_id !== parsed.tenantId) {
      return NextResponse.redirect(
        new URL("/app/settings?shopify=tenant-mismatch", request.url)
      );
    }

    const { apiKey, apiSecret } = oauthConfig;
    const tokenResponse = await fetch(
      `https://${shop}/admin/oauth/access_token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: apiKey, client_secret: apiSecret, code }),
      }
    );
    if (!tokenResponse.ok) {
      return NextResponse.redirect(
        new URL("/app/settings?shopify=token-failed", request.url)
      );
    }
    const tokenData = (await tokenResponse.json()) as {
      access_token: string;
      scope?: string;
    };

    const admin = createSupabaseAdminClient();
    const result = await upsertStoreAndToken(
      admin,
      parsed.tenantId,
      shop,
      tokenData.access_token,
      tokenData.scope ?? ""
    );
    if (result !== "ok") {
      const response = NextResponse.redirect(
        new URL(`/app/settings?shopify=${result}`, request.url)
      );
      clearStateCookie(response);
      return response;
    }

    let status = "connected";
    try {
      await registerRequiredWebhooks(shop, tokenData.access_token);
    } catch {
      status = "connected-webhooks-failed";
    }

    const response = NextResponse.redirect(
      new URL(`/app/settings?shopify=${status}`, request.url)
    );
    clearStateCookie(response);
    return response;
  }

  // ── PATH B: tenantId was null — merchant was not logged in at install time ──
  const { apiKey, apiSecret } = oauthConfig;
  const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: apiKey, client_secret: apiSecret, code }),
  });
  if (!tokenResponse.ok) {
    const response = NextResponse.redirect(
      new URL("/app/shopify-connect?shopify=token-failed", request.url)
    );
    clearStateCookie(response);
    return response;
  }
  const tokenData = (await tokenResponse.json()) as {
    access_token: string;
    scope?: string;
  };

  // Check if the merchant signed into Manuva between starting OAuth and completing it.
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.tenant_id) {
      const admin = createSupabaseAdminClient();
      const result = await upsertStoreAndToken(
        admin,
        profile.tenant_id,
        shop,
        tokenData.access_token,
        tokenData.scope ?? ""
      );
      let status = result === "ok" ? "connected" : result;
      if (result === "ok") {
        try {
          await registerRequiredWebhooks(shop, tokenData.access_token);
        } catch {
          status = "connected-webhooks-failed";
        }
      }
      const response = NextResponse.redirect(
        new URL(`/app/settings?shopify=${status}`, request.url)
      );
      clearStateCookie(response);
      return response;
    }
  }

  // Not logged in — store token in signed pending cookie, send to shopify-connect.
  const pendingCookie = signPendingInstall(
    shop,
    tokenData.access_token,
    tokenData.scope ?? ""
  );
  const connectUrl = new URL("/app/shopify-connect", request.url);
  connectUrl.searchParams.set("shop", shop);
  const response = NextResponse.redirect(connectUrl);
  clearStateCookie(response);
  response.cookies.set("shopify_pending_install", pendingCookie, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
  return response;
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/app/api/shopify/callback/route.ts
git commit -m "feat(shopify): handle unauthenticated install path in callback"
```

---

## Task 3: shopify-connect Page and Actions

**Goal:** Create the page a merchant lands on after an unauthenticated install. It shows sign-in and sign-up (trial creation) tabs. The sign-in action links their existing tenant. The sign-up action creates a new tenant and user. Both actions complete the Shopify install (DB writes + webhooks) and redirect to the Shopify admin.

**Files:**
- Create: `src/app/app/shopify-connect/page.tsx`
- Create: `src/app/app/shopify-connect/shopify-connect-content.tsx`
- Create: `src/app/app/shopify-connect/actions.ts`
- Create: `src/app/app/shopify-connect/shopify-connect.module.css`

**Acceptance Criteria:**
- [ ] Page redirects to `/app/settings?shopify=install-expired` if no valid pending cookie
- [ ] Sign-in form: calls `signInAndLink`, displays errors inline
- [ ] Sign-up form: calls `signUpAndLink`, displays errors inline
- [ ] Sign-up validates that the email domain is not already claimed by another tenant
- [ ] After success, both actions redirect to `https://<shop>/admin`
- [ ] Page renders outside the main app shell (no sidebar)
- [ ] Type-checks cleanly

**Verify:** `npx tsc --noEmit` → no errors.

**Steps:**

- [ ] **Step 1: Create the server actions**

Create `src/app/app/shopify-connect/actions.ts`:

```typescript
"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { verifyPendingInstall } from "@/lib/shopify/pending-install";
import { registerRequiredWebhooks } from "@/lib/shopify/client";

export type ActionState = { error?: string };

async function getPendingInstall() {
  const cookieStore = await cookies();
  const raw = cookieStore.get("shopify_pending_install")?.value ?? "";
  return verifyPendingInstall(raw);
}

async function clearPendingCookie() {
  const cookieStore = await cookies();
  cookieStore.set("shopify_pending_install", "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

async function upsertStoreAndToken(
  tenantId: string,
  shop: string,
  accessToken: string,
  scopes: string
): Promise<string | null> {
  const admin = createSupabaseAdminClient();

  const { data: conflict } = await admin
    .from("shopify_store")
    .select("id")
    .eq("store_domain", shop)
    .neq("tenant_id", tenantId)
    .limit(1);
  if ((conflict ?? []).length > 0) return "This Shopify store is already linked to a different Manuva account.";

  const { data: store, error: storeError } = await admin
    .from("shopify_store")
    .upsert(
      { tenant_id: tenantId, store_domain: shop, status: "active" },
      { onConflict: "tenant_id,store_domain" }
    )
    .select("id")
    .single();
  if (storeError || !store) return "Failed to save Shopify store.";

  const { error: tokenError } = await admin.from("shopify_install_tokens").upsert(
    {
      tenant_id: tenantId,
      shopify_store_id: store.id,
      access_token: accessToken,
      scopes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "shopify_store_id" }
  );
  if (tokenError) return "Failed to save access token.";

  return null;
}

export async function signInAndLink(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const email = formData.get("email")?.toString() ?? "";
  const password = formData.get("password")?.toString() ?? "";
  if (!email || !password) return { error: "Email and password are required." };

  const pending = await getPendingInstall();
  if (!pending) return { error: "Install session expired. Start again from Shopify." };

  const supabase = await createSupabaseServerClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) return { error: signInError.message };

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in failed." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.tenant_id) return { error: "No workspace found for this account." };

  const linkError = await upsertStoreAndToken(
    profile.tenant_id,
    pending.shop,
    pending.accessToken,
    pending.scopes
  );
  if (linkError) return { error: linkError };

  await registerRequiredWebhooks(pending.shop, pending.accessToken).catch(() => {});
  await clearPendingCookie();

  redirect(`https://${pending.shop}/admin`);
}

export async function signUpAndLink(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const email = formData.get("email")?.toString() ?? "";
  const password = formData.get("password")?.toString() ?? "";
  const company = formData.get("company")?.toString() ?? "";
  if (!email || !password || !company) {
    return { error: "Company name, email, and password are required." };
  }

  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return { error: "Invalid email address." };

  const pending = await getPendingInstall();
  if (!pending) return { error: "Install session expired. Start again from Shopify." };

  const admin = createSupabaseAdminClient();

  const { data: existingDomain } = await admin
    .from("tenant_domain")
    .select("tenant_id")
    .eq("domain", domain)
    .maybeSingle();
  if (existingDomain) {
    return {
      error: "An account already exists for this email domain. Use Sign in instead.",
    };
  }

  const { data: tenant, error: tenantError } = await admin
    .from("tenant")
    .insert({ name: company })
    .select("id")
    .single();
  if (tenantError || !tenant) return { error: "Failed to create workspace." };

  const { error: domainError } = await admin
    .from("tenant_domain")
    .insert({ tenant_id: tenant.id, domain });
  if (domainError) return { error: "Failed to register email domain." };

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authError || !authData.user) {
    return { error: authError?.message ?? "Failed to create user." };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: authData.user.id,
    tenant_id: tenant.id,
    role: "admin",
    status: "active",
  });
  if (profileError) return { error: "Failed to create user profile." };

  const { error: accessError } = await admin.from("profile_tenant_access").insert({
    profile_id: authData.user.id,
    tenant_id: tenant.id,
    role: "admin",
  });
  if (accessError) return { error: "Failed to set up workspace access." };

  const supabase = await createSupabaseServerClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) {
    return { error: "Account created but sign-in failed. Sign in manually to continue." };
  }

  const linkError = await upsertStoreAndToken(
    tenant.id,
    pending.shop,
    pending.accessToken,
    pending.scopes
  );
  if (linkError) return { error: linkError };

  await registerRequiredWebhooks(pending.shop, pending.accessToken).catch(() => {});
  await clearPendingCookie();

  redirect(`https://${pending.shop}/admin`);
}
```

- [ ] **Step 2: Create the CSS module**

Create `src/app/app/shopify-connect/shopify-connect.module.css`:

```css
.page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-base);
  padding: 24px;
}

.card {
  width: 100%;
  max-width: 440px;
  padding: 36px 40px;
  border-radius: var(--radius-xl);
  border: 1px solid var(--stroke-card);
  background: var(--bg-card);
  box-shadow: var(--shadow-card);
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.eyebrow {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--ink-faint);
}

.title {
  margin: 4px 0 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--ink-strong);
}

.shopDomain {
  display: inline-block;
  margin-top: 6px;
  font-size: 0.88rem;
  font-weight: 500;
  color: var(--brand-1);
  background: var(--brand-dim, color-mix(in srgb, var(--brand-1) 12%, transparent));
  padding: 2px 10px;
  border-radius: var(--radius-pill);
}

.tabs {
  display: flex;
  border-bottom: 1px solid var(--stroke-card);
  gap: 0;
}

.tab {
  padding: 8px 16px;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--ink-muted);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: color 140ms ease, border-color 140ms ease;
  margin-bottom: -1px;
}

.tabActive {
  color: var(--ink-strong);
  border-bottom-color: var(--brand-1);
}

.form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form label {
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--ink-muted);
}

.form input {
  padding: 9px 12px;
  border-radius: var(--radius-lg);
  border: 1px solid var(--stroke-card);
  background: var(--surface-1);
  color: var(--ink-strong);
  font-size: 0.94rem;
  outline: none;
  transition: border-color 140ms ease;
}

.form input:focus {
  border-color: var(--brand-1);
}

.error {
  margin: 0;
  font-size: 0.84rem;
  color: var(--danger);
}

.submit {
  margin-top: 4px;
  padding: 10px 18px;
  border-radius: var(--radius-lg);
  border: none;
  background: var(--brand-1);
  color: #fff;
  font-size: 0.94rem;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 140ms ease;
}

.submit:hover { opacity: 0.88; }
.submit:disabled { opacity: 0.5; cursor: not-allowed; }
```

- [ ] **Step 3: Create the client content component**

Create `src/app/app/shopify-connect/shopify-connect-content.tsx`:

```tsx
"use client";

import { useState, useActionState } from "react";
import styles from "./shopify-connect.module.css";
import { signInAndLink, signUpAndLink } from "./actions";

const initial = { error: undefined };

export default function ShopifyConnectContent({ shopDomain }: { shopDomain: string }) {
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [signInState, signInAction, signInPending] = useActionState(signInAndLink, initial);
  const [signUpState, signUpAction, signUpPending] = useActionState(signUpAndLink, initial);

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div>
          <p className={styles.eyebrow}>Manuva</p>
          <h1 className={styles.title}>Connect your Shopify store</h1>
          <span className={styles.shopDomain}>{shopDomain}</span>
        </div>

        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === "signin" ? styles.tabActive : ""}`}
            onClick={() => setTab("signin")}
            type="button"
          >
            Sign in
          </button>
          <button
            className={`${styles.tab} ${tab === "signup" ? styles.tabActive : ""}`}
            onClick={() => setTab("signup")}
            type="button"
          >
            Start free trial
          </button>
        </div>

        {tab === "signin" && (
          <form className={styles.form} action={signInAction}>
            <label>
              Email
              <input name="email" type="email" placeholder="you@company.com" required />
            </label>
            <label>
              Password
              <input name="password" type="password" placeholder="••••••••" required />
            </label>
            {signInState.error && <p className={styles.error}>{signInState.error}</p>}
            <button className={styles.submit} type="submit" disabled={signInPending}>
              {signInPending ? "Signing in…" : "Sign in and connect"}
            </button>
          </form>
        )}

        {tab === "signup" && (
          <form className={styles.form} action={signUpAction}>
            <label>
              Company name
              <input name="company" type="text" placeholder="Acme Manufacturing" required />
            </label>
            <label>
              Email
              <input name="email" type="email" placeholder="you@company.com" required />
            </label>
            <label>
              Password
              <input name="password" type="password" placeholder="Create a password" required />
            </label>
            {signUpState.error && <p className={styles.error}>{signUpState.error}</p>}
            <button className={styles.submit} type="submit" disabled={signUpPending}>
              {signUpPending ? "Creating account…" : "Create account and connect"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create the server page**

Create `src/app/app/shopify-connect/page.tsx`:

```tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyPendingInstall } from "@/lib/shopify/pending-install";
import ShopifyConnectContent from "./shopify-connect-content";

export default async function ShopifyConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string; shopify?: string }>;
}) {
  const cookieStore = await cookies();
  const raw = cookieStore.get("shopify_pending_install")?.value ?? "";
  const pending = verifyPendingInstall(raw);

  if (!pending) {
    redirect("/app/settings?shopify=install-expired");
  }

  const params = await searchParams;
  const shopDisplay = params.shop ?? pending.shop;

  return <ShopifyConnectContent shopDomain={shopDisplay} />;
}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 6: Run all tests**

Run: `npm test`
Expected: all tests PASS (no regressions)

- [ ] **Step 7: Commit**

```bash
git add src/app/app/shopify-connect/
git commit -m "feat(shopify): add shopify-connect page for unauthenticated install flow"
```

---

## Task 4: Environment Variables and Shopify Partners Setup

**Goal:** Document the required environment variables and the Shopify Partners configuration needed before the install flow can be tested end-to-end.

**Files:**
- Modify: `.env.local` (or `.env.example` if one exists)

**Acceptance Criteria:**
- [ ] All 4 required env vars are documented and set in local dev
- [ ] Shopify Partners app has the correct redirect URI set
- [ ] App install URL is noted for testing

**Verify:** `curl -I "http://localhost:3000/api/shopify/install?shop=test.myshopify.com"` → 400 (invalid domain without `.myshopify.com` suffix) or 302 to Shopify OAuth.

**Steps:**

- [ ] **Step 1: Check and document env vars**

The following vars must be in `.env.local`:

```bash
SHOPIFY_API_KEY=<from Shopify Partners app credentials>
SHOPIFY_API_SECRET=<from Shopify Partners app credentials>
SHOPIFY_SCOPES=read_orders,write_orders
NEXT_PUBLIC_APP_URL=https://your-ngrok-url.ngrok.io   # or production URL
SHOPIFY_API_VERSION=2026-01                            # already defaulted in client.ts
```

- [ ] **Step 2: Set the redirect URI in Shopify Partners**

In the Shopify Partners dashboard → App setup → App URL and redirect URLs:
- App URL: `https://<your-domain>/api/shopify/install`
- Allowed redirect URL: `https://<your-domain>/api/shopify/callback`

For local dev, use `ngrok http 3000` to get a public HTTPS URL, then update `NEXT_PUBLIC_APP_URL` in `.env.local`.

- [ ] **Step 3: Test the install URL**

The direct install URL format:
```
https://<your-ngrok-url>/api/shopify/install?shop=<dev-store>.myshopify.com
```

Visit this URL while NOT logged into Manuva — you should be redirected through Shopify OAuth and land on the `/app/shopify-connect` page.

Visit this URL while logged into Manuva — you should be redirected through Shopify OAuth and land on `/app/settings?shopify=connected`.

---

## Self-Review Checklist

- [x] All `OAuthState.tenantId` references updated to `string | null` — only in new/modified files
- [x] `auth/route.ts` left untouched — it always has a tenantId and its flow is unchanged
- [x] Pending cookie uses HMAC-SHA256 (same key as `signPayload`) — no new secrets needed
- [x] `signUpAndLink` creates user with `email_confirm: true` — no email verification step blocks install
- [x] `signUpAndLink` sets `role: "admin"` on the new profiles row — owner of a new tenant should be admin
- [x] `upsertStoreAndToken` extracted to a shared helper (used in both callback and actions)
- [x] All DB errors return user-facing error strings rather than crashing
- [x] Webhook registration wrapped in `.catch(() => {})` — a failed webhook registration doesn't block install (consistent with existing callback behaviour)
- [x] Cookie `sameSite: "lax"` chosen over `"strict"` — Shopify redirects cross-site during OAuth, so `strict` would drop the cookie
