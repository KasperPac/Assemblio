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
  const { supabase, tenantId: _tenantId, role } = context;
  const tenantId = _tenantId!; // non-null: layout.tsx redirects tenant-less operators to /app/super-admin
  const canDelete = role === "admin" || role === "super_admin";

  const access = await getSubscriptionAccess(supabase, tenantId);
  if (!access.sub || !hasFeature(access.sub, "binManagement")) {
    return (
      <FeatureUpsell
        feature="Multi-location and bin management"
        requiredTier="growth"
      />
    );
  }

  const [warehousesResult, compLocResult] = await Promise.all([
    supabase
      .from("location")
      .select(`
        id, name, is_default,
        sub_locations:bin_sub_location(id, name),
        aisles:bin_aisle(id, name, sub_location_id, bays:bin_bay(id, name, aisle_id))
      `)
      .eq("tenant_id", tenantId)
      .order("name"),
    supabase
      .from("component")
      .select("bin_sub_location_id, bin_aisle_id, bin_bay_id")
      .eq("tenant_id", tenantId)
      .is("archived_at", null),
  ]);

  if (warehousesResult.error) return <p className={styles.error}>Failed to load locations: {warehousesResult.error.message}</p>;

  const componentCounts: Record<string, number> = {};
  for (const row of compLocResult.data ?? []) {
    if (row.bin_sub_location_id) componentCounts[row.bin_sub_location_id] = (componentCounts[row.bin_sub_location_id] ?? 0) + 1;
    if (row.bin_aisle_id) componentCounts[row.bin_aisle_id] = (componentCounts[row.bin_aisle_id] ?? 0) + 1;
    if (row.bin_bay_id) componentCounts[row.bin_bay_id] = (componentCounts[row.bin_bay_id] ?? 0) + 1;
  }

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
      <LocationsTree warehouses={(warehousesResult.data ?? []) as Warehouse[]} componentCounts={componentCounts} canDelete={canDelete} />
    </div>
  );
}
