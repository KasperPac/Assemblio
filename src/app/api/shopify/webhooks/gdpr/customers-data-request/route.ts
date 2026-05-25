import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { verifyWebhookHmac } from "@/lib/shopify/auth";
import { parseWebhookPayload } from "@/lib/shopify/webhook";
import {
  handleCustomersDataRequest,
  logGdprRequest,
  markGdprRequestProcessed,
  type CustomerPayload,
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
  if (topic !== "customers/data_request" || !shop) {
    return new NextResponse("Wrong topic for this endpoint", { status: 400 });
  }

  const payload = parseWebhookPayload(rawBody);
  if (!payload) {
    return new NextResponse("Invalid payload", { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const audit = await logGdprRequest(admin, "customers/data_request", shop, webhookId || null, payload);

  try {
    await handleCustomersDataRequest(admin, payload as CustomerPayload, shop);
    if (audit) {
      await markGdprRequestProcessed(admin, audit.id, "completed");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown-error";
    if (audit) {
      await markGdprRequestProcessed(admin, audit.id, "failed", message);
    }
    // Still return 200: we have audit log, operator will handle.
    // Returning 5xx makes Shopify retry, which would just duplicate audit rows.
  }

  return new NextResponse("OK", { status: 200 });
}
