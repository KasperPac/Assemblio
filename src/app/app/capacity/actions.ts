"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getServerTenantContext } from "@/lib/tenant/context";
import { logActivity } from "@/lib/activity/log";
import {
  aggregateCapacityByDepartment,
  buildCapacityWeekRows,
  type AvailabilityWithDepartment,
} from "@/lib/capacity/aggregate";

function encodeMessage(message: string) {
  return encodeURIComponent(message);
}

export async function refreshCapacityWeek(formData: FormData) {
  const week = formData.get("week")?.toString().trim() ?? "";
  if (!week) {
    redirect("/app/capacity?error=Planning+week+is+required.");
  }

  const context = await getServerTenantContext();
  if (!context) {
    redirect(`/app/capacity?week=${week}&error=Missing+tenant+context.`);
  }

  const { supabase, tenantId } = context;
  const [{ data: departments, error: departmentError }, { data: availability, error: availabilityError }] =
    await Promise.all([
      supabase
        .from("department")
        .select("id")
        .eq("tenant_id", tenantId)
        .eq("is_active", true),
      supabase
        .from("staff_availability_week")
        .select(
          "staff_member_id,available_hours_net,overtime_hours,staff_member:staff_member_id(department_id)"
        )
        .eq("tenant_id", tenantId)
        .eq("week_start", week),
    ]);

  if (departmentError) {
    redirect(`/app/capacity?week=${week}&error=${encodeMessage(departmentError.message)}`);
  }

  if (availabilityError) {
    redirect(`/app/capacity?week=${week}&error=${encodeMessage(availabilityError.message)}`);
  }

  const capacityByDepartment = aggregateCapacityByDepartment(
    (availability ?? []) as AvailabilityWithDepartment[]
  );

  const upsertRows = buildCapacityWeekRows({
    departments: departments ?? [],
    capacityByDepartment,
    tenantId: tenantId!,
    weekStart: week,
    updatedAt: new Date().toISOString(),
  });

  const { error: upsertError } = await supabase
    .from("department_capacity_week")
    .upsert(upsertRows, {
      onConflict: "tenant_id,department_id,week_start",
    });

  if (upsertError) {
    redirect(`/app/capacity?week=${week}&error=${encodeMessage(upsertError.message)}`);
  }

  const rpcClient = await createSupabaseServerClient();
  const { error } = await rpcClient.rpc("refresh_department_utilization_week", {
    p_week_start: week,
  });

  if (error) {
    redirect(`/app/capacity?week=${week}&error=${encodeMessage(error.message)}`);
  }

  await logActivity({ event: "capacity.week_refreshed", metadata: { week } });
  redirect(`/app/capacity?week=${week}&success=${encodeMessage("Capacity refreshed.")}`);
}
