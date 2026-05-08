"use server";

import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";
import { scheduleJob } from "@/lib/planning/scheduling";

export async function startJob(formData: FormData) {
  const orderLineId = formData.get("order_line_id")?.toString() ?? "";
  const mode = formData.get("mode")?.toString() as "auto" | "manual";
  const manualDatesJson = formData.get("manual_dates")?.toString() ?? "{}";

  if (!orderLineId) return;

  const ctx = await getServerTenantContext();
  if (!ctx) return;
  const { supabase, tenantId } = ctx;

  // Get order line with its variant's active BOM and labor operations
  const { data: orderLine } = await supabase
    .from("order_line")
    .select(
      "id, quantity, order_id, variant:variant_id(id, product_bom(id, is_active, product_bom_labor(*)))"
    )
    .eq("id", orderLineId)
    .eq("tenant_id", tenantId)
    .single();

  if (!orderLine) return;

  const variant = (orderLine.variant as any);
  const activeBom = (variant?.product_bom ?? []).find((b: any) => b.is_active === true);
  if (!activeBom) return;

  const laborOps = (activeBom.product_bom_labor ?? []) as any[];
  if (laborOps.length === 0) return;

  const bomLaborRows = laborOps.map((op: any) => ({
    id: op.id,
    department_id: op.department_id,
    sequence: op.sequence,
    blocked_by: op.blocked_by ?? [],
    operation_name: op.operation_name,
    setup_hours: op.setup_hours ?? 0,
    run_hours_per_unit: op.run_hours_per_unit ?? 0,
  }));

  const startFrom = new Date();
  const scheduled = scheduleJob(bomLaborRows, Number(orderLine.quantity), startFrom);

  const manualDates: Record<number, { start: string; end: string }> =
    mode === "manual" ? JSON.parse(manualDatesJson) : {};

  const rows = scheduled.map((s) => {
    const manual = manualDates[s.sequence];
    return {
      tenant_id: tenantId,
      order_line_id: orderLineId,
      department_id: s.departmentId,
      bom_labor_id: s.bomLaborId,
      sequence: s.sequence,
      blocked_by: s.blockedBy,
      operation_name: s.operationName,
      status: s.initialStatus as "queued" | "blocked",
      scheduled_start: manual?.start ?? s.scheduledStart.toISOString(),
      scheduled_end: manual?.end ?? s.scheduledEnd.toISOString(),
      priority: s.sequence * 10,
    };
  });

  await supabase.from("job_routing_step").insert(rows);
  revalidatePath("/app/planning/floor");
}
