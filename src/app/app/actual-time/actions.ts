"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function parseNumber(value: FormDataEntryValue | null) {
  if (value === null) return null;
  const parsed = Number(value.toString());
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

function parseTimestamp(value: FormDataEntryValue | null) {
  const raw = value?.toString().trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

export async function createActualTimeEntry(formData: FormData) {
  const orderLineId = formData.get("order_line_id")?.toString();
  const departmentId = formData.get("department_id")?.toString();
  const staffMemberId = formData.get("staff_member_id")?.toString() || null;
  const note = formData.get("note")?.toString() ?? null;
  const hours = parseNumber(formData.get("hours"));
  const startedAt = parseTimestamp(formData.get("started_at"));
  const endedAt = parseTimestamp(formData.get("ended_at"));

  if (!orderLineId || !departmentId) {
    redirect("/app/actual-time?error=Order+line+and+department+are+required.");
  }

  if (hours === null || hours <= 0) {
    redirect("/app/actual-time?error=Hours+must+be+greater+than+zero.");
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
  redirect("/app/actual-time?created=1");
}
