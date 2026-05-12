import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  buildShopifyAuthUrl,
  getShopifyOAuthConfig,
  generateStateNonce,
  isValidShopDomain,
  normalizeShopDomain,
  signPayload,
} from "@/lib/shopify/auth";

type OAuthState = {
  nonce: string;
  shop: string;
  tenantId: string;
  exp: number;
};

export async function GET(request: NextRequest) {
  const shopParam = request.nextUrl.searchParams.get("shop") ?? "";
  const shop = normalizeShopDomain(shopParam);
  const oauthConfig = getShopifyOAuthConfig();

  if (!oauthConfig.ok) {
    return NextResponse.redirect(
      new URL("/app/settings/integrations?shopify=config-missing", request.url)
    );
  }

  if (!isValidShopDomain(shop)) {
    return NextResponse.redirect(
      new URL("/app/settings/integrations?shopify=invalid-shop", request.url)
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL("/login?redirect=/app/settings/integrations", request.url));
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.tenant_id) {
    return NextResponse.redirect(
      new URL("/app/settings/integrations?shopify=missing-tenant", request.url)
    );
  }

  const state: OAuthState = {
    nonce: generateStateNonce(),
    shop,
    tenantId: profile.tenant_id,
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
