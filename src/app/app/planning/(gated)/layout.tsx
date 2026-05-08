import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";

export default async function PlanningGatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/login");

  const { supabase, tenantId } = ctx;
  const { data: tenant } = await supabase
    .from("tenant")
    .select("has_planning_module")
    .eq("id", tenantId)
    .maybeSingle();

  if (!tenant?.has_planning_module) {
    redirect("/app/planning/upgrade");
  }

  return <>{children}</>;
}
