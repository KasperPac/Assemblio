import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  SessionTokenError,
  extractBearerToken,
  verifyShopifySessionTokenAny,
} from "@/lib/shopify/session-token";
import { getSubscriptionAccess } from "@/lib/subscription/access";

type SessionResponse =
  | { status: "not-installed" }
  | { status: "no-subscription"; tenantId: string; hasToken: boolean }
  | { status: "past_due_locked"; tenantId: string; hasToken: boolean }
  | {
      status: "ok";
      tenantId: string;
      storeId: string;
      shopDomain: string;
      hasToken: boolean;
      lastSyncedAt: string | null;
      lastSyncStatus: string | null;
    };

export async function POST(request: NextRequest) {
  const token = extractBearerToken(request.headers.get("authorization"));
  if (!token) {
    return new NextResponse("Missing session token", { status: 401 });
  }

  let verified;
  try {
    verified = verifyShopifySessionTokenAny(token);
  } catch (error) {
    const reason = error instanceof SessionTokenError ? error.reason : "verify-failed";
    return new NextResponse(`Invalid session token: ${reason}`, { status: 401 });
  }

  const shop = verified.shop;
  const admin = createSupabaseAdminClient();

  const { data: store } = await admin
    .from("shopify_store")
    .select("id, tenant_id, store_domain, last_synced_at, last_sync_status")
    .eq("store_domain", shop)
    .maybeSingle();

  if (!store) {
    const body: SessionResponse = { status: "not-installed" };
    return NextResponse.json(body);
  }

  // Whether we already hold an access token for this store. A Shopify-managed
  // install creates no token (it skips our OAuth callback), so the embedded
  // surface must run token-exchange to capture one — see embedded-client.tsx.
  const { data: tokenRow } = await admin
    .from("shopify_install_tokens")
    .select("id")
    .eq("shopify_store_id", store.id)
    .maybeSingle();
  const hasToken = !!tokenRow;

  const access = await getSubscriptionAccess(admin, store.tenant_id);

  if (access.state === "paywall") {
    const body: SessionResponse = {
      status: "no-subscription",
      tenantId: store.tenant_id,
      hasToken,
    };
    return NextResponse.json(body);
  }

  if (access.state === "past_due_locked") {
    const body: SessionResponse = {
      status: "past_due_locked",
      tenantId: store.tenant_id,
      hasToken,
    };
    return NextResponse.json(body);
  }

  const body: SessionResponse = {
    status: "ok",
    tenantId: store.tenant_id,
    storeId: store.id,
    shopDomain: store.store_domain,
    hasToken,
    lastSyncedAt: store.last_synced_at,
    lastSyncStatus: store.last_sync_status,
  };
  return NextResponse.json(body);
}
