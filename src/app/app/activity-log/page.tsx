import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import ActivityLogClient from "./table";

export default async function ActivityLogPage() {
  const context = await getServerTenantContext();
  if (!context) redirect("/auth/login");
  const { supabase, tenantId } = context;

  const { data, error } = await supabase
    .from("activity_log")
    .select("id,event,created_at,metadata,actor_id")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(10);
  return <ActivityLogClient rows={data ?? []} error={error?.message} />;
}
