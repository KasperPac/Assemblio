"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";
import { isAdminRole, isReadOnlyRole } from "@/lib/tenant/authz";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { assertNoError } from "@/lib/supabase/assert-no-error";
import { logActivity } from "@/lib/activity/log";
import { parseDraftPayload } from "@/lib/accounting/supplier-invoice/draft";
import { invoiceTotals, lineAmounts } from "@/lib/accounting/supplier-invoice/calc";
import { UUID } from "@/lib/accounting/supplier-invoice/util";
import { dbErrorMessage } from "@/lib/accounting/supplier-invoice/errors";
import { supabaseConnectionRepo } from "@/lib/accounting/connection";
import { isXeroPilotTenant } from "@/lib/accounting/xero/config";
import { xeroAccessFor } from "@/lib/accounting/xero/access";
import { getContact, searchContacts } from "@/lib/accounting/xero/org";
import { classifyXeroFailure } from "@/lib/accounting/xero/errors";
import { XeroAuthError } from "@/lib/accounting/xero/tokens";
import { scrubSecrets } from "@/lib/accounting/xero/scrub";
import { kickOutbox } from "@/lib/accounting/outbox/process";

type Fail = { ok: false; message: string };
type DbErr = { code?: string; message?: string };
type Supabase = NonNullable<Awaited<ReturnType<typeof getServerTenantContext>>>["supabase"];
const READ_ONLY: Fail = { ok: false, message: "Read-only access." };
const NO_WORKSPACE: Fail = { ok: false, message: "You're not signed in to a workspace." };
const RECONNECT: Fail = { ok: false, message: "Xero needs reconnecting. Ask an admin to reconnect it from Integrations." };

function revalidateInvoices(id?: string) {
  revalidatePath("/app/purchasing/invoices");
  if (id) revalidatePath(`/app/purchasing/invoices/${id}`);
  revalidatePath("/app/purchasing");
  revalidatePath("/app/goods-inwards");
}

/** Logs the real error (scrubbed) and returns the user-facing message. A failed write never reports success. */
function failWith(where: string, error: DbErr, fallback: string, ctx?: { invoiceNumber?: string }): Fail {
  console.error(`[supplier-invoice] ${where}`, scrubSecrets({ code: error.code, message: error.message }));
  return { ok: false, message: dbErrorMessage(error, fallback, ctx) };
}

function xeroFailure(where: string, err: unknown): Fail {
  console.error(`[xero] ${where}`, scrubSecrets(err instanceof Error ? err.message : String(err)));
  if (err instanceof XeroAuthError) return RECONNECT;
  return { ok: false, message: "Couldn't reach Xero. Try again." };
}

/** Best-effort read of the invoice number for the activity log; the post/void itself has already succeeded. */
async function invoiceNumberOf(supabase: Supabase, id: string): Promise<string | undefined> {
  const { data, error } = await supabase.from("supplier_invoice").select("invoice_number").eq("id", id).maybeSingle();
  if (error) {
    console.error("[supplier-invoice] read invoice number", scrubSecrets(error.message));
    return undefined;
  }
  return (data as { invoice_number?: string } | null)?.invoice_number;
}

export async function saveSupplierInvoiceDraft(raw: unknown): Promise<{ ok: true; id: string } | Fail> {
  const ctx = await getServerTenantContext();
  if (!ctx?.tenantId) return NO_WORKSPACE;
  if (isReadOnlyRole(ctx.role)) return READ_ONLY;
  const parsed = parseDraftPayload(raw);
  if (!parsed.ok) return { ok: false, message: parsed.error };
  const d = parsed.value;
  const numberCtx = { invoiceNumber: d.invoiceNumber };

  // Amounts are always re-computed here; the client's figures are never trusted.
  const lines = d.lines.map((l) => ({ ...l, ...lineAmounts({ quantity: l.quantity, unitAmount: l.unitAmount, taxRatePercent: l.taxRatePercent }, d.amountsMode) }));
  const totals = invoiceTotals(lines, d.amountsMode);
  // User fields only. status, sync_status, external_*, posted_*, voided_*, void_reason are never set here,
  // and created_by comes from the column default (auth.uid()).
  const header = {
    tenant_id: ctx.tenantId,
    supplier_id: d.supplierId,
    purchase_order_id: d.purchaseOrderId,
    invoice_number: d.invoiceNumber,
    invoice_date: d.invoiceDate,
    due_date: d.dueDate,
    amounts_mode: d.amountsMode,
    currency: d.currency,
    entered_total: d.enteredTotal,
    subtotal: totals.subtotal,
    tax_total: totals.taxTotal,
    total: totals.total,
    updated_at: new Date().toISOString(),
  };

  let id = d.id;
  if (id) {
    const { data, error } = await ctx.supabase.from("supplier_invoice").update(header).eq("id", id).eq("tenant_id", ctx.tenantId).eq("status", "draft").select("id");
    if (error) return failWith("update draft", error, "Couldn't save the invoice.", numberCtx);
    if (!data?.length) return { ok: false, message: "This invoice can't be edited. It may already be posted." };
    // Lines are deleted and re-inserted, never updated in place: the receipt-line unique index forbids swapping.
    const { error: delErr } = await ctx.supabase.from("supplier_invoice_line").delete().eq("supplier_invoice_id", id);
    if (delErr) return failWith("delete draft lines", delErr, "Couldn't save the invoice lines.");
  } else {
    const { data, error } = await ctx.supabase.from("supplier_invoice").insert(header).select("id").single();
    if (error) return failWith("insert draft", error, "Couldn't save the invoice.", numberCtx);
    id = (data as { id: string }).id;
  }

  // A draft is not posted, so a failed line write leaves an editable draft; the user saves again.
  const { error: lineErr } = await ctx.supabase.from("supplier_invoice_line").insert(
    lines.map((l, i) => ({
      tenant_id: ctx.tenantId,
      supplier_invoice_id: id,
      line_no: i + 1,
      kind: l.kind,
      delivery_receipt_line_id: l.deliveryReceiptLineId,
      component_id: l.componentId,
      description: l.description,
      quantity: l.quantity,
      unit_amount: l.unitAmount,
      tax_type: l.taxType,
      tax_rate: l.taxRatePercent,
      account_code: l.accountCode,
      line_amount: l.lineAmount,
      tax_amount: l.taxAmount,
    }))
  );
  if (lineErr) return failWith("insert draft lines", lineErr, "Couldn't save the invoice lines.");
  revalidateInvoices(id!);
  return { ok: true, id: id! };
}

// Entering and posting follow goods inwards, which has no role gate beyond a tenant session
// (spec 8). Void, retry and creating a Xero contact are admin-only.
export async function postSupplierInvoice(id: string, opts: { updateComponentCosts: boolean; createContact: boolean }): Promise<{ ok: true; syncStatus: string } | Fail> {
  const ctx = await getServerTenantContext();
  if (!ctx?.tenantId) return NO_WORKSPACE;
  if (isReadOnlyRole(ctx.role)) return READ_ONLY;
  if (!UUID.test(id)) return { ok: false, message: "Invoice not found." };
  if (opts.createContact && !isAdminRole(ctx.role)) return { ok: false, message: "Only admins can create a contact in Xero. Ask an admin to link or create it." };
  const createContact = opts.createContact && isXeroPilotTenant(ctx.tenantId);
  const { data, error } = await ctx.supabase.rpc("post_supplier_invoice", {
    p_invoice_id: id,
    p_update_component_costs: opts.updateComponentCosts,
    p_create_contact: createContact,
  });
  if (error) return failWith("post_supplier_invoice", error, "Couldn't post the invoice.");
  if (typeof data !== "string" || !data) {
    console.error("[supplier-invoice] post_supplier_invoice returned no sync status", scrubSecrets(data));
    return { ok: false, message: "Couldn't confirm the invoice was posted. Check the invoice before trying again." };
  }
  const syncStatus = data;
  await logActivity({ event: "supplier_invoice.posted", entityId: id, metadata: { invoice_number: await invoiceNumberOf(ctx.supabase, id), sync_status: syncStatus } });
  const tenantId = ctx.tenantId;
  if (syncStatus === "queued" && isXeroPilotTenant(tenantId)) after(() => kickOutbox({ tenantId }));
  revalidateInvoices(id);
  return { ok: true, syncStatus };
}

export async function voidSupplierInvoice(id: string, reason: string): Promise<{ ok: true; syncStatus: string } | Fail> {
  const ctx = await getServerTenantContext();
  if (!ctx?.tenantId) return NO_WORKSPACE;
  if (!isAdminRole(ctx.role)) return { ok: false, message: "Only admins can void supplier invoices." };
  if (!UUID.test(id)) return { ok: false, message: "Invoice not found." };
  const why = typeof reason === "string" ? reason.trim() : "";
  if (!why) return { ok: false, message: "Enter a reason for voiding this invoice." };
  if (why.length > 500) return { ok: false, message: "The void reason is too long (500 characters at most)." };
  const { data, error } = await ctx.supabase.rpc("void_supplier_invoice", { p_invoice_id: id, p_reason: why });
  if (error) return failWith("void_supplier_invoice", error, "Couldn't void the invoice.");
  if (typeof data !== "string" || !data) {
    console.error("[supplier-invoice] void_supplier_invoice returned no sync status", scrubSecrets(data));
    return { ok: false, message: "Couldn't confirm the invoice was voided. Check the invoice before trying again." };
  }
  const syncStatus = data;
  await logActivity({ event: "supplier_invoice.voided", entityId: id, metadata: { invoice_number: await invoiceNumberOf(ctx.supabase, id), reason: why } });
  const tenantId = ctx.tenantId;
  if (syncStatus === "queued" && isXeroPilotTenant(tenantId)) after(() => kickOutbox({ tenantId }));
  revalidateInvoices(id);
  return { ok: true, syncStatus };
}

async function connectedXero(tenantId: string) {
  if (!isXeroPilotTenant(tenantId)) return null;
  const db = createSupabaseAdminClient();
  const conn = await supabaseConnectionRepo(db).findByTenant(tenantId);
  return conn && conn.status === "connected" && conn.setup_completed_at ? { db, conn } : null;
}

export async function searchXeroContactsAction(term: string): Promise<{ ok: true; contacts: { id: string; name: string }[] } | Fail> {
  const ctx = await getServerTenantContext();
  if (!ctx?.tenantId) return NO_WORKSPACE;
  if (isReadOnlyRole(ctx.role)) return READ_ONLY;
  const q = String(term ?? "").trim().slice(0, 100);
  if (q.length < 2) return { ok: true, contacts: [] };
  try {
    const x = await connectedXero(ctx.tenantId);
    if (!x) return { ok: false, message: "Xero isn't connected." };
    const r = await searchContacts(await xeroAccessFor(x.db, x.conn), q);
    if (!r.ok) {
      console.error("[xero] contact search failed", scrubSecrets({ status: r.status, networkError: r.networkError }));
      return { ok: false, message: classifyXeroFailure(r).message };
    }
    return {
      ok: true,
      contacts: (r.data.Contacts ?? []).filter((c) => c.ContactStatus !== "ARCHIVED").slice(0, 10).map((c) => ({ id: c.ContactID, name: c.Name })),
    };
  } catch (err) {
    return xeroFailure("contact search threw", err);
  }
}

export async function linkSupplierToXeroContact(supplierId: string, contactId: string): Promise<{ ok: true; name: string } | Fail> {
  const ctx = await getServerTenantContext();
  if (!ctx?.tenantId) return NO_WORKSPACE;
  if (isReadOnlyRole(ctx.role)) return READ_ONLY;
  if (!UUID.test(supplierId) || !UUID.test(contactId)) return { ok: false, message: "Invalid supplier or contact." };
  const tenantId = ctx.tenantId;

  // `suppliers` (not the active-only `supplier` view): an archived supplier's posted invoice must still be linkable.
  const { data: sup, error: supErr } = await ctx.supabase.from("suppliers").select("id").eq("id", supplierId).eq("tenant_id", tenantId).maybeSingle();
  if (supErr) return failWith("read supplier", supErr, "Couldn't look up that supplier.");
  if (!sup) return { ok: false, message: "Supplier not found." };

  let x: Awaited<ReturnType<typeof connectedXero>>;
  let name: string;
  try {
    x = await connectedXero(tenantId);
    if (!x) return { ok: false, message: "Xero isn't connected." };
    const r = await getContact(await xeroAccessFor(x.db, x.conn), contactId);
    if (!r.ok) {
      console.error("[xero] get contact failed", scrubSecrets({ status: r.status, networkError: r.networkError }));
      return { ok: false, message: classifyXeroFailure(r).message };
    }
    const c = r.data.Contacts?.[0];
    if (!c || c.ContactStatus === "ARCHIVED") return { ok: false, message: "That Xero contact is archived or missing." };
    name = c.Name;
  } catch (err) {
    return xeroFailure("get contact threw", err);
  }

  let kick = false;
  try {
    // An open "create contact" for this supplier is now unnecessary: cancel it and unblock the bills waiting on it.
    const { data: jobs, error: je } = await x.db
      .from("accounting_outbox")
      .select("id, status")
      .eq("tenant_id", tenantId)
      .eq("entity_type", "supplier")
      .eq("entity_id", supplierId)
      .eq("operation", "create_contact")
      .in("status", ["pending", "working", "failed"]);
    assertNoError(je, "find create_contact jobs");
    const open = (jobs ?? []) as { id: string; status: string }[];
    // A job in flight may already have created the contact at Xero; don't race it.
    if (open.some((j) => j.status === "working")) return { ok: false, message: "Xero is creating this contact right now. Try again in a minute." };
    const ids = open.map((j) => j.id);

    const { error } = await x.db.from("accounting_contact_link").upsert(
      { tenant_id: tenantId, provider: "xero", supplier_id: supplierId, external_contact_id: contactId, external_name: name, linked_by: ctx.userId, linked_at: new Date().toISOString() },
      { onConflict: "tenant_id,provider,supplier_id" }
    );
    assertNoError(error, "save accounting_contact_link");
    if (ids.length) {
      const { error: e1 } = await x.db
        .from("accounting_outbox")
        .update({ status: "cancelled", completed_at: new Date().toISOString(), error_message: "Supplier linked to an existing Xero contact" })
        .in("id", ids)
        .in("status", ["pending", "failed"]);
      assertNoError(e1, "cancel create_contact jobs");
      const { error: e2 } = await x.db.from("accounting_outbox").update({ depends_on: null }).eq("tenant_id", tenantId).in("depends_on", ids);
      assertNoError(e2, "unblock dependent bill jobs");
      kick = true;
    }
  } catch (err) {
    console.error("[xero] link supplier failed", scrubSecrets(err instanceof Error ? err.message : String(err)));
    return { ok: false, message: "Couldn't save the link. Try again." };
  }
  if (kick) after(() => kickOutbox({ tenantId }));
  await logActivity({ event: "accounting.supplier_linked", entityId: supplierId, metadata: { contact_name: name } });
  revalidateInvoices();
  return { ok: true, name };
}
