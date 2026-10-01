import type { ReactNode } from "react";
import Link from "next/link";
import { getServerTenantContext } from "@/lib/tenant/context";
import { isAdminRole } from "@/lib/tenant/authz";
import { getXeroConfig } from "@/lib/accounting/xero/config";
import { cardBadge, redirectMessage, type CardBadge } from "@/lib/accounting/xero/card-state";
import { isFailedForGood } from "@/lib/accounting/outbox/state";
import { jobBadge, OPERATION_LABELS } from "@/lib/accounting/supplier-invoice/labels";
import { scrubSecrets } from "@/lib/accounting/xero/scrub";
import { assertNoError } from "@/lib/supabase/assert-no-error";
import StatusBadge from "../../_ui/status-badge";
import EmptyState from "../../_ui/empty-state";
import { DisconnectXeroButton, RetryJobButton } from "./xero-card-actions";
import styles from "./integrations.module.css";
import xs from "./xero/xero.module.css";

type Conn = { id: string; status: string; org_name: string; setup_completed_at: string | null; last_error: string | null };
type Job = { id: string; operation: string; entity_type: string; entity_id: string; status: string; error_class: string | null; error_message: string | null; created_at: string; completed_at: string | null };

function variantOf(b: { variant: string }) {
  return b.variant === "default" ? undefined : (b.variant as "success" | "warning" | "danger" | "info");
}

function Shell({ badge, children }: { badge?: CardBadge; children: ReactNode }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader}>
        <div className={styles.cardTitleRow}>
          <span className={styles.cardName}>Xero</span>
          {badge ? <StatusBadge variant={variantOf(badge)}>{badge.label}</StatusBadge> : null}
        </div>
        <p className={styles.cardDesc}>Send supplier invoices to Xero as bills. Manuva never sends sales.</p>
      </div>
      {children}
    </div>
  );
}

export default async function XeroCard({ xeroParam, reason }: { xeroParam?: string; reason?: string }) {
  const ctx = await getServerTenantContext();
  if (!ctx) return null;
  const isAdmin = isAdminRole(ctx.role);
  const msg = redirectMessage(xeroParam, reason);
  const notice = msg ? <p className={msg.error ? xs.error : xs.help} role="status">{msg.text}</p> : null;

  let live: Conn | null = null;
  let jobs: Job[] = [];
  let problems = 0;
  const invoiceNumbers = new Map<string, string>();
  try {
    const { data: conn, error: connErr } = await ctx.supabase
      .from("accounting_connection")
      .select("id, status, org_name, setup_completed_at, last_error")
      .eq("provider", "xero")
      .maybeSingle();
    assertNoError(connErr, "read accounting_connection");
    const c = conn as Conn | null;
    live = c && c.status !== "disconnected" ? c : null;
    if (live) {
      const { data, error } = await ctx.supabase
        .from("accounting_outbox")
        .select("id, operation, entity_type, entity_id, status, error_class, error_message, created_at, completed_at")
        .eq("connection_id", live.id)
        .order("created_at", { ascending: false })
        .limit(50);
      assertNoError(error, "read accounting_outbox");
      jobs = (data ?? []) as Job[];
      // Same query as the banner, so both count every job, not just the last 50.
      const { count, error: countErr } = await ctx.supabase
        .from("accounting_outbox")
        .select("id", { count: "exact", head: true })
        .eq("connection_id", live.id)
        // Mirrors isFailedForGood() in lib/accounting/outbox/state.ts.
        .or("status.eq.gave_up,and(status.eq.failed,error_class.eq.fixable)");
      assertNoError(countErr, "count accounting_outbox");
      problems = count ?? 0;
      const ids = jobs.filter((j) => j.entity_type === "supplier_invoice").map((j) => j.entity_id);
      if (ids.length) {
        const { data: invs, error: invErr } = await ctx.supabase.from("supplier_invoice").select("id, invoice_number").in("id", ids);
        assertNoError(invErr, "read supplier_invoice");
        for (const i of (invs ?? []) as Array<{ id: string; invoice_number: string }>) invoiceNumbers.set(i.id, i.invoice_number);
      }
    }
  } catch (e) {
    console.error("[xero] card load failed", scrubSecrets(e instanceof Error ? e.message : String(e)));
    return (
      <Shell>
        {notice}
        <p className={xs.error} role="status">Couldn&apos;t load the Xero connection. Refresh to try again.</p>
      </Shell>
    );
  }

  if (!live) {
    return (
      <Shell badge={cardBadge(null)}>
        {notice}
        {getXeroConfig().ok ? (
          <div className={xs.actions}>
            <a href="/api/xero/install" className={xs.primaryBtn}>Connect Xero</a>
          </div>
        ) : (
          <p className={xs.help}>Xero isn&apos;t configured on this server yet.</p>
        )}
      </Shell>
    );
  }

  const lastSent = jobs.find((j) => j.status === "sent")?.completed_at ?? null;

  return (
    <Shell badge={cardBadge(live)}>
      {notice}
      <p className={xs.help}>
        {live.org_name}
        {lastSent ? ` · last sent ${new Date(lastSent).toLocaleString("en-AU")}` : ""}
        {problems ? ` · ${problems} need${problems === 1 ? "s" : ""} attention` : ""}
      </p>
      {live.status === "needs_reconnect" && live.last_error ? <p className={xs.error}>{live.last_error}</p> : null}
      <div className={xs.actions}>
        {live.status === "needs_reconnect" ? <a href="/api/xero/install" className={xs.primaryBtn}>Reconnect Xero</a> : null}
        <Link href="/app/settings/integrations/xero/setup" className={live.setup_completed_at ? xs.secondaryBtn : xs.primaryBtn}>
          {live.setup_completed_at ? "Edit setup" : "Finish setup"}
        </Link>
        <DisconnectXeroButton orgName={live.org_name} />
      </div>
      {jobs.length === 0 ? (
        <EmptyState title="Nothing sent yet" message="Post a supplier invoice and its bill will appear here." />
      ) : (
        <div className={styles.tableCard}>
          <table className={styles.table}>
            <thead><tr><th>When</th><th>Item</th><th>Action</th><th>Status</th><th>Detail</th><th /></tr></thead>
            <tbody>
              {jobs.map((j) => {
                const b = jobBadge(j.status, j.error_class);
                return (
                  <tr key={j.id}>
                    <td>{new Date(j.created_at).toLocaleString("en-AU")}</td>
                    <td>{j.entity_type === "supplier_invoice" ? <Link href={`/app/purchasing/invoices/${j.entity_id}`}>{invoiceNumbers.get(j.entity_id) ?? "Invoice"}</Link> : "Supplier contact"}</td>
                    <td>{OPERATION_LABELS[j.operation] ?? j.operation}</td>
                    <td><StatusBadge variant={variantOf(b)}>{b.label}</StatusBadge></td>
                    <td>{j.error_message ?? ""}</td>
                    <td>{isAdmin && isFailedForGood(j) ? <RetryJobButton jobId={j.id} /> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
