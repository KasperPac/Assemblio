import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerTenantContext } from "@/lib/tenant/context";
import { getSubscriptionAccess } from "@/lib/subscription/access";
import { hasFeature } from "@/lib/plans/features";
import { FeatureUpsell } from "../../_components/feature-upsell";
import PageHeader from "../../_ui/page-header";
import { DefaultLocationPicker } from "./default-location-picker";
import styles from "./locations.module.css";

export default async function LocationsSettingsPage() {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/app/auth/login");
  if (ctx.role !== "admin" && ctx.role !== "super_admin") {
    redirect("/app/settings/profile");
  }

  const { supabase, tenantId } = ctx;

  const access = await getSubscriptionAccess(supabase, tenantId!);
  if (!access.sub || !hasFeature(access.sub, "binManagement")) {
    return (
      <FeatureUpsell
        feature="Multi-location and bin management"
        requiredTier="growth"
      />
    );
  }

  const { data: locations } = await supabase
    .from("location")
    .select("id, name, is_default")
    .eq("tenant_id", tenantId!)
    .order("name", { ascending: true });

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Default Location"
        description="Set the default warehouse location used across the workspace."
        actions={
          <Link href="/app/warehouse/locations" className={styles.manageLink}>
            Manage locations →
          </Link>
        }
      />
      <DefaultLocationPicker locations={locations ?? []} />
    </>
  );
}
