import Link from "next/link";
import { getServerTenantContext } from "@/lib/tenant/context";
import { isAdminRole } from "@/lib/tenant/authz";
import { getSquareConfig, isSquarePilotTenant } from "@/lib/square/config";
import StatusBadge from "../../_ui/status-badge";
import styles from "./integrations.module.css";
import ss from "./square/square.module.css";

const notices: Record<string, string> = {
  connected: "Square connected. Map locations and products before confirming your opening stock count.",
  disconnected: "Square disconnected. Manuva stock records are retained.",
  error: "Square connection failed. Try connecting again. The Square account owner must authorise access.",
};

export default async function SquareCard({ squareParam }: { squareParam?: string; reason?: string }) {
  const ctx = await getServerTenantContext();
  if (!ctx?.tenantId || !isAdminRole(ctx.role)) return null;
  if (!isSquarePilotTenant(ctx.tenantId)) return null;
  const cfg = getSquareConfig();
  const configured = cfg.ok;
  const { data: conn, error } = await ctx.supabase.from("square_connection")
    .select("id,merchant_id,environment,status")
    .eq("tenant_id", ctx.tenantId).eq("environment", cfg.ok ? cfg.environment : "production").maybeSingle();
  const connected = conn?.status === "active";
  const reconnect = conn?.status === "needs_reconnect";
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleRow}>
          <span className={styles.cardName}>Square</span>
          <StatusBadge variant={connected ? "success" : reconnect ? "danger" : "warning"}>
            {error ? "Unavailable" : connected ? "Connected" : reconnect ? "Needs reconnect" : configured ? "Not connected" : "Not configured"}
          </StatusBadge>
        </div>
        <p className={styles.cardDesc}>Connect retail products and completed sales. Services do not consume stock.</p>
      </div>
      {squareParam && notices[squareParam] ? <p className={squareParam === "error" ? ss.error : ss.help} role="status">{notices[squareParam]}</p> : null}
      {error ? <p className={ss.error}>Couldn&apos;t load the Square connection. Refresh to try again.</p> : (
        <>
          {connected ? <p className={ss.help}>Merchant {conn.merchant_id} · {conn.environment === "sandbox" ? "Sandbox — test transactions only" : "Production"}</p> : null}
          <div className={ss.actions}>
            {configured && !connected ? <a href="/api/square/install" className={ss.primaryBtn}>{reconnect ? "Reconnect Square" : "Connect Square"}</a> : null}
            {connected || reconnect ? <Link href="/app/settings/integrations/square" className={ss.primaryBtn}>Manage Square</Link> : null}
          </div>
          {!configured ? <p className={ss.help}>Square isn&apos;t configured on this server yet. An operator must finish setup before the account owner can connect.</p> : null}
          <p className={ss.help}>Stock updates to Square remain off until you confirm the opening stock count. Xero receives supplier bills only.</p>
        </>
      )}
    </div>
  );
}
