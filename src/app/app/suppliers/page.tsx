import { getServerTenantContext } from "@/lib/tenant/context";
import styles from "./suppliers.module.css";
import { createSupplier } from "./actions";
import SupplierCreateForm from "./supplier-create-form";
import PageHeader from "../_ui/page-header";
import EmptyState from "../_ui/empty-state";
import StatusBadge from "../_ui/status-badge";
import Link from "next/link";

type RawRow = {
  id: string;
  name: string;
  website: string | null;
  default_lead_time_days: number | null;
  is_active: boolean;
  supplier_components: Array<{ id: string }>;
  purchase_order: Array<{ id: string; status: string; created_at: string }>;
};

type SupplierRow = {
  id: string;
  name: string;
  website: string | null;
  default_lead_time_days: number | null;
  is_active: boolean;
  component_count: number;
  last_po_date: string | null;
  open_po_count: number;
};

export default async function SuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter = "active" } = await searchParams;
  const context = await getServerTenantContext();
  if (!context) return <p className={styles.errorMsg}>Missing tenant context.</p>;
  const { supabase, tenantId, role } = context;

  let query = supabase
    .from("suppliers")
    .select(
      `id, name, website, default_lead_time_days, is_active,
       supplier_components(id),
       purchase_order(id, status, created_at)`
    )
    .eq("tenant_id", tenantId)
    .order("name");

  if (filter === "active") query = query.eq("is_active", true);
  if (filter === "archived") query = query.eq("is_active", false);

  const { data, error } = await query;

  const rows: SupplierRow[] = (data ?? []).map((s: RawRow) => {
    const pos = (s.purchase_order ?? []) as Array<{
      id: string;
      status: string;
      created_at: string;
    }>;
    const openPos = pos.filter((p) => p.status === "open");
    const lastPo = pos
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    return {
      id: s.id,
      name: s.name,
      website: s.website ?? null,
      default_lead_time_days: s.default_lead_time_days ?? null,
      is_active: s.is_active,
      component_count: Array.isArray(s.supplier_components)
        ? s.supplier_components.length
        : 0,
      last_po_date: lastPo?.created_at ?? null,
      open_po_count: openPos.length,
    };
  });

  const tabs = [
    { key: "active", label: "Active" },
    { key: "archived", label: "Archived" },
    { key: "all", label: "All" },
  ];

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Logistics"
        title="Suppliers"
        description="Manage suppliers used throughout purchasing and inbound stock workflows."
        actions={
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            {(role === "admin" || role === "super_admin") && (
              <Link href="/app/suppliers/import" className={styles.importLink}>
                Import CSV
              </Link>
            )}
            <SupplierCreateForm action={createSupplier} />
          </div>
        }
      />

      <div className={styles.toolbar}>
        <div className={styles.tabs}>
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={`/app/suppliers?filter=${t.key}`}
              className={filter === t.key ? styles.tabActive : styles.tab}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </div>

      {error ? (
        <p className={styles.errorMsg}>Failed to load suppliers.</p>
      ) : rows.length === 0 ? (
        <EmptyState title="No suppliers yet" message="Add your first supplier to start tracking purchasing." />
      ) : (
        <div className={styles.tableCard}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Supplier</th>
                <th>Components</th>
                <th>Lead time</th>
                <th>Last PO</th>
                <th>Open POs</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={!row.is_active ? styles.archivedRow : ""}>
                  <td>
                    <Link href={`/app/suppliers/${row.id}`} className={styles.nameCell}>
                      {row.name}
                    </Link>
                    {row.website && (
                      <div className={styles.website}>{row.website}</div>
                    )}
                  </td>
                  <td className={styles.meta}>
                    {row.component_count > 0 ? row.component_count : "—"}
                  </td>
                  <td className={styles.meta}>
                    {row.default_lead_time_days != null
                      ? `${row.default_lead_time_days} days`
                      : "—"}
                  </td>
                  <td className={styles.meta}>
                    {row.last_po_date
                      ? new Date(row.last_po_date).toLocaleDateString("en-AU", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "—"}
                  </td>
                  <td>
                    {row.open_po_count > 0 ? (
                      <StatusBadge variant="info">{row.open_po_count} open</StatusBadge>
                    ) : (
                      <span className={styles.meta}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
