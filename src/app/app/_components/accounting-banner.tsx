import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isXeroPilotTenant } from "@/lib/accounting/xero/config";
import { scrubSecrets } from "@/lib/accounting/xero/scrub";
import { assertNoError } from "@/lib/supabase/assert-no-error";
import styles from "./accounting-banner.module.css";

/** App-wide admin banner (spec 3.7). Never throws: a broken banner must not break the layout. */
export async function AccountingBanner({ tenantId, isAdmin }: { tenantId: string | null; isAdmin: boolean }) {
  if (!tenantId || !isAdmin || !isXeroPilotTenant(tenantId)) return null;
  let text: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const { data: conn, error: connErr } = await supabase
      .from("accounting_connection")
      .select("id, status")
      .eq("tenant_id", tenantId)
      .eq("provider", "xero")
      .maybeSingle();
    assertNoError(connErr, "banner: read accounting_connection");
    const c = conn as { id: string; status: string } | null;
    if (!c || c.status === "disconnected") return null;
    if (c.status === "needs_reconnect") {
      text = "Xero needs reconnecting. Bills are paused until an admin reconnects it.";
    } else {
      const { count, error } = await supabase
        .from("accounting_outbox")
        .select("id", { count: "exact", head: true })
        .eq("connection_id", c.id)
        // Mirrors isFailedForGood() in lib/accounting/outbox/state.ts.
        .or("status.eq.gave_up,and(status.eq.failed,error_class.eq.fixable)");
      assertNoError(error, "banner: count accounting_outbox");
      if ((count ?? 0) > 0) text = `${count} item${count === 1 ? "" : "s"} couldn't be sent to Xero.`;
    }
  } catch (e) {
    console.error("AccountingBanner failed", scrubSecrets(e instanceof Error ? e.message : String(e)));
    return null;
  }
  if (!text) return null;
  return (
    <div className={styles.banner} role="status">
      <span>{text}</span>
      <Link href="/app/settings/integrations" className={styles.link}>Review in Integrations &rarr;</Link>
    </div>
  );
}
