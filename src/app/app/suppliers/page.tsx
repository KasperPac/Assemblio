import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "./suppliers.module.css";
import { createSupplier, updateSupplierName } from "./actions";
import SupplierCreateForm from "./supplier-create-form";

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
      <div className={styles.header}>
        <div>
          <h1>Suppliers</h1>
          <p>Manage preferred suppliers and purchase flows</p>
        </div>
      </div>
      <SupplierCreateForm action={createSupplier} />
      <div className={styles.table}>
        <div className={styles.tableHeader}>
          <span>Supplier</span>
          <span>Status</span>
          <span>Actions</span>
        </div>
        {error ? (
          <div className={styles.empty}>Failed to load suppliers.</div>
        ) : (data ?? []).length === 0 ? (
          <div className={styles.empty}>No suppliers yet.</div>
        ) : (
          (data as SupplierRow[]).map((row) => (
            <div key={row.id} className={styles.tableRow}>
              <form action={updateSupplierName} className={styles.renameForm}>
                <input type="hidden" name="supplier_id" value={row.id} />
                <input name="name" defaultValue={row.name} />
                <button type="submit">Save</button>
              </form>
              <span className={styles.status}>Active</span>
              <span className={styles.actionHint}>Update name</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
