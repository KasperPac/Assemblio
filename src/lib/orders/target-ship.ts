// src/lib/orders/target-ship.ts
export type DeliveryState =
  | "not-shipped"
  | "partially-shipped"
  | "shipped"
  | "n-a";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function computeTargetShipDate(
  createdAt: Date | null,
  leadTimeDays: number | null
): Date | null {
  if (!createdAt || leadTimeDays === null) return null;
  return new Date(createdAt.getTime() + leadTimeDays * MS_PER_DAY);
}

export function isOverdue(
  targetShipDate: Date | null,
  deliveryState: DeliveryState,
  now: Date = new Date()
): boolean {
  if (!targetShipDate) return false;
  if (deliveryState === "shipped") return false;
  return targetShipDate.getTime() < now.getTime();
}

export function daysLate(targetShipDate: Date, now: Date = new Date()): number {
  const diffMs = now.getTime() - targetShipDate.getTime();
  return Math.max(0, Math.floor(diffMs / MS_PER_DAY));
}
