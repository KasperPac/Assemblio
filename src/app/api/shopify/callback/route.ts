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
