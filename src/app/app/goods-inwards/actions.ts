"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import { computeReceiptStatus } from "./helpers";
import { pushBillToAccounting } from "@/lib/accounting/push-bill";
import Anthropic from "@anthropic-ai/sdk";
import { logActivity } from "@/lib/activity/log";

// ─── Pure helpers (re-exported from helpers.ts for testing) ──────────────────

export type { ReceiptStatus } from "./helpers";

// ─── Types ───────────────────────────────────────────────────────────────────

export type DeliveryReceiptLineInput = {
  component_id: string;
  purchase_order_line_id: string | null;
  quantity_delivered: number;
  quantity_expected: number | null;
  cost_per_unit: number | null;
  notes: string | null;
  batch_number: string | null;
};

// ─── Actions ─────────────────────────────────────────────────────────────────

export async function createDeliveryReceipt(formData: FormData) {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/auth/login");
  const { supabase, tenantId: _tenantId } = ctx;
  const tenantId = _tenantId!; // non-null: layout.tsx redirects tenant-less operators to /app/super-admin

  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/auth/login");

  const linesJson = formData.get("lines") as string;
  let lines: DeliveryReceiptLineInput[];
  try {
    lines = JSON.parse(linesJson);
  } catch {
    return { error: "Invalid line data" };
  }
  if (!Array.isArray(lines) || lines.length === 0) {
    return { error: "At least one line is required" };
  }
  for (const l of lines) {
    if (!l.component_id || typeof l.component_id !== "string") {
      return { error: "Invalid component on a line" };
    }
    if (!Number.isFinite(l.quantity_delivered) || l.quantity_delivered <= 0) {
      return { error: "Quantity delivered must be a positive number" };
    }
    if (l.cost_per_unit !== null && l.cost_per_unit !== undefined &&
        (!Number.isFinite(l.cost_per_unit) || l.cost_per_unit < 0)) {
      return { error: "Cost per unit must be a non-negative number" };
    }
  }

  const purchaseOrderId =
    (formData.get("purchase_order_id") as string) || null;
  const supplierId = (formData.get("supplier_id") as string) || null;
  const supplierNameOverride =
    (formData.get("supplier_name_override") as string) || null;

  if (!supplierId && !supplierNameOverride)
    return { error: "Supplier is required" };

  const supplierReference = (formData.get("supplier_reference") as string) ?? "";
  if (!supplierReference) return { error: "Supplier reference is required" };

  const stockInReason = purchaseOrderId
    ? "supplier_delivery"
    : ((formData.get("stock_in_reason") as string) || null);
  if (!purchaseOrderId && !stockInReason)
    return { error: "Reason is required for non-PO receipts" };

  const { data: receipt, error: receiptError } = await supabase
    .from("delivery_receipt")
    .insert({
      tenant_id: tenantId,
      supplier_id: supplierId,
      supplier_name_override: supplierNameOverride,
      supplier_reference: supplierReference,
      purchase_order_id: purchaseOrderId,
      location_id: formData.get("location_id") as string,
      received_at:
        (formData.get("received_at") as string) || new Date().toISOString(),
      notes: (formData.get("notes") as string) || null,
      stock_in_reason: stockInReason,
      status: "unmatched",
      created_by: authData.user.id,
    })
    .select("id")
    .single();

  if (receiptError || !receipt)
    return { error: receiptError?.message ?? "Failed to create receipt" };

  const { error: linesError } = await supabase
    .from("delivery_receipt_line")
    .insert(
      lines.map((l) => ({
        tenant_id: tenantId,
        delivery_receipt_id: receipt.id,
        component_id: l.component_id,
        purchase_order_line_id: l.purchase_order_line_id,
        quantity_delivered: l.quantity_delivered,
        quantity_expected: l.quantity_expected,
        cost_per_unit: l.cost_per_unit ?? null,
        notes: l.notes,
        batch_number: l.batch_number ?? null,
      }))
    );

  if (linesError) {
    await supabase.from("delivery_receipt").delete().eq("id", receipt.id);
    return { error: linesError.message };
  }

  const { error: rpcError } = await supabase.rpc("receive_delivery_receipt", {
    p_delivery_receipt_id: receipt.id,
  });

  if (rpcError) {
    await supabase.from("delivery_receipt").delete().eq("id", receipt.id);
    return { error: rpcError.message };
  }

  await supabase.from("activity_log").insert({
    tenant_id: tenantId,
    actor_id: authData.user.id,
    event: "delivery_receipt_created",
    metadata: {
      delivery_receipt_id: receipt.id,
      supplier_reference: supplierReference,
      lines_count: lines.length,
      purchase_order_id: purchaseOrderId,
    },
  });

  await logActivity({ event: "goods_receipt.created", entityId: receipt?.id, metadata: { reference: supplierReference } });

  await pushBillToAccounting(tenantId, receipt.id);

  revalidatePath("/app/goods-inwards");
  revalidatePath("/app/purchasing");
  revalidatePath("/app/inventory");
  revalidatePath("/app/activity-log");

  redirect(`/app/goods-inwards/${receipt.id}`);
}

export async function linkReceiptToPo(formData: FormData) {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/auth/login");
  const { supabase, tenantId: _tenantId } = ctx;
  const tenantId = _tenantId!; // non-null: layout.tsx redirects tenant-less operators to /app/super-admin

  const receiptId = formData.get("receipt_id") as string;
  const purchaseOrderId = formData.get("purchase_order_id") as string;

  const { data: receipt } = await supabase
    .from("delivery_receipt")
    .select("*, delivery_receipt_line(*)")
    .eq("id", receiptId)
    .eq("tenant_id", tenantId)
    .single();

  if (!receipt) return { error: "Receipt not found" };
  if (receipt.status !== "unmatched")
    return { error: "Receipt is already linked to a PO" };

  const { data: poLines, error: poError } = await supabase
    .from("purchase_order_line")
    .select("id, component_id, quantity, quantity_received")
    .eq("purchase_order_id", purchaseOrderId)
    .eq("tenant_id", tenantId);

  if (poError || !poLines) return { error: "Purchase order not found" };
  if (poLines.length === 0) return { error: "Purchase order has no lines" };

  const poLineByComponent = new Map(poLines.map((l) => [l.component_id, l]));
  const updatedLines: Array<{
    quantity_delivered: number;
    quantity_expected: number | null;
  }> = [];

  for (const line of receipt.delivery_receipt_line) {
    const poLine = poLineByComponent.get(line.component_id);
    const qtyExpected = poLine
      ? poLine.quantity - poLine.quantity_received
      : null;

    await supabase
      .from("delivery_receipt_line")
      .update({
        purchase_order_line_id: poLine?.id ?? null,
        quantity_expected: qtyExpected,
      })
      .eq("id", line.id)
      .eq("tenant_id", tenantId);

    if (poLine) {
      const applied = Math.min(
        line.quantity_delivered,
        Math.max(poLine.quantity - poLine.quantity_received, 0)
      );
      if (applied > 0) {
        await supabase
          .from("purchase_order_line")
          .update({ quantity_received: poLine.quantity_received + applied })
          .eq("id", poLine.id)
          .eq("tenant_id", tenantId);
        poLine.quantity_received += applied; // keep map in sync
      }
    }

    updatedLines.push({
      quantity_delivered: line.quantity_delivered,
      quantity_expected: qtyExpected,
    });
  }

  const newStatus = computeReceiptStatus(purchaseOrderId, updatedLines);

  await supabase
    .from("delivery_receipt")
    .update({ purchase_order_id: purchaseOrderId, status: newStatus })
    .eq("id", receiptId)
    .eq("tenant_id", tenantId);

  const { data: remaining } = await supabase
    .from("purchase_order_line")
    .select("quantity, quantity_received")
    .eq("purchase_order_id", purchaseOrderId)
    .eq("tenant_id", tenantId);

  if (remaining?.every((l) => l.quantity_received >= l.quantity)) {
    await supabase
      .from("purchase_order")
      .update({ status: "received" })
      .eq("id", purchaseOrderId)
      .eq("tenant_id", tenantId);
  }

  const { data: linkAuthData } = await supabase.auth.getUser();
  await supabase.from("activity_log").insert({
    tenant_id: tenantId,
    actor_id: linkAuthData.user?.id ?? null,
    event: "delivery_receipt_linked",
    metadata: {
      delivery_receipt_id: receiptId,
      purchase_order_id: purchaseOrderId,
    },
  });

  await logActivity({ event: "goods_receipt.linked_to_po", entityId: receiptId });

  revalidatePath("/app/goods-inwards");
  revalidatePath("/app/purchasing");
  revalidatePath("/app/inventory");
  revalidatePath("/app/activity-log");

  redirect(`/app/goods-inwards/${receiptId}`);
}

export async function updateDeliveryReceipt(formData: FormData) {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/auth/login");
  const { supabase, tenantId: _tenantId } = ctx;
  const tenantId = _tenantId!; // non-null: layout.tsx redirects tenant-less operators to /app/super-admin

  const receiptId = formData.get("receipt_id") as string;

  const { data: receipt } = await supabase
    .from("delivery_receipt")
    .select("id, purchase_order_id, delivery_receipt_line(id)")
    .eq("id", receiptId)
    .eq("tenant_id", tenantId)
    .single();

  if (!receipt) return { error: "Receipt not found" };

  const rawSupplierId = (formData.get("supplier_id") as string) || null;
  const supplierId =
    rawSupplierId && rawSupplierId !== "__other__" ? rawSupplierId : null;
  const supplierNameOverride =
    (formData.get("supplier_name_override") as string) || null;

  if (!supplierId && !supplierNameOverride)
    return { error: "Supplier is required" };

  const supplierReference = (formData.get("supplier_reference") as string) ?? "";
  if (!supplierReference) return { error: "Supplier reference is required" };

  const stockInReason = receipt.purchase_order_id
    ? undefined
    : (formData.get("stock_in_reason") as string) || null;

  const { error: headerError } = await supabase
    .from("delivery_receipt")
    .update({
      supplier_id: supplierId,
      supplier_name_override: supplierNameOverride,
      supplier_reference: supplierReference,
      location_id: formData.get("location_id") as string,
      received_at: formData.get("received_at") as string,
      notes: (formData.get("notes") as string) || null,
      ...(stockInReason !== undefined ? { stock_in_reason: stockInReason } : {}),
    })
    .eq("id", receiptId)
    .eq("tenant_id", tenantId);

  if (headerError) return { error: headerError.message };

  await logActivity({ event: "goods_receipt.updated", entityId: receiptId });

  const lineNotesRaw = formData.get("line_notes") as string;
  if (lineNotesRaw) {
    const lineNotes: Record<string, string> = JSON.parse(lineNotesRaw);
    for (const [lineId, notes] of Object.entries(lineNotes)) {
      await supabase
        .from("delivery_receipt_line")
        .update({ notes: notes || null })
        .eq("id", lineId)
        .eq("tenant_id", tenantId);
    }
  }

  revalidatePath(`/app/goods-inwards/${receiptId}`);
  revalidatePath("/app/goods-inwards");
  redirect(`/app/goods-inwards/${receiptId}`);
}

export async function updateComponentCosts(
  updates: { component_id: string; cost_per_unit: number }[]
): Promise<{ updated: number } | { error: string }> {
  const ctx = await getServerTenantContext();
  if (!ctx) return { error: "Not authenticated" };
  const { supabase, tenantId } = ctx;
  if (!tenantId) return { error: "Missing tenant context." };

  for (const u of updates) {
    if (!Number.isFinite(u.cost_per_unit) || u.cost_per_unit < 0) {
      return { error: "Cost per unit must be a non-negative number" };
    }
  }

  let updated = 0;
  for (const u of updates) {
    const { error } = await supabase
      .from("component")
      .update({ cost_per_unit: u.cost_per_unit })
      .eq("id", u.component_id)
      .eq("tenant_id", tenantId);
    if (!error) updated++;
  }

  revalidatePath("/app/components");
  revalidatePath("/app/inventory");
  return { updated };
}

export type ParsedReceiptLine = {
  extracted_name: string;
  quantity: number;
};

export type ParsedReceipt = {
  supplier_reference?: string;
  received_at?: string;
  lines: ParsedReceiptLine[];
};

export async function parseReceiptPdf(
  formData: FormData
): Promise<ParsedReceipt | { error: string }> {
  const ctx = await getServerTenantContext();
  if (!ctx) return { error: "Not authenticated" };

  const file = formData.get("pdf") as File | null;
  if (!file) return { error: "No file provided" };

  if (!file.type.includes("pdf")) return { error: "Only PDF files are supported" };

  const buffer = await file.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");

  if (!process.env.ANTHROPIC_API_KEY) {
    return { error: "PDF parsing is not configured. Contact your administrator." };
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  let text: string;
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 2048,
      system:
        "You are extracting structured data from a delivery docket or packing slip. " +
        "Return ONLY valid JSON with no explanation, no markdown, no code fences.",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document" as const,
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64,
              },
            },
            {
              type: "text",
              text: 'Extract delivery details. Return JSON exactly matching this schema:\n{"supplier_reference":string|null,"received_at":string|null,"lines":[{"extracted_name":string,"quantity":number}]}\nreceived_at must be YYYY-MM-DD format or null. lines must have at least one entry if any products are listed.',
            },
          ] as Parameters<typeof client.messages.create>[0]["messages"][0]["content"],
        },
      ],
    });

    text =
      response.content[0].type === "text" ? response.content[0].text : "";
  } catch (err) {
    const msg = err instanceof Error ? err.message : "API error";
    return { error: `Parsing failed: ${msg}` };
  }

  try {
    const parsed = JSON.parse(text) as ParsedReceipt;
    if (!Array.isArray(parsed.lines)) return { error: "Unexpected response format" };
    return {
      supplier_reference: parsed.supplier_reference ?? undefined,
      received_at: parsed.received_at ?? undefined,
      lines: parsed.lines.filter(
        (l) => typeof l.extracted_name === "string" && typeof l.quantity === "number"
      ),
    };
  } catch {
    return { error: "Could not parse response from AI" };
  }
}
