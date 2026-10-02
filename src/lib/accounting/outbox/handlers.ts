// src/lib/accounting/outbox/handlers.ts
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertNoError } from "@/lib/supabase/assert-no-error";
import { poLabel } from "@/lib/purchasing/po-label";
import type { AmountsMode } from "../supplier-invoice/calc";
import { xeroRequest, type XeroAccess } from "../xero/client";
import {
  DUPLICATE_CONTACT_PATTERN, classifyXeroFailure, fixableError, inactiveInXeroMessage, lockDateMessage, xeroValidationMessages, type ClassifiedError,
} from "../xero/errors";
import { fetchAccounts, fetchOrganisation, fetchTaxRates, lockDateBlocking, type XeroAccount, type XeroOrganisation, type XeroTaxRate } from "../xero/org";
import { buildXeroBill, buildXeroContact, decideVoidAction, existingBillWhere, stockLineDescription, voidPayload, xeroBillUrl, type XeroBillState } from "../xero/bill";

export type OutboxJob = {
  id: string;
  tenant_id: string;
  connection_id: string;
  operation: "create_contact" | "create_bill" | "void_bill";
  entity_type: "supplier" | "supplier_invoice";
  entity_id: string;
  attempts: number;
  first_attempt_at: string | null;
  idempotency_key: string;
  external_id: string | null;
  depends_on: string | null;
};

export type HandlerOutcome = { kind: "sent"; externalId: string | null; note?: unknown } | { kind: "error"; error: ClassifiedError };

export type BillSource = {
  invoice: {
    id: string; tenant_id: string; supplier_id: string; invoice_number: string; invoice_date: string; due_date: string;
    amounts_mode: AmountsMode; currency: string; status: string; total: number; external_id: string | null; po_number: string | null;
  };
  lines: Array<{
    kind: "stock" | "other"; description: string; quantity: number; unit_amount: number;
    account_code: string | null; tax_type: string | null;
    component_name: string | null; component_sku: string | null; receipt_ref: string | null;
  }>;
};

export type HandlerStore = {
  loadBillSource(invoiceId: string, tenantId: string): Promise<BillSource | null>;
  contactLink(tenantId: string, supplierId: string): Promise<string | null>;
  recordBill(invoiceId: string, xeroId: string, url: string, xeroTotal: number | null): Promise<void>;
  loadInvoiceExternal(invoiceId: string, tenantId: string): Promise<{ external_id: string | null; supplier_id?: string; invoice_number?: string } | null>;
  markVoidedInXero(invoiceId: string, tenantId: string): Promise<void>;
  loadSupplier(tenantId: string, supplierId: string): Promise<{ name: string | null; contact_email: string | null; contact_phone: string | null; address: string | null } | null>;
  saveContactLink(tenantId: string, supplierId: string, contactId: string, name: string): Promise<void>;
  /** The Xero InvoiceIDs among `xeroIds` that another supplier_invoice in this tenant already holds. Omitted: none. */
  billIdsLinkedElsewhere?(tenantId: string, xeroIds: string[], exceptInvoiceId: string): Promise<string[]>;
};

type Maybe<T> = T | ClassifiedError;
export type OrgCache = { organisation(): Promise<Maybe<XeroOrganisation>>; accounts(): Promise<Maybe<XeroAccount[]>>; taxRates(): Promise<Maybe<XeroTaxRate[]>> };
export type JobContext = { store: HandlerStore; access: XeroAccess; fetchImpl: typeof fetch; cache: OrgCache };

const isErr = (v: unknown): v is ClassifiedError => !!v && typeof v === "object" && "errorClass" in (v as object);
const fail = (error: ClassifiedError): HandlerOutcome => ({ kind: "error", error });

/** One read of each per processing run: keeps a 25-job batch inside Xero's 60 calls/minute. */
export function createOrgCache(access: XeroAccess, f: typeof fetch): OrgCache {
  let org: Promise<Maybe<XeroOrganisation>> | null = null;
  let accounts: Promise<Maybe<XeroAccount[]>> | null = null;
  let rates: Promise<Maybe<XeroTaxRate[]>> | null = null;
  return {
    organisation: () =>
      (org ??= fetchOrganisation(access, f).then((r) =>
        r.ok ? (r.data.Organisations?.[0] ?? fixableError("Xero didn't return the organisation.")) : classifyXeroFailure(r)
      )),
    accounts: () => (accounts ??= fetchAccounts(access, f).then((r) => (r.ok ? (r.data.Accounts ?? []) : classifyXeroFailure(r)))),
    taxRates: () => (rates ??= fetchTaxRates(access, f).then((r) => (r.ok ? (r.data.TaxRates ?? []) : classifyXeroFailure(r)))),
  };
}

type WithErrors = { HasErrors?: boolean };

const transient = (message: string, detail: unknown): ClassifiedError => ({ errorClass: "transient", message, detail, retryAfterSec: null });
const isLive = (b: XeroBillState) => !["DELETED", "VOIDED"].includes(String(b.Status ?? "").toUpperCase());
const roundingNote = (manuva: number, xero: number | null) =>
  xero !== null && Math.abs(xero - manuva) >= 0.005 ? { rounding: { manuva, xero } } : null;

/**
 * Looks for this invoice's live (not deleted, not voided) ACCPAY bill: this number, this contact. A bill another
 * Manuva invoice already holds is never this one's. More than one candidate is never guessed between. A body-less
 * 2xx counts as a failed search, never as "no bill".
 */
async function findLiveBill(
  ctx: JobContext,
  where: { tenantId: string; invoiceId: string; contactId: string; invoiceNumber: string }
): Promise<{ bill: XeroBillState | null } | { error: ClassifiedError }> {
  const found = await xeroRequest<{ Invoices?: XeroBillState[] } | null>(
    ctx.access,
    { method: "GET", path: "/Invoices", query: { where: existingBillWhere(where.contactId, where.invoiceNumber) } },
    ctx.fetchImpl
  );
  if (!found.ok) return { error: classifyXeroFailure(found) };
  if (!found.data) return { error: transient("Xero returned an empty response. Manuva will retry automatically.", { status: found.status }) };
  let live = (found.data.Invoices ?? []).filter((b) => isLive(b) && !!b.InvoiceID);
  if (live.length && ctx.store.billIdsLinkedElsewhere) {
    const taken = new Set(await ctx.store.billIdsLinkedElsewhere(where.tenantId, live.map((b) => b.InvoiceID), where.invoiceId));
    live = live.filter((b) => !taken.has(b.InvoiceID));
  }
  if (live.length > 1) {
    return {
      error: fixableError(
        `Xero has several bills from this supplier with invoice number ${where.invoiceNumber}. Void the extra one in Xero, then retry.`,
        { candidates: live.map((b) => b.InvoiceID) }
      ),
    };
  }
  return { bill: live[0] ?? null };
}

export async function handleCreateBill(job: OutboxJob, ctx: JobContext): Promise<HandlerOutcome> {
  const src = await ctx.store.loadBillSource(job.entity_id, job.tenant_id);
  if (!src || src.invoice.status !== "posted") return fail(fixableError("This invoice is no longer posted in Manuva."));
  const inv = src.invoice;
  if (inv.external_id) return { kind: "sent", externalId: inv.external_id };

  const contactId = await ctx.store.contactLink(inv.tenant_id, inv.supplier_id);
  if (!contactId) return fail(fixableError("Link this supplier to a Xero contact, then retry."));

  if (job.attempts > 0) {
    // Xero's Idempotency-Key only lasts 6 minutes; after that, look before creating. Adoption sends nothing,
    // so it runs before the pre-checks: a lost-response create must be adopted even if a pre-check now fails.
    const found = await findLiveBill(ctx, { tenantId: inv.tenant_id, invoiceId: inv.id, contactId, invoiceNumber: inv.invoice_number });
    if ("error" in found) return fail(found.error);
    if (found.bill) {
      const xeroTotal = typeof found.bill.Total === "number" ? found.bill.Total : null;
      await ctx.store.recordBill(inv.id, found.bill.InvoiceID, xeroBillUrl(found.bill.InvoiceID), xeroTotal);
      return { kind: "sent", externalId: found.bill.InvoiceID, note: { adopted: true, ...roundingNote(Number(inv.total), xeroTotal) } };
    }
  }

  const org = await ctx.cache.organisation();
  if (isErr(org)) return fail(org);
  const locked = lockDateBlocking(inv.invoice_date, org);
  if (locked) return fail(fixableError(lockDateMessage(locked)));
  if (inv.currency !== org.BaseCurrency) {
    return fail(fixableError(`This invoice is in ${inv.currency} but Xero's base currency is ${org.BaseCurrency}. Multi-currency bills aren't supported yet.`));
  }
  const accounts = await ctx.cache.accounts();
  if (isErr(accounts)) return fail(accounts);
  const rates = await ctx.cache.taxRates();
  if (isErr(rates)) return fail(rates);
  const activeCodes = new Set(accounts.filter((a) => a.Status === "ACTIVE" && a.Code).map((a) => a.Code!));
  const activeTax = new Set(rates.filter((r) => r.Status === "ACTIVE" && r.CanApplyToExpenses !== false).map((r) => r.TaxType));
  for (const l of src.lines) {
    if (!l.account_code || !activeCodes.has(l.account_code)) {
      return fail(fixableError(inactiveInXeroMessage(`Account ${l.account_code ?? "(none)"}`)));
    }
    if (!l.tax_type || !activeTax.has(l.tax_type)) {
      return fail(fixableError(inactiveInXeroMessage(`Tax rate ${l.tax_type ?? "(none)"}`, ", or can't be used on purchases")));
    }
  }

  const payload = buildXeroBill({
    contactId,
    invoiceNumber: inv.invoice_number,
    date: inv.invoice_date,
    dueDate: inv.due_date,
    amountsMode: inv.amounts_mode,
    currencyCode: org.BaseCurrency,
    lines: src.lines.map((l) => ({
      description: l.kind === "stock"
        ? stockLineDescription({ sku: l.component_sku, name: l.component_name ?? l.description, poNumber: inv.po_number, receiptRef: l.receipt_ref })
        : l.description,
      quantity: Number(l.quantity),
      unitAmount: Number(l.unit_amount),
      accountCode: l.account_code!,
      taxType: l.tax_type!,
    })),
  });
  const res = await xeroRequest<{ Invoices?: Array<XeroBillState & WithErrors> } | null>(
    ctx.access,
    { method: "POST", path: "/Invoices", query: { unitdp: "4", summarizeErrors: "false" }, body: payload, idempotencyKey: job.idempotency_key },
    ctx.fetchImpl
  );
  if (!res.ok) return fail(classifyXeroFailure(res));
  const created = res.data?.Invoices?.[0];
  if (created?.HasErrors) return fail(classifyXeroFailure({ ok: false, status: 400, body: res.data, rate: res.rate }));
  // A 2xx with no invoice in the body may still have created one: transient, so the retry searches first.
  if (!created?.InvoiceID) return fail(transient("Xero returned an unexpected response. Manuva will retry automatically.", { status: res.status, body: res.data }));
  const xeroTotal = typeof created.Total === "number" ? created.Total : null;
  await ctx.store.recordBill(inv.id, created.InvoiceID, xeroBillUrl(created.InvoiceID), xeroTotal);
  const note = roundingNote(Number(inv.total), xeroTotal);
  return { kind: "sent", externalId: created.InvoiceID, ...(note ? { note } : {}) };
}

export async function handleVoidBill(job: OutboxJob, ctx: JobContext): Promise<HandlerOutcome> {
  const inv = await ctx.store.loadInvoiceExternal(job.entity_id, job.tenant_id);
  if (!inv) return fail(fixableError("This invoice wasn't found in Manuva."));

  let id = inv.external_id;
  let bill: XeroBillState | undefined;
  if (!id) {
    // A create may have reached Xero without its response coming back, so there is no external_id to void.
    const contactId = inv.supplier_id ? await ctx.store.contactLink(job.tenant_id, inv.supplier_id) : null;
    if (contactId && inv.invoice_number) {
      const found = await findLiveBill(ctx, { tenantId: job.tenant_id, invoiceId: job.entity_id, contactId, invoiceNumber: inv.invoice_number });
      if ("error" in found) return fail(found.error);
      if (found.bill) {
        bill = found.bill;
        id = found.bill.InvoiceID;
      }
    }
    if (!id) {
      await ctx.store.markVoidedInXero(job.entity_id, job.tenant_id);
      return { kind: "sent", externalId: null };
    }
  }

  if (!bill) {
    const got = await xeroRequest<{ Invoices?: XeroBillState[] } | null>(ctx.access, { method: "GET", path: `/Invoices/${encodeURIComponent(id)}` }, ctx.fetchImpl);
    if (!got.ok) return fail(classifyXeroFailure(got));
    if (!got.data) return fail(transient("Xero returned an empty response. Manuva will retry automatically.", { status: got.status }));
    bill = got.data.Invoices?.[0];
  }
  if (!bill) return fail(fixableError("Xero couldn't find this bill. It may have been deleted in Xero."));
  const decision = decideVoidAction(bill);
  if (decision.kind === "blocked") return fail(fixableError(decision.message));
  if (decision.kind !== "already") {
    const res = await xeroRequest(
      ctx.access,
      { method: "POST", path: `/Invoices/${encodeURIComponent(id)}`, body: voidPayload(id, decision.kind), idempotencyKey: job.idempotency_key },
      ctx.fetchImpl
    );
    if (!res.ok) return fail(classifyXeroFailure(res));
  }
  await ctx.store.markVoidedInXero(job.entity_id, job.tenant_id);
  return { kind: "sent", externalId: id };
}

/** A name clash is never auto-linked: the admin links the supplier to the existing contact (spec 6.6). */
function contactFailure(f: Parameters<typeof classifyXeroFailure>[0], name: string): ClassifiedError {
  const classified = classifyXeroFailure(f);
  if (f.status === 400 && xeroValidationMessages(f.body).some((m) => DUPLICATE_CONTACT_PATTERN.test(m))) {
    return fixableError(`A contact named ${name} already exists in Xero — link to it instead.`, classified.detail);
  }
  return classified;
}

export async function handleCreateContact(job: OutboxJob, ctx: JobContext): Promise<HandlerOutcome> {
  const existing = await ctx.store.contactLink(job.tenant_id, job.entity_id);
  if (existing) return { kind: "sent", externalId: existing };
  const sup = await ctx.store.loadSupplier(job.tenant_id, job.entity_id);
  if (!sup) return fail(fixableError("Supplier not found."));
  if (!sup.name?.trim()) return fail(fixableError("This supplier has no name. Add one, then retry."));
  const res = await xeroRequest<{ Contacts?: Array<{ ContactID: string; Name: string } & WithErrors> } | null>(
    ctx.access,
    {
      method: "POST",
      path: "/Contacts",
      query: { summarizeErrors: "false" },
      body: buildXeroContact({ name: sup.name, email: sup.contact_email, phone: sup.contact_phone, address: sup.address }),
      idempotencyKey: job.idempotency_key,
    },
    ctx.fetchImpl
  );
  if (!res.ok) return fail(contactFailure(res, sup.name));
  const c = res.data?.Contacts?.[0];
  if (c?.HasErrors) return fail(contactFailure({ ok: false, status: 400, body: res.data, rate: res.rate }, sup.name));
  if (!c?.ContactID) return fail(transient("Xero returned an unexpected response. Manuva will retry automatically.", { status: res.status, body: res.data }));
  await ctx.store.saveContactLink(job.tenant_id, job.entity_id, c.ContactID, c.Name);
  return { kind: "sent", externalId: c.ContactID };
}

type InvoiceRow = Omit<BillSource["invoice"], "po_number"> & { purchase_order_id: string | null };
type LineRow = {
  kind: "stock" | "other"; description: string; quantity: number; unit_amount: number; account_code: string | null; tax_type: string | null;
  component_id: string | null; delivery_receipt_line_id: string | null;
};
type SupplierRow = { name: string | null; contact_email: string | null; contact_phone: string | null; address: string | null };

const uniq = (xs: Array<string | null>): string[] => [...new Set(xs.filter((x): x is string => !!x))];

/**
 * Service-role reads. RLS does not apply here, so every read filters by tenant_id as well as id.
 * Related rows are read separately (not through embedded joins) so each read can carry that filter.
 */
export function supabaseHandlerStore(db: SupabaseClient): HandlerStore {
  return {
    async loadBillSource(invoiceId, tenantId) {
      const { data: inv, error } = await db
        .from("supplier_invoice")
        .select("id, tenant_id, supplier_id, purchase_order_id, invoice_number, invoice_date, due_date, amounts_mode, currency, status, total, external_id")
        .eq("tenant_id", tenantId)
        .eq("id", invoiceId)
        .maybeSingle();
      assertNoError(error, "load supplier_invoice");
      if (!inv) return null;
      const row = inv as unknown as InvoiceRow;

      let poNumber: string | null = null;
      if (row.purchase_order_id) {
        const { data: po, error: pe } = await db
          .from("purchase_order")
          .select("po_number")
          .eq("tenant_id", tenantId)
          .eq("id", row.purchase_order_id)
          .maybeSingle();
        assertNoError(pe, "load purchase_order");
        // A PO without a number is still named (short id), so the accountant sees which PO a bill line came from.
        poNumber = poLabel({ id: row.purchase_order_id, po_number: (po as { po_number: string | null } | null)?.po_number });
      }

      const { data: lines, error: le } = await db
        .from("supplier_invoice_line")
        .select("kind, description, quantity, unit_amount, account_code, tax_type, component_id, delivery_receipt_line_id")
        .eq("tenant_id", tenantId)
        .eq("supplier_invoice_id", invoiceId)
        .order("line_no");
      assertNoError(le, "load supplier_invoice_line");
      const lineRows = (lines ?? []) as unknown as LineRow[];

      const componentIds = uniq(lineRows.map((l) => l.component_id));
      const components = new Map<string, { name: string | null; sku: string | null }>();
      if (componentIds.length) {
        const { data, error: ce } = await db.from("component").select("id, name, sku").eq("tenant_id", tenantId).in("id", componentIds);
        assertNoError(ce, "load component");
        for (const c of (data ?? []) as Array<{ id: string; name: string | null; sku: string | null }>) components.set(c.id, c);
      }

      const receiptLineIds = uniq(lineRows.map((l) => l.delivery_receipt_line_id));
      const receiptOfLine = new Map<string, string>();
      const referenceOfReceipt = new Map<string, string | null>();
      if (receiptLineIds.length) {
        const { data, error: rle } = await db.from("delivery_receipt_line").select("id, delivery_receipt_id").eq("tenant_id", tenantId).in("id", receiptLineIds);
        assertNoError(rle, "load delivery_receipt_line");
        for (const r of (data ?? []) as Array<{ id: string; delivery_receipt_id: string }>) receiptOfLine.set(r.id, r.delivery_receipt_id);
        const receiptIds = uniq([...receiptOfLine.values()]);
        if (receiptIds.length) {
          const { data: recs, error: re } = await db.from("delivery_receipt").select("id, supplier_reference").eq("tenant_id", tenantId).in("id", receiptIds);
          assertNoError(re, "load delivery_receipt");
          for (const r of (recs ?? []) as Array<{ id: string; supplier_reference: string | null }>) referenceOfReceipt.set(r.id, r.supplier_reference);
        }
      }

      return {
        invoice: {
          id: row.id, tenant_id: row.tenant_id, supplier_id: row.supplier_id, invoice_number: row.invoice_number,
          invoice_date: row.invoice_date, due_date: row.due_date, amounts_mode: row.amounts_mode, currency: row.currency,
          status: row.status, external_id: row.external_id, total: Number(row.total), po_number: poNumber,
        },
        lines: lineRows.map((l) => {
          const comp = l.component_id ? components.get(l.component_id) : undefined;
          const receiptId = l.delivery_receipt_line_id ? receiptOfLine.get(l.delivery_receipt_line_id) : undefined;
          return {
            kind: l.kind, description: l.description, quantity: Number(l.quantity), unit_amount: Number(l.unit_amount),
            account_code: l.account_code, tax_type: l.tax_type,
            component_name: comp?.name ?? null, component_sku: comp?.sku ?? null,
            receipt_ref: receiptId ? (referenceOfReceipt.get(receiptId) ?? null) : null,
          };
        }),
      };
    },
    async contactLink(tenantId, supplierId) {
      const { data, error } = await db.from("accounting_contact_link").select("external_contact_id").eq("tenant_id", tenantId).eq("provider", "xero").eq("supplier_id", supplierId).maybeSingle();
      assertNoError(error, "load accounting_contact_link");
      return (data as { external_contact_id: string } | null)?.external_contact_id ?? null;
    },
    async recordBill(invoiceId, xeroId, url, xeroTotal) {
      const { error } = await db
        .from("supplier_invoice")
        .update({ sync_status: "sent", external_id: xeroId, external_url: url, ...(xeroTotal !== null ? { total: xeroTotal } : {}), updated_at: new Date().toISOString() })
        .eq("id", invoiceId);
      assertNoError(error, "record Xero bill");
    },
    async loadInvoiceExternal(invoiceId, tenantId) {
      const { data, error } = await db.from("supplier_invoice").select("external_id, supplier_id, invoice_number").eq("tenant_id", tenantId).eq("id", invoiceId).maybeSingle();
      assertNoError(error, "load supplier_invoice external_id");
      return (data as { external_id: string | null; supplier_id: string; invoice_number: string } | null) ?? null;
    },
    async billIdsLinkedElsewhere(tenantId, xeroIds, exceptInvoiceId) {
      if (!xeroIds.length) return [];
      const { data, error } = await db
        .from("supplier_invoice")
        .select("external_id")
        .eq("tenant_id", tenantId)
        .in("external_id", xeroIds)
        .neq("id", exceptInvoiceId);
      assertNoError(error, "load supplier_invoice bills held by other invoices");
      return uniq(((data ?? []) as Array<{ external_id: string | null }>).map((r) => r.external_id));
    },
    async markVoidedInXero(invoiceId, tenantId) {
      const { error } = await db.from("supplier_invoice").update({ sync_status: "voided_in_xero", updated_at: new Date().toISOString() }).eq("tenant_id", tenantId).eq("id", invoiceId);
      assertNoError(error, "mark supplier_invoice voided_in_xero");
    },
    async loadSupplier(tenantId, supplierId) {
      // The `suppliers` table, not the active-only `supplier` view: a supplier archived after posting must still sync.
      const { data, error } = await db.from("suppliers").select("name, contact_email, contact_phone, address").eq("tenant_id", tenantId).eq("id", supplierId).maybeSingle();
      assertNoError(error, "load suppliers");
      return (data as SupplierRow | null) ?? null;
    },
    async saveContactLink(tenantId, supplierId, contactId, name) {
      const { error } = await db
        .from("accounting_contact_link")
        .upsert({ tenant_id: tenantId, provider: "xero", supplier_id: supplierId, external_contact_id: contactId, external_name: name, linked_at: new Date().toISOString() }, { onConflict: "tenant_id,provider,supplier_id" });
      assertNoError(error, "save accounting_contact_link");
    },
  };
}
