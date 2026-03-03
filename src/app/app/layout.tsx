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

  const userInitial = (user?.email ?? "U").slice(0, 1).toUpperCase();
  const firstName = user?.email?.split("@")[0] ?? "User";

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <p className={styles.brandTitle}>Assemblio</p>
        </div>

        <div className={styles.userGreeting}>
          <span className={styles.userGreetingAvatar}>{userInitial}</span>
          <p className={styles.userGreetingText}>
            Hello, <strong>{firstName}</strong>
          </p>
        </div>

        <div className={styles.sidebarSearch}>
          <span className={styles.sidebarSearchIcon}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
          </span>
          <input
            type="text"
            placeholder="Search..."
            className={styles.sidebarSearchInput}
            readOnly
          />
        </div>

        <SidebarNav />

        <div className={styles.sidebarFooter}>
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
          <div className={styles.planCard}>
            <div className={styles.planIcon} />
            <div>
              <p className={styles.planName}>{tenant?.name ?? "Tenant"}</p>
              <p className={styles.planTier}>
                {isSuperAdmin ? "Super Admin" : "Tenant Member"}
              </p>
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
          <div className={styles.breadcrumb}>
            <span className={styles.breadcrumbMuted}>Dashboard</span>
            <span className={styles.breadcrumbSep}>/</span>
            <span className={styles.breadcrumbCurrent}>Overview</span>
          </div>
          <div className={styles.topbarActions}>
            <button className={styles.topbarIconBtn} type="button" aria-label="Notifications">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
            </button>
            <button className={styles.topbarIconBtn} type="button" aria-label="Theme">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
              </svg>
            </button>
            <button className={styles.topbarIconBtn} type="button" aria-label="Calendar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                <line x1="16" x2="16" y1="2" y2="6" />
                <line x1="8" x2="8" y1="2" y2="6" />
                <line x1="3" x2="21" y1="10" y2="10" />
              </svg>
            </button>
            <span className={styles.topbarAvatar}>{userInitial}</span>
          </div>
        </header>
        <section className={styles.content}>{children}</section>
      </div>
    </div>
  );
}
