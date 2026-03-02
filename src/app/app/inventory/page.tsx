import styles from "./inventory.module.css";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import MovementForm from "./movement-form";

type InventoryRow = {
  id: string;
  on_hand: number;
  in_prod: number;
  reserved: number;
  component:
    | { name: string | null; sku: string | null }
    | Array<{ name: string | null; sku: string | null }>
    | null;
  location: { name: string | null } | Array<{ name: string | null }> | null;
};

type MovementRow = {
  id: string;
  delta_on_hand: number;
  delta_in_prod: number;
  reason: string | null;
  created_at: string;
  component: { name: string | null } | Array<{ name: string | null }> | null;
  location: { name: string | null } | Array<{ name: string | null }> | null;
};

export default async function InventoryPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("inventory_balance")
    .select(
      "id,on_hand,in_prod,reserved,component:component_id(name,sku),location:location_id(name)"
    )
    .order("on_hand", { ascending: false });

  const { data: movements } = await supabase
    .from("inventory_movement")
    .select(
      "id,delta_on_hand,delta_in_prod,reason,created_at,component:component_id(name),location:location_id(name)"
    )
    .order("created_at", { ascending: false })
    .limit(6);

  const { data: components } = await supabase
    .from("component")
    .select("id,name,sku")
    .order("name");

  const { data: locations } = await supabase
    .from("location")
    .select("id,name,is_default")
    .order("name");

  if (error) {
    return (
      <section className={styles.section}>
        <h2>Inventory Balance</h2>
        <p className={styles.error}>Failed to load inventory: {error.message}</p>
      </section>
    );
  }

  const rows = (data ?? []) as InventoryRow[];
  const movementRows = (movements ?? []) as MovementRow[];

  return (
    <section className={styles.section}>
      <div className={styles.header}>
        <div>
          <h2>Inventory Balance</h2>
          <p>On-hand and reserved positions by component and location.</p>
        </div>
        <a className={styles.export} href="/app/inventory/export">
          Export CSV
        </a>
      </div>
      <MovementForm components={components ?? []} locations={locations ?? []} />
      {rows.length === 0 ? (
        <div className={styles.empty}>
          No inventory balances yet. Receive stock or run a stocktake to get
          started.
        </div>
      ) : (
        <div className={styles.table}>
          <div className={styles.tableHeader}>
            <span>Component</span>
            <span>SKU</span>
            <span>Location</span>
            <span>On-hand</span>
            <span>In prod</span>
            <span>Reserved</span>
          </div>
          {rows.map((row) => {
            const component = Array.isArray(row.component)
              ? row.component[0] ?? null
              : row.component;
            const location = Array.isArray(row.location)
              ? row.location[0] ?? null
              : row.location;
            return (
              <div key={row.id} className={styles.tableRow}>
                <span>{component?.name ?? "Unknown"}</span>
                <span>{component?.sku ?? "--"}</span>
                <span>{location?.name ?? "Unassigned"}</span>
                <span>{row.on_hand}</span>
                <span>{row.in_prod}</span>
                <span>{row.reserved}</span>
              </div>
            );
          })}
        </div>
      )}
      <div className={styles.movements}>
        <h3>Recent movements</h3>
        {movementRows.length === 0 ? (
          <p className={styles.empty}>
            No movement history yet. New receipts, reservations, and
            stocktakes will show up here.
          </p>
        ) : (
          <div className={styles.movementList}>
            {movementRows.map((movement) => {
              const component = Array.isArray(movement.component)
                ? movement.component[0] ?? null
                : movement.component;
              const location = Array.isArray(movement.location)
                ? movement.location[0] ?? null
                : movement.location;
              return (
                <div key={movement.id} className={styles.movementRow}>
                  <div>
                    <p>{component?.name ?? "Unknown component"}</p>
                    <span>
                      {location?.name ?? "Unassigned"} |{" "}
                      {new Date(movement.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className={styles.delta}>
                    {movement.delta_on_hand !== 0
                      ? `On-hand ${movement.delta_on_hand > 0 ? "+" : ""}${movement.delta_on_hand}`
                      : "On-hand 0"}
                    <br />
                    {movement.delta_in_prod !== 0
                      ? `In prod ${movement.delta_in_prod > 0 ? "+" : ""}${movement.delta_in_prod}`
                      : "In prod 0"}
                  </div>
                  <div className={styles.reason}>
                    {movement.reason ?? "movement"}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
