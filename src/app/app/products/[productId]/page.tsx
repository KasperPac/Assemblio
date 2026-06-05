import { notFound } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import styles from "../product-detail.module.css";
import PageHeader from "@/app/app/_ui/page-header";
import { VariantCoverageTable } from "./variant-coverage-table";
import type { DisplayBom, VariantSummary } from "./variant-coverage-table";
import { timeAgo } from "@/lib/utils/time";
import { sanitizeProductHtml } from "@/lib/utils/sanitize";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProductRecord = {
  id: string;
  title: string;
  shopify_id: string;
  created_at: string | null;
  last_synced_at: string | null;
  image_url: string | null;
  description: string | null;
};

type VariantRow = {
  id: string;
  title: string | null;
  sku: string | null;
  price: number | null;
};

type BomRow = {
  id: string;
  variant_id: string;
  version: number;
  status: string;
  is_active: boolean;
  created_at: string | null;
};

type BomLineRow = {
  id: string;
  product_bom_id: string;
  quantity: number;
  yield_pct: number;
  component:
    | { cost_per_unit: number | null }
    | Array<{ cost_per_unit: number | null }>
    | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function calcMatCost(
  lines: Array<{ quantity: number; yield_pct: number; cost: number | null }>
): { cost: number | null; hasMissingCosts: boolean } {
  if (lines.length === 0) return { cost: null, hasMissingCosts: false };
  const hasMissing = lines.some((l) => l.cost == null);
  if (hasMissing) return { cost: null, hasMissingCosts: true };
  const total = lines.reduce(
    (sum, l) => sum + (l.cost! * l.quantity) / l.yield_pct,
    0
  );
  return { cost: total, hasMissingCosts: false };
}

function calcMargin(cost: number | null, sell: number | null): number | null {
  if (cost === null || sell === null || sell <= 0) return null;
  return ((sell - cost) / sell) * 100;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

type Props = {
  params: Promise<{ productId: string }>;
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ProductDetailPage({ params }: Props) {
  const { productId } = await params;

  const context = await getServerTenantContext();
  if (!context) notFound();
  const { supabase, tenantId } = context;

  // Fetch product
  const { data: productData } = await supabase
    .from("product")
    .select("id,title,shopify_id,created_at,last_synced_at,image_url,description")
    .eq("id", productId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!productData) notFound();
  const product = productData as ProductRecord;

  // Fetch all variants for this product
  const { data: variantsData } = await supabase
    .from("product_variant")
    .select("id,title,sku,price")
    .eq("product_id", productId)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  const variants = (variantsData ?? []) as VariantRow[];

  const variantIds = variants.map((v) => v.id);

  // Fetch all BOMs for these variants
  let boms: BomRow[] = [];
  let bomLines: BomLineRow[] = [];
  type LaborRow = {
    product_bom_id: string;
    department_id: string;
    run_hours_per_unit: number;
    admin_hours_per_unit: number;
    electricity_kwh_per_unit: number;
    gas_units_per_unit: number;
  };
  let laborLines: LaborRow[] = [];
  type RateRow = {
    department_id: string;
    labor_rate_per_hour: number;
    admin_rate_per_hour: number;
    electricity_rate_per_kwh: number;
    gas_rate_per_unit: number;
    overhead_rate_per_hour: number;
    effective_from: string;
    effective_to: string | null;
  };
  const ratesByDepartment = new Map<string, RateRow>();

  if (variantIds.length > 0) {
    const { data: bomsData } = await supabase
      .from("product_bom")
      .select("id,variant_id,version,status,is_active,created_at")
      .in("variant_id", variantIds)
      .eq("tenant_id", tenantId)
      .order("is_active", { ascending: false })
      .order("version", { ascending: false });

    boms = (bomsData ?? []) as BomRow[];

    const bomIds = boms.map((b) => b.id);

    if (bomIds.length > 0) {
      const [linesResult, laborResult] = await Promise.all([
        supabase
          .from("product_bom_component")
          .select("id,product_bom_id,quantity,yield_pct,component:component_id(cost_per_unit)")
          .in("product_bom_id", bomIds)
          .eq("tenant_id", tenantId),
        supabase
          .from("product_bom_labor")
          .select(
            "product_bom_id,department_id,run_hours_per_unit,admin_hours_per_unit,electricity_kwh_per_unit,gas_units_per_unit"
          )
          .in("product_bom_id", bomIds)
          .eq("tenant_id", tenantId),
      ]);

      bomLines = (linesResult.data ?? []) as BomLineRow[];
      laborLines = (laborResult.data ?? []) as LaborRow[];

      const deptIds = Array.from(new Set(laborLines.map((l) => l.department_id)));
      if (deptIds.length > 0) {
        const today = new Date().toISOString().slice(0, 10);
        const { data: rateRowsData } = await supabase
          .from("cost_rate_schedule")
          .select(
            "department_id,labor_rate_per_hour,admin_rate_per_hour,electricity_rate_per_kwh,gas_rate_per_unit,overhead_rate_per_hour,effective_from,effective_to,staff_member_id"
          )
          .eq("tenant_id", tenantId)
          .is("staff_member_id", null)
          .in("department_id", deptIds)
          .lte("effective_from", today)
          .order("effective_from", { ascending: false });
        for (const row of (rateRowsData ?? []) as Array<RateRow & { staff_member_id: string | null }>) {
          if (row.effective_to !== null && row.effective_to < today) continue;
          if (!ratesByDepartment.has(row.department_id)) {
            ratesByDepartment.set(row.department_id, row);
          }
        }
      }
    }
  }

  const labourCostByBom = new Map<string, number>();
  const overheadCostByBom = new Map<string, number>();
  for (const row of laborLines) {
    const rate = ratesByDepartment.get(row.department_id);
    if (!rate) continue;
    const labour = Number(row.run_hours_per_unit) * Number(rate.labor_rate_per_hour);
    const overhead =
      Number(row.run_hours_per_unit) * Number(rate.overhead_rate_per_hour) +
      Number(row.admin_hours_per_unit) * Number(rate.admin_rate_per_hour) +
      Number(row.electricity_kwh_per_unit) * Number(rate.electricity_rate_per_kwh) +
      Number(row.gas_units_per_unit) * Number(rate.gas_rate_per_unit);
    labourCostByBom.set(row.product_bom_id, (labourCostByBom.get(row.product_bom_id) ?? 0) + labour);
    overheadCostByBom.set(row.product_bom_id, (overheadCostByBom.get(row.product_bom_id) ?? 0) + overhead);
  }

  // Group BOMs and lines by variant/bom
  const bomsByVariant = new Map<string, BomRow[]>();
  for (const bom of boms) {
    const existing = bomsByVariant.get(bom.variant_id) ?? [];
    existing.push(bom);
    bomsByVariant.set(bom.variant_id, existing);
  }

  const linesByBom = new Map<string, BomLineRow[]>();
  for (const line of bomLines) {
    const existing = linesByBom.get(line.product_bom_id) ?? [];
    existing.push(line);
    linesByBom.set(line.product_bom_id, existing);
  }

  // Build variant summaries
  const variantSummaries: VariantSummary[] = variants.map((v) => {
    const variantBoms = bomsByVariant.get(v.id) ?? [];

    // Pick display BOM: active first, then latest draft, never archived
    const activeBom = variantBoms.find((b) => b.is_active);
    const displayBomRaw = activeBom ?? variantBoms.find((b) => b.status === "draft") ?? null;

    let displayBom: DisplayBom | null = null;
    if (displayBomRaw) {
      const lines = linesByBom.get(displayBomRaw.id) ?? [];
      const lineDetails = lines.map((l) => {
        const comp = Array.isArray(l.component) ? l.component[0] : l.component;
        return {
          quantity: l.quantity,
          yield_pct: l.yield_pct,
          cost: comp?.cost_per_unit ?? null,
        };
      });
      const { cost, hasMissingCosts } = calcMatCost(lineDetails);
      displayBom = {
        id: displayBomRaw.id,
        version: displayBomRaw.version,
        status: displayBomRaw.status,
        is_active: displayBomRaw.is_active,
        created_at: displayBomRaw.created_at,
        lineCount: lines.length,
        matCost: cost,
        hasMissingCosts,
      };
    }

    const margin = displayBom?.is_active
      ? calcMargin(displayBom.matCost, v.price)
      : null;

    let actualMargin: number | null = null;
    if (displayBom?.is_active && displayBom.matCost !== null && v.price !== null && v.price > 0) {
      const labour = labourCostByBom.get(displayBom.id) ?? 0;
      const overhead = overheadCostByBom.get(displayBom.id) ?? 0;
      const total = displayBom.matCost + labour + overhead;
      actualMargin = ((v.price - total) / v.price) * 100;
    }

    return {
      id: v.id,
      title: v.title,
      sku: v.sku,
      price: v.price,
      displayBom,
      margin,
      actualMargin,
    };
  });

  // Coverage stats
  const withBom = variantSummaries.filter((v) => v.displayBom !== null).length;
  const withoutBom = variantSummaries.length - withBom;
  const coveragePct =
    variantSummaries.length > 0
      ? Math.round((withBom / variantSummaries.length) * 100)
      : 0;

  // Footer stats: avg margin + worst variant
  const marginsWithValues = variantSummaries.filter((v) => v.margin !== null);
  const avgMargin =
    marginsWithValues.length > 0
      ? marginsWithValues.reduce((sum, v) => sum + v.margin!, 0) /
        marginsWithValues.length
      : null;
  const actualsWithValues = variantSummaries.filter((v) => v.actualMargin !== null);
  const avgActualMargin =
    actualsWithValues.length > 0
      ? actualsWithValues.reduce((sum, v) => sum + v.actualMargin!, 0) /
        actualsWithValues.length
      : null;
  const worstVariant =
    actualsWithValues.length > 0
      ? actualsWithValues.reduce((worst, v) =>
          v.actualMargin! < worst.actualMargin! ? v : worst
        )
      : marginsWithValues.length > 0
        ? marginsWithValues.reduce((worst, v) =>
            v.margin! < worst.margin! ? v : worst
          )
        : null;

  // Header meta
  const lastSync = product.last_synced_at ?? product.created_at;
  const syncLabel = product.last_synced_at ? "Last sync" : "Added";

  return (
    <div className={styles.page}>
      <PageHeader
        breadcrumbs={[
          { label: "Products", href: "/app/products" },
          { label: product.title },
        ]}
        title={product.title}
        description={`${variants.length} variant${variants.length === 1 ? "" : "s"} · ${syncLabel} ${timeAgo(lastSync)}`}
      />

      {/* Product image + description */}
      {(product.image_url || product.description) && (
        <div className={styles.productMeta}>
          {product.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.image_url}
              alt={product.title}
              className={styles.productImage}
            />
          )}
          {product.description && (
            <div
              className={styles.productDescription}
              dangerouslySetInnerHTML={{ __html: sanitizeProductHtml(product.description) }}
            />
          )}
        </div>
      )}

      {/* BOM Coverage bar */}
      <div className={styles.coverageCard}>
        <div className={styles.coverageTop}>
          <span className={styles.coverageText}>
            {withBom} / {variantSummaries.length} variants have a BOM
          </span>
          {withoutBom > 0 && (
            <span className={styles.amberBadge}>
              {withoutBom} need{withoutBom === 1 ? "s" : ""} BOMs
            </span>
          )}
        </div>
        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{ width: `${coveragePct}%` }}
          />
        </div>
      </div>

      {/* Variant table */}
      <VariantCoverageTable
        summaries={variantSummaries}
        avgMargin={avgMargin}
        avgActualMargin={avgActualMargin}
        worstVariant={worstVariant}
      />
    </div>
  );
}
