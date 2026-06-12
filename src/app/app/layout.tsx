import type { ReactNode } from "react";
import Image from "next/image";
import { headers } from "next/headers";
import styles from "./shell.module.css";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOut, switchActiveTenant } from "./actions";
import SidebarNav from "./sidebar-nav";
import Topbar from "./topbar";
import { requireActiveSubscription } from "./_lib/require-active-subscription";
import { TrialBanner } from "./_components/trial-banner";
import ViewAsBanner from "./_components/view-as-banner";
import { PastDueBanner } from "./_components/past-due-banner";
import { pastDueSoftLocked } from "@/lib/plans";
import type { AccessResult } from "@/lib/subscription/access";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const pathname = (await headers()).get("x-pathname") ?? ""; // set by middleware on /app/* only
  const isBillingShell = pathname.startsWith("/app/billing");
  const isPrintRoute = pathname.endsWith("/print");
  const isScanRoute = pathname.startsWith("/app/scan");
  if (isBillingShell || isPrintRoute || isScanRoute) return <>{children}</>; // billing/layout.tsx, print routes, and scan routes provide their own chrome

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id,role,avatar_url,super_admin_home_tenant_id,tenant:tenant_id(id,name,has_planning_module)")
    .eq("id", user?.id ?? "")
    .maybeSingle();

  const isSuperAdmin = profile?.role === "super_admin";
  const isPlatformOperator =
    profile?.role === "super_admin" || profile?.role === "platform_observer";

  // Platform operator with no active tenant → send them to the platform module,
  // unless they're on /app (dev dashboard) or /app/super-admin.
  const isSuperAdminPath = pathname.startsWith("/app/super-admin");
  const isDevDashboard = pathname === "/app";
  if (isPlatformOperator && !profile?.tenant_id && !isSuperAdminPath && !isDevDashboard) {
    const { redirect } = await import("next/navigation");
    redirect("/app/super-admin");
  }

  const isSuspendedPath = pathname.startsWith("/app/suspended");
  if (!isSuspendedPath && profile?.tenant_id && !isPlatformOperator) {
    const { data: tenantLockState } = await supabase
      .from("tenant")
      .select("suspended_at, deleted_at")
      .eq("id", profile.tenant_id)
      .maybeSingle();
    if (tenantLockState?.suspended_at || tenantLockState?.deleted_at) {
      const { redirect } = await import("next/navigation");
      redirect("/app/suspended");
    }
  }

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

  // Subscription gate: redirects to /app/billing/paywall or /app/billing/past-due
  // when the tenant's subscription state requires it. /app/billing/* routes are
  // already short-circuited above, so this only fires on non-billing routes.
  let access: AccessResult | null = null;
  if (profile?.tenant_id && !isPlatformOperator) {
    access = await requireActiveSubscription(supabase, profile.tenant_id);
  }
  const sub = access?.sub ?? null;
  const trialDaysLeft =
    sub?.status === "trialing" && typeof access?.daysLeft === "number"
      ? access.daysLeft
      : null;
  const showPastDueBanner =
    sub?.status === "past_due" && pastDueSoftLocked(sub);

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

        <SidebarNav hasPlanning={hasPlanning} isSuperAdmin={isSuperAdmin} isPlatformOperator={isPlatformOperator} />
      </aside>

      <div className={styles.main}>
        <Topbar
          tenantName={tenant?.name ?? "No tenant access"}
          userInitial={userInitial}
          userAvatarUrl={profile?.avatar_url ?? null}
          selectableTenants={selectableTenants}
          currentTenantId={profile?.tenant_id ?? ""}
        />
        {isPlatformOperator && profile?.tenant_id && profile?.tenant_id !== profile?.super_admin_home_tenant_id && (
          <ViewAsBanner tenantName={tenant?.name ?? "tenant"} />
        )}
        {trialDaysLeft !== null && sub ? (
          <TrialBanner
            daysLeft={trialDaysLeft}
            selectedTier={sub.selected_tier}
          />
        ) : null}
        {showPastDueBanner ? <PastDueBanner /> : null}
        <section className={styles.content}>{children}</section>
      </div>
    </div>
  );
}
