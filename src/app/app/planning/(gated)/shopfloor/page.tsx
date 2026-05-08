import { getServerTenantContext } from "@/lib/tenant/context";
import { redirect } from "next/navigation";
import { OperatorQueue } from "./operator-queue";

export default async function ShopFloorPage() {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/login");
  const { supabase } = ctx;

  const [{ data: departments }, { data: routingSteps }] = await Promise.all([
    supabase.from("department").select("id,name").eq("is_active", true).order("name"),
    supabase
      .from("job_routing_step")
      .select(`
        id, sequence, blocked_by, status, operation_name, department_id,
        order_line:order_line_id (
          orders:order_id ( order_number ),
          variant:variant_id ( title, product:product_id ( title ) )
        )
      `)
      .in("status", ["active", "queued", "blocked"])
      .order("priority", { ascending: true }),
  ]);

  const stepsByDept: Record<string, {
    id: string;
    orderNumber: string | null;
    productTitle: string;
    operationName: string;
    status: "active" | "queued" | "blocked";
    blockedBy: number[];
  }[]> = {};

  for (const step of routingSteps ?? []) {
    const ol = step.order_line as any;
    const order = ol?.orders as any;
    const variant = ol?.variant as any;
    const product = variant?.product as any;

    if (!stepsByDept[step.department_id]) stepsByDept[step.department_id] = [];
    stepsByDept[step.department_id].push({
      id: step.id,
      orderNumber: order?.order_number ?? null,
      productTitle: product?.title ?? variant?.title ?? "Product",
      operationName: step.operation_name,
      status: step.status as "active" | "queued" | "blocked",
      blockedBy: step.blocked_by ?? [],
    });
  }

  return (
    <OperatorQueue
      departments={departments ?? []}
      stepsByDept={stepsByDept}
    />
  );
}
