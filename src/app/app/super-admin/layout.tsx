import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";

export default async function SuperAdminLayout({ children }: { children: ReactNode }) {
  const ctx = await getServerTenantContext();

  if (
    !ctx ||
    (ctx.role !== "super_admin" && ctx.role !== "platform_observer")
  ) {
    redirect("/app");
  }

  return <>{children}</>;
}
