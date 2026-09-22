import { getServerTenantContext, type TenantContext } from "@/lib/tenant/context";

/**
 * Roles that may perform workspace administration: billing, integrations,
 * team, company settings, and destructive/config mutations.
 *
 * `platform_observer` is deliberately excluded — it is read-only.
 */
export function isAdminRole(role: string | null | undefined): boolean {
  return role === "admin" || role === "super_admin";
}

export class NotAuthorisedError extends Error {
  constructor(message = "You do not have permission to do that.") {
    super(message);
    this.name = "NotAuthorisedError";
  }
}

/**
 * Server actions and route handlers are directly invocable — hiding a button
 * in the UI is not access control. Call this at the top of any admin-only
 * mutation.
 *
 * Throws NotAuthorisedError when the caller is not signed in or not an admin.
 */
export async function requireAdmin(): Promise<TenantContext> {
  const ctx = await getServerTenantContext();
  if (!ctx) throw new NotAuthorisedError("You are not signed in.");
  if (!isAdminRole(ctx.role)) throw new NotAuthorisedError();
  return ctx;
}

/**
 * Non-throwing variant for callers that already hold a context and return a
 * result object rather than throwing (e.g. `ActionResult`).
 */
export function assertAdminContext(ctx: TenantContext | null): ctx is TenantContext {
  return Boolean(ctx) && isAdminRole(ctx!.role);
}
