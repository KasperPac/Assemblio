"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import { reconcileOrderAllocations } from "@/lib/allocation/reconcile-order";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getWeekStart } from "@/lib/dates";

function sanitizeReturnPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/app/orders")) {
    return null;
  }

  return value;
}

function parsePlanWeek(formData: FormData) {
  return formData.get("week_start")?.toString().trim() || getWeekStart();
}

export async function allocateOrder(formData: FormData) {
  const orderId = formData.get("order_id")?.toString() ?? "";
  if (!orderId) return;

  const idempotencyKey = formData.get("idempotency_key")?.toString().trim() || null;

  const context = await getServerTenantContext();
  if (!context) return;
  const { supabase, tenantId } = context;

  const returnTo = sanitizeReturnPath(
    formData.get("return_to")?.toString() ?? null
  );

  // Idempotency: if the same form was double-submitted (rapid double-click,
  // network retry, etc.) the second invocation should not re-run allocation.
  // The client renders a fresh idempotency_key per page load, so two clicks
  // share the same key but a fresh page render gets a new key.
  if (idempotencyKey) {
    const { data: existingRuns } = await supabase
      .from("activity_log")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("event", "order_allocation_run")
      .contains("metadata", {
        order_id: orderId,
        idempotency_key: idempotencyKey,
      })
      .limit(1);

    if ((existingRuns ?? []).length > 0) {
      if (returnTo) {
        redirect(`${returnTo}?allocated=already`);
      }
      return;
    }
  }

  const result = await reconcileOrderAllocations(
    supabase,
    tenantId,
    orderId
  );

  await supabase.from("activity_log").insert({
    tenant_id: tenantId,
    event: "order_allocation_run",
    metadata: {
      order_id: orderId,
      changes_applied: result.applied,
      missing_bom_lines: result.skippedMissingBom,
      cleared_only: result.clearedOnly,
      idempotency_key: idempotencyKey,
    },
  });

  revalidatePath("/app/orders");
  revalidatePath("/app/inventory");
  revalidatePath("/app/activity-log");

  if (returnTo) {
    redirect(`${returnTo}?allocated=1`);
  }
}

export async function planOpenOrders() {
  const supabase = await createSupabaseServerClient();
  const weekStart = getWeekStart();
  const { data, error } = await supabase.rpc(
    "generate_financial_plans_for_open_orders",
    {
      p_start_week: weekStart,
    }
  );

  if (error) {
    redirect(`/app/orders?planError=${encodeURIComponent(error.message)}`);
  }

  redirect(`/app/orders?planned=${data ?? 0}`);
}

async function refreshPlannedWeeks(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  orderId: string
) {
  const { data: plannedWeeks, error: weeksError } = await supabase
    .from("job_labor_plan")
    .select("week_start")
    .eq("order_id", orderId);

  if (weeksError) {
    return weeksError.message;
  }

  const uniqueWeeks = Array.from(
    new Set((plannedWeeks ?? []).map((row) => row.week_start).filter(Boolean))
  );

  for (const weekStart of uniqueWeeks) {
    const { error: refreshError } = await supabase.rpc(
      "refresh_department_utilization_week",
      {
        p_week_start: weekStart,
      }
    );

    if (refreshError) {
      return refreshError.message;
    }
  }

  return null;
}

export async function planOrder(formData: FormData) {
  const orderId = formData.get("order_id")?.toString() ?? "";
  if (!orderId) {
    return;
  }

  const supabase = await createSupabaseServerClient();
  const weekStart = parsePlanWeek(formData);
  const returnTo =
    sanitizeReturnPath(formData.get("return_to")?.toString() ?? null) ??
    `/app/orders/${orderId}`;
  const { data: lines, error: linesError } = await supabase
    .from("order_line")
    .select("id")
    .eq("order_id", orderId);

  if (linesError) {
    redirect(`${returnTo}?planError=${encodeURIComponent(linesError.message)}`);
  }

  let plannedCount = 0;
  for (const line of lines ?? []) {
    const { error } = await supabase.rpc("generate_job_financial_plan", {
      p_order_line_id: line.id,
      p_start_week: weekStart,
    });

    if (error) {
      redirect(`${returnTo}?planError=${encodeURIComponent(error.message)}`);
    }
    plannedCount += 1;
  }

  const refreshError = await refreshPlannedWeeks(supabase, orderId);
  if (refreshError) {
    redirect(`${returnTo}?planError=${encodeURIComponent(refreshError)}`);
  }

  revalidatePath(`/app/orders/${orderId}`);
  revalidatePath("/app/orders");
  revalidatePath("/app/costing");
  revalidatePath("/app/capacity");
  redirect(
    `${returnTo}?planned=${plannedCount}&week=${encodeURIComponent(weekStart)}`
  );
}

export async function allocateAndPlanOrder(formData: FormData) {
  const orderId = formData.get("order_id")?.toString() ?? "";
  if (!orderId) {
    return;
  }

  const returnTo =
    sanitizeReturnPath(formData.get("return_to")?.toString() ?? null) ??
    `/app/orders/${orderId}`;
  const context = await getServerTenantContext();
  if (!context) {
    redirect(`${returnTo}?planError=${encodeURIComponent("Missing tenant context.")}`);
  }

  const { supabase, tenantId } = context;
  const result = await reconcileOrderAllocations(supabase, tenantId, orderId);

  await supabase.from("activity_log").insert({
    tenant_id: tenantId,
    event: "order_allocation_run",
    metadata: {
      order_id: orderId,
      changes_applied: result.applied,
      missing_bom_lines: result.skippedMissingBom,
      cleared_only: result.clearedOnly,
    },
  });

  const planFormData = new FormData();
  planFormData.set("order_id", orderId);
  planFormData.set("week_start", parsePlanWeek(formData));
  planFormData.set("return_to", returnTo);

  await planOrder(planFormData);
}

export async function updateJobLaborPlanWeek(formData: FormData) {
  const planId = formData.get("plan_id")?.toString() ?? "";
  const orderId = formData.get("order_id")?.toString() ?? "";
  const weekStart = formData.get("week_start")?.toString().trim() ?? "";
  const returnTo =
    sanitizeReturnPath(formData.get("return_to")?.toString() ?? null) ??
    `/app/orders/${orderId}`;

  if (!planId || !orderId || !weekStart) {
    redirect(
      `${returnTo}?planError=${encodeURIComponent(
        "Plan id and target week are required."
      )}`
    );
  }

  const context = await getServerTenantContext();
  if (!context) {
    redirect(
      `${returnTo}?planError=${encodeURIComponent("Missing tenant context.")}`
    );
  }

  const { supabase, tenantId } = context;
  const { data: existingPlan, error: existingPlanError } = await supabase
    .from("job_labor_plan")
    .select("week_start")
    .eq("tenant_id", tenantId)
    .eq("id", planId)
    .maybeSingle();

  if (existingPlanError) {
    redirect(`${returnTo}?planError=${encodeURIComponent(existingPlanError.message)}`);
  }

  const { error: updateError } = await supabase
    .from("job_labor_plan")
    .update({
      week_start: weekStart,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .eq("id", planId);

  if (updateError) {
    redirect(`${returnTo}?planError=${encodeURIComponent(updateError.message)}`);
  }

  const weeksToRefresh = Array.from(
    new Set([existingPlan?.week_start, weekStart].filter(Boolean))
  );
  for (const refreshWeek of weeksToRefresh) {
    const { error: refreshError } = await supabase.rpc(
      "refresh_department_utilization_week",
      {
        p_week_start: refreshWeek,
      }
    );

    if (refreshError) {
      redirect(`${returnTo}?planError=${encodeURIComponent(refreshError.message)}`);
    }
  }

  revalidatePath(`/app/orders/${orderId}`);
  revalidatePath("/app/orders");
  revalidatePath("/app/capacity");
  redirect(
    `${returnTo}?planned=updated&week=${encodeURIComponent(weekStart)}`
  );
}
