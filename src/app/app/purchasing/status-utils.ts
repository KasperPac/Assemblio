export function getStatusVariant(
  status: string
): "default" | "success" | "warning" | "danger" | "info" {
  if (status === "received") return "success";
  if (status === "cancelled" || status === "archived") return "danger";
  if (status === "in_transit") return "info";
  return "warning";
}

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_transit: "In Transit",
  received: "Received",
  cancelled: "Cancelled",
  archived: "Archived",
};

export function getStatusLabel(status: string): string {
  return Object.prototype.hasOwnProperty.call(STATUS_LABELS, status)
    ? STATUS_LABELS[status]
    : status;
}
