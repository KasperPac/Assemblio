import { createSupabaseServerClient } from "@/lib/supabase/server";
import ActivityLogClient from "./table";

export default async function ActivityLogPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("activity_log")
    .select("id,event,created_at,metadata,actor_id")
    .order("created_at", { ascending: false })
    .limit(10);
  return <ActivityLogClient rows={data ?? []} error={error?.message} />;
}
