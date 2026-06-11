import Image from "next/image";
import Link from "next/link";
import { getServerTenantContext } from "@/lib/tenant/context";
import styles from "./products.module.css";
import PageHeader from "@/app/app/_ui/page-header";
import EmptyState from "@/app/app/_ui/empty-state";
import ProductFilters from "./product-filters";

type ProductRow = {
  id: string;
  title: string;
  description: string | null;
  created_at?: string | null;
  image_url: string | null;
  status: string;
};

type VariantRow = {
  id: string;
  product_id: string;
  title: string | null;
  sku: string | null;
  price: number | null;
};

type BomRow = { id: string; variant_id: string };
type BomComponentRow = {
  product_bom_id: string;
  quantity: number;
  yield_pct: number;
  component:
    | { cost_per_unit: number | null }
    | Array<{ cost_per_unit: number | null }>
    | null;
};
type BomLaborRow = {
  product_bom_id: string;
  department_id: string;
  setup_hours: number;
  run_hours_per_unit: number;
  admin_hours_per_unit: number;
  electricity_kwh_per_unit: number;
  gas_units_per_unit: number;
};
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

type Props = {
  searchParams?: Promise<{
    q?: string;
    status?: string;
    shopify?: string;
    products?: string;
    orders?: string;
    sync_error?: string;
  }>;
};

export default async function ProductsPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const q = (params.q ?? "").trim().toLowerCase();
  const statusFilter = (params.status ?? "all").toLowerCase();
  const syncStatus = params.shopify ?? null;
  const syncProducts = params.products ?? "0";
  const syncOrders = params.orders ?? "0";
  const syncError = params.sync_error ?? "";
  const ctx = await getServerTenantContext();
  const supabase = ctx?.supabase;
  const tenantId = ctx?.tenantId;

  if (!supabase || !tenantId) {
    return <div className={styles.page}>No tenant access.</div>;
  }

  const detailedVariantsResult = await supabase
    .from("product_variant")
    .select("id,product_id,title,sku,price")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });
  const variantsFallbackResult = detailedVariantsResult.error
    ? await supabase.from("product_variant").select("id,product_id,title,sku,price")
    : null;
  const variants =
    (detailedVariantsResult.error
      ? variantsFallbackResult?.data
      : detailedVariantsResult.data) ?? [];

  const variantIds = (variants ?? []).map((v) => v.id);

  const [activeBomsResult, ratesResult] = await Promise.all([
    variantIds.length === 0
      ? Promise.resolve({ data: [] as BomRow[] })
      : supabase
          .from("product_bom")
          .select("id,variant_id")
          .eq("tenant_id", tenantId)
          .eq("is_active", true)
          .in("variant_id", variantIds),
    supabase
      .from("cost_rate_schedule")
      .select(
        "department_id,labor_rate_per_hour,admin_rate_per_hour,electricity_rate_per_kwh,gas_rate_per_unit,overhead_rate_per_hour,effective_from,effective_to,staff_member_id"
      )
      .eq("tenant_id", tenantId)
      .is("staff_member_id", null)
      .lte("effective_from", new Date().toISOString().slice(0, 10))
      .order("effective_from", { ascending: false }),
  ]);

  const activeBoms = ((activeBomsResult.data ?? []) as BomRow[]).filter((b) => b.variant_id);
  const bomIdToVariant = new Map<string, string>(
    activeBoms.map((b) => [b.id, b.variant_id])
  );
  const bomIds = activeBoms.map((b) => b.id);

  const [bomComponentsResult, bomLaborResult] = await Promise.all([
    bomIds.length === 0
      ? Promise.resolve({ data: [] as BomComponentRow[] })
      : supabase
          .from("product_bom_component")
          .select("product_bom_id,quantity,yield_pct,component:component_id(cost_per_unit)")
          .eq("tenant_id", tenantId)
          .in("product_bom_id", bomIds),
    bomIds.length === 0
      ? Promise.resolve({ data: [] as BomLaborRow[] })
      : supabase
          .from("product_bom_labor")
          .select(
            "product_bom_id,department_id,setup_hours,run_hours_per_unit,admin_hours_per_unit,electricity_kwh_per_unit,gas_units_per_unit"
          )
          .eq("tenant_id", tenantId)
          .in("product_bom_id", bomIds),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const ratesByDepartment = new Map<string, RateRow>();
  for (const row of (ratesResult.data ?? []) as Array<RateRow & { staff_member_id: string | null }>) {
    if (row.effective_to !== null && row.effective_to < today) continue;
    if (!ratesByDepartment.has(row.department_id)) {
      ratesByDepartment.set(row.department_id, row);
    }
  }

  const materialCostByBom = new Map<string, number>();
  for (const row of (bomComponentsResult.data ?? []) as BomComponentRow[]) {
    const comp = Array.isArray(row.component) ? row.component[0] ?? null : row.component;
    const costPerUnit = comp?.cost_per_unit ?? null;
    if (costPerUnit == null) continue;
    const yieldPct = row.yield_pct > 0 ? row.yield_pct : 1;
    const lineCost = (Number(costPerUnit) * Number(row.quantity)) / yieldPct;
    materialCostByBom.set(
      row.product_bom_id,
      (materialCostByBom.get(row.product_bom_id) ?? 0) + lineCost
    );
  }

  const labourCostByBom = new Map<string, number>();
  const overheadCostByBom = new Map<string, number>();
  for (const row of (bomLaborResult.data ?? []) as BomLaborRow[]) {
    const rate = ratesByDepartment.get(row.department_id);
    if (!rate) continue;
    const labour = Number(row.run_hours_per_unit) * Number(rate.labor_rate_per_hour);
    const overhead =
      Number(row.run_hours_per_unit) * Number(rate.overhead_rate_per_hour) +
      Number(row.admin_hours_per_unit) * Number(rate.admin_rate_per_hour) +
      Number(row.electricity_kwh_per_unit) * Number(rate.electricity_rate_per_kwh) +
      Number(row.gas_units_per_unit) * Number(rate.gas_rate_per_unit);
    labourCostByBom.set(
      row.product_bom_id,
      (labourCostByBom.get(row.product_bom_id) ?? 0) + labour
    );
    overheadCostByBom.set(
      row.product_bom_id,
      (overheadCostByBom.get(row.product_bom_id) ?? 0) + overhead
    );
  }

  type VariantGp = { matGpPct: number; actualGpPct: number };
  const gpByVariant = new Map<string, VariantGp>();
  for (const bom of activeBoms) {
    const variantId = bomIdToVariant.get(bom.id);
    if (!variantId) continue;
    const variant = (variants ?? []).find((v) => v.id === variantId);
    const sell = variant?.price != null ? Number(variant.price) : 0;
    if (!sell || sell <= 0) continue;
    const mat = materialCostByBom.get(bom.id) ?? 0;
    const labour = labourCostByBom.get(bom.id) ?? 0;
    const overhead = overheadCostByBom.get(bom.id) ?? 0;
    gpByVariant.set(variantId, {
      matGpPct: (sell - mat) / sell,
      actualGpPct: (sell - mat - labour - overhead) / sell,
    });
  }

  const detailedProductsResult = await supabase
    .from("product")
    .select("id,title,description,created_at,image_url,status")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  let products: ProductRow[] = [];
  let productsError: string | null = null;

  if (detailedProductsResult.error) {
    // status column may not exist yet (patch not applied) — retry without it
    const fallbackNoStatus = await supabase
      .from("product")
      .select("id,title,description,created_at,image_url")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });
    if (!fallbackNoStatus.error) {
      products = (fallbackNoStatus.data ?? []).map((product) => ({
        ...(product as Omit<ProductRow, "status">),
        status: "active",
      }));
    } else {
      const fallbackWithDescription = await supabase
        .from("product")
        .select("id,title,description,image_url")
        .eq("tenant_id", tenantId);
      if (!fallbackWithDescription.error) {
        products = (fallbackWithDescription.data ?? []).map((product) => ({
          ...(product as Omit<ProductRow, "created_at" | "status">),
          created_at: null,
          status: "active",
        }));
      } else {
        const fallbackMinimalWithCreatedAt = await supabase
          .from("product")
          .select("id,title,created_at")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false });
        if (!fallbackMinimalWithCreatedAt.error) {
          products = (fallbackMinimalWithCreatedAt.data ?? []).map((product) => ({
            ...(product as Omit<ProductRow, "description" | "image_url" | "status">),
            description: null,
            image_url: null,
            status: "active",
          }));
        } else {
          const fallbackMinimal = await supabase
            .from("product")
            .select("id,title")
            .eq("tenant_id", tenantId);
          if (fallbackMinimal.error) {
            productsError = fallbackMinimal.error.message;
          } else {
            products = (fallbackMinimal.data ?? []).map((product) => ({
              ...(product as Omit<ProductRow, "description" | "image_url" | "created_at" | "status">),
              description: null,
              image_url: null,
              created_at: null,
              status: "active",
            }));
          }
        }
      }
    }
  } else {
    products = (detailedProductsResult.data ?? []) as ProductRow[];
  }

  const variantsByProduct = (variants ?? []).reduce<Record<string, VariantRow[]>>(
    (acc, variant) => {
      const bucket = acc[variant.product_id] ?? [];
      bucket.push(variant as VariantRow);
      acc[variant.product_id] = bucket;
      return acc;
    },
    {}
  );

  const sellPriceByProduct = (variants ?? []).reduce<Record<string, number>>((acc, variant) => {
    if (variant.price != null && variant.price > 0 && !acc[variant.product_id]) {
      acc[variant.product_id] = Number(variant.price);
    }
    return acc;
  }, {});

  function formatCurrency(value: number) {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      maximumFractionDigits: 0,
    }).format(value);
  }

  const filteredProducts = products.filter((product) => {
    const productVariants = variantsByProduct[product.id] ?? [];
    const matchesQ =
      q.length === 0 ||
      product.title.toLowerCase().includes(q) ||
      (product.description ?? "").toLowerCase().includes(q) ||
      productVariants.some(
        (variant) =>
          (variant.title ?? "").toLowerCase().includes(q) ||
          (variant.sku ?? "").toLowerCase().includes(q)
      );

    if (!matchesQ) return false;
    if (statusFilter !== "all" && product.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Products"
        title="Products"
        description={`${filteredProducts.length} of ${products.length} products`}
        actions={
          <form method="post" action="/api/shopify/sync?return_to=/app/products">
            <button type="submit" className={styles.importButton}>
              Import Products
            </button>
          </form>
        }
      />

      {syncStatus === "sync-ok" && (
        <div className={styles.syncBanner} role="status">
          Synced {syncProducts} products and {syncOrders} orders.
        </div>
      )}
      {syncStatus === "sync-failed" && (
        <div className={styles.syncBannerError} role="alert">
          Sync failed: {syncError}
        </div>
      )}

      <ProductFilters />

      <div className={styles.table}>
        <div className={styles.tableHeader}>
          <span>Products</span>
          <span>Variants</span>
          <span>Status</span>
          <span>Sell Price</span>
          <span>Material GP %</span>
          <span>Actual GP %</span>
        </div>
        {productsError ? (
          <EmptyState title="Failed to load" message={`Could not load products: ${productsError}`} />
        ) : filteredProducts.length === 0 ? (
          <EmptyState title="No results" message="No products match your filters." />
        ) : (
          filteredProducts.map((product) => {
            const productVariants = variantsByProduct[product.id] ?? [];
            const sellPrice = sellPriceByProduct[product.id] ?? null;
            const variantsWithGp = productVariants.filter((v) => gpByVariant.has(v.id));
            const avgMatGpPct =
              variantsWithGp.length > 0
                ? variantsWithGp.reduce((sum, v) => sum + gpByVariant.get(v.id)!.matGpPct, 0) /
                  variantsWithGp.length
                : null;
            const avgActualGpPct =
              variantsWithGp.length > 0
                ? variantsWithGp.reduce((sum, v) => sum + gpByVariant.get(v.id)!.actualGpPct, 0) /
                  variantsWithGp.length
                : null;
            const gpClassFor = (value: number | null) =>
              value == null ? "" : value >= 0.3 ? styles.gpGood : value >= 0.1 ? styles.gpWarn : styles.gpBad;
            return (
              <div key={product.id} className={styles.tableRow}>
                <Link className={styles.productCell} href={`/app/products/${product.id}`}>
                  <div className={styles.thumb}>
                    {product.image_url ? (
                      <Image
                        src={product.image_url}
                        alt={product.title}
                        width={44}
                        height={44}
                      />
                    ) : (
                      <span>{product.title.slice(0, 1)}</span>
                    )}
                  </div>
                  <span className={styles.productTitle}>{product.title}</span>
                </Link>

                <span className={styles.variantCount} data-label="Variants">{productVariants.length}</span>

                <span
                  className={`${styles.statusBadge} ${
                    product.status === "active"
                      ? styles.statusActive
                      : product.status === "draft"
                        ? styles.statusDraft
                        : styles.statusArchived
                  }`}
                  data-label="Status"
                >
                  {product.status.toUpperCase()}
                </span>

                <span className={styles.sellPriceCell} data-label="Sell Price">
                  {sellPrice != null ? formatCurrency(sellPrice) : "—"}
                </span>

                <span className={`${styles.gpCell} ${gpClassFor(avgMatGpPct)}`} data-label="Mat. GP %">
                  {avgMatGpPct != null ? `${(avgMatGpPct * 100).toFixed(0)}%` : "—"}
                </span>

                <span className={`${styles.gpCell} ${gpClassFor(avgActualGpPct)}`} data-label="Actual GP %">
                  {avgActualGpPct != null ? `${(avgActualGpPct * 100).toFixed(0)}%` : "—"}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
