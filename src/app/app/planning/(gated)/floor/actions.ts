"use server";

import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";
import { scheduleJob } from "@/lib/planning/scheduling";

export async function startJob(formData: FormData) {
  const orderLineId = formData.get("order_line_id")?.toString() ?? "";
  const mode = formData.get("mode")?.toString() as "auto" | "manual";

  if (!orderLineId) return;

  const ctx = await getServerTenantContext();
  if (!ctx) return;
  const { supabase, tenantId } = ctx;

  // Early return if job already started (duplicate-start guard)
  const { count } = await supabase
    .from("job_routing_step")
    .select("id", { count: "exact", head: true })
    .eq("order_line_id", orderLineId)
    .eq("tenant_id", tenantId);

  if ((count ?? 0) > 0) return;

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

  const manualStart = formData.get("manual_start")?.toString();
  const parsedManual = manualStart ? new Date(manualStart) : null;
  const startFrom =
    mode === "manual" && parsedManual && !isNaN(parsedManual.getTime())
      ? parsedManual
      : new Date();
  const scheduled = scheduleJob(bomLaborRows, Number(orderLine.quantity), startFrom);

  const rows = scheduled.map((s) => ({
    tenant_id: tenantId,
    order_line_id: orderLineId,
    department_id: s.departmentId,
    bom_labor_id: s.bomLaborId,
    sequence: s.sequence,
    blocked_by: s.blockedBy,
    operation_name: s.operationName,
    status: s.initialStatus as "queued" | "blocked",
    scheduled_start: s.scheduledStart.toISOString(),
    scheduled_end: s.scheduledEnd.toISOString(),
    priority: s.sequence * 10,
  }));

  const { error } = await supabase.from("job_routing_step").insert(rows);
  if (error) throw new Error(error.message);
  revalidatePath("/app/planning/floor");
}
