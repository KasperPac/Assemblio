// src/lib/orders/pipeline-rollup.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deriveComponentsState,
  type ComponentsState,
  type ComponentsLineInput,
} from "./components-state";
import {
  deriveProductionState,
  type ProductionState,
} from "./production-state";
import {
  deriveDeliveryState,
  type DeliveryState,
  type DeliveryLineInput,
} from "./delivery-state";
import { isOverdue } from "./target-ship";
import { getOrderLineStatus } from "./order-line-status";

export type OrderPipelineRollup = {
  orderId: string;
  components: ComponentsState;
  production: ProductionState;
  delivery: DeliveryState;
  targetShipDate: Date | null;
  isOverdue: boolean;
};

// Pure composer — used directly by tests with synthetic data.
export function rollupOrderPipeline(input: {
  orderId: string;
  orderStatus: string;
  targetShipDate: Date | null;
  lines: Array<ComponentsLineInput & DeliveryLineInput>;
  snapshots: Array<{ status: string }>;
  hasAnyActualTime: boolean;
  now?: Date;
}): OrderPipelineRollup {
  const components = deriveComponentsState(
    input.lines.map((l) => ({
      bom: l.bom,
      componentCount: l.componentCount,
      shortComponents: l.shortComponents,
    }))
  );
  const production = deriveProductionState({
    orderStatus: input.orderStatus,
    snapshots: input.snapshots,
    hasAnyActualTime: input.hasAnyActualTime,
  });
  const delivery = deriveDeliveryState(
    input.lines.map((l) => ({ shippedAt: l.shippedAt }))
  );
  const overdue = isOverdue(input.targetShipDate, delivery, input.now);

  return {
    orderId: input.orderId,
    components,
    production,
    delivery,
    targetShipDate: input.targetShipDate,
    isOverdue: overdue,
  };
}

type OrderRow = {
  id: string;
  status: string;
  target_ship_date: string | null;
};

type OrderLineRow = {
  id: string;
  order_id: string;
  variant_id: string;
  quantity: number;
  shipped_at: string | null;
};

export async function getOrdersPipelineRollup(
  supabase: SupabaseClient,
  tenantId: string,
  orders: OrderRow[]
): Promise<Map<string, OrderPipelineRollup>> {
  const result = new Map<string, OrderPipelineRollup>();
  if (orders.length === 0) return result;
  const orderIds = orders.map((o) => o.id);

  const [{ data: lineRows }, { data: snapshotRows }, { data: actualRows }] =
    await Promise.all([
      supabase
        .from("order_line")
        .select("id, order_id, variant_id, quantity, shipped_at")
        .in("order_id", orderIds),
      supabase
        .from("job_cost_snapshot")
        .select("order_id, snapshot_status")
        .eq("tenant_id", tenantId)
        .in("order_id", orderIds),
      supabase
        .from("job_actual_time_entry")
        .select("order_id")
        .eq("tenant_id", tenantId)
        .in("order_id", orderIds)
        .limit(1000),
    ]);

  const lines = (lineRows ?? []) as OrderLineRow[];
  const linesByOrder = new Map<string, OrderLineRow[]>();
  for (const row of lines) {
    const bucket = linesByOrder.get(row.order_id) ?? [];
    bucket.push(row);
    linesByOrder.set(row.order_id, bucket);
  }

  const snapshotsByOrder = new Map<string, Array<{ status: string }>>();
  for (const row of (snapshotRows ?? []) as Array<{
    order_id: string;
    snapshot_status: string;
  }>) {
    const bucket = snapshotsByOrder.get(row.order_id) ?? [];
    bucket.push({ status: row.snapshot_status });
    snapshotsByOrder.set(row.order_id, bucket);
  }

  const ordersWithActuals = new Set(
    ((actualRows ?? []) as Array<{ order_id: string }>).map((r) => r.order_id)
  );

  const allLineStatuses = await getOrderLineStatus(
    supabase,
    tenantId,
    lines.map((l) => ({ id: l.id, variant_id: l.variant_id, quantity: l.quantity }))
  );

  const now = new Date();

  for (const order of orders) {
    const orderLines = linesByOrder.get(order.id) ?? [];
    const composedLines = orderLines.map((line) => {
      const status = allLineStatuses.get(line.id);
      const shortComponents =
        status?.components
          .filter((c) => c.isShort)
          .map((c) => ({
            componentId: c.componentId,
            earliestEta: c.earliestPoEta,
          })) ?? [];
      return {
        bom: status?.bom ? { id: status.bom.id } : null,
        componentCount: status?.components.length ?? 0,
        shortComponents,
        shippedAt: line.shipped_at ? new Date(line.shipped_at) : null,
      };
    });

    const rollup = rollupOrderPipeline({
      orderId: order.id,
      orderStatus: order.status,
      targetShipDate: order.target_ship_date
        ? new Date(order.target_ship_date)
        : null,
      lines: composedLines,
      snapshots: snapshotsByOrder.get(order.id) ?? [],
      hasAnyActualTime: ordersWithActuals.has(order.id),
      now,
    });

    result.set(order.id, rollup);
  }

  return result;
}
