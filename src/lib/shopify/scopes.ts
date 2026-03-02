const REQUIRED_SYNC_SCOPES = ["read_products", "read_orders"] as const;

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
