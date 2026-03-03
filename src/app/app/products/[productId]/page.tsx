import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ProductVariantPicker from "../product-variant-picker";
import styles from "../product-detail.module.css";

type ProductRecord = {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  shopify_id: string;
  created_at: string | null;
};

type VariantRecord = {
  id: string;
  title: string | null;
  sku: string | null;
  created_at: string | null;
};

type BomRecord = {
  id: string;
  version: number;
  is_active: boolean;
};

type BomLineRecord = {
  quantity: number;
  component:
    | {
        name: string | null;
        sku: string | null;
        unit: string | null;
      }
    | Array<{
        name: string | null;
        sku: string | null;
        unit: string | null;
      }>
    | null;
};

type Props = {
  params: Promise<{
    productId: string;
  }>;
  searchParams?: Promise<{
    variant_id?: string;
  }>;
};

export default async function ProductDetailPage({ params, searchParams }: Props) {
  const { productId } = await params;
  const query = (await searchParams) ?? {};
  const supabase = await createSupabaseServerClient();

  const [productResult, variantsResult] = await Promise.all([
    supabase
      .from("shopify_product")
      .select("id,title,description,image_url,shopify_id,created_at")
      .eq("id", productId)
      .maybeSingle(),
    supabase
      .from("shopify_variant")
      .select("id,title,sku,created_at")
      .eq("product_id", productId)
      .order("created_at", { ascending: true }),
  ]);

  let product = productResult.data as ProductRecord | null;
  let variants = (variantsResult.data ?? []) as VariantRecord[];

  if (!product) {
    const fallbackProduct = await supabase
      .from("shopify_product")
      .select("id,title,shopify_id,created_at")
      .eq("id", productId)
      .maybeSingle();

    if (fallbackProduct.data) {
      product = {
        id: fallbackProduct.data.id,
        title: fallbackProduct.data.title,
        shopify_id: fallbackProduct.data.shopify_id,
        created_at: fallbackProduct.data.created_at,
        description: null,
        image_url: null,
      };
    }
  }

  if (variantsResult.error) {
    const fallbackVariants = await supabase
      .from("shopify_variant")
      .select("id,title,sku")
      .eq("product_id", productId);
    variants = (fallbackVariants.data ?? []).map((variant) => ({
      id: variant.id,
      title: variant.title,
      sku: variant.sku,
      created_at: null,
    }));
  }

  if (!product?.id) {
    notFound();
  }

  const typedProduct = product as ProductRecord;
  const typedVariants = variants as VariantRecord[];
  const selectedVariant =
    typedVariants.find((variant) => variant.id === query.variant_id) ??
    typedVariants[0] ??
    null;

  const { data: boms } = selectedVariant
    ? await supabase
        .from("product_bom")
        .select("id,version,is_active")
        .eq("variant_id", selectedVariant.id)
        .order("is_active", { ascending: false })
        .order("version", { ascending: false })
    : { data: [] };

  const typedBoms = (boms ?? []) as BomRecord[];
  const selectedBom = typedBoms.find((bom) => bom.is_active) ?? typedBoms[0] ?? null;

  const { data: bomLines } = selectedBom
    ? await supabase
        .from("product_bom_component")
        .select("quantity,component:component_id(name,sku,unit)")
        .eq("product_bom_id", selectedBom.id)
        .order("created_at", { ascending: true })
    : { data: [] };

  const typedBomLines = (bomLines ?? []) as BomLineRecord[];
  const variantLabel = selectedVariant
    ? `${selectedVariant.title ?? "Untitled variant"}${selectedVariant.sku ? ` (${selectedVariant.sku})` : ""}`
    : "No variants";

  return (
    <div className={styles.page}>
      <div className={styles.topRow}>
        <Link href="/app/products" className={styles.backButton}>
          {"<- Back"}
        </Link>
        <p className={styles.breadcrumb}>
          <Link href="/app/products">Products</Link> &gt; Product Detail
        </p>
      </div>

      <section className={styles.layout}>
        <aside className={styles.sideCard}>
          <div className={styles.sideImage}>
            {typedProduct.image_url ? (
              <Image
                src={typedProduct.image_url}
                alt={typedProduct.title}
                width={360}
                height={180}
                unoptimized
              />
            ) : (
              <span>{typedProduct.title.slice(0, 1)}</span>
            )}
          </div>
          <h1 className={styles.sideTitle}>{typedProduct.title}</h1>
          <div className={styles.sideMeta}>
            <p>SHOPIFY PROD ID</p>
            <strong>{typedProduct.shopify_id}</strong>
          </div>
          <div className={styles.sideMeta}>
            <p>VARIANTS</p>
            <strong>{typedVariants.length}</strong>
          </div>
          <div className={styles.sideMeta}>
            <p>STATUS</p>
            <span className={styles.statusBadge}>Active</span>
          </div>
          <div className={styles.sideMeta}>
            <p>LAST UPDATED</p>
            <strong>
              {typedProduct.created_at
                ? new Date(typedProduct.created_at).toLocaleDateString("en-GB")
                : "N/A"}
            </strong>
          </div>
          {selectedVariant ? (
            <ProductVariantPicker
              productId={typedProduct.id}
              value={selectedVariant.id}
              options={typedVariants.map((variant) => ({
                id: variant.id,
                label: `${variant.title ?? "Untitled"}${variant.sku ? ` - ${variant.sku}` : ""}`,
              }))}
            />
          ) : null}
        </aside>

        <div className={styles.mainCard}>
          <div className={styles.mainHeader}>
            <div className={styles.mainHeaderInfo}>
              <h2>
                {typedProduct.title} - {variantLabel} ({typedBomLines.length} Components)
              </h2>
              <p className={styles.versionMeta}>
                {selectedBom ? `Version - ${selectedBom.version}` : "No BOM version"}
              </p>
            </div>
            <div className={styles.headerActions}>
              {selectedVariant ? (
                <Link
                  href={`/app/products/variants/${selectedVariant.id}`}
                  className={styles.actionButton}
                >
                  + Add Component
                </Link>
              ) : null}
              <button type="button" className={styles.actionButtonSecondary} disabled>
                Add Lead Time
              </button>
              <button type="button" className={styles.actionButtonDanger} disabled>
                Delete BoM
              </button>
            </div>
          </div>

          <div className={styles.lineTable}>
            <div className={styles.lineHeader}>
              <span>Component</span>
              <span>Description</span>
              <span>Qty</span>
              <span>Unit</span>
              <span>Edit</span>
              <span>Remove</span>
            </div>
            {typedBomLines.length === 0 ? (
              <div className={styles.lineRowEmpty}>No BOM components found for this variant.</div>
            ) : (
              typedBomLines.map((line, index) => {
                const component = Array.isArray(line.component)
                  ? line.component[0] ?? null
                  : line.component;
                return (
                  <div className={styles.lineRow} key={`${selectedBom?.id ?? "none"}-${index}`}>
                    <span>{component?.name ?? "Unknown component"}</span>
                    <span>
                      {component?.sku
                        ? `SKU ${component.sku}`
                        : "No description available."}
                    </span>
                    <span>{line.quantity}</span>
                    <span>{component?.unit ?? "ea"}</span>
                    <span>Edit</span>
                    <span>Remove</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

