import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import { LocationsTree, type Warehouse } from "./locations-tree";
import PageHeader from "../../_ui/page-header";
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
      <PageHeader
        eyebrow="Warehouse"
        title="Locations"
        description="Manage warehouses, sub-locations, aisles, and bays."
      />
      <LocationsTree warehouses={(warehouses ?? []) as Warehouse[]} />
    </div>
  );
}
