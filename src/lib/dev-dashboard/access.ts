type DashboardAccessContext = {
  role: string;
  tenantId: string | null;
  superAdminHomeTenantId: string | null;
};

export function shouldShowDevDashboard(context: DashboardAccessContext): boolean {
  const isPlatformOperator =
    context.role === "super_admin" || context.role === "platform_observer";

  if (!isPlatformOperator) return false;

  return !context.tenantId || context.tenantId === context.superAdminHomeTenantId;
}
