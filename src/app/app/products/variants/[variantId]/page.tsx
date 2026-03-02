import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "../../variant-detail.module.css";
import BomSeedPanel from "../../bom-seed-panel";

type VariantRecord = {
  id: string;
  title: string | null;
  sku: string | null;
  shopify_id: string;
  product:
    | {
        id: string;
        title: string;
      }
    | Array<{
        id: string;
        title: string;
      }>
    | null;
};

type BomRecord = {
  id: string;
  version: number;
  status: string;
  is_active: boolean;
  created_at: string;
};

type BomLineRecord = {
  product_bom_id: string;
  quantity: number;
  component:
    | {
        name: string | null;
        sku: string | null;
      }
    | Array<{
        name: string | null;
        sku: string | null;
      }>
    | null;
};

type SourceBomRecord = {
  id: string;
  version: number;
  status: string;
  variant:
    | {
        id: string;
        title: string | null;
        sku: string | null;
        product:
          | {
              title: string;
            }
          | Array<{
              title: string;
            }>
          | null;
      }
    | Array<{
        id: string;
        title: string | null;
        sku: string | null;
        product:
          | {
              title: string;
            }
          | Array<{
              title: string;
            }>
          | null;
      }>
    | null;
};

type Props = {
  params: Promise<{
    variantId: string;
  }>;
};

function classForStatus(status: string) {
  if (status === "active") return `${styles.badge} ${styles.badgeActive}`;
  if (status === "archived") return `${styles.badge} ${styles.badgeArchived}`;
  return `${styles.badge} ${styles.badgeDraft}`;
}

export default async function VariantDetailPage({ params }: Props) {
  const { variantId } = await params;
  const supabase = await createSupabaseServerClient();

  const [{ data: variant }, { data: boms }, { data: sourceBoms }, { data: profile }] =
    await Promise.all([
      supabase
        .from("shopify_variant")
        .select("id,title,sku,shopify_id,product:product_id(id,title)")
        .eq("id", variantId)
        .maybeSingle(),
      supabase
        .from("product_bom")
        .select("id,version,status,is_active,created_at")
        .eq("variant_id", variantId)
        .order("version", { ascending: false }),
      supabase
        .from("product_bom")
        .select("id,version,status,variant:variant_id(id,title,sku,product:product_id(title))")
        .order("created_at", { ascending: false })
        .limit(250),
      supabase.from("profiles").select("role").single(),
    ]);

  if (!variant) {
    notFound();
  }

  const typedVariant = variant as VariantRecord;
  const typedProduct = Array.isArray(typedVariant.product)
    ? typedVariant.product[0] ?? null
    : typedVariant.product;
  const typedBoms = (boms ?? []) as BomRecord[];
  const hasBom = typedBoms.length > 0;
  const canManageBom = ["admin", "super_admin"].includes(profile?.role ?? "member");
  const bomIds = typedBoms.map((bom) => bom.id);

  const { data: bomLines } =
    bomIds.length === 0
      ? { data: [] }
      : await supabase
          .from("product_bom_component")
          .select("product_bom_id,quantity,component:component_id(name,sku)")
          .in("product_bom_id", bomIds)
          .order("created_at", { ascending: true });

  const linesByBom = ((bomLines ?? []) as BomLineRecord[]).reduce<
    Record<string, BomLineRecord[]>
  >((acc, line) => {
    const bucket = acc[line.product_bom_id] ?? [];
    bucket.push(line);
    acc[line.product_bom_id] = bucket;
    return acc;
  }, {});

  const copyOptions = ((sourceBoms ?? []) as SourceBomRecord[]).map((source) => {
    const sourceVariant = Array.isArray(source.variant)
      ? source.variant[0] ?? null
      : source.variant;
    const sourceProduct = Array.isArray(sourceVariant?.product)
      ? sourceVariant?.product[0] ?? null
      : sourceVariant?.product ?? null;

    return {
      id: source.id,
      label: `${sourceProduct?.title ?? "Product"} / ${sourceVariant?.title ?? "Variant"}${
        sourceVariant?.sku ? ` (${sourceVariant.sku})` : ""
      } - v${source.version} [${source.status}]`,
    };
  });

  return (
    <div className={styles.page}>
      <p className={styles.breadcrumb}>
        <Link href="/app/products">Products</Link>
        {typedProduct?.id ? (
          <>
            {" / "}
            <Link href={`/app/products/${typedProduct.id}`}>{typedProduct.title}</Link>
          </>
        ) : null}
        {" / "}
        {typedVariant.title ?? "Untitled variant"}
      </p>

      <section className={styles.card}>
        <h3>{typedVariant.title ?? "Untitled variant"}</h3>
        <p className={styles.meta}>{typedVariant.sku ? `SKU ${typedVariant.sku}` : "No SKU"}</p>
        <p className={styles.meta}>Shopify ID: {typedVariant.shopify_id}</p>
      </section>

      <section className={styles.card}>
        <h3>BOM</h3>
        {hasBom ? (
          <div className={styles.bomList}>
            {typedBoms.map((bom) => {
              const lines = linesByBom[bom.id] ?? [];
              return (
                <div key={bom.id} className={styles.lineTable}>
                  <div className={styles.bomHeader}>
                    <div className={styles.lineRow}>
                      <strong>Version {bom.version}</strong>
                      <div className={styles.badges}>
                        <span className={classForStatus(bom.status)}>{bom.status}</span>
                        {bom.is_active ? (
                          <span className={`${styles.badge} ${styles.badgeActive}`}>active</span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                  <div className={styles.lineHeader}>
                    <span>Component</span>
                    <span>Qty / unit</span>
                  </div>
                  {lines.length === 0 ? (
                    <div className={styles.lineRow}>
                      <span className={styles.empty}>No components on this BOM.</span>
                      <span />
                    </div>
                  ) : (
                    lines.map((line, index) => {
                      const component = Array.isArray(line.component)
                        ? line.component[0] ?? null
                        : line.component;
                      return (
                        <div className={styles.lineRow} key={`${bom.id}-${index}`}>
                          <span>
                            {component?.name ?? "Unknown component"}
                            {component?.sku ? ` (${component.sku})` : ""}
                          </span>
                          <span>{line.quantity}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              );
            })}
          </div>
        ) : canManageBom ? (
          <BomSeedPanel targetVariantId={typedVariant.id} sourceBoms={copyOptions} />
        ) : (
          <p className={styles.notice}>
            No BOM exists for this variant. Only admin and super_admin can create or copy BOMs.
          </p>
        )}
      </section>
    </div>
  );
}
