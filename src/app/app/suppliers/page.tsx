import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "./suppliers.module.css";
import { createSupplier } from "./actions";
import SupplierCreateForm from "./supplier-create-form";
import PageHeader from "../_ui/page-header";
import Link from "next/link";

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
  const supabase = await createSupabaseServerClient();

  let query = supabase
    .from("suppliers")
    .select(
      `id, name, website, default_lead_time_days, is_active,
       supplier_components(id),
       purchase_order(id, status, created_at)`
    )
    .order("name");

  if (filter === "active") query = query.eq("is_active", true);
  if (filter === "archived") query = query.eq("is_active", false);

  const { data, error } = await query;

  const rows: SupplierRow[] = (data ?? []).map((s: any) => {
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
        eyebrow="Suppliers"
        title="Supplier directory"
        description="Manage suppliers used throughout purchasing and inbound stock workflows."
      />

      <div className={styles.toolbar}>
        <div className={styles.filterTabs}>
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={`/app/suppliers?filter=${t.key}`}
              className={`${styles.filterTab} ${filter === t.key ? styles.filterTabActive : ""}`}
            >
              {t.label}
            </Link>
          ))}
        </div>
        <SupplierCreateForm action={createSupplier} />
      </div>

      {error ? (
        <p className={styles.errorMsg}>Failed to load suppliers.</p>
      ) : rows.length === 0 ? (
        <p className={styles.emptyMsg}>No suppliers.</p>
      ) : (
        <div className={styles.table}>
          <div className={styles.tableHeader}>
            <span>Supplier</span>
            <span>Components</span>
            <span>Lead time</span>
            <span>Last PO</span>
            <span>Open POs</span>
          </div>
          {rows.map((row) => (
            <div
              key={row.id}
              className={`${styles.tableRow} ${!row.is_active ? styles.tableRowArchived : ""}`}
            >
              <div>
                <Link href={`/app/suppliers/${row.id}`} className={styles.supplierName}>
                  {row.name}
                </Link>
                {row.website && (
                  <div className={styles.supplierWebsite}>{row.website}</div>
                )}
              </div>
              <span>
                {row.component_count > 0 ? `${row.component_count}` : "—"}
              </span>
              <span>
                {row.default_lead_time_days ? `${row.default_lead_time_days} days` : "—"}
              </span>
              <span>
                {row.last_po_date
                  ? new Date(row.last_po_date).toLocaleDateString("en-AU", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })
                  : "—"}
              </span>
              <span>
                {row.open_po_count > 0 ? (
                  <span className={styles.openPoBadge}>{row.open_po_count} open</span>
                ) : (
                  "—"
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
