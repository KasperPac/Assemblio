import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "./goods-inwards.module.css";
import { receivePurchaseOrder, receivePurchaseOrderLine } from "./actions";
import PageHeader from "../_ui/page-header";
import StatusBadge from "../_ui/status-badge";
import EmptyState from "../_ui/empty-state";
import ListPanel, { ListRow } from "../_ui/list-panel";

type GoodsRow = {
  id: string;
  status: string;
  created_at: string;
  supplier: { name: string | null } | Array<{ name: string | null }> | null;
};

type PoLineRow = {
  id: string;
  purchase_order_id: string;
  quantity: number;
  quantity_received: number;
  component:
    | { name: string | null; sku: string | null }
    | Array<{ name: string | null; sku: string | null }>
    | null;
};

function getStatusVariant(status: string) {
  const normalized = status.toLowerCase();
  if (normalized === "received") return "success";
  if (normalized === "cancelled" || normalized === "archived") return "danger";
  if (normalized === "in_transit") return "info";
  return "warning";
}

type Props = {
  searchParams?: Promise<{
    receive_ok?: string;
    receive_error?: string;
  }>;
};

export default async function GoodsInwardsPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const supabase = await createSupabaseServerClient();
  const [{ data, error }, { data: lines }] = await Promise.all([
    supabase
      .from("purchase_order")
      .select("id,status,created_at,supplier:supplier_id(name)")
      .order("created_at", { ascending: false }),
    supabase
      .from("purchase_order_line")
      .select(
        "id,purchase_order_id,quantity,quantity_received,component:component_id(name,sku)"
      )
      .order("created_at", { ascending: false }),
  ]);

  const linesByPo = (lines ?? []).reduce<Record<string, PoLineRow[]>>((acc, line) => {
    const typedLine = line as PoLineRow;
    const current = acc[typedLine.purchase_order_id] ?? [];
    current.push(typedLine);
    acc[typedLine.purchase_order_id] = current;
    return acc;
  }, {});

  const totalsByPo = Object.entries(linesByPo).reduce<
    Record<string, { lineCount: number; ordered: number; received: number; remaining: number }>
  >((acc, [purchaseOrderId, poLines]) => {
    const ordered = poLines.reduce((sum, line) => sum + Number(line.quantity ?? 0), 0);
    const received = poLines.reduce(
      (sum, line) => sum + Number(line.quantity_received ?? 0),
      0
    );
    acc[purchaseOrderId] = {
      lineCount: poLines.length,
      ordered,
      received,
      remaining: Math.max(0, ordered - received),
    };
    return acc;
  }, {});

  return (
    <div className={styles.page}>
      {params.receive_ok ? (
        <div className={styles.notice} role="status">
          Receive OK — {params.receive_ok} lines / units recorded.
        </div>
      ) : null}
      {params.receive_error ? (
        <div className={styles.errorNotice} role="alert">
          Receive failed: {params.receive_error.replace(/_/g, " ")}
        </div>
      ) : null}
      <PageHeader
        eyebrow="Goods inwards"
        title="Receiving workflow"
        description="Receive inbound purchase order quantities in full or line by line while keeping remaining quantities visible."
      />

      <ListPanel
        eyebrow="Inbound receipts"
        title="Purchase orders awaiting receiving"
        description="Receive the remainder of a PO at once, or record partial receipts against individual lines."
      >
        {error ? (
          <EmptyState
            title="Failed to load goods inwards"
            message="The receiving queue could not be loaded from Supabase."
          />
        ) : (data ?? []).length === 0 ? (
          <EmptyState
            title="No goods inwards yet"
            message="Purchase orders will appear here once inbound supply exists."
          />
        ) : (
          (data as GoodsRow[]).map((row) => {
            const supplier = Array.isArray(row.supplier)
              ? row.supplier[0] ?? null
              : row.supplier;
            const totals = totalsByPo[row.id] ?? {
              lineCount: 0,
              ordered: 0,
              received: 0,
              remaining: 0,
            };
            const poLines = linesByPo[row.id] ?? [];

            return (
              <article key={row.id} className={styles.poCard}>
                <div className={styles.poSummary}>
                  <div className={styles.poIdentity}>
                    <div className={styles.poTitleRow}>
                      <h3>PO-{row.id.slice(0, 6)}</h3>
                      <StatusBadge variant={getStatusVariant(row.status)}>
                        {row.status}
                      </StatusBadge>
                    </div>
                    <p className={styles.meta}>
                      {supplier?.name ?? "Unknown supplier"} • Created{" "}
                      {new Date(row.created_at).toLocaleDateString("en-GB")}
                    </p>
                  </div>
                  <div className={styles.poMetrics}>
                    <div className={styles.metric}>
                      <span>Lines</span>
                      <strong>{totals.lineCount}</strong>
                    </div>
                    <div className={styles.metric}>
                      <span>Ordered</span>
                      <strong>{totals.ordered.toFixed(2)}</strong>
                    </div>
                    <div className={styles.metric}>
                      <span>Received</span>
                      <strong>{totals.received.toFixed(2)}</strong>
                    </div>
                    <div className={styles.metric}>
                      <span>Remaining</span>
                      <strong>{totals.remaining.toFixed(2)}</strong>
                    </div>
                  </div>
                  <form action={receivePurchaseOrder} className={styles.primaryActionWrap}>
                    <input type="hidden" name="purchase_order_id" value={row.id} />
                    <button
                      type="submit"
                      className={styles.primary}
                      disabled={
                        row.status === "received" ||
                        row.status === "cancelled" ||
                        totals.remaining <= 0
                      }
                    >
                      Receive remaining
                    </button>
                  </form>
                </div>

                {poLines.length > 0 ? (
                  <div className={styles.lineList}>
                    {poLines.map((line) => {
                      const component = Array.isArray(line.component)
                        ? line.component[0] ?? null
                        : line.component;
                      const remaining = Math.max(
                        0,
                        Number(line.quantity ?? 0) - Number(line.quantity_received ?? 0)
                      );
                      return (
                        <ListRow
                          key={line.id}
                          columnsTemplate="1.5fr 0.7fr 0.7fr 0.7fr 1.3fr"
                          className={styles.lineRow}
                        >
                          <div className={styles.cellStack}>
                            <strong>{component?.name ?? "Unknown"}</strong>
                            <span className={styles.meta}>
                              {component?.sku ? component.sku : "No SKU"}
                            </span>
                          </div>
                          <span>{Number(line.quantity ?? 0).toFixed(2)}</span>
                          <span>{Number(line.quantity_received ?? 0).toFixed(2)}</span>
                          <span>{remaining.toFixed(2)}</span>
                          <form action={receivePurchaseOrderLine} className={styles.lineForm}>
                            <input type="hidden" name="line_id" value={line.id} />
                            <input
                              type="number"
                              name="receive_qty"
                              min="0.01"
                              max={remaining.toFixed(2)}
                              step="0.01"
                              defaultValue={remaining > 0 ? remaining.toFixed(2) : "0.00"}
                              disabled={
                                row.status === "received" ||
                                row.status === "cancelled" ||
                                remaining <= 0
                              }
                            />
                            <button
                              type="submit"
                              className={styles.secondary}
                              disabled={
                                row.status === "received" ||
                                row.status === "cancelled" ||
                                remaining <= 0
                              }
                            >
                              Receive
                            </button>
                          </form>
                        </ListRow>
                      );
                    })}
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </ListPanel>
    </div>
  );
}
