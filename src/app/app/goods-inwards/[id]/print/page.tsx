import { notFound, redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";

type Props = {
  params: Promise<{ id: string }>;
};

type GrnLine = {
  id: string;
  quantity_delivered: number;
  quantity_expected: number | null;
  cost_per_unit: number | null;
  notes: string | null;
  batch_number: string | null;
  component:
    | { name: string; sku: string | null }
    | Array<{ name: string; sku: string | null }>
    | null;
};

export default async function GrnPrintPage({ params }: Props) {
  const { id } = await params;

  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/auth/login");
  const { supabase, tenantId } = ctx;
  if (!tenantId) redirect("/auth/login");

  const [{ data: receipt }, { data: tenantData }] = await Promise.all([
    supabase
      .from("delivery_receipt")
      .select(
        `id, supplier_reference, supplier_name_override, received_at,
         notes, purchase_order_id,
         supplier:supplier_id(name),
         location:location_id(name),
         purchase_order:purchase_order_id(po_number),
         delivery_receipt_line(
           id, quantity_delivered, quantity_expected, cost_per_unit,
           notes, batch_number,
           component:component_id(name, sku)
         )`
      )
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .single(),
    supabase
      .from("tenant")
      .select("name")
      .eq("id", tenantId)
      .single(),
  ]);

  if (!receipt) notFound();

  // Resolve company name
  const companyName =
    (tenantData as { name: string } | null)?.name ?? "";

  // Resolve supplier name — linked supplier takes priority, then override
  const rawSupplier = Array.isArray(receipt.supplier)
    ? receipt.supplier[0]
    : receipt.supplier;
  const supplierName =
    (rawSupplier as { name: string } | null)?.name ??
    (receipt.supplier_name_override as string | null) ??
    "—";

  // Resolve location name
  const rawLocation = Array.isArray(receipt.location)
    ? receipt.location[0]
    : receipt.location;
  const locationName =
    (rawLocation as { name: string } | null)?.name ?? "—";

  const lines = ((receipt.delivery_receipt_line ?? []) as GrnLine[]);

  // Total received value — null when no line has a cost
  const totalValue = lines.reduce<number | null>((acc, line) => {
    if (line.cost_per_unit === null) return acc;
    return (acc ?? 0) + line.quantity_delivered * line.cost_per_unit;
  }, null);

  const dateStr = new Date(receipt.received_at as string).toLocaleDateString(
    "en-AU",
    { day: "numeric", month: "long", year: "numeric" }
  );

  const poRef = receipt.purchase_order_id
    ? (() => {
        const rawPo = Array.isArray(receipt.purchase_order) ? receipt.purchase_order[0] : receipt.purchase_order;
        return (rawPo as { po_number: string | null } | null)?.po_number ?? `PO-${(receipt.purchase_order_id as string).slice(0, 8).toUpperCase()}`;
      })()
    : "—";

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        body { font-family: Arial, sans-serif; color: #111; background: #fff; margin: 0; padding: 24px 32px; font-size: 0.88rem; }
        @media print {
          body { padding: 0; }
          .no-print { display: none !important; }
        }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 16px; }
        .company { font-size: 1.1rem; font-weight: 700; margin: 0 0 2px; }
        .doc-title { font-size: 1.1rem; font-weight: 700; text-align: right; margin: 0 0 4px; }
        .doc-ref { font-size: 0.82rem; color: #444; text-align: right; margin: 0; }
        .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; margin-bottom: 16px; font-size: 0.85rem; }
        .meta-label { color: #555; }
        table { width: 100%; border-collapse: collapse; font-size: 0.82rem; margin-top: 8px; }
        th { text-align: left; padding: 6px 6px; font-size: 0.75rem; border-bottom: 1px solid #888; font-weight: 600; }
        th.r { text-align: right; }
        td { padding: 6px 6px; border-bottom: 1px solid #ddd; vertical-align: top; }
        td.r { text-align: right; }
        .total-row { margin-top: 8px; text-align: right; font-size: 0.85rem; }
        .sig-block { margin-top: 24px; display: flex; gap: 48px; }
        .sig-field { flex: 1; }
        .sig-label { font-size: 0.75rem; color: #555; margin-bottom: 4px; }
        .sig-line { border-bottom: 1px solid #111; height: 24px; }
        footer { margin-top: 16px; font-size: 0.72rem; color: #888; border-top: 1px solid #ddd; padding-top: 6px; }
        .print-btn { margin-bottom: 16px; padding: 8px 16px; font-size: 0.9rem; cursor: pointer; }
      `}</style>

      <button className="print-btn no-print" id="print-btn">
        Print GRN
      </button>
      <script
        dangerouslySetInnerHTML={{
          __html:
            "document.getElementById('print-btn').onclick=function(){window.print();};",
        }}
      />

      <div className="header">
        <div>
          <p className="company">{companyName}</p>
        </div>
        <div>
          <p className="doc-title">GOODS RECEIVED NOTE</p>
          <p className="doc-ref">GRN: {receipt.supplier_reference as string}</p>
        </div>
      </div>

      <div className="meta-grid">
        <div>
          <span className="meta-label">Supplier: </span>
          {supplierName}
        </div>
        <div>
          <span className="meta-label">Date received: </span>
          {dateStr}
        </div>
        <div>
          <span className="meta-label">Location: </span>
          {locationName}
        </div>
        <div>
          <span className="meta-label">Purchase Order: </span>
          {poRef}
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Component</th>
            <th>SKU</th>
            <th className="r">Expected</th>
            <th className="r">Delivered</th>
            <th className="r">Variance</th>
            <th className="r">Cost / unit</th>
            <th className="r">Total</th>
            <th>Batch #</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) => {
            const comp = Array.isArray(line.component)
              ? line.component[0]
              : line.component;
            const variance =
              line.quantity_expected !== null
                ? line.quantity_delivered - line.quantity_expected
                : null;
            const lineTotal =
              line.cost_per_unit !== null
                ? line.quantity_delivered * line.cost_per_unit
                : null;
            return (
              <tr key={line.id}>
                <td>{comp?.name ?? "—"}</td>
                <td>{comp?.sku ?? "—"}</td>
                <td className="r">{line.quantity_expected ?? "—"}</td>
                <td className="r">{line.quantity_delivered}</td>
                <td className="r">
                  {variance === null
                    ? "—"
                    : variance > 0
                    ? `+${variance}`
                    : String(variance)}
                </td>
                <td className="r">
                  {line.cost_per_unit !== null
                    ? `$${line.cost_per_unit.toFixed(2)}`
                    : "—"}
                </td>
                <td className="r">
                  {lineTotal !== null ? `$${lineTotal.toFixed(2)}` : "—"}
                </td>
                <td>{line.batch_number ?? "—"}</td>
                <td>{line.notes ?? ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {totalValue !== null && (
        <div className="total-row">
          <strong>
            Total received value: ${totalValue.toFixed(2)}
          </strong>
        </div>
      )}

      <div className="sig-block">
        <div className="sig-field">
          <p className="sig-label">Received by:</p>
          <div className="sig-line" />
        </div>
        <div className="sig-field">
          <p className="sig-label">Date:</p>
          <div className="sig-line" />
        </div>
        <div className="sig-field">
          <p className="sig-label">Signature:</p>
          <div className="sig-line" />
        </div>
      </div>

      <footer>
        Generated by Manuva &middot;{" "}
        {new Date().toLocaleDateString("en-AU", {
          day: "numeric",
          month: "long",
          year: "numeric",
        })}
      </footer>
    </>
  );
}
