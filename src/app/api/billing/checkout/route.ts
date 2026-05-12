import { NextResponse } from "next/server";
import { getServerTenantContext } from "@/lib/tenant/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { stripeClient } from "@/lib/stripe/client";
import { priceIdFor } from "@/lib/stripe/price-resolution";
import {
  countTenantUsage,
  computeLimit,
  type LimitKind,
} from "@/lib/subscription/limits";
import {
  PLANS,
  type BillingInterval,
  type PlanTier,
} from "@/lib/plans";

const VALID_PLANS: ReadonlySet<PlanTier> = new Set<PlanTier>([
  "starter",
  "growth",
  "pro",
]);
const VALID_INTERVALS: ReadonlySet<BillingInterval> = new Set<BillingInterval>([
  "monthly",
  "annual",
]);
const LIMIT_KINDS: ReadonlyArray<LimitKind> = ["locations", "users"];

export async function POST(req: Request) {
  const ctx = await getServerTenantContext();
  if (!ctx) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const form = await req.formData();
  const tier = String(form.get("tier") ?? "") as PlanTier;
  const billing = String(form.get("billing") ?? "") as BillingInterval;

  if (!VALID_PLANS.has(tier) || !VALID_INTERVALS.has(billing)) {
    return NextResponse.json(
      { error: "invalid plan or billing interval" },
      { status: 400 }
    );
  }

  const admin = createSupabaseAdminClient();

  const { data: sub, error: subError } = await admin
    .from("tenant_subscription")
    .select("stripe_customer_id")
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  if (subError) {
    console.error("[billing/checkout] tenant_subscription lookup failed", subError);
    return NextResponse.json({ error: "subscription lookup failed" }, { status: 500 });
  }
  if (!sub) {
    return NextResponse.json({ error: "no subscription row" }, { status: 400 });
  }

  // Over-limit pre-check against the requested target tier (not the effective
  // tier — we don't want to let a trialing tenant downgrade into a tier they
  // currently exceed).
  const usage = await countTenantUsage(admin, ctx.tenantId);
  for (const kind of LIMIT_KINDS) {
    const limit = computeLimit(tier, kind);
    if (limit !== Infinity && usage[kind] > limit) {
      return NextResponse.json(
        {
          error: `You have ${usage[kind]} ${kind} but ${PLANS[tier].name} allows ${limit}. Upgrade to a higher tier, or archive ${kind} first.`,
          kind,
          limit,
          current: usage[kind],
        },
        { status: 400 }
      );
    }
  }

  let priceId: string;
  try {
    priceId = priceIdFor(tier, billing);
  } catch (err) {
    console.error("[billing/checkout] price resolution failed", err);
    return NextResponse.json(
      { error: "billing not configured for this plan" },
      { status: 500 }
    );
  }

  const stripe = stripeClient();

  let customerId = sub.stripe_customer_id;
  if (!customerId) {
    const [{ data: tenantRow }, { data: userResult }] = await Promise.all([
      admin
        .from("tenant")
        .select("name")
        .eq("id", ctx.tenantId)
        .maybeSingle(),
      admin.auth.admin.getUserById(ctx.userId),
    ]);
    const customer = await stripe.customers.create({
      email: userResult?.user?.email ?? undefined,
      name: tenantRow?.name ?? undefined,
      metadata: { tenant_id: ctx.tenantId },
    });
    customerId = customer.id;
    await admin
      .from("tenant_subscription")
      .update({ stripe_customer_id: customerId })
      .eq("tenant_id", ctx.tenantId);
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${baseUrl}/app/billing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/app/billing/paywall`,
    metadata: { tenant_id: ctx.tenantId, tier, billing },
    subscription_data: {
      metadata: { tenant_id: ctx.tenantId, tier, billing },
    },
  });

  if (!session.url) {
    return NextResponse.json(
      { error: "stripe did not return a session URL" },
      { status: 502 }
    );
  }
  return NextResponse.redirect(session.url, 303);
}
