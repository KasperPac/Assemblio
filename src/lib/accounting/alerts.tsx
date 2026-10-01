import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email/send";
import { XeroAttention } from "@/lib/email/templates/xero-attention";
import type { AlertSender } from "./maintenance";
import { scrubSecrets } from "./xero/scrub";

export function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://app.manuva.app";
}

export function emailAlertSender(db: SupabaseClient, baseUrl: string): AlertSender {
  return async (c, kind, problemCount) => {
    if (!c.connected_by) return false;
    const { data: u, error } = await db.auth.admin.getUserById(c.connected_by);
    if (error) {
      console.error("[xero] alert recipient lookup failed", c.id, scrubSecrets(error.message));
      return false;
    }
    if (!u.user?.email) return false;

    const { data: t, error: te } = await db.from("tenant").select("name").eq("id", c.tenant_id).maybeSingle();
    if (te) console.error("[xero] alert tenant name lookup failed", c.id, scrubSecrets(te.message));
    const tenantName = (t as { name?: string } | null)?.name ?? "your workspace";

    const r = await sendEmail({
      to: u.user.email,
      subject: kind === "reconnect" ? "Xero needs reconnecting in Manuva" : "Some bills didn't reach Xero",
      react: (
        <XeroAttention
          tenantName={tenantName}
          orgName={c.org_name}
          kind={kind}
          problemCount={problemCount}
          settingsUrl={`${baseUrl}/app/settings/integrations`}
        />
      ),
    });
    if (!r.ok) console.error("[xero] alert email failed", c.id, scrubSecrets(r.error));
    return r.ok;
  };
}
