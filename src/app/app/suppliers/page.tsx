import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "./suppliers.module.css";
import { createSupplier, updateSupplierName } from "./actions";
import SupplierCreateForm from "./supplier-create-form";
import PageHeader from "../_ui/page-header";
import StatusBadge from "../_ui/status-badge";
import EmptyState from "../_ui/empty-state";
import ListPanel, { ListRow } from "../_ui/list-panel";

type SupplierRow = {
  id: string;
  name: string;
};

export default async function SuppliersPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("suppliers")
    .select("id,name")
    .order("name");

  return (
    <div className={styles.page}>
      <PageHeader
        eyebrow="Suppliers"
        title="Supplier directory"
        description="Maintain the supplier list used throughout purchasing and inbound stock workflows."
      />
      <SupplierCreateForm action={createSupplier} />

      <ListPanel
        eyebrow="Directory"
        title="Active suppliers"
        description="Keep supplier naming clean so purchasing and receiving stay consistent."
        columns={["Supplier", "Status", "Actions"]}
        columnsTemplate="1.4fr 0.6fr 1fr"
      >
        {error ? (
          <EmptyState
            title="Failed to load suppliers"
            message="The supplier directory could not be loaded from Supabase."
          />
        ) : (data ?? []).length === 0 ? (
          <EmptyState
            title="No suppliers yet"
            message="Add a supplier to begin managing purchasing relationships."
          />
        ) : (
          (data as SupplierRow[]).map((row) => (
            <ListRow
              key={row.id}
              columnsTemplate="1.4fr 0.6fr 1fr"
              className={styles.row}
            >
              <strong>{row.name}</strong>
              <StatusBadge variant="success">Active</StatusBadge>
              <form action={updateSupplierName} className={styles.renameForm}>
                <input type="hidden" name="supplier_id" value={row.id} />
                <input name="name" defaultValue={row.name} />
                <button type="submit">Save</button>
              </form>
            </ListRow>
          ))
        )}
      </ListPanel>
    </div>
  );
}
