import {
  buildRequiredComponentQuantities,
  buildReservedMutation,
  getNextReserved,
  groupAllocationRows,
} from "./engine";

type DbClient = {
  from: (table: string) => unknown;
};

type DbQuery = {
  select: (columns: string) => DbQuery;
  insert: (values: Record<string, unknown> | Record<string, unknown>[]) => DbQuery;
  upsert: (
    values: Record<string, unknown> | Record<string, unknown>[],
    options?: { onConflict?: string }
  ) => DbQuery;
  update: (values: Record<string, unknown>) => DbQuery;
  delete: () => DbQuery;
  eq: (column: string, value: unknown) => DbQuery;
  in: (column: string, values: unknown[]) => DbQuery;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  then: <TResult1 = unknown, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null
  ) => Promise<TResult1 | TResult2>;
};

function asQuery(query: unknown) {
  return query as DbQuery;
}

type OrderRow = {
  id: string;
  status: string;
};

type LocationRow = {
  id: string;
};

type OrderLineRow = {
  id: string;
  variant_id: string;
  quantity: number;
};

type BomRow = {
  id: string;
};

type BomComponentRow = {
  component_id: string;
  quantity: number;
};

type AllocationRow = {
  id: string;
  component_id: string;
  quantity: number;
};

type BalanceRow = {
  id: string;
  reserved: number;
};

export type ReconcileOrderResult = {
  applied: number;
  skippedMissingBom: number;
  clearedOnly: boolean;
};

async function updateReservedWithMovement(
  client: DbClient,
  tenantId: string,
  orderId: string,
  componentId: string,
  locationId: string,
  deltaReserved: number
) {
  const mutation = buildReservedMutation(deltaReserved);
  if (!mutation) return;

  const { error: movementError } = await asQuery(client.from("inventory_movement")).insert({
    tenant_id: tenantId,
    component_id: componentId,
    location_id: locationId,
    delta_on_hand: mutation.deltaOnHand,
    delta_in_prod: 0,
    delta_reserved: mutation.deltaReserved,
    reason: mutation.reason,
    reference_type: "order",
    reference_id: orderId,
  });
  if (movementError) throw movementError;

  const { data: existingBalance, error: balanceReadError } = await asQuery(
    client.from("inventory_balance")
  )
    .select("id,reserved")
    .eq("tenant_id", tenantId)
    .eq("component_id", componentId)
    .eq("location_id", locationId)
    .maybeSingle();
  if (balanceReadError) throw balanceReadError;

  const balance = existingBalance as BalanceRow | null;
  if (!balance?.id) {
    const { error: balanceInsertError } = await asQuery(
      client.from("inventory_balance")
    ).insert({
      tenant_id: tenantId,
      component_id: componentId,
      location_id: locationId,
      on_hand: 0,
      in_prod: 0,
      reserved: getNextReserved(0, mutation.deltaReserved),
    });
    if (balanceInsertError) throw balanceInsertError;
    return;
  }

  const nextReserved = getNextReserved(
    Number(balance.reserved ?? 0),
    mutation.deltaReserved
  );
  const { error: balanceUpdateError } = await asQuery(client.from("inventory_balance"))
    .update({ reserved: nextReserved })
    .eq("tenant_id", tenantId)
    .eq("id", balance.id);
  if (balanceUpdateError) throw balanceUpdateError;
}

async function clearLineAllocations(
  client: DbClient,
  tenantId: string,
  orderId: string,
  locationId: string,
  lineId: string
) {
  const { data: existingAllocations, error: readError } = await asQuery(
    client.from("order_component_allocation")
  )
    .select("id,component_id,quantity")
    .eq("tenant_id", tenantId)
    .eq("order_line_id", lineId);
  if (readError) throw readError;

  let released = 0;
  for (const [componentId, grouped] of groupAllocationRows(
    (existingAllocations ?? []) as AllocationRow[]
  ).entries()) {
    const { error: deleteError } = await asQuery(
      client.from("order_component_allocation")
    )
      .delete()
      .eq("tenant_id", tenantId)
      .in("id", grouped.ids);
    if (deleteError) throw deleteError;

    await updateReservedWithMovement(
      client,
      tenantId,
      orderId,
      componentId,
      locationId,
      -grouped.totalQty
    );
    released += 1;
  }

  return released;
}

export async function reconcileOrderAllocations(
  client: DbClient,
  tenantId: string,
  orderId: string
): Promise<ReconcileOrderResult> {
  const { data: orderData, error: orderError } = await asQuery(client.from("orders"))
    .select("id,status")
    .eq("tenant_id", tenantId)
    .eq("id", orderId)
    .maybeSingle();
  if (orderError) throw orderError;
  const order = orderData as OrderRow | null;
  if (!order?.id) return { applied: 0, skippedMissingBom: 0, clearedOnly: false };

  const { data: locationData, error: locationError } = await asQuery(
    client.from("location")
  )
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("is_default", true)
    .maybeSingle();
  if (locationError) throw locationError;
  const location = locationData as LocationRow | null;
  const locationId = location?.id;
  if (!locationId) return { applied: 0, skippedMissingBom: 0, clearedOnly: false };

  const { data: orderLineData, error: lineError } = await asQuery(
    client.from("order_line")
  )
    .select("id,variant_id,quantity")
    .eq("tenant_id", tenantId)
    .eq("order_id", orderId);
  if (lineError) throw lineError;
  const lines = (orderLineData ?? []) as OrderLineRow[];
  if (lines.length === 0) return { applied: 0, skippedMissingBom: 0, clearedOnly: false };

  const shouldClearOnly = ["fulfilled", "cancelled"].includes(
    String(order.status ?? "").toLowerCase()
  );
  let applied = 0;
  let skippedMissingBom = 0;

  for (const line of lines) {
    if (shouldClearOnly) {
      applied += await clearLineAllocations(client, tenantId, orderId, locationId, line.id);
      continue;
    }

    const { data: bomData, error: bomError } = await asQuery(
      client.from("product_bom")
    )
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("variant_id", line.variant_id)
      .eq("is_active", true)
      .maybeSingle();
    if (bomError) throw bomError;

    const bom = bomData as BomRow | null;
    if (!bom?.id) {
      skippedMissingBom += 1;
      continue;
    }

    const { data: bomComponentData, error: bomComponentError } = await asQuery(
      client.from("product_bom_component")
    )
      .select("component_id,quantity")
      .eq("tenant_id", tenantId)
      .eq("product_bom_id", bom.id);
    if (bomComponentError) throw bomComponentError;

    const bomComponents = (bomComponentData ?? []) as BomComponentRow[];
    if (bomComponents.length === 0) {
      skippedMissingBom += 1;
      continue;
    }

    const { data: existingAllocationData, error: allocationReadError } = await asQuery(
      client.from("order_component_allocation")
    )
      .select("id,component_id,quantity")
      .eq("tenant_id", tenantId)
      .eq("order_line_id", line.id);
    if (allocationReadError) throw allocationReadError;

    const groupedExisting = groupAllocationRows(
      (existingAllocationData ?? []) as AllocationRow[]
    );
    const requiredMap = buildRequiredComponentQuantities(
      Number(line.quantity ?? 0),
      bomComponents
    );

    for (const [componentId, requiredQty] of requiredMap.entries()) {
      const existing = groupedExisting.get(componentId);
      const currentQty = existing?.totalQty ?? 0;
      const delta = requiredQty - currentQty;

      if (!existing?.primaryId) {
        const { error: allocationInsertError } = await asQuery(
          client.from("order_component_allocation")
        )
          .upsert(
            {
              tenant_id: tenantId,
              order_line_id: line.id,
              component_id: componentId,
              quantity: requiredQty,
            },
            { onConflict: "tenant_id,order_line_id,component_id" }
          );
        if (allocationInsertError) throw allocationInsertError;
      } else if (delta !== 0) {
        const { error: allocationUpdateError } = await asQuery(
          client.from("order_component_allocation")
        )
          .update({ quantity: requiredQty })
          .eq("tenant_id", tenantId)
          .eq("id", existing.primaryId);
        if (allocationUpdateError) throw allocationUpdateError;
      }

      if (existing && existing.duplicateIds.length > 0) {
        const { error: duplicateDeleteError } = await asQuery(
          client.from("order_component_allocation")
        )
          .delete()
          .eq("tenant_id", tenantId)
          .in("id", existing.duplicateIds);
        if (duplicateDeleteError) throw duplicateDeleteError;
      }

      await updateReservedWithMovement(
        client,
        tenantId,
        orderId,
        componentId,
        locationId,
        delta
      );
      if (delta !== 0 || !existing?.primaryId) applied += 1;
    }

    for (const [componentId, grouped] of groupedExisting.entries()) {
      if (requiredMap.has(componentId)) continue;

      const { error: deleteError } = await asQuery(
        client.from("order_component_allocation")
      )
        .delete()
        .eq("tenant_id", tenantId)
        .in("id", grouped.ids);
      if (deleteError) throw deleteError;

      await updateReservedWithMovement(
        client,
        tenantId,
        orderId,
        componentId,
        locationId,
        -grouped.totalQty
      );
      applied += 1;
    }
  }

  return { applied, skippedMissingBom, clearedOnly: shouldClearOnly };
}
