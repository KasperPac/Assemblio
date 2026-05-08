import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import PageHeader from "../../_ui/page-header";
import { setDefaultLocation } from "./actions";
import styles from "./locations.module.css";

export default async function LocationsPage() {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/app/auth/login");
  if (ctx.role !== "admin" && ctx.role !== "super_admin") {
    redirect("/app/settings/profile");
  }

  const { data: locations } = await ctx.supabase
    .from("location")
    .select("id, name, is_default")
    .order("name", { ascending: true });

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Locations"
        description="Set the default warehouse location used across the workspace."
      />
      <div className={styles.list}>
        {(locations ?? []).map((loc) => (
          <div
            key={loc.id}
            className={`${styles.row} ${loc.is_default ? styles.rowDefault : ""}`}
          >
            <div className={styles.rowInfo}>
              <span className={styles.name}>{loc.name}</span>
              {loc.is_default && (
                <span className={styles.defaultBadge}>Default</span>
              )}
            </div>
            {!loc.is_default && (
              <form action={setDefaultLocation}>
                <input type="hidden" name="location_id" value={loc.id} />
                <button type="submit" className={styles.setDefaultButton}>
                  Set as default
                </button>
              </form>
            )}
          </div>
        ))}
        {(locations ?? []).length === 0 && (
          <p className={styles.empty}>
            No locations found. Create locations in the Locations module first.
          </p>
        )}
      </div>
    </>
  );
}
