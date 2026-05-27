// src/lib/orders/delivery-state.ts
import type { DeliveryState } from "./target-ship";
export type { DeliveryState } from "./target-ship";

export type DeliveryLineInput = {
  shippedAt: Date | null;
};

export function deriveDeliveryState(lines: DeliveryLineInput[]): DeliveryState {
  if (lines.length === 0) return "n-a";
  const shippedCount = lines.filter((l) => l.shippedAt !== null).length;
  if (shippedCount === 0) return "not-shipped";
  if (shippedCount === lines.length) return "shipped";
  return "partially-shipped";
}
