import Link from "next/link";
import styles from "./purchasing.module.css";
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import { getStatusVariant } from "./status-utils";
import PurchaseOrderCreateForm from "./po-create-form";
import PurchaseOrderLineForm from "./po-line-form";
import {
  createPurchaseOrder,
  createPurchaseOrderLine,
  updatePurchaseOrderLineQuantity,
  updatePurchaseOrderStatus,
} from "./actions";
import PageHeader from "../_ui/page-header";
import StatusBadge from "../_ui/status-badge";
import EmptyState from "../_ui/empty-state";
import ListPanel, { ListRow } from "../_ui/list-panel";
import HelpLink from "../_ui/help-link";

type PurchaseOrderRow = {
  id: string;
  status: string;
  created_at: string;
  supplier:
    | { id: string | null; name: string | null }
    | Array<{ id: string | null; name: string | null }>
    | null;
};

type PurchaseOrderLineRow = {
  id: string;
  quantity: number;
  quantity_received: number;
  purchase_order: { id: string } | Array<{ id: string }> | null;
  component:
    | { id: string | null; name: string | null; sku: string | null }
    | Array<{ id: string | null; name: string | null; sku: string | null }>
    | null;
};

export default async function PurchasingPage() {
  const context = await getServerTenantContext();
  if (!context) redirect("/auth/login");
  const { supabase, tenantId } = context;

  const [{ data, error }, { data: suppliers }, { data: components }, { data: poLines }] =
    await Promise.all([
      supabase
        .from("purchase_order")
        .select("id,status,created_at,supplier:supplier_id(id,name)")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(12),
      supabase.from("suppliers").select("id,name").eq("tenant_id", tenantId).order("name"),
      supabase.from("component").select("id,name,sku").eq("tenant_id", tenantId).order("name"),
      supabase
        .from("purchase_order_line")
        .select(
          "id,quantity,quantity_received,purchase_order:purchase_order_id(id),component:component_id(id,name,sku)"
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Operations"
        title="Purchasing"
        description="Create inbound purchase orders, manage status changes, and keep received quantities aligned with component demand."
        actions={
          <div className={styles.headerActions}>
            <PurchaseOrderLineForm
              purchaseOrders={(data ?? []).map((po) => ({
                id: po.id,
                label: `PO-${po.id.slice(0, 6)} (${po.status})`,
              }))}
              components={(
                (components ?? []) as Array<{ id: string; name: string | null; sku: string | null }>
              ).map((c) => ({
                id: c.id,
                label: `${c.name ?? "Unnamed"}${c.sku ? ` (${c.sku})` : ""}`,
              }))}
              action={createPurchaseOrderLine}
            />
            <PurchaseOrderCreateForm
              suppliers={
                (suppliers ?? []) as Array<{ id: string; name: string | null }>
              }
              action={createPurchaseOrder}
            />
          </div>
        }
      />
      <HelpLink slug="purchasing/purchase-orders" label="How to create a purchase order" />

      <ListPanel
        eyebrow="Orders"
        title="Purchase orders"
        description="Track PO status and keep supplier communication in sync with warehouse reality."
        columns={["PO", "Supplier", "Status", "Created", "Actions"]}
        columnsTemplate="0.8fr 1.1fr 0.8fr 0.8fr 1.2fr"
      >
        {error ? (
          <EmptyState
            title="Failed to load purchase orders"
            message="The purchase order list could not be retrieved from Supabase."
          />
        ) : (data ?? []).length === 0 ? (
          <EmptyState
            title="No purchase orders yet"
            message="Create a purchase order to begin tracking inbound supply."
          />
        ) : (
          (data as PurchaseOrderRow[]).map((row) => {
            const supplier = Array.isArray(row.supplier)
              ? row.supplier[0] ?? null
              : row.supplier;
            return (
              <ListRow
                key={row.id}
                columnsTemplate="0.8fr 1.1fr 0.8fr 0.8fr 1.2fr"
                className={styles.row}
              >
                <Link href={`/app/purchasing/${row.id}`} className={styles.poLink}>
                  PO-{row.id.slice(0, 6)}
                </Link>
                {supplier?.id ? (
                  <Link
                    href={`/app/suppliers/${supplier.id}`}
                    className={styles.poLink}
                  >
                    {supplier.name ?? "Unknown supplier"}
                  </Link>
                ) : (
                  <span className={styles.meta}>
                    {supplier?.name ?? "Unknown supplier"}
                  </span>
                )}
                <StatusBadge variant={getStatusVariant(row.status)}>
                  {row.status}
                </StatusBadge>
                <span className={styles.meta}>
                  {new Date(row.created_at).toLocaleDateString("en-GB")}
                </span>
                <form action={updatePurchaseOrderStatus} className={styles.inlineForm}>
                  <input type="hidden" name="purchase_order_id" value={row.id} />
                  <select name="status" defaultValue={row.status}>
                    <option value="open">Open</option>
                    <option value="in_transit">In Transit</option>
                    <option value="received">Received</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="archived">Archived</option>
                  </select>
                  <button type="submit" className={styles.inlineFormBtn}>
                    Update
                  </button>
                </form>
              </ListRow>
            );
          })
        )}
      </ListPanel>

      <ListPanel
        eyebrow="Lines"
        title="Purchase order lines"
        description="Review ordered quantities versus receipts and correct PO lines in place."
        columns={["PO", "Component", "Qty / Received", "Actions"]}
        columnsTemplate="0.85fr 1.5fr 0.8fr 1.2fr"
      >
        {(poLines ?? []).length === 0 ? (
          <EmptyState
            title="No purchase order lines yet"
            message="Add a line to a purchase order to track quantities and receipts."
          />
        ) : (
          (poLines as PurchaseOrderLineRow[]).map((line) => {
            const po = Array.isArray(line.purchase_order)
              ? line.purchase_order[0] ?? null
              : line.purchase_order;
            const component = Array.isArray(line.component)
              ? line.component[0] ?? null
              : line.component;
            return (
              <ListRow
                key={line.id}
                columnsTemplate="0.85fr 1.5fr 0.8fr 1.2fr"
                className={styles.row}
              >
                {po?.id ? (
                  <Link href={`/app/purchasing/${po.id}`} className={styles.poLink}>
                    PO-{po.id.slice(0, 6)}
                  </Link>
                ) : (
                  <strong>???</strong>
                )}
                <div className={styles.cellStack}>
                  {component?.id ? (
                    <Link
                      href={`/app/components/${component.id}`}
                      className={styles.poLink}
                    >
                      {component.name ?? "Unknown"}
                    </Link>
                  ) : (
                    <strong>{component?.name ?? "Unknown"}</strong>
                  )}
                  <span className={styles.meta}>
                    {component?.sku ?? "No SKU"}
                  </span>
                </div>
                <div className={styles.cellStack}>
                  <strong>{line.quantity}</strong>
                  <span className={styles.meta}>
                    Received {Number(line.quantity_received ?? 0)}
                  </span>
                </div>
                <form action={updatePurchaseOrderLineQuantity} className={styles.inlineForm}>
                  <input type="hidden" name="line_id" value={line.id} />
                  <input
                    name="quantity"
                    type="number"
                    step="0.01"
                    min="0.01"
                    defaultValue={line.quantity}
                  />
                  <button type="submit" className={styles.inlineFormBtn}>
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
