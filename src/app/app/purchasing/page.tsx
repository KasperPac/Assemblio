import styles from "./purchasing.module.css";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import PurchaseOrderCreateForm from "./po-create-form";
import PurchaseOrderLineForm from "./po-line-form";
import {
  createPurchaseOrder,
  createPurchaseOrderLine,
  updatePurchaseOrderLineQuantity,
  updatePurchaseOrderStatus,
} from "./actions";

type PurchaseOrderRow = {
  id: string;
  status: string;
  created_at: string;
  supplier: { name: string | null } | Array<{ name: string | null }> | null;
};

type PurchaseOrderLineRow = {
  id: string;
  quantity: number;
  quantity_received: number;
  purchase_order:
    | { id: string }
    | Array<{ id: string }>
    | null;
  component:
    | { name: string | null; sku: string | null }
    | Array<{ name: string | null; sku: string | null }>
    | null;
};

export default async function PurchasingPage() {
  const supabase = await createSupabaseServerClient();
  const [{ data, error }, { data: suppliers }, { data: components }, { data: poLines }] =
    await Promise.all([
    supabase
      .from("purchase_order")
      .select("id,status,created_at,supplier:supplier_id(name)")
      .order("created_at", { ascending: false })
      .limit(12),
    supabase.from("suppliers").select("id,name").order("name"),
    supabase.from("component").select("id,name,sku").order("name"),
    supabase
      .from("purchase_order_line")
      .select(
        "id,quantity,quantity_received,purchase_order:purchase_order_id(id),component:component_id(name,sku)"
      )
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1>Purchasing</h1>
          <p>Track suppliers, create purchase orders, and receive inbound stock.</p>
        </div>
      </div>
      <PurchaseOrderCreateForm
        suppliers={(suppliers ?? []) as Array<{ id: string; name: string | null }>}
        action={createPurchaseOrder}
      />
      <PurchaseOrderLineForm
        purchaseOrders={(data ?? []).map((po) => ({
          id: po.id,
          label: `PO-${po.id.slice(0, 6)} (${po.status})`,
        }))}
        components={((components ?? []) as Array<{ id: string; name: string | null; sku: string | null }>).map((c) => ({
          id: c.id,
          label: `${c.name ?? "Unnamed"}${c.sku ? ` (${c.sku})` : ""}`,
        }))}
        action={createPurchaseOrderLine}
      />
      <div className={styles.table}>
        <div className={styles.tableHeader}>
          <span>PO</span>
          <span>Supplier</span>
          <span>Status</span>
          <span>Created</span>
          <span>Actions</span>
        </div>
        {error ? (
          <div className={styles.empty}>Failed to load purchase orders.</div>
        ) : (data ?? []).length === 0 ? (
          <div className={styles.empty}>No purchase orders yet.</div>
        ) : (
          (data as PurchaseOrderRow[]).map((row) => {
            const supplier = Array.isArray(row.supplier)
              ? row.supplier[0] ?? null
              : row.supplier;
            return (
              <div key={row.id} className={styles.tableRow}>
                <span>PO-{row.id.slice(0, 6)}</span>
                <span>{supplier?.name ?? "Unknown supplier"}</span>
                <span className={styles.status}>{row.status}</span>
                <span>{new Date(row.created_at).toLocaleDateString("en-GB")}</span>
                <form action={updatePurchaseOrderStatus} className={styles.inlineForm}>
                  <input type="hidden" name="purchase_order_id" value={row.id} />
                  <select name="status" defaultValue={row.status}>
                    <option value="open">Open</option>
                    <option value="in_transit">In Transit</option>
                    <option value="received">Received</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="archived">Archived</option>
                  </select>
                  <button type="submit">Update</button>
                </form>
              </div>
            );
          })
        )}
      </div>
      <div className={styles.table}>
        <div className={styles.tableHeaderLines}>
          <span>PO</span>
          <span>Component</span>
          <span>Qty / Received</span>
          <span>Actions</span>
        </div>
        {(poLines ?? []).length === 0 ? (
          <div className={styles.empty}>No purchase order lines yet.</div>
        ) : (
          (poLines as PurchaseOrderLineRow[]).map((line) => {
            const po = Array.isArray(line.purchase_order)
              ? line.purchase_order[0] ?? null
              : line.purchase_order;
            const component = Array.isArray(line.component)
              ? line.component[0] ?? null
              : line.component;
            return (
              <div key={line.id} className={styles.tableRowLines}>
                <span>PO-{po?.id?.slice(0, 6) ?? "???"}</span>
                <span>
                  {component?.name ?? "Unknown"}
                  {component?.sku ? ` (${component.sku})` : ""}
                </span>
                <span>
                  {line.quantity} / {Number(line.quantity_received ?? 0)}
                </span>
                <form action={updatePurchaseOrderLineQuantity} className={styles.inlineForm}>
                  <input type="hidden" name="line_id" value={line.id} />
                  <input
                    name="quantity"
                    type="number"
                    step="0.01"
                    min="0.01"
                    defaultValue={line.quantity}
                  />
                  <button type="submit">Save</button>
                </form>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
