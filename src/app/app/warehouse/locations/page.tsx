import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import { LocationsTree, type Warehouse } from "./locations-tree";
import styles from "./page.module.css";

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

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Locations</h1>
        <p className={styles.subtitle}>Manage warehouses, aisles, and bays.</p>
      </div>
      <LocationsTree warehouses={(warehouses ?? []) as Warehouse[]} />
    </div>
  );
}
