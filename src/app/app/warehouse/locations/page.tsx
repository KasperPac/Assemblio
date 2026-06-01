import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerTenantContext } from "@/lib/tenant/context";
import { getSubscriptionAccess } from "@/lib/subscription/access";
import { hasFeature } from "@/lib/plans/features";
import { LocationsTree, type Warehouse } from "./locations-tree";
import { FeatureUpsell } from "../../_components/feature-upsell";
import PageHeader from "../../_ui/page-header";
import styles from "./page.module.css";

export default async function LocationsPage() {
  const context = await getServerTenantContext();
  if (!context) redirect("/auth/login");
  const { supabase, tenantId: _tenantId } = context;
  const tenantId = _tenantId!; // non-null: layout.tsx redirects tenant-less operators to /app/super-admin

  const access = await getSubscriptionAccess(supabase, tenantId);
  if (!access.sub || !hasFeature(access.sub, "binManagement")) {
    return (
      <FeatureUpsell
        feature="Multi-location and bin management"
        requiredTier="growth"
      />
    );
  }

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
        eyebrow="Logistics"
        title="Locations"
        description="Manage warehouses, sub-locations, aisles, and bays."
      />
      <p className={styles.settingsHint}>
        Default location is set in{" "}
        <Link href="/app/settings/locations">Settings → Locations</Link>.
      </p>
      <LocationsTree warehouses={(warehouses ?? []) as Warehouse[]} />
    </div>
  );
}
