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

  // Shopify always sends hmac on legitimate App Store install requests.
  // SHOPIFY_SKIP_HMAC_CHECK=true bypasses this for local dev (never set in production).
  const skipHmac = process.env.SHOPIFY_SKIP_HMAC_CHECK === "true";
  const hmacPresent = request.nextUrl.searchParams.has("hmac");
  if (!skipHmac && (!hmacPresent || !verifyShopifyCallbackHmac(request.nextUrl))) {
    return new NextResponse("Invalid HMAC.", { status: 403 });
  }
  if (skipHmac && hmacPresent && !verifyShopifyCallbackHmac(request.nextUrl)) {
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
