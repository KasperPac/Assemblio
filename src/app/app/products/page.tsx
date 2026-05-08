import Image from "next/image";
import Link from "next/link";
import { getServerTenantContext } from "@/lib/tenant/context";
import styles from "./products.module.css";

type ProductRow = {
  id: string;
  title: string;
  description: string | null;
  created_at?: string | null;
  image_url: string | null;
};

type VariantRow = {
  id: string;
  product_id: string;
  title: string | null;
  sku: string | null;
  price: number | null;
};

type VariantMarginRow = {
  order_line:
    | { variant_id: string }
    | Array<{ variant_id: string }>
    | null;
  planned_margin_pct: number;
};

type Props = {
  searchParams?: Promise<{
    q?: string;
    filter?: string;
  }>;
};

export default async function ProductsPage({ searchParams }: Props) {
  const params = (await searchParams) ?? {};
  const q = (params.q ?? "").trim().toLowerCase();
  const filter = (params.filter ?? "all").toLowerCase();
  const ctx = await getServerTenantContext();
  const supabase = ctx?.supabase;
  const tenantId = ctx?.tenantId;

  if (!supabase || !tenantId) {
    return <div className={styles.page}>No tenant access.</div>;
  }

  const [detailedVariantsResult, marginResult] = await Promise.all([
    supabase
      .from("shopify_variant")
      .select("id,product_id,title,sku,price")
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: true }),
    supabase
      .from("job_cost_snapshot")
      .select("planned_margin_pct,order_line:order_line_id(variant_id)")
      .eq("tenant_id", tenantId),
  ]);
  const variantsFallbackResult = detailedVariantsResult.error
    ? await supabase.from("shopify_variant").select("id,product_id,title,sku,price")
    : null;
  const variants =
    (detailedVariantsResult.error
      ? variantsFallbackResult?.data
      : detailedVariantsResult.data) ?? [];

  const detailedProductsResult = await supabase
    .from("shopify_product")
    .select("id,title,description,created_at,image_url")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  let products: ProductRow[] = [];
  let productsError: string | null = null;

  if (detailedProductsResult.error) {
    const fallbackWithDescription = await supabase
      .from("shopify_product")
      .select("id,title,description,image_url")
      .eq("tenant_id", tenantId);
    if (!fallbackWithDescription.error) {
      products = (fallbackWithDescription.data ?? []).map((product) => ({
        ...(product as Omit<ProductRow, "created_at">),
        created_at: null,
      }));
    } else {
      const fallbackMinimalWithCreatedAt = await supabase
        .from("shopify_product")
        .select("id,title,created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false });
      if (!fallbackMinimalWithCreatedAt.error) {
        products = (fallbackMinimalWithCreatedAt.data ?? []).map((product) => ({
          ...(product as Omit<ProductRow, "description" | "image_url">),
          description: null,
          image_url: null,
        }));
      } else {
        const fallbackMinimal = await supabase
          .from("shopify_product")
          .select("id,title")
          .eq("tenant_id", tenantId);
        if (fallbackMinimal.error) {
          productsError = fallbackMinimal.error.message;
        } else {
          products = (fallbackMinimal.data ?? []).map((product) => ({
            ...(product as Omit<ProductRow, "description" | "image_url" | "created_at">),
            description: null,
            image_url: null,
            created_at: null,
          }));
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

  type GpAccum = { sum: number; count: number };
  const gpByVariant = ((marginResult.data ?? []) as VariantMarginRow[]).reduce<Record<string, GpAccum>>(
    (acc, row) => {
      const orderLine = Array.isArray(row.order_line) ? row.order_line[0] ?? null : row.order_line;
      if (!orderLine?.variant_id || row.planned_margin_pct == null) return acc;
      const existing = acc[orderLine.variant_id] ?? { sum: 0, count: 0 };
      acc[orderLine.variant_id] = { sum: existing.sum + Number(row.planned_margin_pct), count: existing.count + 1 };
      return acc;
    },
    {}
  );

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
    if (filter === "with-variants") return productVariants.length > 0;
    if (filter === "without-variants") return productVariants.length === 0;
    return true;
  });

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1>Products</h1>
          <p>
            {filteredProducts.length} of {products.length} Products
          </p>
        </div>
        <form method="post" action="/api/shopify/sync">
          <button type="submit" className={styles.importButton}>
            Import Products
          </button>
        </form>
      </div>

      <form className={styles.filters} method="get">
        <input
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Search by name or SKU"
          aria-label="Search by name or SKU"
        />
        <select name="filter" defaultValue={filter}>
          <option value="all">All</option>
          <option value="with-variants">With variants</option>
          <option value="without-variants">Without variants</option>
        </select>
      </form>

      <div className={styles.table}>
        <div className={styles.tableHeader}>
          <span>Products</span>
          <span>Variants</span>
          <span>Status</span>
          <span>Sell Price</span>
          <span>GP %</span>
        </div>
        {productsError ? (
          <div className={styles.empty}>Failed to load products: {productsError}</div>
        ) : filteredProducts.length === 0 ? (
          <div className={styles.empty}>No products match your filters.</div>
        ) : (
          filteredProducts.map((product) => {
            const productVariants = variantsByProduct[product.id] ?? [];
            const statusLabel = productVariants.length > 0 ? "ACTIVE" : "PENDING";
            const sellPrice = sellPriceByProduct[product.id] ?? null;
            const variantsWithGp = productVariants.filter((v) => gpByVariant[v.id]);
            const avgGpPct = variantsWithGp.length > 0
              ? variantsWithGp.reduce((sum, v) => {
                  const gp = gpByVariant[v.id]!;
                  return sum + gp.sum / gp.count;
                }, 0) / variantsWithGp.length
              : null;
            const gpClass = avgGpPct == null ? "" : avgGpPct >= 0.3 ? styles.gpGood : avgGpPct >= 0.1 ? styles.gpWarn : styles.gpBad;
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

                <span className={styles.variantCount}>{productVariants.length}</span>

                <span
                  className={`${styles.statusBadge} ${
                    productVariants.length > 0 ? styles.statusActive : styles.statusPending
                  }`}
                >
                  {statusLabel}
                </span>

                <span className={styles.sellPriceCell}>
                  {sellPrice != null ? formatCurrency(sellPrice) : "—"}
                </span>

                <span className={`${styles.gpCell} ${gpClass}`}>
                  {avgGpPct != null ? `${(avgGpPct * 100).toFixed(0)}%` : "—"}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
