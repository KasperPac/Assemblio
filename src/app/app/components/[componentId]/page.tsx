import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import DetailTabs from "./detail-tabs";
import styles from "./component-detail.module.css";
import { getStockStatus } from "../helpers";
import { getAvgActualLeadTimesForComponent } from "@/lib/suppliers/catalog";

type Props = {
  params: Promise<{ componentId: string }>;
};

type ComponentRecord = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  cost_per_unit: number;
  reorder_point: number;
  low_stock_level: number;
  archived_at: string | null;
  supplier_id: string | null;
  group_id: string | null;
  created_at: string | null;
  bin_sub_location_id: string | null;
  bin_aisle_id: string | null;
  bin_bay_id: string | null;
  tenant_id: string;
  supplier: { name: string } | Array<{ name: string }> | null;
  location: { name: string } | Array<{ name: string }> | null;
  group: { name: string } | Array<{ name: string }> | null;
};

type SupplierCatalogRow = {
  id: string;
  supplier_id: string;
  unit_cost: number | null;
  currency: string | null;
  lead_time_days: number | null;
  moq: number | null;
  supplier_part_number: string | null;
  is_preferred: boolean;
  supplier: { id: string; name: string } | Array<{ id: string; name: string }> | null;
};

type BalanceRecord = {
  on_hand: number;
  in_prod: number;
  reserved: number;
  location: { name: string } | Array<{ name: string }> | null;
};

type MovementRecord = {
  id: string;
  delta_on_hand: number;
  delta_in_prod: number;
  reason: string | null;
  reference_type: string | null;
  created_at: string;
};

type ReceiptLineRaw = {
  quantity_delivered: number;
  delivery_receipt: {
    received_at: string;
    supplier_reference: string;
    supplier_name_override: string | null;
    supplier: { name: string } | Array<{ name: string }> | null;
  } | Array<{
    received_at: string;
    supplier_reference: string;
    supplier_name_override: string | null;
    supplier: { name: string } | Array<{ name: string }> | null;
  }> | null;
};

type BomUsageRecord = {
  product_bom_id: string;
  quantity: number;
  product_bom: {
    version: number;
    is_active: boolean;
    variant: {
      title: string | null;
      product: { title: string } | Array<{ title: string }> | null;
    } | Array<{
      title: string | null;
      product: { title: string } | Array<{ title: string }> | null;
    }> | null;
  } | Array<{
    version: number;
    is_active: boolean;
    variant: {
      title: string | null;
      product: { title: string } | Array<{ title: string }> | null;
    } | Array<{
      title: string | null;
      product: { title: string } | Array<{ title: string }> | null;
    }> | null;
  }> | null;
};

function unwrap<T>(val: T | T[] | null): T | null {
  if (val == null) return null;
  return Array.isArray(val) ? val[0] ?? null : val;
}

export default async function ComponentDetailPage({ params }: Props) {
  const { componentId } = await params;

  const context = await getServerTenantContext();
  if (!context) redirect("/auth/login");
  const { supabase, tenantId: _tenantId, role } = context;
  const tenantId = _tenantId!; // non-null: layout.tsx redirects tenant-less operators to /app/super-admin
  const isAdmin = role === "admin" || role === "super_admin";

  const { data: component } = await supabase
    .from("component")
    .select("id,name,sku,unit,cost_per_unit,reorder_point,low_stock_level,archived_at,created_at,tenant_id,bin_sub_location_id,bin_aisle_id,bin_bay_id,supplier_id,group_id,supplier:supplier_id(name),location:location_id(name),group:group_id(name)")
    .eq("id", componentId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!component) notFound();

  const c = component as ComponentRecord;

  // Only fetch bin location data for admins — members never see the Location tab
  const [whRes, slRes, aisleRes, bayRes] = isAdmin
    ? await Promise.all([
        supabase.from("location").select("id, name").eq("tenant_id", tenantId).order("name"),
        supabase.from("bin_sub_location").select("id, name, warehouse_id").eq("tenant_id", tenantId).order("name"),
        supabase.from("bin_aisle").select("id, name, warehouse_id, sub_location_id").eq("tenant_id", tenantId).order("name"),
        supabase.from("bin_bay").select("id, name, aisle_id").eq("tenant_id", tenantId).order("name"),
      ])
    : ([{ data: [] }, { data: [] }, { data: [] }, { data: [] }] as const);

  const currentAisleForWh = (aisleRes.data ?? []).find((a: { id: string }) => a.id === c.bin_aisle_id) as { warehouse_id: string } | undefined;
  const currentSlForWh = (slRes.data ?? []).find((s: { id: string }) => s.id === c.bin_sub_location_id) as { warehouse_id: string } | undefined;
  const currentWarehouseId = currentAisleForWh?.warehouse_id ?? currentSlForWh?.warehouse_id ?? null;

  const [
    { data: balances },
    { data: movements },
    { data: bomUsage },
    { data: recentReceiptLines },
    { data: supplierCatalogRaw },
    { data: allSuppliersRaw },
  ] = await Promise.all([
    supabase
      .from("inventory_balance")
      .select("on_hand,in_prod,reserved,location:location_id(name)")
      .eq("component_id", componentId),
    supabase
      .from("inventory_movement")
      .select("id,delta_on_hand,delta_in_prod,reason,reference_type,created_at")
      .eq("component_id", componentId)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("product_bom_component")
      .select("quantity,product_bom_id,product_bom:product_bom_id(version,is_active,variant:variant_id(title,product:product_id(title)))")
      .eq("component_id", componentId),
    supabase
      .from("delivery_receipt_line")
      .select("quantity_delivered,delivery_receipt:delivery_receipt_id(received_at,supplier_reference,supplier_name_override,supplier:supplier_id(name))")
      .eq("component_id", componentId)
      .order("id", { ascending: false })
      .limit(5),
    supabase
      .from("supplier_components")
      .select(`
        id, supplier_id, unit_cost, currency, lead_time_days, moq,
        supplier_part_number, is_preferred,
        supplier:supplier_id(id, name)
      `)
      .eq("tenant_id", tenantId)
      .eq("component_id", componentId)
      .order("is_preferred", { ascending: false }),
    supabase
      .from("suppliers")
      .select("id, name")
      .eq("tenant_id", tenantId)
      .eq("is_active", true)
      .order("name"),
  ]);

  const avgLtMap = await getAvgActualLeadTimesForComponent(supabase, tenantId, componentId);

  const supplierCatalog = ((supplierCatalogRaw ?? []) as SupplierCatalogRow[]).map((row) => {
    const supplier = Array.isArray(row.supplier) ? row.supplier[0] : row.supplier;
    const lt = avgLtMap.get(row.supplier_id);
    return {
      id: row.id,
      supplierId: row.supplier_id,
      supplierName: supplier?.name ?? "—",
      partNumber: row.supplier_part_number,
      unitCost: row.unit_cost,
      moq: row.moq,
      leadTimeDays: row.lead_time_days,
      isPreferred: row.is_preferred,
      avgActualDays: lt ? lt.avgDays : null,
    };
  });

  const typedBalances = (balances ?? []) as BalanceRecord[];
  const typedMovements = (movements ?? []) as MovementRecord[];
  const typedBomUsage = (bomUsage ?? []) as BomUsageRecord[];

  const totalOnHand = typedBalances.reduce((s, b) => s + (b.on_hand ?? 0), 0);
  const totalInProd = typedBalances.reduce((s, b) => s + (b.in_prod ?? 0), 0);
  const totalReserved = typedBalances.reduce((s, b) => s + (b.reserved ?? 0), 0);
  const available = totalOnHand - totalReserved;
  const belowReorder = c.reorder_point > 0 && available < c.reorder_point;
  const supplierName = unwrap(c.supplier)?.name ?? null;
  const groupName = unwrap(c.group)?.name ?? null;
  const componentLocation = unwrap(c.location)?.name ?? null;
  const locationName = componentLocation
    ?? (typedBalances.length > 0 ? (unwrap(typedBalances[0].location)?.name ?? "N/A") : "N/A");

  const status = getStockStatus(available, c.reorder_point);
  const totalValue = totalOnHand * c.cost_per_unit;

  const stats = [
    {
      label: "On Hand",
      value: String(totalOnHand),
      color: "default" as const,
    },
    {
      label: "Available",
      value: String(available),
      color: available <= 0 ? "red" as const : belowReorder ? "orange" as const : "green" as const,
      highlight: (status === "critical" ? "danger" : status === "low" ? "warning" : undefined) as "danger" | "warning" | undefined,
      subText: totalReserved > 0 ? `${totalReserved} committed to production` : undefined,
    },
    {
      label: "Reserved",
      value: String(totalReserved),
      color: "default" as const,
      subText: "Committed to open orders",
    },
    {
      label: "In Production",
      value: String(totalInProd),
      color: "default" as const,
      subText: "Allocated to active jobs",
    },
    {
      label: "Reorder Point",
      value: String(c.reorder_point),
      color: "default" as const,
      subText: belowReorder ? `Below threshold by ${c.reorder_point - available}` : undefined,
      subTextDanger: belowReorder,
    },
  ];

  const recentReceipts = ((recentReceiptLines ?? []) as ReceiptLineRaw[]).map((line) => {
    const dr = Array.isArray(line.delivery_receipt)
      ? line.delivery_receipt[0]
      : line.delivery_receipt;
    const supplierRaw = dr?.supplier;
    const supplierName = supplierRaw
      ? Array.isArray(supplierRaw) ? supplierRaw[0]?.name : supplierRaw.name
      : null;
    return {
      date: dr?.received_at
        ? new Date(dr.received_at).toLocaleDateString("en-AU", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : "--",
      supplierName: supplierName ?? dr?.supplier_name_override ?? "--",
      reference: dr?.supplier_reference ?? "--",
      qty: line.quantity_delivered,
    };
  });

  const movementRows = typedMovements.map((m) => ({
    id: m.id,
    date: new Date(m.created_at).toLocaleDateString("en-GB"),
    deltaOnHand: m.delta_on_hand,
    deltaInProd: m.delta_in_prod,
    reason: m.reason ?? "--",
    refType: m.reference_type ?? "--",
  }));

  const bomRows = typedBomUsage.map((row) => {
    const bom = unwrap(row.product_bom);
    const variant = bom ? unwrap(bom.variant) : null;
    const product = variant ? unwrap(variant.product) : null;
    return {
      bomId: row.product_bom_id as string,
      product: product?.title ?? "--",
      variant: variant?.title ?? "--",
      version: bom?.version ?? 0,
      quantity: row.quantity,
      active: bom?.is_active ?? false,
    };
  });

  return (
    <div className={styles.page}>
      <div className={styles.topRow}>
        <Link href="/app/components" className={styles.backButton}>
          &larr; Back
        </Link>
      </div>

      <div className={styles.layout}>
        {/* ── Left: Component info card ──── */}
        <aside className={styles.infoCard}>
          <h1 className={styles.componentName}>{c.name}</h1>
          {c.sku && <span className={styles.skuBadge}>{c.sku}</span>}

          {status !== "ok" && (
            <div className={styles.alarmBanner}>
              {status === "critical"
                ? `Critical — no available stock${totalReserved > 0 ? ` (${totalReserved} committed to production)` : ""}`
                : `Low stock — ${available} available, reorder point is ${c.reorder_point}`}
            </div>
          )}

          <div className={styles.metaGrid}>
            <div>
              <dt>Unit of Measure</dt>
              <dd>{c.unit ?? "ea"}</dd>
            </div>
            <div>
              <dt>Location</dt>
              <dd>{locationName}</dd>
            </div>
            <div>
              <dt>On Hand</dt>
              <dd className={styles.metaBold}>{totalOnHand}</dd>
            </div>
            <div>
              <dt>Reorder Point</dt>
              <dd>{c.reorder_point}</dd>
            </div>
            <div>
              <dt>Unit Cost</dt>
              <dd>
                {c.cost_per_unit.toLocaleString("en-AU", {
                  style: "currency",
                  currency: "AUD",
                })}
              </dd>
            </div>
            <div>
              <dt>Stock Value</dt>
              <dd>
                {totalValue.toLocaleString("en-AU", {
                  style: "currency",
                  currency: "AUD",
                  maximumFractionDigits: 0,
                })}
              </dd>
            </div>
            <div>
              <dt>Primary Supplier</dt>
              <dd>{supplierName ?? "None"}</dd>
            </div>
            <div>
              <dt>Group</dt>
              <dd>{groupName ?? "None"}</dd>
            </div>
          </div>

          <div className={styles.cardActions}>
            <Link href="/app/goods-inwards/new" className={styles.btnSecondary}>
              Receive stock
            </Link>
          </div>
        </aside>

        {/* ── Right: Tabbed content ─────── */}
        <DetailTabs
          stats={stats}
          movements={movementRows}
          bomUsage={bomRows}
          recentReceipts={recentReceipts}
          supplierCatalog={supplierCatalog}
          allSuppliers={(allSuppliersRaw ?? []) as Array<{ id: string; name: string }>}
          componentId={componentId}
          isAdmin={isAdmin}
          warehouses={(whRes.data ?? []) as Array<{ id: string; name: string }>}
          subLocations={(slRes.data ?? []) as Array<{ id: string; name: string; warehouse_id: string }>}
          aisles={(aisleRes.data ?? []) as Array<{ id: string; name: string; warehouse_id: string; sub_location_id: string | null }>}
          bays={(bayRes.data ?? []) as Array<{ id: string; name: string; aisle_id: string }>}
          currentWarehouseId={currentWarehouseId}
          currentSubLocationId={c.bin_sub_location_id}
          currentAisleId={c.bin_aisle_id}
          currentBayId={c.bin_bay_id}
        />
      </div>
    </div>
  );
}
