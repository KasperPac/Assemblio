// src/app/app/orders/_components/pipeline-pills.tsx
import StatusBadge from "../../_ui/status-badge";
import type {
  ComponentsState,
} from "@/lib/orders/components-state";
import type { ProductionState } from "@/lib/orders/production-state";
import type { DeliveryState } from "@/lib/orders/delivery-state";
import styles from "./pipeline-pills.module.css";

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short" });
}

export function ComponentsPill({ state }: { state: ComponentsState }) {
  switch (state.kind) {
    case "empty":
      return <span className={styles.dash}>—</span>;
    case "in-stock":
      return <StatusBadge variant="success">In stock</StatusBadge>;
    case "partial": {
      const label = state.earliestEta
        ? `${state.readyLines} of ${state.totalLines} ready · ${formatDate(state.earliestEta)}`
        : `${state.readyLines} of ${state.totalLines} ready`;
      return <StatusBadge variant="warning">{label}</StatusBadge>;
    }
    case "awaiting":
      return (
        <StatusBadge variant="danger">
          Expected {formatDate(state.earliestEta)}
        </StatusBadge>
      );
    case "no-eta":
      return <StatusBadge variant="danger">No ETA</StatusBadge>;
    case "bom-needed":
      return <StatusBadge variant="danger">BOM needed</StatusBadge>;
  }
}

export function ProductionPill({ state }: { state: ProductionState }) {
  switch (state) {
    case "not-started":
      return <StatusBadge>Not started</StatusBadge>;
    case "in-progress":
      return <StatusBadge variant="info">In progress</StatusBadge>;
    case "done":
      return <StatusBadge variant="success">Done</StatusBadge>;
    case "cancelled":
      return <StatusBadge>Cancelled</StatusBadge>;
  }
}

export function DeliveryPill({ state }: { state: DeliveryState }) {
  switch (state) {
    case "n-a":
      return <span className={styles.dash}>—</span>;
    case "not-shipped":
      return <StatusBadge>Not shipped</StatusBadge>;
    case "partially-shipped":
      return <StatusBadge variant="warning">Partially shipped</StatusBadge>;
    case "shipped":
      return <StatusBadge variant="success">Shipped</StatusBadge>;
  }
}
