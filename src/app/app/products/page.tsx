import Image from "next/image";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "./products.module.css";

type ProductRow = {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  image_url: string | null;
};

type VariantRow = {
  id: string;
  product_id: string;
  title: string | null;
  sku: string | null;
};

function formatDescription(description: string | null) {
  if (!description) return "No description available.";
  const trimmed = description.trim();
  if (!trimmed) return "No description available.";
  return trimmed.length > 140 ? `${trimmed.slice(0, 140)}...` : trimmed;
}

export default async function ProductsPage() {
  const supabase = await createSupabaseServerClient();
  const [{ data: products, error }, { data: variants }] = await Promise.all([
    supabase
      .from("shopify_product")
      .select("id,title,description,created_at,image_url")
      .order("created_at", { ascending: false }),
    supabase
      .from("shopify_variant")
      .select("id,product_id,title,sku")
      .order("created_at", { ascending: true }),
  ]);

  const variantsByProduct = (variants ?? []).reduce<Record<string, VariantRow[]>>(
    (acc, variant) => {
      const bucket = acc[variant.product_id] ?? [];
      bucket.push(variant as VariantRow);
      acc[variant.product_id] = bucket;
      return acc;
    },
    {}
  );

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1>Products</h1>
          <p>{(products ?? []).length} imported from Shopify</p>
        </div>
      </div>

      <div className={styles.table}>
        <div className={styles.tableHeader}>
          <span>Product</span>
          <span>Variants</span>
          <span>Last Updated</span>
        </div>
        {error ? (
          <div className={styles.empty}>Failed to load products.</div>
        ) : (products ?? []).length === 0 ? (
          <div className={styles.empty}>No products yet.</div>
        ) : (
          (products as ProductRow[]).map((product) => {
            const productVariants = variantsByProduct[product.id] ?? [];
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
                        unoptimized
                      />
                    ) : (
                      <span>{product.title.slice(0, 1)}</span>
                    )}
                  </div>
                  <div className={styles.productText}>
                    <p className={styles.productTitle}>{product.title}</p>
                    <p className={styles.productDescription}>
                      {formatDescription(product.description)}
                    </p>
                  </div>
                </Link>

                <div className={styles.variantCell}>
                  <span className={styles.variantCount}>{productVariants.length}</span>
                  <div className={styles.variantLinks}>
                    {productVariants.slice(0, 2).map((variant) => (
                      <Link key={variant.id} href={`/app/products/variants/${variant.id}`}>
                        {variant.title ?? "Untitled"}
                        {variant.sku ? ` (${variant.sku})` : ""}
                      </Link>
                    ))}
                    {productVariants.length > 2 ? (
                      <span>+{productVariants.length - 2} more</span>
                    ) : null}
                  </div>
                </div>

                <span>{new Date(product.created_at).toLocaleDateString("en-GB")}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
