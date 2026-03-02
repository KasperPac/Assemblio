import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "./stocktake.module.css";
import StocktakeCreateForm from "./stocktake-create-form";
import StocktakeLineForm from "./stocktake-line-form";
import {
  canApplyStocktakeSession,
  canEditStocktakeLines,
  type StocktakeSessionStatus,
} from "@/lib/stocktake/lifecycle";
import {
  applyStocktakeSession,
  createStocktakeLine,
  createStocktakeSession,
  updateStocktakeLineCounted,
  updateStocktakeStatus,
} from "./actions";

type StocktakeRow = {
  id: string;
  status: StocktakeSessionStatus;
  created_at: string;
  location: { name: string | null } | Array<{ name: string | null }> | null;
};

type StocktakeLineRow = {
  id: string;
  expected_on_hand: number;
  counted: number;
  session:
    | { id: string; status: StocktakeSessionStatus }
    | Array<{ id: string; status: StocktakeSessionStatus }>
    | null;
  component:
    | { name: string | null; sku: string | null }
    | Array<{ name: string | null; sku: string | null }>
    | null;
};

export default async function StocktakePage() {
  const supabase = await createSupabaseServerClient();
  const [{ data, error }, { data: locations }, { data: components }, { data: lines }] =
    await Promise.all([
    supabase
      .from("stocktake_session")
      .select("id,status,created_at,location:location_id(name)")
      .order("created_at", { ascending: false })
      .limit(12),
    supabase.from("location").select("id,name,is_default").order("name"),
    supabase.from("component").select("id,name,sku").order("name"),
    supabase
      .from("stocktake_line")
      .select(
        "id,expected_on_hand,counted,session:session_id(id,status),component:component_id(name,sku)"
      )
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1>Stocktake</h1>
          <p>Run cycle counts and reconcile variances.</p>
        </div>
      </div>
      <StocktakeCreateForm
        locations={
          (locations ?? []) as Array<{
            id: string;
            name: string | null;
            is_default?: boolean | null;
          }>
        }
        action={createStocktakeSession}
      />
      <StocktakeLineForm
        sessions={(data ?? [])
          .filter((session) => canEditStocktakeLines(session.status))
          .map((session) => ({
            id: session.id,
            label: `STK-${session.id.slice(0, 6)} (${session.status})`,
          }))}
        components={
          ((components ?? []) as Array<{ id: string; name: string | null; sku: string | null }>).map((c) => ({
            id: c.id,
            label: `${c.name ?? "Unnamed"}${c.sku ? ` (${c.sku})` : ""}`,
          }))
        }
        action={createStocktakeLine}
      />
      <div className={styles.table}>
        <div className={styles.tableHeader}>
          <span>Session</span>
          <span>Location</span>
          <span>Status</span>
          <span>Created</span>
          <span>Actions</span>
        </div>
        {error ? (
          <div className={styles.empty}>Failed to load stocktake sessions.</div>
        ) : (data ?? []).length === 0 ? (
          <div className={styles.empty}>No stocktake sessions yet.</div>
        ) : (
          (data as StocktakeRow[]).map((row) => {
            const location = Array.isArray(row.location)
              ? row.location[0] ?? null
              : row.location;
            return (
              <div key={row.id} className={styles.tableRow}>
                <span>STK-{row.id.slice(0, 6)}</span>
                <span>{location?.name ?? "Unknown location"}</span>
                <span className={styles.status}>{row.status}</span>
                <span>{new Date(row.created_at).toLocaleDateString("en-GB")}</span>
                <div className={styles.actionStack}>
                  <form action={updateStocktakeStatus} className={styles.inlineForm}>
                    <input type="hidden" name="session_id" value={row.id} />
                    <select name="status" defaultValue={row.status}>
                      <option value="open">Open</option>
                      <option value="locked">Locked</option>
                      <option value="approved">Approved</option>
                      <option value="completed">Completed</option>
                      <option value="archived">Archived</option>
                    </select>
                    <button type="submit">Update</button>
                  </form>
                  <form action={applyStocktakeSession}>
                    <input type="hidden" name="session_id" value={row.id} />
                    <button
                      type="submit"
                      className={styles.applyBtn}
                      disabled={!canApplyStocktakeSession(row.status)}
                    >
                      Apply
                    </button>
                  </form>
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className={styles.table}>
        <div className={styles.tableHeaderLines}>
          <span>Session</span>
          <span>Component</span>
          <span>Expected / Counted / Variance</span>
          <span>Actions</span>
        </div>
        {(lines ?? []).length === 0 ? (
          <div className={styles.empty}>No stocktake lines yet.</div>
        ) : (
          (lines as StocktakeLineRow[]).map((line) => {
            const session = Array.isArray(line.session) ? line.session[0] ?? null : line.session;
            const component = Array.isArray(line.component)
              ? line.component[0] ?? null
              : line.component;
            return (
              <div key={line.id} className={styles.tableRowLines}>
                <span>STK-{session?.id?.slice(0, 6) ?? "???"}</span>
                <span>
                  {component?.name ?? "Unknown"} ({session?.status ?? "unknown"})
                  {component?.sku ? ` (${component.sku})` : ""}
                </span>
                <span>
                  {Number(line.expected_on_hand ?? 0).toFixed(2)} / {Number(line.counted ?? 0).toFixed(2)} /{" "}
                  {(Number(line.counted ?? 0) - Number(line.expected_on_hand ?? 0)).toFixed(2)}
                </span>
                <form action={updateStocktakeLineCounted} className={styles.inlineForm}>
                  <input type="hidden" name="line_id" value={line.id} />
                  <input
                    name="counted"
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={line.counted}
                    disabled={!session?.status || !canEditStocktakeLines(session.status)}
                  />
                  <button
                    type="submit"
                    disabled={
                      !session?.status || !canEditStocktakeLines(session.status)
                    }
                  >
                    Save
                  </button>
                </form>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
