export type LowStockComponentRow = {
  componentId: string;
  reorderPoint: number;
};

export type LowStockBalanceRow = {
  componentId: string;
  onHand: number;
  reserved: number;
};

export function countLowStockComponents(
  components: LowStockComponentRow[],
  balances: LowStockBalanceRow[]
) {
  const availableByComponent = new Map<string, number>();

  for (const row of balances) {
    const available =
      Number(row.onHand ?? 0) - Number(row.reserved ?? 0);
    availableByComponent.set(
      row.componentId,
      (availableByComponent.get(row.componentId) ?? 0) + available
    );
  }

  return components.filter((component) => {
    const reorderPoint = Number(component.reorderPoint ?? 0);
    if (reorderPoint <= 0) return false;

    const available = availableByComponent.get(component.componentId) ?? 0;
    return available < reorderPoint;
  }).length;
}
