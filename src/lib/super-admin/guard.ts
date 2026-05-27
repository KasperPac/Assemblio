import { getServerTenantContext, type TenantContext } from "@/lib/tenant/context";

export async function requireSuperAdmin(): Promise<TenantContext> {
  const ctx = await getServerTenantContext();
  if (!ctx || ctx.role !== "super_admin") {
    throw new Error("forbidden");
  }
  return ctx;
}
