export type BomComponentQuantity = {
  component_id: string;
  quantity: number;
};

export type AllocationQuantityRow = {
  id: string;
  component_id: string;
  quantity: number;
};

export type GroupedAllocation = {
  componentId: string;
  ids: string[];
  totalQty: number;
  primaryId: string | null;
  duplicateIds: string[];
};

export type ReservedMutation = {
  deltaOnHand: number;
  reason: "order_reserve" | "order_release";
  deltaReserved: number;
};

export function buildRequiredComponentQuantities(
  lineQuantity: number,
  bomComponents: BomComponentQuantity[]
): Map<string, number> {
  const requiredMap = new Map<string, number>();
  for (const componentRow of bomComponents) {
    const requiredQty = Number(lineQuantity) * Number(componentRow.quantity);
    requiredMap.set(
      componentRow.component_id,
      (requiredMap.get(componentRow.component_id) ?? 0) + requiredQty
    );
  }
  return requiredMap;
}

export function groupAllocationRows(
  rows: AllocationQuantityRow[]
): Map<string, GroupedAllocation> {
  const grouped = new Map<string, GroupedAllocation>();
  for (const row of rows) {
    const componentId = row.component_id;
    const current = grouped.get(componentId) ?? {
      componentId,
      ids: [],
      totalQty: 0,
      primaryId: null,
      duplicateIds: [],
    };
    current.ids.push(row.id);
    current.totalQty += Number(row.quantity ?? 0);
    if (!current.primaryId) {
      current.primaryId = row.id;
    } else {
      current.duplicateIds.push(row.id);
    }
    grouped.set(componentId, current);
  }
  return grouped;
}

export function buildReservedMutation(
  deltaReserved: number
): ReservedMutation | null {
  if (deltaReserved === 0) return null;
  return {
    deltaReserved,
    deltaOnHand: 0,
    reason: deltaReserved > 0 ? "order_reserve" : "order_release",
  };
}

export function getNextReserved(currentReserved: number, deltaReserved: number) {
  return Math.max(0, Number(currentReserved ?? 0) + Number(deltaReserved ?? 0));
}
