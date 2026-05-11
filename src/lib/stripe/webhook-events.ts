import type Stripe from "stripe";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolvePriceId } from "./price-resolution";

type Admin = SupabaseClient;

export interface ProcessDeps {
  // Optional injection point — defaults to the real Stripe client. Tests
  // pass a stub so they don't need network access or env vars.
  getSubscription?: (id: string) => Promise<Stripe.Subscription>;
}

const PG_UNIQUE_VIOLATION = "23505";

export async function processStripeEvent(
  admin: Admin,
  event: Stripe.Event,
  deps: ProcessDeps = {}
): Promise<{ deduped: boolean }> {
  // Idempotency: try to insert event_id first; if conflict, exit silently.
  const { error: insertError } = await admin
    .from("stripe_event_log")
    .insert({ event_id: event.id, event_type: event.type });
  if (insertError) {
    const code =
      typeof insertError === "object" && insertError !== null
        ? (insertError as { code?: string }).code
        : undefined;
    if (code === PG_UNIQUE_VIOLATION) {
      return { deduped: true };
    }
    throw insertError;
  }

  switch (event.type) {
    case "checkout.session.completed":
      await onCheckoutCompleted(
        admin,
        event.data.object as Stripe.Checkout.Session,
        deps
      );
      break;
    case "customer.subscription.updated":
      await onSubscriptionUpdated(
        admin,
        event.data.object as Stripe.Subscription
      );
      break;
    case "customer.subscription.deleted":
      await onSubscriptionDeleted(
        admin,
        event.data.object as Stripe.Subscription
      );
      break;
    case "invoice.payment_failed":
      await onInvoiceFailed(admin, event.data.object as Stripe.Invoice);
      break;
    case "invoice.payment_succeeded":
      await onInvoiceSucceeded(admin, event.data.object as Stripe.Invoice);
      break;
    default:
      // ignore unhandled event types
      break;
  }
  return { deduped: false };
}

function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const raw = (invoice as unknown as { subscription?: string | Stripe.Subscription | null })
    .subscription;
  if (!raw) return null;
  return typeof raw === "string" ? raw : raw.id;
}

async function defaultGetSubscription(id: string): Promise<Stripe.Subscription> {
  const { stripeClient } = await import("./client");
  return stripeClient().subscriptions.retrieve(id) as unknown as Promise<Stripe.Subscription>;
}

async function onCheckoutCompleted(
  admin: Admin,
  session: Stripe.Checkout.Session,
  deps: ProcessDeps
) {
  const tenantId = session.metadata?.tenant_id;
  if (!tenantId) return;

  const subRef = session.subscription;
  const subId = typeof subRef === "string" ? subRef : subRef?.id ?? null;
  if (!subId) return;

  const getSub = deps.getSubscription ?? defaultGetSubscription;
  const stripeSub = await getSub(subId);
  const priceId = stripeSub.items.data[0]?.price?.id ?? "";
  const resolved = resolvePriceId(priceId);
  if (!resolved) return;

  const periodEnd = subscriptionPeriodEnd(stripeSub);

  await admin
    .from("tenant_subscription")
    .update({
      status: "active",
      stripe_subscription_id: subId,
      selected_tier: resolved.tier,
      billing_interval: resolved.billing,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    })
    .eq("tenant_id", tenantId);

  await admin.from("activity_log").insert({
    tenant_id: tenantId,
    actor_id: null,
    event: "subscription.activated",
    metadata: { tier: resolved.tier, billing: resolved.billing },
  });
}

async function onSubscriptionUpdated(
  admin: Admin,
  stripeSub: Stripe.Subscription
) {
  const priceId = stripeSub.items.data[0]?.price?.id ?? "";
  const resolved = resolvePriceId(priceId);
  if (!resolved) return;

  const periodEnd = subscriptionPeriodEnd(stripeSub);

  await admin
    .from("tenant_subscription")
    .update({
      selected_tier: resolved.tier,
      billing_interval: resolved.billing,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    })
    .eq("stripe_subscription_id", stripeSub.id);
}

async function onSubscriptionDeleted(
  admin: Admin,
  stripeSub: Stripe.Subscription
) {
  await admin
    .from("tenant_subscription")
    .update({ status: "canceled" })
    .eq("stripe_subscription_id", stripeSub.id);
}

async function onInvoiceFailed(admin: Admin, invoice: Stripe.Invoice) {
  const subId = subscriptionIdFromInvoice(invoice);
  if (!subId) return;
  await admin
    .from("tenant_subscription")
    .update({ status: "past_due" })
    .eq("stripe_subscription_id", subId);
}

async function onInvoiceSucceeded(admin: Admin, invoice: Stripe.Invoice) {
  const subId = subscriptionIdFromInvoice(invoice);
  if (!subId) return;
  // Only flip past_due → active. Active renewals are a no-op.
  await admin
    .from("tenant_subscription")
    .update({ status: "active" })
    .eq("stripe_subscription_id", subId)
    .eq("status", "past_due");
}

// Stripe placed current_period_end on the subscription item (or root, depending
// on API version). We read it defensively so the handler works across versions.
function subscriptionPeriodEnd(sub: Stripe.Subscription): number | null {
  const root = (sub as unknown as { current_period_end?: number }).current_period_end;
  if (typeof root === "number") return root;
  const item = sub.items?.data?.[0] as unknown as { current_period_end?: number } | undefined;
  if (item && typeof item.current_period_end === "number") return item.current_period_end;
  return null;
}
