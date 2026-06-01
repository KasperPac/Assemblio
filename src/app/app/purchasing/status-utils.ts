export function getStatusVariant(
  status: string
): "default" | "success" | "warning" | "danger" | "info" {
  if (status === "received") return "success";
  if (status === "cancelled" || status === "archived") return "danger";
  if (status === "in_transit") return "info";
  return "warning";
}
