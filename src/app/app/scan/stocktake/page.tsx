import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import styles from "../scan.module.css";

export default async function ScanSessionPickerPage() {
  const context = await getServerTenantContext();
  if (!context) return notFound();
  const { supabase, tenantId } = context;

  const { data: sessions } = await supabase
    .from("stocktake_session")
    .select("id, reference_number, status, blind_count, location:location_id(name)")
    .eq("tenant_id", tenantId)
    .in("status", ["open", "counting"])
    .order("created_at", { ascending: false });

  // Fetch line counts separately to avoid complex nested aggregations
  const sessionIds = (sessions ?? []).map((s: any) => s.id as string);
  let lineCounts: Map<string, { total: number; counted: number }> = new Map();

  if (sessionIds.length > 0) {
    const { data: lines } = await supabase
      .from("stocktake_line")
      .select("session_id, counted")
      .in("session_id", sessionIds)
      .eq("tenant_id", tenantId);

    for (const line of lines ?? []) {
      const l = line as { session_id: string; counted: number | null };
      const current = lineCounts.get(l.session_id) ?? { total: 0, counted: 0 };
      lineCounts.set(l.session_id, {
        total: current.total + 1,
        counted: current.counted + (l.counted !== null ? 1 : 0),
      });
    }
  }

  const enriched = (sessions ?? []).map((s: any) => {
    const location = Array.isArray(s.location) ? s.location[0] : s.location;
    const counts = lineCounts.get(s.id as string) ?? { total: 0, counted: 0 };
    return {
      id: s.id as string,
      reference: (s.reference_number ?? "—") as string,
      blindCount: s.blind_count as boolean,
      locationName: (location?.name ?? "—") as string,
      total: counts.total,
      counted: counts.counted,
    };
  });

  return (
    <main>
      <div className={styles.topBar}>
        <Link href="/app/scan" className={styles.backBtn}>← Back</Link>
        <span className={styles.topBarTitle}>Count Stock</span>
      </div>

      {enriched.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No active stocktake sessions.</p>
          <p>Create one from the desktop app first.</p>
        </div>
      ) : (
        <div className={styles.sessionList}>
          {enriched.map((s) => (
            <Link key={s.id} href={`/app/scan/stocktake/${s.id}`} className={styles.sessionCard}>
              <span className={styles.sessionRef}>{s.reference}</span>
              <span className={styles.sessionMeta}>
                {s.locationName}{s.blindCount ? " · Blind count" : ""}
              </span>
              <span className={styles.sessionProgress}>
                {s.counted}/{s.total} counted
              </span>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
