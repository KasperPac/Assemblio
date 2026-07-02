import { Fragment } from "react";
import Image from "next/image";
import Link from "next/link";
import { getServerTenantContext } from "@/lib/tenant/context";
import styles from "./products.module.css";
import PageHeader from "@/app/app/_ui/page-header";
import EmptyState from "@/app/app/_ui/empty-state";
import ProductFilters from "./product-filters";
import SortableHeader from "./sortable-header";
import { parseSortParams, sortProductRows } from "./sort";
import { fetchAllRows } from "@/lib/supabase/paginate";
import ProductsPagination from "./products-pagination";
import { buildFacets } from "@/lib/products/facets";
import { matchesCategoryFilters, resolveGroupKey, type GroupBy } from "@/lib/products/grouping";

const PAGE_SIZE = 25;

type ProductRow = {
  id: string;
  title: string;
  description: string | null;
  created_at?: string | null;
  image_url: string | null;
  status: string;
  product_type: string | null;
  tags: string[] | null;
  category_name: string | null;
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
    sort?: string;
    dir?: string;
    page?: string;
    shopify?: string;
    products?: string;
    orders?: string;
    sync_error?: string;
    type?: string;
    tags?: string;
    collection?: string;
    category?: string;
    group?: string;
  }>;
};

export default async function ProductsPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const q = (params.q ?? "").trim().toLowerCase();
  const statusFilter = (params.status ?? "all").toLowerCase();
  const typeFilter = (params.type ?? "").trim();
  const categoryFilter = (params.category ?? "").trim();
  const tagsFilter = (params.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  const collectionFilter = (params.collection ?? "").split(",").map((c) => c.trim()).filter(Boolean);
  const groupBy: GroupBy = ["type", "category", "collection"].includes(params.group ?? "")
    ? (params.group as GroupBy)
    : "none";
  const { sort: sortKey, dir: sortDir } = parseSortParams(params.sort, params.dir);
  const pageNum = Math.max(1, parseInt(params.page ?? "1", 10) || 1);
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

  // Page through every variant: PostgREST caps an un-paginated response at 1000
  // rows, so tenants with >1000 variants would otherwise have products silently
  // showing 0 variants / no price (the detail page is unaffected — it filters by
  // product_id). See fetchAllRows.
  const detailedVariantsResult = await fetchAllRows<VariantRow>((from, to) =>
    supabase
      .from("product_variant")
      .select("id,product_id,title,sku,price")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true })
      .range(from, to)
  );
  const variantsFallbackResult = detailedVariantsResult.error
    ? await fetchAllRows<VariantRow>((from, to) =>
        supabase
          .from("product_variant")
          .select("id,product_id,title,sku,price")
          .range(from, to)
      )
    : null;
  const variants =
    (detailedVariantsResult.error
      ? variantsFallbackResult?.data
      : detailedVariantsResult.data) ?? [];

  const [activeBomsResult, ratesResult] = await Promise.all([
    // All active BOMs for the tenant. Don't filter by `.in("variant_id", ids)`:
    // with thousands of variant ids that URL would 414. Active BOMs are few, and
    // every BOM's variant is already in `variants`, so a plain fetch is enough.
    supabase
      .from("product_bom")
      .select("id,variant_id")
      .eq("tenant_id", tenantId)
      .eq("is_active", true),
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
    .select("id,title,description,created_at,image_url,status,product_type,tags,category_name")
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
        ...(product as Omit<ProductRow, "status" | "product_type" | "tags" | "category_name">),
        status: "active",
        product_type: null,
        tags: [],
        category_name: null,
      }));
    } else {
      const fallbackWithDescription = await supabase
        .from("product")
        .select("id,title,description,image_url")
        .eq("tenant_id", tenantId);
      if (!fallbackWithDescription.error) {
        products = (fallbackWithDescription.data ?? []).map((product) => ({
          ...(product as Omit<ProductRow, "created_at" | "status" | "product_type" | "tags" | "category_name">),
          created_at: null,
          status: "active",
          product_type: null,
          tags: [],
          category_name: null,
        }));
      } else {
        const fallbackMinimalWithCreatedAt = await supabase
          .from("product")
          .select("id,title,created_at")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false });
        if (!fallbackMinimalWithCreatedAt.error) {
          products = (fallbackMinimalWithCreatedAt.data ?? []).map((product) => ({
            ...(product as Omit<ProductRow, "description" | "image_url" | "status" | "product_type" | "tags" | "category_name">),
            description: null,
            image_url: null,
            status: "active",
            product_type: null,
            tags: [],
            category_name: null,
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
              ...(product as Omit<ProductRow, "description" | "image_url" | "created_at" | "status" | "product_type" | "tags" | "category_name">),
              description: null,
              image_url: null,
              created_at: null,
              status: "active",
              product_type: null,
              tags: [],
              category_name: null,
            }));
          }
        }
      }
    }
  } else {
    products = (detailedProductsResult.data ?? []) as ProductRow[];
  }

  type CollectionMembershipRow = {
    product_id: string;
    collection_id: string;
    shopify_collection: { id: string; title: string } | { id: string; title: string }[] | null;
  };
  const membershipResult = await fetchAllRows<CollectionMembershipRow>((from, to) =>
    supabase
      .from("product_collection")
      .select("product_id,collection_id,shopify_collection:collection_id(id,title)")
      .eq("tenant_id", tenantId)
      // Deterministic order so "first collection" grouping is stable across renders.
      .order("collection_id", { ascending: true })
      .range(from, to)
  );
  const collectionsByProduct = new Map<string, Array<{ id: string; title: string }>>();
  if (!membershipResult.error) {
    for (const row of membershipResult.data ?? []) {
      const coll = Array.isArray(row.shopify_collection)
        ? row.shopify_collection[0] ?? null
        : row.shopify_collection;
      if (!coll) continue;
      const list = collectionsByProduct.get(row.product_id) ?? [];
      list.push({ id: coll.id, title: coll.title });
      collectionsByProduct.set(row.product_id, list);
    }
  }

  const facets = buildFacets(products, collectionsByProduct);

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

    if (
      !matchesCategoryFilters(
        product,
        collectionsByProduct.get(product.id) ?? [],
        {
          type: typeFilter || undefined,
          category: categoryFilter || undefined,
          tags: tagsFilter.length ? tagsFilter : undefined,
          collections: collectionFilter.length ? collectionFilter : undefined,
        }
      )
    ) {
      return false;
    }
    return true;
  });

  const rows = filteredProducts.map((product) => {
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
    return {
      id: product.id,
      title: product.title,
      image_url: product.image_url,
      status: product.status,
      variantCount: productVariants.length,
      sellPrice,
      matGpPct: avgMatGpPct,
      actualGpPct: avgActualGpPct,
      groupKey: resolveGroupKey(
        product,
        collectionsByProduct.get(product.id) ?? [],
        groupBy
      ),
    };
  });

  const sortedRows = sortProductRows(rows, sortKey, sortDir);
  const groupedRows =
    groupBy === "none"
      ? sortedRows
      : [...sortedRows].sort((a, b) => a.groupKey.localeCompare(b.groupKey));
  const totalFiltered = groupedRows.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));
  const safePage = Math.min(pageNum, totalPages);
  const pagedRows = groupedRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const gpClassFor = (value: number | null) =>
    value == null ? "" : value >= 0.3 ? styles.gpGood : value >= 0.1 ? styles.gpWarn : styles.gpBad;

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Products"
        title="Products"
        description={`${totalFiltered} of ${products.length} products`}
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

      <ProductFilters
        productTypes={facets.productTypes}
        categories={facets.categories}
        tags={facets.tags}
        collections={facets.collections}
      />

      <div className={styles.table}>
        <div className={styles.tableHeader}>
          <SortableHeader label="Products" sortKey="title" />
          <SortableHeader label="Variants" sortKey="variants" />
          <SortableHeader label="Status" sortKey="status" />
          <SortableHeader label="Sell Price" sortKey="price" />
          <SortableHeader label="Material GP %" sortKey="mat_gp" />
          <SortableHeader label="Actual GP %" sortKey="actual_gp" />
        </div>
        {productsError ? (
          <EmptyState title="Failed to load" message={`Could not load products: ${productsError}`} />
        ) : filteredProducts.length === 0 ? (
          <EmptyState title="No results" message="No products match your filters." />
        ) : (
          (() => {
            let lastGroup: string | null = null;
            return pagedRows.map((row) => {
              const showHeader = groupBy !== "none" && row.groupKey !== lastGroup;
              lastGroup = row.groupKey;
              return (
                <Fragment key={row.id}>
                  {showHeader && (
                    <div className={styles.groupHeader}>{row.groupKey}</div>
                  )}
                  <div className={styles.tableRow}>
                    <Link className={styles.productCell} href={`/app/products/${row.id}`}>
                      <div className={styles.thumb}>
                        {row.image_url ? (
                          <Image src={row.image_url} alt={row.title} width={44} height={44} />
                        ) : (
                          <span>{row.title.slice(0, 1)}</span>
                        )}
                      </div>
                      <span className={styles.productTitle}>{row.title}</span>
                    </Link>

                    <span className={styles.variantCount} data-label="Variants">{row.variantCount}</span>

                    <span
                      className={`${styles.statusBadge} ${
                        row.status === "active"
                          ? styles.statusActive
                          : row.status === "draft"
                            ? styles.statusDraft
                            : styles.statusArchived
                      }`}
                      data-label="Status"
                    >
                      {row.status.toUpperCase()}
                    </span>

                    <span className={styles.sellPriceCell} data-label="Sell Price">
                      {row.sellPrice != null ? formatCurrency(row.sellPrice) : "—"}
                    </span>

                    <span className={`${styles.gpCell} ${gpClassFor(row.matGpPct)}`} data-label="Mat. GP %">
                      {row.matGpPct != null ? `${(row.matGpPct * 100).toFixed(0)}%` : "—"}
                    </span>

                    <span className={`${styles.gpCell} ${gpClassFor(row.actualGpPct)}`} data-label="Actual GP %">
                      {row.actualGpPct != null ? `${(row.actualGpPct * 100).toFixed(0)}%` : "—"}
                    </span>
                  </div>
                </Fragment>
              );
            });
          })()
        )}
      </div>

      <ProductsPagination page={safePage} pageSize={PAGE_SIZE} total={totalFiltered} />
    </div>
  );
}
