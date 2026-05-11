import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { refreshXeroToken, createXeroBill } from "@/lib/accounting/xero";

export async function pushBillToAccounting(
  tenantId: string,
  receiptId: string
): Promise<void> {
  const admin = createSupabaseAdminClient();

  const { data: connection } = await admin
    .from("accounting_connection")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("provider", "xero")
    .eq("is_active", true)
    .maybeSingle();

  if (!connection) return;

  let accessToken = connection.access_token;
  if (new Date(connection.token_expires_at).getTime() - Date.now() < 60_000) {
    try {
      const refreshed = await refreshXeroToken(connection.refresh_token);
      accessToken = refreshed.access_token;
      await admin
        .from("accounting_connection")
        .update({
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token,
          token_expires_at: new Date(
            Date.now() + refreshed.expires_in * 1000
          ).toISOString(),
        })
        .eq("id", connection.id);
    } catch (err) {
      await admin.from("accounting_sync_event").insert({
        tenant_id: tenantId,
        connection_id: connection.id,
        entity_type: "bill",
        entity_id: receiptId,
        status: "failed",
        error: `Token refresh failed: ${err instanceof Error ? err.message : String(err)}`,
      });
      return;
    }
  }

  const { data: receipt } = await admin
    .from("delivery_receipt")
    .select(
      `
      supplier_reference,
      received_at,
      supplier_name_override,
      supplier:supplier_id ( name ),
      delivery_receipt_line (
        quantity_delivered,
        cost_per_unit,
        notes,
        component:component_id ( name )
      )
    `
    )
    .eq("id", receiptId)
    .eq("tenant_id", tenantId)
    .single();

  if (!receipt) return;

  type LineRow = {
    quantity_delivered: number;
    cost_per_unit: number | null;
    notes: string | null;
    component: { name: string } | null;
  };

  const billLines = (receipt.delivery_receipt_line as unknown as LineRow[])
    .filter((l) => l.cost_per_unit != null)
    .map((l) => ({
      description:
        (l.component?.name ?? "Component") + (l.notes ? ` — ${l.notes}` : ""),
      quantity: l.quantity_delivered,
      unitAmount: l.cost_per_unit!,
      accountCode: connection.default_account_code,
    }));

  if (billLines.length === 0) return;

  type SupplierRow = { name: string } | null;
  const supplierName =
    (receipt.supplier as unknown as SupplierRow)?.name ??
    receipt.supplier_name_override ??
    "Unknown Supplier";

  const date = (receipt.received_at as string).slice(0, 10);

  let externalId: string | null = null;
  let status: "synced" | "failed" = "failed";
  let error: string | null = null;

  try {
    externalId = await createXeroBill(accessToken, connection.provider_org_id, {
      contactName: supplierName,
      date,
      dueDate: date,
      reference: receipt.supplier_reference ?? undefined,
      lines: billLines,
    });
    status = "synced";
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  await admin.from("accounting_sync_event").insert({
    tenant_id: tenantId,
    connection_id: connection.id,
    entity_type: "bill",
    entity_id: receiptId,
    external_id: externalId,
    status,
    error,
  });
}
