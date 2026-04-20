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
import PageHeader from "../_ui/page-header";
import StatusBadge from "../_ui/status-badge";
import EmptyState from "../_ui/empty-state";
import ListPanel, { ListRow } from "../_ui/list-panel";

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

function getStatusVariant(status: StocktakeSessionStatus) {
  if (status === "completed") return "success";
  if (status === "approved") return "info";
  if (status === "archived") return "danger";
  return "warning";
}

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
      <PageHeader
        eyebrow="Stocktake"
        title="Cycle count sessions"
        description="Open count sessions, record counted stock, and apply approved variances back into the inventory ledger."
      />

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
          ((components ?? []) as Array<{ id: string; name: string | null; sku: string | null }>).map(
            (c) => ({
              id: c.id,
              label: `${c.name ?? "Unnamed"}${c.sku ? ` (${c.sku})` : ""}`,
            })
          )
        }
        action={createStocktakeLine}
      />

      <ListPanel
        eyebrow="Sessions"
        title="Stocktake sessions"
        description="Control stocktake lifecycle by location before applying any variance to balances."
        columns={["Session", "Location", "Status", "Created", "Actions"]}
        columnsTemplate="0.8fr 1.1fr 0.8fr 0.8fr 1.3fr"
      >
        {error ? (
          <EmptyState
            title="Failed to load stocktake sessions"
            message="The stocktake session list could not be retrieved from Supabase."
          />
        ) : (data ?? []).length === 0 ? (
          <EmptyState
            title="No stocktake sessions yet"
            message="Create a stocktake session to begin cycle counting."
          />
        ) : (
          (data as StocktakeRow[]).map((row) => {
            const location = Array.isArray(row.location)
              ? row.location[0] ?? null
              : row.location;
            return (
              <ListRow
                key={row.id}
                columnsTemplate="0.8fr 1.1fr 0.8fr 0.8fr 1.3fr"
                className={styles.row}
              >
                <strong>STK-{row.id.slice(0, 6)}</strong>
                <span className={styles.meta}>{location?.name ?? "Unknown location"}</span>
                <StatusBadge variant={getStatusVariant(row.status)}>{row.status}</StatusBadge>
                <span className={styles.meta}>
                  {new Date(row.created_at).toLocaleDateString("en-GB")}
                </span>
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
              </ListRow>
            );
          })
        )}
      </ListPanel>

      <ListPanel
        eyebrow="Lines"
        title="Counted lines"
        description="Compare expected versus counted stock before promoting a session through approval."
        columns={["Session", "Component", "Expected / Counted / Variance", "Actions"]}
        columnsTemplate="0.85fr 1.5fr 1fr 1.2fr"
      >
        {(lines ?? []).length === 0 ? (
          <EmptyState
            title="No stocktake lines yet"
            message="Add counted lines to an open session to begin reconciliation."
          />
        ) : (
          (lines as StocktakeLineRow[]).map((line) => {
            const session = Array.isArray(line.session) ? line.session[0] ?? null : line.session;
            const component = Array.isArray(line.component)
              ? line.component[0] ?? null
              : line.component;
            const variance =
              Number(line.counted ?? 0) - Number(line.expected_on_hand ?? 0);
            return (
              <ListRow
                key={line.id}
                columnsTemplate="0.85fr 1.5fr 1fr 1.2fr"
                className={styles.row}
              >
                <div className={styles.cellStack}>
                  <strong>STK-{session?.id?.slice(0, 6) ?? "???"}</strong>
                  <span className={styles.meta}>{session?.status ?? "unknown"}</span>
                </div>
                <div className={styles.cellStack}>
                  <strong>{component?.name ?? "Unknown"}</strong>
                  <span className={styles.meta}>
                    {component?.sku ? component.sku : "No SKU"}
                  </span>
                </div>
                <div className={styles.cellStack}>
                  <strong>
                    {Number(line.expected_on_hand ?? 0).toFixed(2)} /{" "}
                    {Number(line.counted ?? 0).toFixed(2)}
                  </strong>
                  <span className={variance === 0 ? styles.meta : styles.varianceMeta}>
                    Variance {variance.toFixed(2)}
                  </span>
                </div>
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
                    disabled={!session?.status || !canEditStocktakeLines(session.status)}
                  >
                    Save
                  </button>
                </form>
              </ListRow>
            );
          })
        )}
      </ListPanel>
    </div>
  );
}
