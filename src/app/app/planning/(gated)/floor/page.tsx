import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import styles from "./floor.module.css";
import { FloorBoard, type DepartmentColumn, type DrawerStep } from "./floor-board";
import type { JobCardData } from "./job-card";

// ── Raw DB row shapes ──────────────────────────────────────────────────────────

type DeptRow = {
  id: string;
  name: string;
};

type StepRow = {
  id: string;
  sequence: number;
  blocked_by: number[];
  status: "blocked" | "queued" | "active";
  operation_name: string;
  scheduled_start: string | null;
  department_id: string;
  order_line_id: string;
  order_line: {
    variant: {
      title: string | null;
      product: { title: string } | null;
    } | null;
    orders: {
      order_number: string | null;
      customer_email: string | null;
    } | null;
  } | null;
};

type SiblingStepRow = {
  id: string;
  sequence: number;
  operation_name: string;
  status: string;
  actual_start: string | null;
  actual_end: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  order_line_id: string;
  department: { name: string } | null;
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function FloorPage() {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/login");

  const { supabase, tenantId } = ctx;

  // 1. Parallel-fetch departments (active) + routing steps (active/queued/blocked)
  const [{ data: deptData }, { data: stepData }] = await Promise.all([
    supabase
      .from("department")
      .select("id,name")
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("job_routing_step")
      .select(
        `id,sequence,blocked_by,status,operation_name,scheduled_start,department_id,order_line_id,
         order_line:order_line_id(
           variant:variant_id(title,product:product_id(title)),
           orders:order_id(order_number,customer_email)
         )`
      )
      .eq("tenant_id", tenantId)
      .in("status", ["active", "queued", "blocked"]),
  ]);

  const departments = (deptData ?? []) as DeptRow[];
  const steps = (stepData ?? []) as unknown as StepRow[];

  // 2. Group steps by department_id — only include departments that have steps
  const stepsByDept = new Map<string, StepRow[]>();
  for (const step of steps) {
    const list = stepsByDept.get(step.department_id) ?? [];
    list.push(step);
    stepsByDept.set(step.department_id, list);
  }

  // 3. Build columns — ALL active departments (empty ones show "No active jobs")
  const columns: DepartmentColumn[] = departments.map((dept) => {
      const deptSteps = stepsByDept.get(dept.id) ?? [];
      const cardSteps: JobCardData[] = deptSteps.map((s) => {
        const ol = s.order_line;
        const variant = ol?.variant as any;
        const order = ol?.orders as any;
        const productTitle =
          variant?.product?.title ?? variant?.title ?? "Unknown product";
        return {
          id: s.id,
          orderLineId: s.order_line_id,
          orderNumber: order?.order_number ?? null,
          customerName: order?.customer_email ?? null,
          productTitle,
          operationName: s.operation_name,
          status: s.status,
          blockedBy: s.blocked_by ?? [],
          scheduledStart: s.scheduled_start,
        };
      });
      return { id: dept.id, name: dept.name, steps: cardSteps };
    });

  // 4. Fetch sibling steps for the drawer (all statuses, for order lines that appear on the board)
  const drawerSteps: Record<string, DrawerStep> = {};

  const boardOrderLineIds = [...new Set(steps.map((s) => s.order_line_id))];

  if (boardOrderLineIds.length > 0) {
    const { data: siblingData } = await supabase
      .from("job_routing_step")
      .select(
        `id,sequence,operation_name,status,actual_start,actual_end,scheduled_start,scheduled_end,
         order_line_id,
         department:department_id(name)`
      )
      .eq("tenant_id", tenantId)
      .in("order_line_id", boardOrderLineIds)
      .order("sequence");

    const siblings = (siblingData ?? []) as unknown as SiblingStepRow[];

    // Group siblings by order_line_id
    const siblingsByLine = new Map<string, SiblingStepRow[]>();
    for (const sib of siblings) {
      const list = siblingsByLine.get(sib.order_line_id) ?? [];
      list.push(sib);
      siblingsByLine.set(sib.order_line_id, list);
    }

    // Build drawerSteps keyed by order_line_id (deduplicated — many board steps share a line)
    for (const step of steps) {
      if (drawerSteps[step.order_line_id]) continue; // already built for this order line
      const ol = step.order_line as any;
      const variant = ol?.variant as any;
      const order = ol?.orders as any;
      const productTitle =
        variant?.product?.title ?? variant?.title ?? "Unknown product";

      const lineSiblings = siblingsByLine.get(step.order_line_id) ?? [];
      drawerSteps[step.order_line_id] = {
        id: step.order_line_id,
        orderNumber: order?.order_number ?? null,
        productTitle,
        orderLineParts: lineSiblings.map((sib) => ({
          id: sib.id,
          sequence: sib.sequence,
          operationName: sib.operation_name,
          departmentName: (sib.department as any)?.name ?? "—",
          status: sib.status,
          actualStart: sib.actual_start,
          actualEnd: sib.actual_end,
          scheduledStart: sib.scheduled_start,
          scheduledEnd: sib.scheduled_end,
        })),
      };
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Floor Board</h1>
      </div>
      <FloorBoard columns={columns} drawerSteps={drawerSteps} />
    </div>
  );
}
