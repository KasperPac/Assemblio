"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getServerTenantContext } from "@/lib/tenant/context";

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

  type AvailabilityWithDepartment = {
    available_hours_net: number | null;
    overtime_hours: number | null;
    staff_member:
      | { department_id: string | null }
      | Array<{ department_id: string | null }>
      | null;
  };

  const capacityByDepartment = new Map<
    string,
    { availableHours: number; overtimeHours: number }
  >();

  for (const row of (availability ?? []) as AvailabilityWithDepartment[]) {
    const relation = Array.isArray(row.staff_member)
      ? row.staff_member[0] ?? null
      : row.staff_member;
    const departmentId = relation?.department_id ?? null;
    if (!departmentId) continue;
    const current = capacityByDepartment.get(departmentId) ?? {
      availableHours: 0,
      overtimeHours: 0,
    };
    current.availableHours += Number(row.available_hours_net ?? 0);
    current.overtimeHours += Number(row.overtime_hours ?? 0);
    capacityByDepartment.set(departmentId, current);
  }

  const upsertRows = (departments ?? []).map((department) => {
    const totals = capacityByDepartment.get(department.id) ?? {
      availableHours: 0,
      overtimeHours: 0,
    };
    return {
      tenant_id: tenantId,
      department_id: department.id,
      week_start: week,
      available_hours: totals.availableHours,
      overtime_hours: totals.overtimeHours,
      capacity_hours_total: totals.availableHours + totals.overtimeHours,
      updated_at: new Date().toISOString(),
    };
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

  redirect(`/app/capacity?week=${week}&success=${encodeMessage("Capacity refreshed.")}`);
}
