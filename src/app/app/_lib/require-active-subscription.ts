import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getSubscriptionAccess,
  type AccessResult,
} from "@/lib/subscription/access";

/**
 * Server-component helper. Redirects to the paywall or past-due page when
 * the tenant's subscription requires it; otherwise returns the AccessResult
 * for the caller to inspect (e.g. to render the trial banner).
 *
 * Callers MUST exempt /app/billing/* routes from this gate or they will
 * redirect into themselves.
 */
export async function requireActiveSubscription(
  supabase: SupabaseClient,
  tenantId: string
): Promise<AccessResult> {
  const access = await getSubscriptionAccess(supabase, tenantId);
  if (access.state === "paywall") redirect("/app/billing/paywall");
  if (access.state === "past_due_locked") redirect("/app/billing/past-due");
  return access;
}
