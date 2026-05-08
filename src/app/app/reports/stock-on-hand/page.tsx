import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import { ReportShell } from "../_components/report-shell";
import { ReportStatCards } from "../_components/report-stat-cards";
import { ReportTable, Badge } from "../_components/report-table";
import type { TableColumn } from "../_components/report-table";

interface Row {
  id: string;
  name: string;
  sku: string | null;
  location: string;
  on_hand: number;
  reserved: number;
  in_prod: number;
  value: number;
  reorder_point: number | null;
}

type BalanceRaw = {
  component_id: string;
  location_id: string;
  on_hand: number;
  reserved: number | null;
  in_prod: number | null;
  component: { id: string; name: string; sku: string | null; cost_per_unit: number | null; reorder_point: number | null } | null;
  location: { name: string } | null;
};

export default async function StockOnHandPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/auth/login");
  const { supabase, tenantId } = ctx;

  const { data: raw } = await supabase
    .from("inventory_balance")
    .select(
      "component_id,on_hand,reserved,in_prod,location_id,component:component_id(id,name,sku,cost_per_unit,reorder_point),location:location_id(name)"
    )
    .eq("tenant_id", tenantId)
    .gt("on_hand", 0)
    .order("on_hand", { ascending: false });

  const balances = (raw ?? []) as unknown as BalanceRaw[];

  const rows: Row[] = balances.map((r) => {
    const c = r.component;
    const loc = r.location;
    return {
      id: `${r.component_id}-${r.location_id}`,
      name: c?.name ?? "—",
      sku: c?.sku ?? null,
      location: loc?.name ?? "—",
      on_hand: r.on_hand,
      reserved: r.reserved ?? 0,
      in_prod: r.in_prod ?? 0,
      value: r.on_hand * (c?.cost_per_unit ?? 0),
      reorder_point: c?.reorder_point ?? null,
    };
  });

  const totalValue = rows.reduce((s, r) => s + r.value, 0);
  const belowReorder = rows.filter(
    (r) => r.reorder_point != null && r.on_hand <= r.reorder_point
  ).length;

  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(n);

  const columns: TableColumn<Row>[] = [
    { key: "name", header: "Component", render: (r) => r.name },
    { key: "sku", header: "SKU", render: (r) => r.sku ?? "—" },
    { key: "location", header: "Location", render: (r) => r.location },
    { key: "on_hand", header: "On hand", align: "right", render: (r) => r.on_hand.toLocaleString() },
    { key: "reserved", header: "Reserved", align: "right", render: (r) => r.reserved.toLocaleString() },
    { key: "in_prod", header: "In production", align: "right", render: (r) => r.in_prod.toLocaleString() },
    { key: "value", header: "Value", align: "right", render: (r) => fmtCurrency(r.value) },
    {
      key: "status", header: "Status",
      render: (r) => {
        if (r.on_hand === 0) return <Badge variant="red">Out</Badge>;
        if (r.reorder_point != null && r.on_hand <= r.reorder_point)
          return <Badge variant="amber">Low</Badge>;
        return <Badge variant="green">OK</Badge>;
      },
    },
  ];

  return (
    <ReportShell
      eyebrow="Inventory"
      title="Stock on hand"
      description="Current on-hand quantities and values across all locations."
      csvSlug="stock-on-hand"
      searchParams={sp}
    >
      <ReportStatCards
        cards={[
          { label: "Components in stock", value: rows.length },
          { label: "Total value", value: fmtCurrency(totalValue) },
          { label: "Below reorder point", value: belowReorder, variant: belowReorder > 0 ? "amber" : "default" },
        ]}
      />
      <ReportTable columns={columns} rows={rows} rowKey={(r) => r.id} />
    </ReportShell>
  );
}
