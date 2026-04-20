"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

function getWeekStart() {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}

export async function generateFinancialPlans() {
  await generateFinancialPlansForWeek(getWeekStart(), "/app/costing");
}

export async function generateFinancialPlansFromForm(formData: FormData) {
  const weekStart =
    formData.get("week")?.toString().trim() || getWeekStart();
  const redirectTo =
    formData.get("redirect_to")?.toString().trim() || "/app/costing";

  await generateFinancialPlansForWeek(weekStart, redirectTo);
}

async function generateFinancialPlansForWeek(weekStart: string, redirectTo: string) {
  const supabase = await createSupabaseServerClient();

  const { data, error } = await supabase.rpc(
    "generate_financial_plans_for_open_orders",
    {
      p_start_week: weekStart,
    }
  );

  if (error) {
    redirect(`${redirectTo}?week=${weekStart}&error=${encodeURIComponent(error.message)}`);
  }

  redirect(`${redirectTo}?week=${weekStart}&generated=${data ?? 0}`);
}
