const REQUIRED_SYNC_SCOPES = ["read_products", "read_orders"] as const;

/**
 * The scope string sent to Shopify at OAuth. Deliberately identical to
 * REQUIRED_SYNC_SCOPES: `read_customers` is protected customer data, needs its
 * own justification at App Store review, and the order sync writes
 * customer_email / customer_first_name as null (see sync.ts). Asking for it
 * would be asking for data we never read. Keep this in step with the
 * `[access_scopes]` block in shopify.app.toml and the SHOPIFY_SCOPES env var.
 */
export const OAUTH_SCOPES = REQUIRED_SYNC_SCOPES.join(",");

export function parseShopifyScopes(scopes: string | null | undefined): Set<string> {
  if (!scopes) return new Set();
  return new Set(
    scopes
      .split(",")
      .map((scope) => scope.trim())
      .filter(Boolean)
  );
}

export function getMissingSyncScopes(scopes: string | null | undefined) {
  const granted = parseShopifyScopes(scopes);
  return REQUIRED_SYNC_SCOPES.filter((scope) => !granted.has(scope));
}
