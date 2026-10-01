import { redirect } from "next/navigation";
import Link from "next/link";
import { getServerTenantContext } from "@/lib/tenant/context";
import { isAdminRole, isReadOnlyRole } from "@/lib/tenant/authz";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { FALLBACK_TAX_OPTIONS, isInvoiceableReceipt, type AmountsMode } from "@/lib/accounting/supplier-invoice/calc";
import type { DraftLine } from "@/lib/accounting/supplier-invoice/draft";
import { isXeroPilotTenant } from "@/lib/accounting/xero/config";
import { supabaseConnectionRepo } from "@/lib/accounting/connection";
import { xeroAccessFor } from "@/lib/accounting/xero/access";
import { accountOptions, fetchAccounts, fetchTaxRates, INVENTORY_ACCOUNT_TYPES, OTHER_CHARGE_ACCOUNT_TYPES, purchaseTaxOptions } from "@/lib/accounting/xero/org";
import { storedAccountOptions, storedTaxOptions } from "@/lib/accounting/xero/setup";
import { chunk, isUuid, one } from "@/lib/accounting/supplier-invoice/util";
import PageHeader from "../../../_ui/page-header";
import EmptyState from "../../../_ui/empty-state";
import InvoiceForm, { type AccountOption, type ReceiptOption, type TaxOption } from "../invoice-form";
import LoadFailed from "../load-failed";
import styles from "../invoices.module.css";

type Props = { searchParams?: Promise<{ po?: string; receipt?: string; draft?: string }> };
const uuidOrNull = (v: string | undefined) => (isUuid(v) ? v : null);

export default async function NewSupplierInvoicePage({ searchParams }: Props) {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/app/auth/login");
  if (!ctx.tenantId) redirect("/app");
  const sp = (await searchParams) ?? {};
  const { supabase, tenantId } = ctx;
  const draftParam = uuidOrNull(sp.draft);
  const receiptParam = uuidOrNull(sp.receipt);
  const poParam = uuidOrNull(sp.po);

  if (isReadOnlyRole(ctx.role)) {
    return (
      <section className={styles.page}>
        <PageHeader eyebrow="Operations" breadcrumbs={[{ label: "Supplier invoices", href: "/app/purchasing/invoices" }, { label: "New" }]} title="Enter supplier invoice" />
        <EmptyState title="Read-only access" message="Your role can view supplier invoices but not enter or edit them." />
      </section>
    );
  }
  const loadFailed = (what: string, error: { message?: string }) => (
    <LoadFailed title="Enter supplier invoice" crumb="New" what={what} error={error} />
  );

  type DraftRow = {
    id: string; supplier_id: string; purchase_order_id: string | null; invoice_number: string; invoice_date: string; due_date: string;
    amounts_mode: AmountsMode; entered_total: number | null; status: string;
    supplier_invoice_line: Array<{ line_no: number; kind: "stock" | "other"; delivery_receipt_line_id: string | null; component_id: string | null; description: string; quantity: number; unit_amount: number; tax_type: string | null; tax_rate: number; account_code: string | null }>;
  };
  let draft: DraftRow | null = null;
  if (draftParam) {
    const { data, error } = await supabase
      .from("supplier_invoice")
      .select("id, supplier_id, purchase_order_id, invoice_number, invoice_date, due_date, amounts_mode, entered_total, status, supplier_invoice_line(line_no, kind, delivery_receipt_line_id, component_id, description, quantity, unit_amount, tax_type, tax_rate, account_code)")
      .eq("id", draftParam)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) return loadFailed("the draft invoice", error);
    if (!data) redirect("/app/purchasing/invoices");
    if ((data as DraftRow).status !== "draft") redirect(`/app/purchasing/invoices/${draftParam}`);
    draft = data as DraftRow;
  }

  let supplierId = draft?.supplier_id ?? null;
  let poId = draft?.purchase_order_id ?? poParam;
  const preselect: string[] = [];
  let startedFromReceipt = false;
  if (!supplierId && receiptParam) {
    const { data, error } = await supabase
      .from("delivery_receipt")
      .select("id, supplier_id, purchase_order_id, stock_in_reason")
      .eq("id", receiptParam)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (error) return loadFailed("the goods receipt", error);
    const r = data as { id: string; supplier_id: string | null; purchase_order_id: string | null; stock_in_reason: string | null } | null;
    if (r && r.supplier_id && isInvoiceableReceipt(r, r.supplier_id)) {
      supplierId = r.supplier_id;
      poId = poId ?? r.purchase_order_id;
      preselect.push(r.id);
      startedFromReceipt = true;
    }
  }
  if (!supplierId && poParam) {
    const { data, error } = await supabase.from("purchase_order").select("supplier_id").eq("id", poParam).eq("tenant_id", tenantId).maybeSingle();
    if (error) return loadFailed("the purchase order", error);
    supplierId = (data as { supplier_id: string } | null)?.supplier_id ?? null;
  }

  const header = (
    <PageHeader
      eyebrow="Operations"
      breadcrumbs={[{ label: "Supplier invoices", href: "/app/purchasing/invoices" }, { label: draft ? draft.invoice_number : "New" }]}
      title={draft ? `Edit draft ${draft.invoice_number}` : "Enter supplier invoice"}
      description="Record the supplier's tax invoice against what was received."
    />
  );
  if (!supplierId) {
    return (
      <section className={styles.page}>
        {header}
        <EmptyState title="Start from a purchase order or goods receipt" message="Open a PO or a supplier delivery and choose “Enter supplier invoice”." />
      </section>
    );
  }

  // `suppliers` (the table), not the active-only `supplier` view: an archived supplier must still show on its existing draft or receipts.
  const [supplierRes, receiptRes, connRes, linkRes, tenantRes] = await Promise.all([
    supabase.from("suppliers").select("id, name, payment_terms, default_currency").eq("id", supplierId).eq("tenant_id", tenantId).maybeSingle(),
    supabase
      .from("delivery_receipt")
      .select("id, supplier_reference, received_at, purchase_order_id, purchase_order:purchase_order_id(po_number), delivery_receipt_line(id, component_id, quantity_delivered, cost_per_unit, component:component_id(name, sku), purchase_order_line:purchase_order_line_id(unit_cost))")
      .eq("tenant_id", tenantId)
      .eq("supplier_id", supplierId)
      .eq("stock_in_reason", "supplier_delivery")
      .order("received_at", { ascending: false })
      .limit(50),
    supabase
      .from("accounting_connection")
      .select("status, setup_completed_at, base_currency, inventory_account_code, other_charges_account_code, purchase_tax_type, purchase_tax_rate, gst_free_tax_type, gst_free_tax_rate, default_amounts_mode")
      .eq("tenant_id", tenantId)
      .eq("provider", "xero")
      .maybeSingle(),
    supabase.from("accounting_contact_link").select("external_name").eq("tenant_id", tenantId).eq("provider", "xero").eq("supplier_id", supplierId).maybeSingle(),
    supabase.from("tenant").select("currency").eq("id", tenantId).maybeSingle(),
  ]);
  if (supplierRes.error) return loadFailed("the supplier", supplierRes.error);
  if (receiptRes.error) return loadFailed("the supplier's receipts", receiptRes.error);
  if (connRes.error) return loadFailed("the accounting connection", connRes.error);
  if (linkRes.error) return loadFailed("the Xero contact link", linkRes.error);
  if (tenantRes.error) return loadFailed("the workspace settings", tenantRes.error);
  const { data: supplier } = supplierRes;
  if (!supplier) redirect("/app/purchasing/invoices");

  type RLine = { id: string; component_id: string; quantity_delivered: number; cost_per_unit: number | null; component: unknown; purchase_order_line: unknown };
  type RRow = { id: string; supplier_reference: string | null; received_at: string | null; purchase_order_id: string | null; purchase_order: unknown; delivery_receipt_line: RLine[] };
  const rows = (receiptRes.data ?? []) as unknown as RRow[];
  // Preselect PO-wide only when the user started from the PO; starting from a receipt preselects just that receipt.
  if (!startedFromReceipt && !draft && poParam) for (const r of rows) if (r.purchase_order_id === poParam && !preselect.includes(r.id)) preselect.push(r.id);

  // A receipt line already on another live (non-voided) invoice, draft or posted, is not offered (spec 3.4).
  // Lines on the draft being edited stay offered. The post-time SQL guard still covers races.
  const lineIds = rows.flatMap((r) => r.delivery_receipt_line.map((l) => l.id));
  const takenRows: unknown[] = [];
  // Chunked: a supplier with many receipt lines would otherwise overflow the request URL. 100 uuids keep the
  // request line under 8 KB; 200 can exceed it.
  for (const ids of chunk(lineIds, 100)) {
    const { data, error } = await supabase
      .from("supplier_invoice_line")
      .select("delivery_receipt_line_id, supplier_invoice:supplier_invoice_id(id, status)")
      .in("delivery_receipt_line_id", ids);
    if (error) return loadFailed("which receipt lines are already invoiced", error);
    takenRows.push(...(data ?? []));
  }
  const takenSet = new Set(
    (takenRows as Array<{ delivery_receipt_line_id: string; supplier_invoice: unknown }>)
      .filter((t) => {
        const si = one(t.supplier_invoice as { id: string; status: string } | null);
        return !!si && si.status !== "voided" && si.id !== draft?.id;
      })
      .map((t) => t.delivery_receipt_line_id)
  );

  const receipts: ReceiptOption[] = rows.map((r) => ({
    id: r.id,
    label: [r.supplier_reference ?? "Receipt", one(r.purchase_order as { po_number: string | null } | null)?.po_number, r.received_at?.slice(0, 10)].filter(Boolean).join(" · "),
    lines: r.delivery_receipt_line.map((l) => {
      const c = one(l.component as { name: string; sku: string | null } | null);
      const poCost = one(l.purchase_order_line as { unit_cost: number | null } | null)?.unit_cost;
      return {
        id: l.id, componentId: l.component_id, name: c?.name ?? "Component", sku: c?.sku ?? null,
        received: Number(l.quantity_delivered), cost: Number(l.cost_per_unit ?? 0),
        poUnitCost: poCost === null || poCost === undefined ? null : Number(poCost),
        taken: takenSet.has(l.id),
      };
    }),
  }));

  const c = connRes.data as {
    status: string; setup_completed_at: string | null; base_currency: string; inventory_account_code: string; other_charges_account_code: string;
    purchase_tax_type: string; purchase_tax_rate: number | string | null; gst_free_tax_type: string; gst_free_tax_rate: number | string | null;
    default_amounts_mode: AmountsMode;
  } | null;
  // Set up and not disconnected: post_supplier_invoice queues bills for this connection (it ignores a
  // disconnected one), so every line needs Xero codes, whether or not Xero can be read right now.
  const setUp = !!c && c.status !== "disconnected" && !!c.setup_completed_at;
  const canReadXero = setUp && c?.status === "connected" && isXeroPilotTenant(tenantId);
  let taxOptions: TaxOption[] = FALLBACK_TAX_OPTIONS.map((t) => ({ ...t }));
  let accounts: AccountOption[] = [];
  let xeroLive = false;
  let readFailed = false;
  if (canReadXero) {
    try {
      const db = createSupabaseAdminClient();
      const full = await supabaseConnectionRepo(db).findByTenant(tenantId);
      if (!full) throw new Error("connection not found");
      const access = await xeroAccessFor(db, full);
      const [t, a] = await Promise.all([fetchTaxRates(access), fetchAccounts(access)]);
      if (t.ok && a.ok) {
        taxOptions = purchaseTaxOptions(t.data.TaxRates ?? []);
        accounts = [...accountOptions(a.data.Accounts ?? [], INVENTORY_ACCOUNT_TYPES), ...accountOptions(a.data.Accounts ?? [], OTHER_CHARGE_ACCOUNT_TYPES)].map((x) => ({ code: x.code, name: x.name }));
        xeroLive = true;
      } else readFailed = true;
    } catch (err) {
      console.error("[xero] new invoice page: couldn't load tax rates and accounts", err instanceof Error ? err.message : "unknown error");
      readFailed = true;
    }
  }
  // Live reads unavailable (needs reconnect, not a pilot tenant, or the read failed): use the stored setup, so
  // posting still queues the bill and it waits for Xero (spec 7). With no set-up connection, keep the fallback.
  let storedOk = false;
  if (setUp && c && !xeroLive) {
    const stored = storedTaxOptions(c);
    if (stored.length) {
      taxOptions = stored;
      accounts = storedAccountOptions(c);
      storedOk = true;
    }
  }
  const xeroDefaults = setUp && (xeroLive || storedOk);
  let xeroNotice: { text: string; error: boolean } | null = null;
  if (readFailed) {
    xeroNotice = storedOk
      ? { text: "Couldn't load tax rates and accounts from Xero, so the ones chosen in Xero setup are offered. Posting still works.", error: true }
      : { text: "Couldn't load tax rates and accounts from Xero. You can save a draft and post once Xero responds.", error: true };
  } else if (storedOk && c?.status === "needs_reconnect") {
    xeroNotice = { text: "Xero needs reconnecting. You can still post: the bill waits and is sent once an admin reconnects Xero.", error: false };
  }

  const s = supplier as { id: string; name: string | null; payment_terms: string | null; default_currency: string | null };
  return (
    <section className={styles.page}>
      {header}
      <InvoiceForm
        supplier={{ id: s.id, name: s.name ?? "Supplier", paymentTerms: s.payment_terms, currency: s.default_currency }}
        purchaseOrderId={poId}
        receipts={receipts}
        preselectedReceiptIds={preselect}
        currency={c?.base_currency ?? (tenantRes.data as { currency: string | null } | null)?.currency ?? "AUD"}
        taxOptions={taxOptions}
        accountOptions={accounts}
        xeroNotice={xeroNotice}
        xeroLive={xeroLive}
        canCreateContact={isAdminRole(ctx.role)}
        xero={xeroDefaults && c ? {
          inventoryAccountCode: c.inventory_account_code, otherChargesAccountCode: c.other_charges_account_code,
          purchaseTaxType: c.purchase_tax_type, defaultAmountsMode: c.default_amounts_mode,
          contactName: (linkRes.data as { external_name: string } | null)?.external_name ?? null,
        } : null}
        draft={draft ? {
          id: draft.id, invoiceNumber: draft.invoice_number, invoiceDate: draft.invoice_date, dueDate: draft.due_date,
          amountsMode: draft.amounts_mode, enteredTotal: draft.entered_total === null ? null : Number(draft.entered_total),
          lines: [...draft.supplier_invoice_line].sort((a, b) => a.line_no - b.line_no).map((l): DraftLine => ({
            kind: l.kind, deliveryReceiptLineId: l.delivery_receipt_line_id, componentId: l.component_id, description: l.description,
            quantity: Number(l.quantity), unitAmount: Number(l.unit_amount), taxType: l.tax_type, taxRatePercent: Number(l.tax_rate), accountCode: l.account_code,
          })),
        } : null}
      />
      <Link href="/app/purchasing/invoices" className={styles.backLink}>← Back to supplier invoices</Link>
    </section>
  );
}
