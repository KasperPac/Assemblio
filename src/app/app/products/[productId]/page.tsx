import { notFound } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import styles from "../product-detail.module.css";
import PageHeader from "@/app/app/_ui/page-header";
import { VariantCoverageTable } from "./variant-coverage-table";
import type { DisplayBom, VariantSummary } from "./variant-coverage-table";
import { timeAgo } from "@/lib/utils/time";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProductRecord = {
  id: string;
  title: string;
  shopify_id: string;
  updated_at: string | null;
  created_at: string | null;
};

type VariantRow = {
  id: string;
  title: string | null;
  sku: string | null;
  price: number | null;
  updated_at: string | null;
};

type BomRow = {
  id: string;
  variant_id: string;
  version: number;
  status: string;
  is_active: boolean;
  updated_at: string | null;
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
    .from("shopify_product")
    .select("id,title,shopify_id,updated_at,created_at")
    .eq("id", productId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!productData) notFound();
  const product = productData as ProductRecord;

  // Fetch all variants for this product
  const { data: variantsData } = await supabase
    .from("shopify_variant")
    .select("id,title,sku,price,updated_at")
    .eq("product_id", productId)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  const variants = (variantsData ?? []) as VariantRow[];

  const variantIds = variants.map((v) => v.id);

  // Fetch all BOMs for these variants
  let boms: BomRow[] = [];
  let bomLines: BomLineRow[] = [];

  if (variantIds.length > 0) {
    const { data: bomsData } = await supabase
      .from("product_bom")
      .select("id,variant_id,version,status,is_active,updated_at")
      .in("variant_id", variantIds)
      .eq("tenant_id", tenantId)
      .order("is_active", { ascending: false })
      .order("version", { ascending: false });

    boms = (bomsData ?? []) as BomRow[];

    const bomIds = boms.map((b) => b.id);

    if (bomIds.length > 0) {
      const { data: linesData } = await supabase
        .from("product_bom_component")
        .select("id,product_bom_id,quantity,yield_pct,component:component_id(cost_per_unit)")
        .in("product_bom_id", bomIds)
        .eq("tenant_id", tenantId);

      bomLines = (linesData ?? []) as BomLineRow[];
    }
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
        updated_at: displayBomRaw.updated_at,
        lineCount: lines.length,
        matCost: cost,
        hasMissingCosts,
      };
    }

    const margin = displayBom?.is_active
      ? calcMargin(displayBom.matCost, v.price)
      : null;

    return {
      id: v.id,
      title: v.title,
      sku: v.sku,
      price: v.price,
      updated_at: v.updated_at,
      displayBom,
      margin,
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
  const worstVariant =
    marginsWithValues.length > 0
      ? marginsWithValues.reduce((worst, v) =>
          v.margin! < worst.margin! ? v : worst
        )
      : null;

  // Header meta
  const lastSync = product.updated_at ?? product.created_at;

  return (
    <div className={styles.page}>
      <PageHeader
        title={product.title}
        description={`Shopify ID: ${product.shopify_id} · ${variants.length} variant${variants.length === 1 ? "" : "s"} · Last sync ${timeAgo(lastSync)}`}
      />

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
        worstVariant={worstVariant}
      />
    </div>
  );
}
