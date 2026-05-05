import type { SupabaseClient } from "@supabase/supabase-js";

export type ComponentStatus = {
  componentId: string;
  name: string;
  requiredQty: number;
  availableQty: number;
  isShort: boolean;
};

export type OrderLineStatus = {
  lineId: string;
  bom: { id: string; version: number } | null;
  components: ComponentStatus[];
  allocatedQty: number;
  allocationState: "allocated" | "no-bom" | "empty-bom";
};

/**
 * Derives allocation state from BOM structure, not from whether allocation rows exist.
 * _allocatedQty is accepted in the signature for caller convenience but is not used.
 */
export function deriveAllocationState(
  bom: { id: string } | null,
  componentCount: number,
  _allocatedQty: number
): "allocated" | "no-bom" | "empty-bom" {
  if (!bom) return "no-bom";
  if (componentCount === 0) return "empty-bom";
  return "allocated";
}

export async function getOrderLineStatus(
  supabase: SupabaseClient,
  tenantId: string,
  lines: Array<{ id: string; variant_id: string; quantity: number }>
): Promise<Map<string, OrderLineStatus>> {
  const result = new Map<string, OrderLineStatus>();
  if (lines.length === 0) return result;

  const variantIds = [...new Set(lines.map((l) => l.variant_id))];

  const { data: boms } = await supabase
    .from("product_bom")
    .select("id,version,variant_id")
    .eq("tenant_id", tenantId)
    .in("variant_id", variantIds)
    .eq("is_active", true);

  const bomByVariant = new Map(
    (boms ?? []).map((b) => [
      b.variant_id as string,
      b as { id: string; version: number; variant_id: string },
    ])
  );

  const bomIds = (boms ?? []).map((b) => (b as { id: string }).id);

  const { data: bomComponentRows } =
    bomIds.length > 0
      ? await supabase
          .from("product_bom_component")
          .select("product_bom_id,component_id,quantity")
          .eq("tenant_id", tenantId)
          .in("product_bom_id", bomIds)
      : {
          data: [] as Array<{
            product_bom_id: string;
            component_id: string;
            quantity: number;
          }>,
        };

  const componentsByBom = new Map<
    string,
    Array<{ component_id: string; quantity: number }>
  >();
  for (const row of bomComponentRows ?? []) {
    const r = row as {
      product_bom_id: string;
      component_id: string;
      quantity: number;
    };
    const existing = componentsByBom.get(r.product_bom_id) ?? [];
    existing.push({ component_id: r.component_id, quantity: Number(r.quantity) });
    componentsByBom.set(r.product_bom_id, existing);
  }

  const componentIds = [
    ...new Set(
      (bomComponentRows ?? []).map(
        (r) => (r as { component_id: string }).component_id
      )
    ),
  ];

  const { data: defaultLocationRow } = await supabase
    .from("location")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("is_default", true)
    .maybeSingle();
  const defaultLocationId = (defaultLocationRow as { id: string } | null)?.id ?? null;

  const [{ data: componentRows }, { data: balanceRows }, { data: allocationRows }] =
    await Promise.all([
      componentIds.length > 0
        ? supabase.from("component").select("id,name").in("id", componentIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
      componentIds.length > 0
        ? (() => {
            let q = supabase
              .from("inventory_balance")
              .select("component_id,on_hand,reserved")
              .in("component_id", componentIds);
            if (defaultLocationId) q = q.eq("location_id", defaultLocationId);
            return q;
          })()
        : Promise.resolve({
            data: [] as Array<{
              component_id: string;
              on_hand: number;
              reserved: number;
            }>,
          }),
      supabase
        .from("order_component_allocation")
        .select("order_line_id,quantity")
        .in(
          "order_line_id",
          lines.map((l) => l.id)
        ),
    ]);

  const nameById = new Map(
    (componentRows ?? []).map((c) => [
      (c as { id: string; name: string }).id,
      (c as { id: string; name: string }).name,
    ])
  );

  const balanceByComponent = new Map(
    (balanceRows ?? []).map((b) => {
      const r = b as {
        component_id: string;
        on_hand: number;
        reserved: number;
      };
      return [
        r.component_id,
        { onHand: Number(r.on_hand ?? 0), reserved: Number(r.reserved ?? 0) },
      ];
    })
  );

  const allocatedByLine = new Map<string, number>();
  for (const row of allocationRows ?? []) {
    const r = row as { order_line_id: string; quantity: number };
    allocatedByLine.set(
      r.order_line_id,
      (allocatedByLine.get(r.order_line_id) ?? 0) + Number(r.quantity ?? 0)
    );
  }

  for (const line of lines) {
    const bom = bomByVariant.get(line.variant_id) ?? null;
    const bomComponents = bom ? (componentsByBom.get(bom.id) ?? []) : [];
    const allocatedQty = allocatedByLine.get(line.id) ?? 0;
    const allocationState = deriveAllocationState(
      bom,
      bomComponents.length,
      allocatedQty
    );

    const components: ComponentStatus[] = bomComponents.map((bc) => {
      const requiredQty = Number(bc.quantity) * Number(line.quantity);
      const bal = balanceByComponent.get(bc.component_id);
      const availableQty = (bal?.onHand ?? 0) - (bal?.reserved ?? 0);
      return {
        componentId: bc.component_id,
        name: nameById.get(bc.component_id) ?? bc.component_id,
        requiredQty,
        availableQty,
        isShort: availableQty < requiredQty,
      };
    });

    result.set(line.id, {
      lineId: line.id,
      bom: bom ? { id: bom.id, version: bom.version } : null,
      components,
      allocatedQty,
      allocationState,
    });
  }

  return result;
}
