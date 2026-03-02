import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "./goods-inwards.module.css";
import { receivePurchaseOrder, receivePurchaseOrderLine } from "./actions";

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

export default async function GoodsInwardsPage() {
  const supabase = await createSupabaseServerClient();
  const [{ data, error }, { data: lines }] = await Promise.all([
    supabase
      .from("purchase_order")
      .select("id,status,created_at,supplier:supplier_id(name)")
      .order("created_at", { ascending: false }),
    supabase
      .from("purchase_order_line")
      .select("id,purchase_order_id,quantity,quantity_received,component:component_id(name,sku)")
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
      <div className={styles.header}>
        <div>
          <h1>Goods Inwards</h1>
          <p>Inbound receipts and supplier deliveries</p>
        </div>
      </div>
      <div className={styles.table}>
        <div className={styles.tableHeader}>
          <span>PO</span>
          <span>Supplier</span>
          <span>Status</span>
          <span>Lines / Ordered</span>
          <span>Received / Remaining</span>
          <span>Actions</span>
        </div>
        {error ? (
          <div className={styles.empty}>Failed to load receipts.</div>
        ) : (data ?? []).length === 0 ? (
          <div className={styles.empty}>No goods inwards yet.</div>
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
              <div key={row.id} className={styles.poBlock}>
                <div className={styles.tableRow}>
                  <span>PO-{row.id.slice(0, 6)}</span>
                  <span>{supplier?.name ?? "Unknown supplier"}</span>
                  <span className={styles.status}>{row.status}</span>
                  <span>
                    {totals.lineCount.toString()} / {totals.ordered.toFixed(2)}
                  </span>
                  <span>
                    {totals.received.toFixed(2)} / {totals.remaining.toFixed(2)}
                  </span>
                  <form action={receivePurchaseOrder}>
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
                      Receive Remaining
                    </button>
                  </form>
                </div>
                {poLines.length > 0 ? (
                  <div className={styles.lineTable}>
                    <div className={styles.lineHeader}>
                      <span>Component</span>
                      <span>Ordered</span>
                      <span>Received</span>
                      <span>Remaining</span>
                      <span>Receive Qty</span>
                    </div>
                    {poLines.map((line) => {
                      const component = Array.isArray(line.component)
                        ? line.component[0] ?? null
                        : line.component;
                      const remaining = Math.max(
                        0,
                        Number(line.quantity ?? 0) - Number(line.quantity_received ?? 0)
                      );
                      return (
                        <div key={line.id} className={styles.lineRow}>
                          <span>
                            {component?.name ?? "Unknown"}
                            {component?.sku ? ` (${component.sku})` : ""}
                          </span>
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
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
