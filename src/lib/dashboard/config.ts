import type { SupabaseClient } from "@supabase/supabase-js";
import { PRESET_WIDGETS, WIDGET_IDS, type WidgetId } from "./types";

export async function loadDashboardConfig(
  supabase: SupabaseClient,
  tenantId: string
): Promise<WidgetId[]> {
  const { data } = await supabase
    .from("tenant_dashboard_config")
    .select("widgets")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!data) return [...PRESET_WIDGETS.owner];

  const valid = (data.widgets as string[]).filter((id): id is WidgetId =>
    (WIDGET_IDS as readonly string[]).includes(id)
  );
  return valid.length > 0 ? valid : [...PRESET_WIDGETS.owner];
}
