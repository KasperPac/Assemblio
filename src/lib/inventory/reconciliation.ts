export type BalanceSnapshotRow = {
  componentId: string;
  locationId: string;
  componentName: string;
  locationName: string;
  onHand: number;
  inProd: number;
};

export type MovementAggregateRow = {
  componentId: string;
  locationId: string;
  deltaOnHand: number;
  deltaInProd: number;
};

export type ReconciliationIssue = {
  componentId: string;
  locationId: string;
  componentName: string;
  locationName: string;
  onHandBalance: number;
  onHandMovement: number;
  inProdBalance: number;
  inProdMovement: number;
  onHandDelta: number;
  inProdDelta: number;
};

function key(componentId: string, locationId: string) {
  return `${componentId}:${locationId}`;
}

export function reconcileInventoryBalances(
  balances: BalanceSnapshotRow[],
  movements: MovementAggregateRow[],
  tolerance = 0.0001
) {
  const movementTotals = new Map<
    string,
    { onHand: number; inProd: number }
  >();

  for (const movement of movements) {
    const k = key(movement.componentId, movement.locationId);
    const current = movementTotals.get(k) ?? { onHand: 0, inProd: 0 };
    current.onHand += Number(movement.deltaOnHand ?? 0);
    current.inProd += Number(movement.deltaInProd ?? 0);
    movementTotals.set(k, current);
  }

  const issues: ReconciliationIssue[] = [];
  for (const balance of balances) {
    const k = key(balance.componentId, balance.locationId);
    const movement = movementTotals.get(k) ?? { onHand: 0, inProd: 0 };
    const onHandDelta = Number(balance.onHand ?? 0) - movement.onHand;
    const inProdDelta = Number(balance.inProd ?? 0) - movement.inProd;

    if (Math.abs(onHandDelta) <= tolerance && Math.abs(inProdDelta) <= tolerance) {
      continue;
    }

    issues.push({
      componentId: balance.componentId,
      locationId: balance.locationId,
      componentName: balance.componentName,
      locationName: balance.locationName,
      onHandBalance: Number(balance.onHand ?? 0),
      onHandMovement: movement.onHand,
      inProdBalance: Number(balance.inProd ?? 0),
      inProdMovement: movement.inProd,
      onHandDelta,
      inProdDelta,
    });
  }

  return issues;
}
