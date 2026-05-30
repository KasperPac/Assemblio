import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import {
  loadInventoryIntegrityAudit,
  type AuditClient,
} from "@/lib/inventory/audit";
import { ReportShell } from "../_components/report-shell";
import { ReportStatCards } from "../_components/report-stat-cards";
import { ReportTable, Badge } from "../_components/report-table";
import type { TableColumn } from "../_components/report-table";

interface IssueRow extends Record<string, unknown> {
  rowKey: string;
  issueType: string;
  component: string;
  description: string;
}

export default async function InventoryIntegrityPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; preset?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/auth/login");
  const { supabase, tenantId: _tenantId } = ctx;
  const tenantId = _tenantId!; // non-null: layout.tsx redirects tenant-less operators to /app/super-admin

  const integrity = await loadInventoryIntegrityAudit(
    supabase as unknown as AuditClient,
    tenantId
  );

  const allIssues: IssueRow[] = [
    ...integrity.invariantIssues.map((issue, i) => ({
      rowKey: `invariant-${i}`,
      issueType: "Invariant",
      component: issue.componentName,
      description: issue.detail,
    })),
    ...integrity.reconciliationIssues.map((issue, i) => ({
      rowKey: `reconciliation-${i}`,
      issueType: "Reconciliation",
      component: issue.componentName,
      description: `on_hand delta: ${issue.onHandDelta.toFixed(4)}, in_prod delta: ${issue.inProdDelta.toFixed(4)}`,
    })),
    ...integrity.duplicateAllocationKeys.map(([key, count], i) => ({
      rowKey: `duplicate-${i}`,
      issueType: "Duplicate key",
      component: "—",
      description: `Allocation key "${key}" appears ${count} times`,
    })),
    ...integrity.poOverReceipt.map((line, i) => ({
      rowKey: `po-over-receipt-${i}`,
      issueType: "PO over-receipt",
      component: "—",
      description: `PO line ${String(line.id ?? "").slice(0, 8).toUpperCase()}: received ${line.quantity_received} > ordered ${line.quantity}`,
    })),
  ];

  const totalIssues = allIssues.length;

  const columns: TableColumn<IssueRow>[] = [
    {
      key: "issueType",
      header: "Type",
      render: (row) => {
        if (row.issueType === "Invariant") {
          return <Badge variant="red">{row.issueType}</Badge>;
        }
        if (row.issueType === "PO over-receipt") {
          return <Badge variant="blue">{row.issueType}</Badge>;
        }
        return <Badge variant="amber">{row.issueType}</Badge>;
      },
    },
    {
      key: "component",
      header: "Component",
      render: (row) => row.component,
    },
    {
      key: "description",
      header: "Description",
      render: (row) => row.description,
    },
  ];

  return (
    <ReportShell
      eyebrow="System"
      title="Inventory Integrity"
      description="Automated checks across allocations, balances, and PO receipts."
      csvSlug="inventory-integrity"
      searchParams={sp}
      hideDateRange={true}
    >
      <ReportStatCards
        cards={[
          {
            label: "Total issues",
            value: totalIssues > 0 ? `${totalIssues} issues` : "Healthy",
            sub: totalIssues > 0 ? "action required" : "0 issues · checked now",
            variant: totalIssues > 0 ? "red" : "green",
          },
          {
            label: "Invariant issues",
            value: integrity.invariantIssues.length,
            variant: integrity.invariantIssues.length > 0 ? "red" : "default",
          },
          {
            label: "Reconciliation drifts",
            value: integrity.reconciliationIssues.length,
            variant: integrity.reconciliationIssues.length > 0 ? "amber" : "default",
          },
          {
            label: "PO over-receipts",
            value: integrity.poOverReceipt.length,
            variant: integrity.poOverReceipt.length > 0 ? "amber" : "default",
          },
        ]}
      />
      <ReportTable
        columns={columns}
        rows={allIssues}
        rowKey={(r) => r.rowKey}
        emptyMessage="No integrity issues found. All checks passed."
      />
    </ReportShell>
  );
}
