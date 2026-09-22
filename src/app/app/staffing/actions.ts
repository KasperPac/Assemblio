"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logActivity } from "@/lib/activity/log";
import {
  parseHours as parseNumber,
  parseNullableHours as parseNullableNumber,
  parseCheckbox,
  netAvailableHours as netAvailable,
} from "@/lib/staffing/hours";

function encodeMessage(message: string) {
  return encodeURIComponent(message);
}

function staffingPath(weekStart: string, params?: Record<string, string>) {
  const search = new URLSearchParams({ week: weekStart });
  for (const [key, value] of Object.entries(params ?? {})) {
    search.set(key, value);
  }
  return `/app/staffing?${search.toString()}`;
}

async function upsertAvailability(
  supabase: SupabaseClient,
  tenantId: string,
  staffMemberId: string,
  weekStart: string,
  contractedHours: number,
  leaveHours: number,
  trainingHours: number,
  nonProductiveHours: number,
  overtimeHours: number
) {
  const availableHoursNet = netAvailable(
    contractedHours,
    leaveHours,
    trainingHours,
    nonProductiveHours,
    overtimeHours
  );

  return supabase.from("staff_availability_week").upsert(
    {
      tenant_id: tenantId,
      staff_member_id: staffMemberId,
      week_start: weekStart,
      contracted_hours: contractedHours,
      leave_hours: leaveHours,
      training_hours: trainingHours,
      non_productive_hours: nonProductiveHours,
      overtime_hours: overtimeHours,
      available_hours_net: availableHoursNet,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "staff_member_id,week_start" }
  );
}

export async function prepareStaffingWeek(formData: FormData) {
  const weekStart =
    formData.get("week_start")?.toString().trim() || new Date().toISOString().slice(0, 10);

  const context = await getServerTenantContext();
  if (!context) {
    redirect(staffingPath(weekStart, { error: "Missing tenant context." }));
  }

  const { supabase, tenantId } = context;

  const [{ data: staffMembers, error: staffError }, { data: currentWeekRows, error: currentWeekError }] =
    await Promise.all([
      supabase
        .from("staff_member")
        .select("id,standard_weekly_hours")
        .eq("tenant_id", tenantId)
        .eq("is_active", true),
      supabase
        .from("staff_availability_week")
        .select(
          "staff_member_id,contracted_hours,leave_hours,training_hours,non_productive_hours,overtime_hours"
        )
        .eq("tenant_id", tenantId)
        .eq("week_start", weekStart),
    ]);

  if (staffError) {
    redirect(staffingPath(weekStart, { error: encodeMessage(staffError.message) }));
  }

  if (currentWeekError) {
    redirect(staffingPath(weekStart, { error: encodeMessage(currentWeekError.message) }));
  }

  const existingByStaff = new Map(
    (currentWeekRows ?? []).map((row) => [row.staff_member_id, row])
  );
  const createdRows = (staffMembers ?? [])
    .filter((staffMember) => !existingByStaff.has(staffMember.id))
    .map((staffMember) => {
      const contractedHours = Number(staffMember.standard_weekly_hours ?? 0);
      return {
        tenant_id: tenantId,
        staff_member_id: staffMember.id,
        week_start: weekStart,
        contracted_hours: contractedHours,
        leave_hours: 0,
        training_hours: 0,
        non_productive_hours: 0,
        overtime_hours: 0,
        available_hours_net: contractedHours,
      };
    });

  if (createdRows.length > 0) {
    const { error: insertError } = await supabase
      .from("staff_availability_week")
      .upsert(createdRows, { onConflict: "staff_member_id,week_start" });

    if (insertError) {
      redirect(staffingPath(weekStart, { error: encodeMessage(insertError.message) }));
    }
  }

  revalidatePath("/app/staffing");
  revalidatePath("/app/capacity");
  await logActivity({ event: "staffing.week_prepared", metadata: { weekStart } });
  redirect(
    staffingPath(weekStart, {
      success: encodeMessage(
        createdRows.length > 0
          ? `Prepared ${createdRows.length} staffing rows for ${weekStart}.`
          : `All active staff already have availability rows for ${weekStart}.`
      ),
    })
  );
}

export async function createStaffMember(formData: FormData) {
  const departmentId = formData.get("department_id")?.toString() ?? "";
  const name = formData.get("name")?.toString().trim() ?? "";
  const employmentType = formData.get("employment_type")?.toString().trim() || "salary";
  const annualSalary = parseNullableNumber(formData.get("annual_salary"));
  const hourlyRate = parseNullableNumber(formData.get("hourly_rate"));
  const standardWeeklyHours = parseNumber(formData.get("standard_weekly_hours"), 38);
  const weekStart =
    formData.get("week_start")?.toString().trim() || new Date().toISOString().slice(0, 10);
  const contractedHours = parseNumber(formData.get("contracted_hours"), standardWeeklyHours);
  const leaveHours = parseNumber(formData.get("leave_hours"));
  const trainingHours = parseNumber(formData.get("training_hours"));
  const nonProductiveHours = parseNumber(formData.get("non_productive_hours"));
  const overtimeHours = parseNumber(formData.get("overtime_hours"));

  if (!departmentId || !name) {
    redirect(staffingPath(weekStart, { error: "Department+and+name+are+required." }));
  }

  const context = await getServerTenantContext();
  if (!context || !context.tenantId) {
    redirect(staffingPath(weekStart, { error: "Missing+tenant+context." }));
  }

  const { supabase, tenantId } = context;
  if (!tenantId) redirect(staffingPath(weekStart, { error: "Missing+tenant+context." })); // non-null: layout.tsx redirects tenant-less operators to /app/super-admin
  const { data: staffMember, error } = await supabase
    .from("staff_member")
    .insert({
      tenant_id: tenantId,
      department_id: departmentId,
      name,
      employment_type: employmentType,
      annual_salary: annualSalary,
      hourly_rate: hourlyRate,
      standard_weekly_hours: standardWeeklyHours,
      is_active: true,
    })
    .select("id")
    .single();

  if (error || !staffMember) {
    redirect(
      staffingPath(weekStart, {
        error: encodeMessage(error?.message ?? "Failed to create staff member."),
      })
    );
  }

  const { error: availabilityError } = await upsertAvailability(
    supabase,
    tenantId,
    staffMember.id,
    weekStart,
    contractedHours,
    leaveHours,
    trainingHours,
    nonProductiveHours,
    overtimeHours
  );

  if (availabilityError) {
    redirect(staffingPath(weekStart, { error: encodeMessage(availabilityError.message) }));
  }

  revalidatePath("/app/staffing");
  revalidatePath("/app/capacity");
  revalidatePath("/app/actual-time");
  revalidatePath("/app/reports");
  await logActivity({ event: "staff.created", entityId: staffMember.id, metadata: { name } });
  redirect(staffingPath(weekStart, { success: encodeMessage(`Created ${name}.`) }));
}

export async function updateStaffMember(formData: FormData) {
  const staffMemberId = formData.get("staff_member_id")?.toString() ?? "";
  const departmentId = formData.get("department_id")?.toString() ?? "";
  const name = formData.get("name")?.toString().trim() ?? "";
  const employmentType = formData.get("employment_type")?.toString().trim() || "salary";
  const annualSalary = parseNullableNumber(formData.get("annual_salary"));
  const hourlyRate = parseNullableNumber(formData.get("hourly_rate"));
  const standardWeeklyHours = parseNumber(formData.get("standard_weekly_hours"), 38);
  const isActive = parseCheckbox(formData.get("is_active"));
  const weekStart =
    formData.get("week_start")?.toString().trim() || new Date().toISOString().slice(0, 10);
  const contractedHours = parseNumber(formData.get("contracted_hours"), standardWeeklyHours);
  const leaveHours = parseNumber(formData.get("leave_hours"));
  const trainingHours = parseNumber(formData.get("training_hours"));
  const nonProductiveHours = parseNumber(formData.get("non_productive_hours"));
  const overtimeHours = parseNumber(formData.get("overtime_hours"));

  if (!staffMemberId || !departmentId || !name) {
    redirect(staffingPath(weekStart, { error: "Staff+details+are+required." }));
  }

  const context = await getServerTenantContext();
  if (!context || !context.tenantId) {
    redirect(staffingPath(weekStart, { error: "Missing+tenant+context." }));
  }

  const { supabase, tenantId } = context;
  if (!tenantId) redirect(staffingPath(weekStart, { error: "Missing+tenant+context." })); // non-null: layout.tsx redirects tenant-less operators to /app/super-admin
  const { error } = await supabase
    .from("staff_member")
    .update({
      department_id: departmentId,
      name,
      employment_type: employmentType,
      annual_salary: annualSalary,
      hourly_rate: hourlyRate,
      standard_weekly_hours: standardWeeklyHours,
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .eq("id", staffMemberId);

  if (error) {
    redirect(staffingPath(weekStart, { error: encodeMessage(error.message) }));
  }

  const { error: availabilityError } = await upsertAvailability(
    supabase,
    tenantId,
    staffMemberId,
    weekStart,
    contractedHours,
    leaveHours,
    trainingHours,
    nonProductiveHours,
    overtimeHours
  );

  if (availabilityError) {
    redirect(staffingPath(weekStart, { error: encodeMessage(availabilityError.message) }));
  }

  revalidatePath("/app/staffing");
  revalidatePath("/app/capacity");
  revalidatePath("/app/actual-time");
  revalidatePath("/app/reports");
  await logActivity({ event: "staff.updated", entityId: staffMemberId });
  redirect(staffingPath(weekStart, { success: encodeMessage(`Updated ${name}.`) }));
}
