"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWeekStart } from "@/lib/dates";
import { logActivity } from "@/lib/activity/log";

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

  await logActivity({ event: "costing.financial_plans_generated", metadata: { weekStart } });
  redirect(`${redirectTo}?week=${weekStart}&generated=${data ?? 0}`);
}
