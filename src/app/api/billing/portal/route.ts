import { NextResponse } from "next/server";
import { getServerTenantContext } from "@/lib/tenant/context";
import { isAdminRole } from "@/lib/tenant/authz";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { stripeClient } from "@/lib/stripe/client";

export async function POST() {
  const ctx = await getServerTenantContext();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  // The Stripe portal can cancel the subscription — admins only.
  if (!isAdminRole(ctx.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = createSupabaseAdminClient();
  const { data: sub, error } = await admin
    .from("tenant_subscription")
    .select("stripe_customer_id")
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  if (error) {
    console.error("[billing/portal] tenant_subscription lookup failed", error);
    return NextResponse.json(
      { error: "subscription lookup failed" },
      { status: 500 }
    );
  }
  if (!sub?.stripe_customer_id) {
    return NextResponse.json({ error: "no stripe customer" }, { status: 400 });
  }

  const stripe = stripeClient();
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const portal = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: `${baseUrl}/app`,
  });
  return NextResponse.redirect(portal.url, 303);
}
