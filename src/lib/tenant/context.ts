import { createSupabaseServerClient } from "@/lib/supabase/server";

export type TenantContext = {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  tenantId: string | null;   // null = platform operator with no active tenant
  role: string;
  userId: string;
  superAdminHomeTenantId: string | null;
};

export async function getServerTenantContext(): Promise<TenantContext | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id,role,status,super_admin_home_tenant_id")
    .eq("id", user.id)
    .single();

  if (profile?.status === "deactivated") return null;

  // Platform operators (super_admin / platform_observer) may have null tenant_id.
  if (!profile?.tenant_id) {
    if (profile?.role === "super_admin" || profile?.role === "platform_observer") {
      return {
        supabase,
        tenantId: null,
        role: profile.role,
        userId: user.id,
        superAdminHomeTenantId: profile.super_admin_home_tenant_id ?? null,
      };
    }
    // Member with null tenant_id: invariant violation — treat as logged-out.
    return null;
  }

  // Regular user with a tenant set — validate and fall back to first available.
  if (profile.role !== "super_admin") {
    const { data: accessRows } = await supabase
      .from("profile_tenant_access")
      .select("tenant_id")
      .eq("profile_id", user.id);

    const hasActiveTenantAccess = (accessRows ?? []).some(
      (row) => row.tenant_id === profile.tenant_id
    );

    if (!hasActiveTenantAccess) {
      const fallbackTenantId = accessRows?.[0]?.tenant_id ?? null;
      if (!fallbackTenantId) return null;

      await supabase
        .from("profiles")
        .update({ tenant_id: fallbackTenantId })
        .eq("id", user.id);

      return {
        supabase,
        tenantId: fallbackTenantId,
        role: profile.role as string,
        userId: user.id,
        superAdminHomeTenantId: profile.super_admin_home_tenant_id ?? null,
      };
    }
  }

  return {
    supabase,
    tenantId: profile.tenant_id,
    role: profile.role as string,
    userId: user.id,
    superAdminHomeTenantId: profile.super_admin_home_tenant_id ?? null,
  };
}
