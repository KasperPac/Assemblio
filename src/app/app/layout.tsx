import type { ReactNode } from "react";
import styles from "./shell.module.css";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOut, switchActiveTenant } from "./actions";
import SidebarNav from "./sidebar-nav";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id,role,tenant:tenant_id(id,name)")
    .single();

  const isSuperAdmin = profile?.role === "super_admin";
  const [{ data: accessRows }, { data: allTenants }] = await Promise.all([
    supabase
      .from("profile_tenant_access")
      .select("tenant_id,tenant:tenant_id(id,name),role")
      .eq("profile_id", user?.id ?? ""),
    isSuperAdmin ? supabase.from("tenant").select("id,name").order("name") : Promise.resolve({ data: null }),
  ]);

  const selectableTenants = isSuperAdmin
    ? (allTenants ?? []).map((tenant) => ({ id: tenant.id, name: tenant.name }))
    : (accessRows ?? []).map((row) => {
        const tenant = Array.isArray(row.tenant) ? row.tenant[0] : row.tenant;
        return {
          id: tenant?.id ?? row.tenant_id,
          name: tenant?.name ?? "Tenant",
        };
      });

  const tenant = Array.isArray(profile?.tenant)
    ? profile?.tenant[0] ?? null
    : profile?.tenant;

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <span className={styles.brandMark} />
          <div>
            <p className={styles.brandTitle}>Assemblio</p>
            <p className={styles.brandMeta}>
              By {tenant?.name ?? "Tenant"}
            </p>
          </div>
        </div>
        <SidebarNav />
        <div className={styles.sidebarFooter}>
          <div className={styles.planCard}>
            <div className={styles.planIcon} />
            <div>
              <p className={styles.planName}>{tenant?.name ?? "Tenant"}</p>
              <p className={styles.planTier}>
                {isSuperAdmin ? "Super Admin" : "Tenant Member"}
              </p>
            </div>
          </div>
          {selectableTenants.length > 1 ? (
            <form action={switchActiveTenant} className={styles.tenantSwitchForm}>
              <label htmlFor="tenant-switch" className={styles.tenantSwitchLabel}>
                Active tenant
              </label>
              <select
                id="tenant-switch"
                name="tenant_id"
                defaultValue={profile?.tenant_id ?? ""}
                className={styles.tenantSwitchSelect}
              >
                {selectableTenants.map((tenantOption) => (
                  <option key={tenantOption.id} value={tenantOption.id}>
                    {tenantOption.name}
                  </option>
                ))}
              </select>
              <button type="submit" className={styles.tenantSwitchButton}>
                Switch
              </button>
            </form>
          ) : null}
          <div className={styles.userCard}>
            <span className={styles.userAvatar}>
              {(user?.email ?? "U").slice(0, 1).toUpperCase()}
            </span>
            <div>
              <p className={styles.userName}>{user?.email ?? "User"}</p>
              <p className={styles.userRole}>{profile?.role ?? "member"}</p>
            </div>
          </div>
          <a className={styles.helpLink} href="/app/help">
            Help & Docs
          </a>
          <form action={signOut}>
            <button className={styles.logout} type="submit">
              Log Out
            </button>
          </form>
        </div>
      </aside>
      <div className={styles.main}>
        <header className={styles.topbar}>
          <div>
            <p className={styles.topbarEyebrow}>Operations</p>
            <h1 className={styles.topbarTitle}>Assemblio Workspace</h1>
          </div>
          <div className={styles.topbarMeta}>
            <span className={styles.metaChip}>{tenant?.name ?? "Tenant"}</span>
            <span className={styles.metaChip}>{profile?.role ?? "member"}</span>
            <span className={styles.metaChip}>{user?.email ?? "User"}</span>
          </div>
        </header>
        <section className={styles.content}>{children}</section>
      </div>
    </div>
  );
}
