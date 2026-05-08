import { Resend } from "resend";
import type { SupabaseClient } from "@supabase/supabase-js";

const resend = new Resend(process.env.RESEND_API_KEY);

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

type FireParams = {
  supabase: SupabaseClient;
  tenantId: string;
  stepId: string;
  orderLineId: string;
};

export async function fireNotificationIfConfigured({
  supabase,
  tenantId,
  stepId,
  orderLineId,
}: FireParams): Promise<void> {
  // 1. Get the completed step with its BOM info and order customer email
  const { data: step } = await supabase
    .from("job_routing_step")
    .select(`
      sequence, operation_name,
      bom_labor:bom_labor_id ( product_bom_id ),
      order_line:order_line_id (
        orders:order_id ( id, order_number, customer_email ),
        variant:variant_id ( title, product:product_id ( title ) )
      )
    `)
    .eq("id", stepId)
    .eq("tenant_id", tenantId)
    .single();

  if (!step) return;

  const bomLaborInfo = step.bom_labor as any;
  const productBomId: string | null = bomLaborInfo?.product_bom_id ?? null;
  if (!productBomId) return;

  const ol = step.order_line as any;
  const order = ol?.orders as any;
  const customerEmail: string | null = order?.customer_email ?? null;
  if (!customerEmail) return;

  const orderId: string | null = order?.id ?? null;
  if (!orderId) return;

  const variant = ol?.variant as any;
  const product = variant?.product as any;

  // 2. Check for a notification trigger for this BOM + sequence
  const { data: trigger } = await supabase
    .from("product_notification_trigger")
    .select("id, message_template, channel")
    .eq("tenant_id", tenantId)
    .eq("product_bom_id", productBomId)
    .eq("routing_sequence", step.sequence)
    .maybeSingle();

  if (!trigger) return;

  // Skip if already sent for this step+trigger (deduplication)
  const { count: existingCount } = await supabase
    .from("notification_log")
    .select("id", { count: "exact", head: true })
    .eq("order_line_id", orderLineId)
    .eq("trigger_id", trigger.id);
  if ((existingCount ?? 0) > 0) return;

  // 3. Render template
  const vars: Record<string, string> = {
    product_name: product?.title ?? variant?.title ?? "your product",
    order_number: order?.order_number ?? "",
    department_name: step.operation_name,
    customer_first_name: "",
  };
  const body = renderTemplate(trigger.message_template, vars);
  const subject = `Update on your order ${order?.order_number ?? ""}`;

  // 4. Send and log
  let deliveryStatus: "sent" | "failed" = "sent";
  try {
    await resend.emails.send({
      from: "Manuva <noreply@manuva.app>",
      to: customerEmail,
      subject,
      html: `<p>${body}</p>`,
    });
  } catch {
    deliveryStatus = "failed";
  }

  await supabase.from("notification_log").insert({
    tenant_id: tenantId,
    order_id: orderId,
    order_line_id: orderLineId,
    trigger_id: trigger.id,
    channel: trigger.channel,
    recipient: customerEmail,
    delivery_status: deliveryStatus,
  });
}
