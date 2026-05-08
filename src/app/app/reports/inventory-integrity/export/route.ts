import { NextResponse } from "next/server";
import { getServerTenantContext } from "@/lib/tenant/context";
import {
  loadInventoryIntegrityAudit,
  type AuditClient,
} from "@/lib/inventory/audit";

export async function GET() {
  const ctx = await getServerTenantContext();
  if (!ctx) return new NextResponse("Unauthorized", { status: 401 });
  const { supabase, tenantId } = ctx;

  const integrity = await loadInventoryIntegrityAudit(
    supabase as unknown as AuditClient,
    tenantId
  );

  type CsvRow = { type: string; component: string; description: string };

  const rows: CsvRow[] = [
    ...integrity.invariantIssues.map((issue) => ({
      type: "Invariant",
      component: issue.componentName,
      description: issue.detail,
    })),
    ...integrity.reconciliationIssues.map((issue) => ({
      type: "Reconciliation",
      component: issue.componentName,
      description: `on_hand delta: ${issue.onHandDelta.toFixed(4)}, in_prod delta: ${issue.inProdDelta.toFixed(4)}`,
    })),
    ...integrity.duplicateAllocationKeys.map(([key, count]) => ({
      type: "Duplicate key",
      component: "",
      description: `Allocation key "${key}" appears ${count} times`,
    })),
    ...integrity.poOverReceipt.map((line) => ({
      type: "PO over-receipt",
      component: "",
      description: `PO line ${String(line.id ?? "").slice(0, 8).toUpperCase()}: received ${line.quantity_received} > ordered ${line.quantity}`,
    })),
  ];

  const headers = ["Type", "Component", "Description"];

  const csvLines = rows.map((r) =>
    [r.type, r.component, r.description]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",")
  );

  const csv = [headers.join(","), ...csvLines].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": 'attachment; filename="inventory-integrity.csv"',
    },
  });
}
