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

type OAuthState = {
  nonce: string;
  shop: string;
  tenantId: string;
  exp: number;
};

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

  const shop = normalizeShopDomain(request.nextUrl.searchParams.get("shop") ?? "");
  const code = request.nextUrl.searchParams.get("code") ?? "";
  const state = request.nextUrl.searchParams.get("state") ?? "";
  if (!isValidShopDomain(shop) || !code || !state) {
    return NextResponse.redirect(new URL("/app/settings?shopify=invalid-callback", request.url));
  }

  const signedCookie = request.cookies.get("shopify_oauth_state")?.value ?? "";
  const [encoded, sig] = signedCookie.split(".");
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
  if (parsed.nonce !== state || parsed.shop !== shop || parsed.exp < Date.now()) {
    return NextResponse.redirect(
      new URL("/app/settings?shopify=state-expired", request.url)
    );
  }

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
  const tokenResponse = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: apiKey,
      client_secret: apiSecret,
      code,
    }),
  });

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

  const { data: conflictingStores } = await admin
    .from("shopify_store")
    .select("id,tenant_id")
    .eq("store_domain", shop)
    .neq("tenant_id", parsed.tenantId)
    .limit(1);
  if ((conflictingStores ?? []).length > 0) {
    return NextResponse.redirect(
      new URL("/app/settings?shopify=tenant-store-conflict", request.url)
    );
  }

  const { data: store, error: storeError } = await admin
    .from("shopify_store")
    .upsert(
      {
        tenant_id: parsed.tenantId,
        store_domain: shop,
        status: "active",
      },
      { onConflict: "tenant_id,store_domain" }
    )
    .select("id")
    .single();

  if (storeError || !store) {
    return NextResponse.redirect(
      new URL("/app/settings?shopify=store-save-failed", request.url)
    );
  }

  const { error: tokenError } = await admin.from("shopify_install_tokens").upsert(
    {
      tenant_id: parsed.tenantId,
      shopify_store_id: store.id,
      access_token: tokenData.access_token,
      scopes: tokenData.scope ?? "",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "shopify_store_id" }
  );

  if (tokenError) {
    return NextResponse.redirect(
      new URL("/app/settings?shopify=token-save-failed", request.url)
    );
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
  response.cookies.set("shopify_oauth_state", "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
