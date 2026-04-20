import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import DetailTabs from "./detail-tabs";
import styles from "./component-detail.module.css";

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
  created_at: string | null;
  supplier: { name: string } | Array<{ name: string }> | null;
  location: { name: string } | Array<{ name: string }> | null;
  group: { name: string } | Array<{ name: string }> | null;
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

type BomUsageRecord = {
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
  const supabase = await createSupabaseServerClient();

  const { data: component } = await supabase
    .from("component")
    .select("id,name,sku,unit,cost_per_unit,reorder_point,low_stock_level,created_at,supplier:supplier_id(name),location:location_id(name),group:group_id(name)")
    .eq("id", componentId)
    .maybeSingle();

  if (!component) notFound();

  const c = component as ComponentRecord;

  const [
    { data: balances },
    { data: movements },
    { data: bomUsage },
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
      .select("quantity,product_bom:product_bom_id(version,is_active,variant:variant_id(title,product:product_id(title)))")
      .eq("component_id", componentId),
  ]);

  const typedBalances = (balances ?? []) as BalanceRecord[];
  const typedMovements = (movements ?? []) as MovementRecord[];
  const typedBomUsage = (bomUsage ?? []) as BomUsageRecord[];

  const totalOnHand = typedBalances.reduce((s, b) => s + (b.on_hand ?? 0), 0);
  const totalInProd = typedBalances.reduce((s, b) => s + (b.in_prod ?? 0), 0);
  const totalReserved = typedBalances.reduce((s, b) => s + (b.reserved ?? 0), 0);
  const totalValue = totalOnHand * c.cost_per_unit;
  const available = totalOnHand - totalReserved;
  const belowReorder = c.reorder_point > 0 && available < c.reorder_point;
  const belowLowStock = c.low_stock_level > 0 && available <= c.low_stock_level;
  const supplierName = unwrap(c.supplier)?.name ?? null;
  const groupName = unwrap(c.group)?.name ?? null;
  const componentLocation = unwrap(c.location)?.name ?? null;
  const locationName = componentLocation
    ?? (typedBalances.length > 0 ? (unwrap(typedBalances[0].location)?.name ?? "N/A") : "N/A");

  const stats = [
    { label: "On Hand", value: String(totalOnHand), color: "default" as const },
    { label: "Allocated", value: String(totalReserved), color: "blue" as const },
    {
      label: "Available",
      value: String(available),
      color: belowLowStock ? "red" as const : "green" as const,
    },
    { label: "In Production", value: String(totalInProd), color: "default" as const },
    {
      label: "Low Stock Level",
      value: String(c.low_stock_level),
      color: belowLowStock ? "red" as const : "default" as const,
      alarm: belowLowStock,
    },
    {
      label: "Reorder Point",
      value: String(c.reorder_point),
      color: belowReorder ? "red" as const : "default" as const,
    },
    {
      label: "Value On Hand",
      value: totalValue.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }),
      color: "orange" as const,
    },
    { label: "Ideal Stock", value: String(c.reorder_point * 2 || 0), color: "default" as const },
  ];

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

          {belowLowStock && (
            <div className={styles.alarmBanner}>Low stock alarm — available stock is at or below {c.low_stock_level}</div>
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
              <dt>Low Stock Level</dt>
              <dd>{c.low_stock_level}</dd>
            </div>
            <div>
              <dt>Unit Cost</dt>
              <dd>
                {c.cost_per_unit.toLocaleString("en-US", {
                  style: "currency",
                  currency: "USD",
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
            <Link href="/app/inventory" className={styles.btnPrimary}>
              Open Inventory
            </Link>
            <Link href="/app/purchasing" className={styles.btnSecondary}>
              Review Purchasing
            </Link>
          </div>
          <p className={styles.actionHint}>
            Component edits and stock changes are currently handled through the
            inventory and purchasing workflows.
          </p>
        </aside>

        {/* ── Right: Tabbed content ─────── */}
        <DetailTabs stats={stats} movements={movementRows} bomUsage={bomRows} />
      </div>
    </div>
  );
}
