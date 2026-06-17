import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import { ACTIVITY_EVENTS } from "@/lib/activity/events";
import { parseActivityFilters, activityRange, totalPages, ACTIVITY_PAGE_SIZE } from "@/lib/activity/query";
import ActivityLogClient from "./table";

type SearchParams = Record<string, string | string[] | undefined>;

export default async function ActivityLogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const context = await getServerTenantContext();
  if (!context) redirect("/auth/login");
  const { supabase, tenantId } = context;

  const filters = parseActivityFilters(await searchParams);
  const { from, to } = activityRange(filters.page);

  // Build the filtered query (reused for both rows and count).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyFilters = (q: any): any => {
    let out = q;
    if (filters.event) out = out.eq("event", filters.event);
    if (filters.actorId) out = out.eq("actor_id", filters.actorId);
    if (filters.dateFrom) out = out.gte("created_at", filters.dateFrom);
    if (filters.dateTo) out = out.lte("created_at", `${filters.dateTo}T23:59:59.999Z`);
    if (filters.search) {
      const term = filters.search.replace(/[%,]/g, "");
      out = out.or(`summary.ilike.%${term}%,actor_label.ilike.%${term}%`);
    }
    return out;
  };

  const rowsQuery = applyFilters(
    supabase
      .from("activity_log")
      .select("id,event,created_at,metadata,actor_id,actor_type,actor_label,entity_type,entity_id,summary")
      .eq("tenant_id", tenantId)
  )
    .order("created_at", { ascending: false })
    .range(from, to);

  const countQuery = applyFilters(
    supabase
      .from("activity_log")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
  );

  const [{ data, error }, { count }, { data: actorRows }] = await Promise.all([
    rowsQuery,
    countQuery,
    supabase.from("profiles").select("id,full_name").eq("tenant_id", tenantId).order("full_name"),
  ]);

  const eventOptions = Object.keys(ACTIVITY_EVENTS).sort();
  const actorOptions = (actorRows ?? []).map((a) => ({
    id: a.id as string,
    label: (a.full_name as string | null) ?? "Unnamed user",
  }));

  return (
    <ActivityLogClient
      rows={data ?? []}
      error={error?.message}
      filters={filters}
      eventOptions={eventOptions}
      actorOptions={actorOptions}
      page={filters.page}
      totalPages={totalPages(count ?? 0)}
      pageSize={ACTIVITY_PAGE_SIZE}
      totalCount={count ?? 0}
    />
  );
}
