import { createSupabaseServerClient } from "@/lib/supabase/server";
import styles from "./components.module.css";
import ComponentCreateForm from "./component-create-form";
import { createComponent } from "./actions";

type ComponentRow = {
  id: string;
  name: string;
  sku: string | null;
  reorder_point: number | null;
};

type BalanceRow = {
  component_id: string;
  on_hand: number;
  in_prod: number;
};

export default async function ComponentsPage() {
  const supabase = await createSupabaseServerClient();
  const { data: components, error } = await supabase
    .from("component")
    .select("id,name,sku,reorder_point")
    .order("name");

  const { data: balances } = await supabase
    .from("inventory_balance")
    .select("component_id,on_hand,in_prod");

  const balanceMap = (balances ?? []).reduce<Record<string, BalanceRow>>(
    (acc, row) => {
      acc[row.component_id] = row;
      return acc;
    },
    {}
  );

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1>Components</h1>
          <p>{(components ?? []).length} Components</p>
        </div>
      </div>
      <ComponentCreateForm action={createComponent} />
      <div className={styles.table}>
        <div className={styles.tableHeader}>
          <span>Component</span>
          <span>SKU</span>
          <span>On Hand</span>
          <span>In Prod</span>
          <span>Reorder</span>
        </div>
        {error ? (
          <div className={styles.empty}>Failed to load components.</div>
        ) : (components ?? []).length === 0 ? (
          <div className={styles.empty}>No components yet.</div>
        ) : (
          (components as ComponentRow[]).map((component) => {
            const balance = balanceMap[component.id];
            return (
              <div key={component.id} className={styles.tableRow}>
                <span>{component.name}</span>
                <span>{component.sku ?? "--"}</span>
                <span>{balance?.on_hand ?? 0}</span>
                <span>{balance?.in_prod ?? 0}</span>
                <span>{component.reorder_point ?? 0}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
