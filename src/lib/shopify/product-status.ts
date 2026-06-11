export type ProductStatus = "active" | "draft" | "archived";

// Maps Shopify's product status (ACTIVE / DRAFT / ARCHIVED) to our lowercase
// status values. Unknown or missing values fall back to "active".
export function mapProductStatus(
  shopifyStatus: string | null | undefined
): ProductStatus {
  switch ((shopifyStatus ?? "").toUpperCase()) {
    case "DRAFT":
      return "draft";
    case "ARCHIVED":
      return "archived";
    default:
      return "active";
  }
}
