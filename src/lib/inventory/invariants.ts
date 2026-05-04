export type InventoryInvariantInputRow = {
  componentName: string;
  locationName: string;
  onHand: number;
  inProd: number;
  reserved: number;
};

export type InventoryInvariantIssue = {
  type:
    | "negative_on_hand"
    | "negative_in_prod"
    | "negative_reserved"
    | "over_reserved";
  componentName: string;
  locationName: string;
  detail: string;
};

export function findInventoryInvariantIssues(
  rows: InventoryInvariantInputRow[]
) {
  const issues: InventoryInvariantIssue[] = [];
  for (const row of rows) {
    const onHand = Number(row.onHand ?? 0);
    const inProd = Number(row.inProd ?? 0);
    const reserved = Number(row.reserved ?? 0);
    if (onHand < 0) {
      issues.push({
        type: "negative_on_hand",
        componentName: row.componentName,
        locationName: row.locationName,
        detail: `on_hand is negative (${onHand}).`,
      });
    }
    if (inProd < 0) {
      issues.push({
        type: "negative_in_prod",
        componentName: row.componentName,
        locationName: row.locationName,
        detail: `in_prod is negative (${inProd}).`,
      });
    }
    if (reserved < 0) {
      issues.push({
        type: "negative_reserved",
        componentName: row.componentName,
        locationName: row.locationName,
        detail: `reserved is negative (${reserved}).`,
      });
    }
    if (Math.abs(reserved) > Math.abs(onHand)) {
      issues.push({
        type: "over_reserved",
        componentName: row.componentName,
        locationName: row.locationName,
        detail: `reserved magnitude (${reserved}) exceeds on_hand magnitude (${onHand}).`,
      });
    }
  }

  return issues;
}
