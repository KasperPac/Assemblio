export type BadgeVariant = "default" | "success" | "warning" | "danger" | "info";
type Badge = { variant: BadgeVariant; label: string };

export function invoiceBadge(status: string, syncStatus: string): Badge {
  if (status === "draft") return { variant: "default", label: "Draft" };
  if (status === "voided") {
    if (syncStatus === "queued") return { variant: "warning", label: "Voiding in Xero" };
    if (syncStatus === "failed") return { variant: "danger", label: "Void in Xero failed" };
    return { variant: "default", label: "Voided" };
  }
  switch (syncStatus) {
    case "sent": return { variant: "success", label: "Sent to Xero" };
    case "queued": return { variant: "info", label: "Queued for Xero" };
    case "failed": return { variant: "danger", label: "Xero sync failed" };
    default: return { variant: "default", label: "Posted" };
  }
}

export function jobBadge(status: string, errorClass: string | null): Badge {
  switch (status) {
    case "pending": return errorClass === "auth" ? { variant: "warning", label: "Paused: reconnect Xero" } : { variant: "info", label: "Queued" };
    case "working": return { variant: "info", label: "Sending" };
    case "sent": return { variant: "success", label: "Sent" };
    case "failed":
      if (errorClass === "fixable") return { variant: "danger", label: "Needs attention" };
      if (errorClass === "daily_limit") return { variant: "warning", label: "Waiting for Xero's daily limit" };
      return { variant: "warning", label: "Retrying" };
    case "gave_up": return { variant: "danger", label: "Stopped retrying" };
    default: return { variant: "default", label: "Cancelled" };
  }
}

export const OPERATION_LABELS: Record<string, string> = { create_bill: "Create bill", void_bill: "Void bill", create_contact: "Create contact" };

export const INVOICE_TABS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "not_synced", label: "Not synced" },
  { key: "queued", label: "Queued" },
  { key: "sent", label: "Sent" },
  { key: "failed", label: "Failed" },
  { key: "voided", label: "Voided" },
] as const;
