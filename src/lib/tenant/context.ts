import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function getServerTenantContext() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id,role,status")
    .eq("id", user.id)
    .single();

  if (!profile?.tenant_id) {
    return null;
  }

  if (profile.status === "deactivated") {
    return null;
  }

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
      };
    }
  }

  return {
    supabase,
    tenantId: profile.tenant_id,
    role: profile.role as string,
    userId: user.id,
  };
}
