"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import { reconcileOrderAllocations } from "@/lib/allocation/reconcile-order";
import { logActivity } from "@/lib/activity/log";

function sanitizeReturnPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/app/orders")) {
    return null;
  }

  return value;
}

export async function allocateOrder(formData: FormData) {
  const orderId = formData.get("order_id")?.toString() ?? "";
  if (!orderId) return;

  const idempotencyKey = formData.get("idempotency_key")?.toString().trim() || null;

  const context = await getServerTenantContext();
  if (!context || !context.tenantId) return;
  const { supabase, tenantId } = context;
  if (!tenantId) return; // non-null: layout.tsx redirects tenant-less operators to /app/super-admin

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
      .eq("event", "order.allocation_run")
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

  await logActivity({ event: "order.allocation_run", entityId: orderId, metadata: { order_id: orderId, changes_applied: result.applied, idempotency_key: idempotencyKey } });

  revalidatePath("/app/orders");
  revalidatePath("/app/inventory");
  revalidatePath("/app/activity-log");

  if (returnTo) {
    redirect(`${returnTo}?allocated=1`);
  }
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

  const { supabase, tenantId: _tenantId } = context;
  const tenantId = _tenantId!; // non-null: layout.tsx redirects tenant-less operators to /app/super-admin
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
  await logActivity({ event: "order.labor_plan_updated", entityId: planId });
  redirect(
    `${returnTo}?planned=updated&week=${encodeURIComponent(weekStart)}`
  );
}
