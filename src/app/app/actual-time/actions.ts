"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logActivity } from "@/lib/activity/log";
import {
  parseEntryHours as parseNumber,
  parseEntryTimestamp as parseTimestamp,
  validateActualTimeEntry,
} from "@/lib/actual-time/entry";

export async function createActualTimeEntry(formData: FormData) {
  const orderLineId = formData.get("order_line_id")?.toString();
  const departmentId = formData.get("department_id")?.toString();
  const staffMemberId = formData.get("staff_member_id")?.toString() || null;
  const note = formData.get("note")?.toString() ?? null;
  const hours = parseNumber(formData.get("hours"));
  const startedAt = parseTimestamp(formData.get("started_at"));
  const endedAt = parseTimestamp(formData.get("ended_at"));

  const validation = validateActualTimeEntry({ orderLineId, departmentId, hours });
  if (!validation.ok) {
    redirect(`/app/actual-time?error=${encodeURIComponent(validation.error)}`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("create_job_actual_time_entry", {
    p_order_line_id: orderLineId,
    p_department_id: departmentId,
    p_hours: hours,
    p_staff_member_id: staffMemberId,
    p_started_at: startedAt,
    p_ended_at: endedAt,
    p_note: note,
    p_entry_type: "manual",
  });

  if (error) {
    redirect(`/app/actual-time?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/app/actual-time");
  revalidatePath("/app/capacity");
  revalidatePath("/app/costing");
  revalidatePath("/app/reports");
  await logActivity({ event: "production.actual_time_logged", entityId: orderLineId });
  redirect("/app/actual-time?created=1");
}
