import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import styles from "./page.module.css";

type Bay = { id: string; name: string; aisle_id: string };
type Aisle = {
  id: string;
  name: string;
  sub_location_id: string | null;
  bays: Bay[] | null;
};
type SubLocation = { id: string; name: string };
type Warehouse = {
  id: string;
  name: string;
  is_default: boolean;
  sub_locations: SubLocation[] | null;
  aisles: Aisle[] | null;
};

function shortCode(id: string) {
  return id.replace(/-/g, "").slice(-6).toUpperCase();
}

export default async function LocationsPage() {
  const context = await getServerTenantContext();
  if (!context) redirect("/auth/login");
  const { supabase, tenantId } = context;

  const { data: warehouses, error } = await supabase
    .from("location")
    .select(`
      id, name, is_default,
      sub_locations:bin_sub_location(id, name),
      aisles:bin_aisle(id, name, sub_location_id, bays:bin_bay(id, name, aisle_id))
    `)
    .eq("tenant_id", tenantId)
    .order("name");

  if (error) return <p className={styles.error}>Failed to load locations: {error.message}</p>;

  const wh = (warehouses ?? []) as Warehouse[];

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Locations</h1>
        <p className={styles.subtitle}>Manage warehouses, aisles, and bays.</p>
      </div>

      {wh.length === 0 && (
        <p className={styles.empty}>No warehouses configured.</p>
      )}

      {wh.map((warehouse) => {
        const subLocMap = new Map((warehouse.sub_locations ?? []).map((s) => [s.id, s.name]));
        const aisles = [...(warehouse.aisles ?? [])].sort((a, b) => a.name.localeCompare(b.name));
        const subLocs = [...(warehouse.sub_locations ?? [])].sort((a, b) => a.name.localeCompare(b.name));

        return (
          <div key={warehouse.id} className={styles.warehouseBlock}>
            <div className={styles.warehouseRow}>
              <span className={styles.typeTag}>Warehouse</span>
              <span className={styles.warehouseName}>{warehouse.name}</span>
              <span className={styles.countTag}>{subLocs.length} sub-loc</span>
              <span className={styles.countTag}>{aisles.length} aisles</span>
              <span className={styles.shortCode}>{shortCode(warehouse.id)}</span>
            </div>

            {subLocs.map((sl) => (
              <div key={sl.id} className={styles.subLocRow}>
                <span className={styles.indent}>└</span>
                <span className={styles.typeTag}>Sub-loc</span>
                <span className={styles.entityName}>{sl.name}</span>
                <span className={styles.shortCode}>{shortCode(sl.id)}</span>
              </div>
            ))}

            {aisles.map((aisle) => {
              const bays = [...(aisle.bays ?? [])].sort((a, b) => a.name.localeCompare(b.name));
              const slName = aisle.sub_location_id ? subLocMap.get(aisle.sub_location_id) : null;
              return (
                <div key={aisle.id}>
                  <div className={styles.aisleRow}>
                    <span className={styles.indent}>└</span>
                    <span className={styles.typeTag}>Aisle</span>
                    <span className={styles.entityName}>
                      {aisle.name}
                      {slName && <span className={styles.slTag}> · {slName}</span>}
                      <span className={styles.bayCount}> · {bays.length} bays</span>
                    </span>
                    <span className={styles.shortCode}>{shortCode(aisle.id)}</span>
                  </div>
                  {bays.map((bay) => (
                    <div key={bay.id} className={styles.bayRow}>
                      <span className={styles.indent2}>└</span>
                      <span className={styles.typeTag}>Bay</span>
                      <span className={styles.entityName}>{bay.name}</span>
                      <span className={styles.pathHint}>{aisle.name} · {bay.name}</span>
                      <span className={styles.shortCode}>{shortCode(bay.id)}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        );
      })}

      <div className={styles.addWarehouseRow}>
        <span className={styles.addHint}>Multi-warehouse supported — add more any time</span>
      </div>
    </div>
  );
}
