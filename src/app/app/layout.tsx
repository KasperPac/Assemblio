import type { ReactNode } from "react";
import Image from "next/image";
import { headers } from "next/headers";
import styles from "./shell.module.css";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOut, switchActiveTenant } from "./actions";
import SidebarNav from "./sidebar-nav";
import Topbar from "./topbar";
import { requireActiveSubscription } from "./_lib/require-active-subscription";
import type { AccessResult } from "@/lib/subscription/access";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const pathname = (await headers()).get("x-pathname") ?? "";
  const isBillingShell = pathname.startsWith("/app/billing");
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id,role,tenant:tenant_id(id,name,has_planning_module)")
    .eq("id", user?.id ?? "")
    .maybeSingle();

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

  const profileTenant = Array.isArray(profile?.tenant)
    ? profile?.tenant[0] ?? null
    : profile?.tenant;

  // The profiles -> tenant join can return null if the tenant row is hidden
  // by RLS (e.g. the user lost their profile_tenant_access row but their
  // profiles.tenant_id was never cleared). Try profile_tenant_access first
  // (self-readable policy), then a direct lookup on the tenant table as a
  // last resort.
  const accessTenant = (accessRows ?? [])
    .map((row) => (Array.isArray(row.tenant) ? row.tenant[0] : row.tenant))
    .find((t) => t?.id === profile?.tenant_id);

  let tenant = profileTenant?.name
    ? profileTenant
    : accessTenant ?? profileTenant;

  let hasPlanning = (profile?.tenant as any)?.has_planning_module ?? false;

  if (!tenant?.name && profile?.tenant_id) {
    const { data: directTenant } = await supabase
      .from("tenant")
      .select("id,name,has_planning_module")
      .eq("id", profile.tenant_id)
      .maybeSingle();
    if (directTenant?.name) {
      tenant = directTenant;
      hasPlanning = directTenant.has_planning_module ?? false;
    }
  }

  const userInitial = (user?.email ?? "U").slice(0, 1).toUpperCase();

  // Subscription gate: skip entirely for /app/billing/* so the user can
  // always reach the paywall / past-due pages to pay. Otherwise this
  // redirects to /app/billing/paywall or /app/billing/past-due when the
  // tenant's subscription state requires it.
  let access: AccessResult | null = null;
  if (!isBillingShell && profile?.tenant_id) {
    access = await requireActiveSubscription(supabase, profile.tenant_id);
  }

  // Billing shell bypass: render bare children (no sidebar/topbar) so the
  // paywall / past-due pages are not wrapped in app chrome.
  if (isBillingShell) {
    return <>{children}</>;
  }

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <Image
            src="/manuva-logo.png"
            alt="Manuva"
            width={140}
            height={39}
            className={styles.brandLogo}
            priority
          />
        </div>

        <SidebarNav hasPlanning={hasPlanning} />
      </aside>

      <div className={styles.main}>
        <Topbar
          tenantName={tenant?.name ?? "No tenant access"}
          userInitial={userInitial}
          selectableTenants={selectableTenants}
          currentTenantId={profile?.tenant_id ?? ""}
        />
        {/* TODO Task 7: trial banner here, using `access` */}
        <section className={styles.content}>{children}</section>
      </div>
    </div>
  );
}
