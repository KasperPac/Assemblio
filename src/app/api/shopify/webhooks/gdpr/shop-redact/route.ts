import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookHmac } from "@/lib/shopify/auth";
import { parseWebhookPayload } from "@/lib/shopify/webhook";
import {
  handleShopRedact,
  logGdprRequest,
  markGdprRequestProcessed,
  type ShopRedactPayload,
} from "@/lib/shopify/gdpr";

export async function POST(request: NextRequest) {
  const hmac = request.headers.get("x-shopify-hmac-sha256") ?? "";
  const topic = request.headers.get("x-shopify-topic") ?? "";
  const shop = request.headers.get("x-shopify-shop-domain") ?? "";
  const webhookId = request.headers.get("x-shopify-webhook-id") ?? "";
  const rawBody = await request.text();

  if (!hmac || !verifyWebhookHmac(rawBody, hmac)) {
    return new NextResponse("Invalid webhook signature", { status: 401 });
  }
  if (topic !== "shop/redact" || !shop) {
    return new NextResponse("Wrong topic for this endpoint", { status: 400 });
  }

  const payload = parseWebhookPayload(rawBody);
  if (!payload) {
    return new NextResponse("Invalid payload", { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const audit = await logGdprRequest(admin, "shop/redact", shop, webhookId || null, payload);

  try {
    await handleShopRedact(admin, payload as ShopRedactPayload, shop);
    if (audit) {
      await markGdprRequestProcessed(admin, audit.id, "completed");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown-error";
    if (audit) {
      await markGdprRequestProcessed(admin, audit.id, "failed", message);
    }
  }

  return new NextResponse("OK", { status: 200 });
}
