import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ProductVariantPicker from "../product-variant-picker";
import BomLightbox from "../bom-lightbox";
import styles from "../product-detail.module.css";
import PageHeader from "@/app/app/_ui/page-header";
import StatusBadge from "@/app/app/_ui/status-badge";
import EmptyState from "@/app/app/_ui/empty-state";

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

  const [{ data: allSourceBoms }, { data: templates }, { data: allComponents }] =
    await Promise.all([
      supabase
        .from("product_bom")
        .select("id,version,status,variant:variant_id(id,title,sku,product:product_id(title))")
        .order("created_at", { ascending: false })
        .limit(250),
      supabase
        .from("bom_template")
        .select("id,name,description,bom_template_line(id)")
        .order("name"),
      supabase
        .from("component")
        .select("id,name,sku,unit,group:group_id(name)")
        .order("name"),
    ]);

  const templateOptions = (templates ?? []).map((t: Record<string, unknown>) => ({
    id: t.id as string,
    name: t.name as string,
    lineCount: Array.isArray(t.bom_template_line) ? t.bom_template_line.length : 0,
  }));

  const sourceBomOptions = (allSourceBoms ?? []).map((s: Record<string, unknown>) => {
    const v = Array.isArray(s.variant) ? s.variant[0] : s.variant;
    const p = v ? (Array.isArray(v.product) ? v.product[0] : v.product) : null;
    return {
      id: s.id as string,
      label: `${p?.title ?? "Product"} / ${v?.title ?? "Variant"}${v?.sku ? ` (${v.sku})` : ""} - v${s.version} [${s.status}]`,
    };
  });

  const componentOptions = (allComponents ?? []).map((c: Record<string, unknown>) => {
    const g = Array.isArray(c.group) ? c.group[0] : c.group;
    return {
      id: c.id as string,
      name: c.name as string,
      sku: (c.sku as string | null) ?? null,
      unit: (c.unit as string | null) ?? null,
      group: (g as { name: string } | null)?.name ?? null,
    };
  });

  const typedBomLines = (bomLines ?? []) as BomLineRecord[];
  const variantLabel = selectedVariant
    ? `${selectedVariant.title ?? "Untitled variant"}${selectedVariant.sku ? ` (${selectedVariant.sku})` : ""}`
    : "No variants";
  const productStatus = selectedBom ? "BOM ready" : selectedVariant ? "Needs BOM" : "No variants";
  const productStatusVariant = selectedBom ? "success" : selectedVariant ? "warning" : "default";
  const productDescription =
    typedProduct.description?.trim() ||
    "This product is synced from Shopify. Use the selected variant to inspect BOM coverage and component requirements.";
  const summaryItems = [
    { label: "Shopify product", value: typedProduct.shopify_id },
    { label: "Variants", value: String(typedVariants.length) },
    { label: "BOM version", value: selectedBom ? `v${selectedBom.version}` : "Not created" },
    { label: "Components", value: String(typedBomLines.length) },
  ];

  return (
    <div className={styles.page}>
      <PageHeader
        title={typedProduct.title}
        description={productDescription}
        actions={
          selectedVariant ? (
            <>
              <Link
                href={`/app/products/variants/${selectedVariant.id}`}
                className={styles.actionButton}
              >
                Manage Variant BOM
              </Link>
              <BomLightbox
                variantId={selectedVariant.id}
                variantLabel={variantLabel}
                templates={templateOptions}
                sourceBoms={sourceBomOptions}
                components={componentOptions}
                buttonClassName={styles.actionButtonSecondary}
              />
            </>
          ) : null
        }
      />

      <section className={styles.layout}>
        <aside className={styles.sideCard}>
          <div className={styles.sideImage}>
            {typedProduct.image_url ? (
              <Image
                src={typedProduct.image_url}
                alt={typedProduct.title}
                width={360}
                height={180}
              />
            ) : (
              <span>{typedProduct.title.slice(0, 1)}</span>
            )}
          </div>
          <div className={styles.sideTitleRow}>
            <StatusBadge variant={productStatusVariant}>{productStatus}</StatusBadge>
          </div>
          <p className={styles.sideDescription}>{productDescription}</p>

          <div className={styles.summaryGrid}>
            {summaryItems.map((item) => (
              <div key={item.label} className={styles.summaryCard}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
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
            <div className={styles.variantPanel}>
              <div className={styles.variantPanelHeader}>
                <p className={styles.variantPanelLabel}>Selected variant</p>
                <StatusBadge variant={selectedBom ? "success" : "warning"}>
                  {selectedBom ? "Active BOM" : "No active BOM"}
                </StatusBadge>
              </div>
              <ProductVariantPicker
                productId={typedProduct.id}
                value={selectedVariant.id}
                options={typedVariants.map((variant) => ({
                  id: variant.id,
                  label: `${variant.title ?? "Untitled"}${variant.sku ? ` - ${variant.sku}` : ""}`,
                }))}
              />
            </div>
          ) : null}
        </aside>

        <div className={styles.mainCard}>
          <div className={styles.mainHeader}>
            <div className={styles.mainHeaderInfo}>
              <p className={styles.sectionEyebrow}>Variant configuration</p>
              <h2>{variantLabel}</h2>
              <p className={styles.versionMeta}>
                {selectedBom
                  ? `Active BOM version ${selectedBom.version} with ${typedBomLines.length} component line${typedBomLines.length === 1 ? "" : "s"}.`
                  : "No BOM has been created for the selected variant yet."}
              </p>
            </div>
            {selectedBom ? <StatusBadge variant="success">v{selectedBom.version}</StatusBadge> : null}
          </div>

          {typedBomLines.length === 0 ? (
            <EmptyState
              title="No BOM components for this variant"
              message="Use the BOM builder to start from scratch, copy another BOM, or apply a template to this variant."
              action={
                selectedVariant ? (
                  <BomLightbox
                    variantId={selectedVariant.id}
                    variantLabel={variantLabel}
                    templates={templateOptions}
                    sourceBoms={sourceBomOptions}
                    components={componentOptions}
                    buttonClassName={styles.actionButton}
                  />
                ) : null
              }
            />
          ) : (
            <div className={styles.lineTable}>
              <div className={styles.lineHeader}>
                <span>Component</span>
                <span>Reference</span>
                <span>Quantity</span>
                <span>Unit</span>
              </div>
              {typedBomLines.map((line, index) => {
                const component = Array.isArray(line.component)
                  ? line.component[0] ?? null
                  : line.component;
                return (
                  <div className={styles.lineRow} key={`${selectedBom?.id ?? "none"}-${index}`}>
                    <div className={styles.linePrimary}>
                      <strong>{component?.name ?? "Unknown component"}</strong>
                    </div>
                    <span>{component?.sku ? `SKU ${component.sku}` : "No SKU reference"}</span>
                    <span>{line.quantity}</span>
                    <span>{component?.unit ?? "ea"}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
