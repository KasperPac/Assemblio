import { NextResponse } from "next/server";
import { after } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { verifySquareWebhookSignature } from "@/lib/square/webhook-signature";
import { processSquareWebhook, processDueSquareEvents } from "@/lib/square/events";

export async function POST(req: Request) {
  const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY;
  const notificationUrl = process.env.SQUARE_WEBHOOK_URL;
  if (!key || !notificationUrl) return NextResponse.json({ error: "Webhook is not configured" }, { status: 503 });
  const rawBody = await req.text();
  if (Buffer.byteLength(rawBody, "utf8") > 2_000_000) return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  if (!verifySquareWebhookSignature(rawBody, req.headers.get("x-square-hmacsha256-signature"), key, notificationUrl)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(rawBody); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || typeof payload.event_id !== "string" || !payload.event_id || typeof payload.merchant_id !== "string" || !payload.merchant_id || typeof payload.type !== "string" || !payload.type) {
    return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  }
  try {
    const db = createSupabaseAdminClient();
    const result = await processSquareWebhook(db, payload);
    if (result.stored) after(async () => {
      try { await processDueSquareEvents(db, 40_000); }
      catch { console.error("[square] webhook processing deferred to retry worker"); }
    });
    return NextResponse.json({ received: true });
  } catch { return NextResponse.json({ error: "Event could not be recorded; retry" }, { status: 503 }); }
}
