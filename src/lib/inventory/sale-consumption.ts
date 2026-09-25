import { assertNoError } from "@/lib/supabase/assert-no-error";

type RpcClient = {
  rpc: (name: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }>;
};

// Consumes one fulfilled retail order line: on_hand down by the BOM
// requirement, its reservation released, one 'sale' movement — atomically
// and at most once per line. See
// supabase/patches/2026-09-25-retail-stock-foundation.sql.
export async function consumeOrderLineSale(
  client: RpcClient,
  input: { tenantId: string; orderLineId: string; locationId: string }
): Promise<number> {
  const { data, error } = await client.rpc("apply_sale_consumption", {
    p_tenant_id: input.tenantId,
    p_order_line_id: input.orderLineId,
    p_location_id: input.locationId,
  });
  assertNoError(error as { message?: string } | null, "apply_sale_consumption");
  return Number(data ?? 0);
}

function first<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

// order_line selected with `variant:variant_id(product:product_id(kind))`.
export function isRetailLine(line: { variant?: unknown }): boolean {
  const variant = first(line.variant as { product?: unknown } | { product?: unknown }[] | null);
  const product = first(variant?.product as { kind?: string } | { kind?: string }[] | null);
  return product?.kind === "retail";
}
