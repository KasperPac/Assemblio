import Link from "next/link";
import styles from "./stocktake.module.css";
import { getServerTenantContext } from "@/lib/tenant/context";
import PageHeader from "../_ui/page-header";
import StatusBadge from "../_ui/status-badge";
import EmptyState from "../_ui/empty-state";
import { createStocktakeSession } from "./actions";

type SessionRow = {
  id: string;
  reference_number: string | null;
  session_type: string;
  status: string;
  created_at: string;
  blind_count: boolean;
  location: { name: string | null } | Array<{ name: string | null }> | null;
};

function statusVariant(s: string) {
  if (s === "completed" || s === "approved") return "success" as const;
  if (s === "reconciliation") return "danger" as const;
  if (s === "counting") return "warning" as const;
  if (s === "open") return "info" as const;
  return "default" as const; // draft, locked, archived, unknown
}

function isDone(s: string) {
  return s === "completed" || s === "archived";
}

export default async function StocktakePage() {
  const context = await getServerTenantContext();
  if (!context) return null;
  const { supabase, tenantId } = context;

  // Stage 1: sessions, locations, balances in parallel
  const [{ data: sessions, error }, { data: locations }, { data: balances }] =
    await Promise.all([
      supabase
        .from("stocktake_session")
        .select("id,reference_number,session_type,status,created_at,blind_count,location:location_id(name)")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase.from("location").select("id,name").eq("tenant_id", tenantId).order("name"),
      supabase
        .from("inventory_balance")
        .select("on_hand")
        .eq("tenant_id", tenantId),
    ]);

  // Stage 2: line counts scoped to the current page's sessions
  const sessionIds = ((sessions ?? []) as SessionRow[]).map((s) => s.id);
  const { data: lineCounts } = sessionIds.length > 0
    ? await supabase.from("stocktake_line").select("session_id").eq("tenant_id", tenantId).in("session_id", sessionIds)
    : { data: [] };

  const lineCountBySession = ((lineCounts ?? []) as { session_id: string }[]).reduce<Record<string, number>>(
    (acc, l) => { acc[l.session_id] = (acc[l.session_id] ?? 0) + 1; return acc; },
    {}
  );

  const hasAnyStock = ((balances ?? []) as { on_hand: number }[]).some((b) => Number(b.on_hand) > 0);
  const hasCompletedSession = ((sessions ?? []) as SessionRow[]).some((s) => s.status === "completed");
  const showBanner = !hasAnyStock && !hasCompletedSession;

  function formatDate(iso: string) {
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) return d.toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit" });
    return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: d.getFullYear() !== now.getFullYear() ? "numeric" : undefined });
  }

  return (
    <div className={styles.page}>
      <PageHeader
        description="Manage physical counts and reconcile inventory discrepancies."
        actions={
          <button className={styles.primary} popoverTarget="new-stocktake-dialog">
            + New stocktake
          </button>
        }
      />

      {showBanner && (
        <div className={styles.banner}>
          <div className={styles.bannerInner}>
            <span className={styles.bannerIcon}>📦</span>
            <div>
              <strong className={styles.bannerTitle}>Set up your opening stock</strong>
              <p className={styles.bannerDesc}>
                Your inventory is empty. Run an initial stock count to enter your current on-hand quantities before using Assemblio for production.
              </p>
            </div>
          </div>
          <button className={styles.bannerCta} popoverTarget="new-stocktake-dialog">
            Start initial count →
          </button>
        </div>
      )}

      {/* New stocktake modal */}
      <dialog id="new-stocktake-dialog" className={styles.dialog} popover="auto">
        <form action={createStocktakeSession}>
          <div className={styles.dialogHeader}>
            <span className={styles.dialogEyebrow}>New stocktake</span>
            <h2 className={styles.dialogTitle}>Create session</h2>
          </div>
          <div className={styles.dialogFields}>
            <fieldset className={styles.sessionTypeGroup}>
              <legend className={styles.fieldLabel}>Count type</legend>
              <label className={styles.radioOption}>
                <input type="radio" name="session_type" value="full" defaultChecked />
                <div>
                  <span className={styles.radioLabel}>Full count</span>
                  <span className={styles.radioDesc}>Count all components and reconcile variances</span>
                </div>
              </label>
              <label className={styles.radioOption}>
                <input type="radio" name="session_type" value="initial" />
                <div>
                  <span className={styles.radioLabel}>Initial count</span>
                  <span className={styles.radioDesc}>Set opening stock quantities for a new inventory</span>
                </div>
              </label>
            </fieldset>
            <label className={styles.dialogField}>
              <span className={styles.fieldLabel}>Location</span>
              <select name="location_id" className={styles.select} required>
                <option value="">Select location…</option>
                {((locations ?? []) as { id: string; name: string | null }[]).map((l) => (
                  <option key={l.id} value={l.id}>{l.name ?? "Unnamed"}</option>
                ))}
              </select>
            </label>
            <label className={styles.dialogField}>
              <span className={styles.fieldLabel}>Notes <span className={styles.optional}>(optional)</span></span>
              <input name="notes" className={styles.input} placeholder="e.g. End-of-month count" />
            </label>
            <label className={styles.checkboxRow}>
              <input type="checkbox" name="blind_count" />
              <div>
                <span className={styles.checkboxLabel}>Blind count mode</span>
                <span className={styles.checkboxDesc}>Expected qty hidden from counters until reconciliation</span>
              </div>
            </label>
          </div>
          <div className={styles.dialogActions}>
            <button type="button" className={styles.secondary} popoverTarget="new-stocktake-dialog">Cancel</button>
            <button type="submit" className={styles.primary}>Start counting →</button>
          </div>
        </form>
      </dialog>

      {/* Sessions list */}
      <div className={styles.panel}>
        <div className={styles.panelHeader}>
          <span className={styles.eyebrow}>Sessions</span>
          <h2 className={styles.panelTitle}>All stocktake sessions</h2>
        </div>
        <div className={styles.tableHeader}>
          <span>Reference</span>
          <span>Type</span>
          <span>Location</span>
          <span>Date</span>
          <span>Lines</span>
          <span>Status</span>
          <span></span>
        </div>
        {error ? (
          <EmptyState title="Failed to load sessions" message={error.message} />
        ) : (sessions ?? []).length === 0 ? (
          <EmptyState title="No stocktake sessions yet" message="Create a session to begin counting." />
        ) : (
          ((sessions ?? []) as SessionRow[]).map((row) => {
            const location = Array.isArray(row.location) ? row.location[0] : row.location;
            const done = isDone(row.status);
            return (
              <div key={row.id} className={`${styles.tableRow} ${done ? styles.dimmed : ""}`}>
                <strong className={styles.reference}>{row.reference_number ?? row.id.slice(0, 8)}</strong>
                <span className={styles.meta}>{row.session_type === "initial" ? "Initial count" : "Full count"}</span>
                <span className={styles.meta}>{location?.name ?? "—"}</span>
                <span className={styles.meta}>{formatDate(row.created_at)}</span>
                <span className={styles.meta}>{lineCountBySession[row.id] ?? 0} lines</span>
                <StatusBadge variant={statusVariant(row.status)}>{row.status}</StatusBadge>
                <Link href={`/app/stocktake/${row.id}`} className={styles.viewLink}>
                  {done ? "View →" : "Open →"}
                </Link>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
