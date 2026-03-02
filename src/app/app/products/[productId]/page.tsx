import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "../product-detail.module.css";

type ProductRecord = {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  shopify_id: string;
  created_at: string;
};

type VariantRecord = {
  id: string;
  title: string | null;
  sku: string | null;
  created_at: string;
};

type Props = {
  params: Promise<{
    productId: string;
  }>;
};

export default async function ProductDetailPage({ params }: Props) {
  const { productId } = await params;
  const supabase = await createSupabaseServerClient();

  const [{ data: product }, { data: variants }] = await Promise.all([
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

  if (!product) {
    notFound();
  }

  const typedProduct = product as ProductRecord;

  return (
    <div className={styles.page}>
      <p className={styles.breadcrumb}>
        <Link href="/app/products">Products</Link> / {typedProduct.title}
      </p>

      <section className={styles.hero}>
        <div className={styles.heroImage}>
          {typedProduct.image_url ? (
            <Image
              src={typedProduct.image_url}
              alt={typedProduct.title}
              width={120}
              height={120}
              unoptimized
            />
          ) : (
            <span>{typedProduct.title.slice(0, 1)}</span>
          )}
        </div>
        <div className={styles.heroText}>
          <h1>{typedProduct.title}</h1>
          <p className={styles.description}>
            {typedProduct.description?.trim() || "No description available."}
          </p>
          <p className={styles.meta}>Shopify ID: {typedProduct.shopify_id}</p>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>Variants ({(variants ?? []).length})</h2>
        </div>
        {(variants ?? []).length === 0 ? (
          <p className={styles.empty}>No variants imported for this product.</p>
        ) : (
          (variants as VariantRecord[]).map((variant) => (
            <div key={variant.id} className={styles.variantRow}>
              <div>
                <p className={styles.variantTitle}>{variant.title ?? "Untitled variant"}</p>
                <p className={styles.variantMeta}>{variant.sku ? `SKU ${variant.sku}` : "No SKU"}</p>
              </div>
              <Link className={styles.variantLink} href={`/app/products/variants/${variant.id}`}>
                Open variant
              </Link>
            </div>
          ))
        )}
      </section>
    </div>
  );
}
