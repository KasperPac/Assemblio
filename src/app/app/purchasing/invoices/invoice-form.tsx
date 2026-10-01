"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { dueDateFromTerms } from "@/lib/accounting/supplier-invoice/terms";
import { invoiceTotals, lineAmounts, lineVariance, totalMismatch, type AmountsMode } from "@/lib/accounting/supplier-invoice/calc";
import type { DraftLine } from "@/lib/accounting/supplier-invoice/draft";
import { postSupplierInvoice, saveSupplierInvoiceDraft } from "./actions";
import SupplierLink from "./supplier-link";
import styles from "./invoices.module.css";

export type ReceiptLineOption = { id: string; componentId: string; name: string; sku: string | null; received: number; cost: number; poUnitCost: number | null; taken: boolean };
export type ReceiptOption = { id: string; label: string; lines: ReceiptLineOption[] };
export type TaxOption = { taxType: string | null; name: string; rate: number };
export type AccountOption = { code: string; name: string };
export type XeroDefaults = {
  inventoryAccountCode: string; otherChargesAccountCode: string; purchaseTaxType: string;
  defaultAmountsMode: AmountsMode; contactName: string | null;
};
export type DraftInit = { id: string; invoiceNumber: string; invoiceDate: string; dueDate: string; amountsMode: AmountsMode; enteredTotal: number | null; lines: DraftLine[] };

type Props = {
  supplier: { id: string; name: string; paymentTerms: string | null; currency: string | null };
  purchaseOrderId: string | null;
  receipts: ReceiptOption[];
  preselectedReceiptIds: string[];
  currency: string;
  taxOptions: TaxOption[];
  accountOptions: AccountOption[];
  xeroLoadError: boolean;
  xero: XeroDefaults | null;
  draft: DraftInit | null;
};

type Row = DraftLine & { key: string };
const taxKey = (t: { taxType: string | null; rate: number }) => t.taxType ?? `rate:${t.rate}`;
const today = () => new Date().toLocaleDateString("en-CA"); // local date: the UTC date is yesterday before ~10am in AU
const strip = ({ key, ...line }: Row): DraftLine => { void key; return line; };

export default function InvoiceForm(p: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [draftId, setDraftId] = useState<string | null>(p.draft?.id ?? null);
  const [invoiceNumber, setInvoiceNumber] = useState(p.draft?.invoiceNumber ?? "");
  const [invoiceDate, setInvoiceDate] = useState(p.draft?.invoiceDate ?? today());
  const [dueDate, setDueDate] = useState(p.draft?.dueDate ?? dueDateFromTerms(today(), p.supplier.paymentTerms));
  const [dueTouched, setDueTouched] = useState(!!p.draft);
  const [mode, setMode] = useState<AmountsMode>(p.draft?.amountsMode ?? p.xero?.defaultAmountsMode ?? "exclusive");
  const [enteredTotal, setEnteredTotal] = useState(p.draft?.enteredTotal?.toString() ?? "");
  const [updateCosts, setUpdateCosts] = useState(true);
  const [createContact, setCreateContact] = useState(false);
  const [contactName, setContactName] = useState<string | null>(p.xero?.contactName ?? null);

  const money = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: p.currency }).format(n);
  const defaultTax = p.taxOptions.find((t) => t.taxType === p.xero?.purchaseTaxType) ?? p.taxOptions[0];
  const receiptLines = useMemo(() => new Map(p.receipts.flatMap((r) => r.lines.map((l) => [l.id, l] as const))), [p.receipts]);

  const stockRowsFor = (receiptId: string): Row[] =>
    (p.receipts.find((r) => r.id === receiptId)?.lines ?? [])
      .filter((l) => !l.taken)
      .map((l) => ({
        key: l.id, kind: "stock", deliveryReceiptLineId: l.id, componentId: l.componentId,
        description: l.sku ? `${l.sku} ${l.name}` : l.name, quantity: l.received, unitAmount: l.cost,
        taxType: defaultTax?.taxType ?? null, taxRatePercent: defaultTax?.rate ?? 0, accountCode: p.xero?.inventoryAccountCode ?? null,
      }));

  const [selected, setSelected] = useState<Set<string>>(() => {
    if (!p.draft) return new Set(p.preselectedReceiptIds);
    const ids = new Set(p.draft.lines.map((l) => l.deliveryReceiptLineId).filter(Boolean));
    return new Set(p.receipts.filter((r) => r.lines.some((l) => ids.has(l.id))).map((r) => r.id));
  });
  const [rows, setRows] = useState<Row[]>(() =>
    p.draft
      ? p.draft.lines.map((l, i) => ({ ...l, key: l.deliveryReceiptLineId ?? `other-${i}` }))
      : p.preselectedReceiptIds.flatMap(stockRowsFor)
  );

  function toggleReceipt(id: string) {
    const next = new Set(selected);
    if (next.has(id)) {
      next.delete(id);
      const ids = new Set(p.receipts.find((r) => r.id === id)?.lines.map((l) => l.id));
      setRows((rs) => rs.filter((r) => !r.deliveryReceiptLineId || !ids.has(r.deliveryReceiptLineId)));
    } else {
      next.add(id);
      setRows((rs) => [...rs, ...stockRowsFor(id)]);
    }
    setSelected(next);
  }
  const update = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addOther = () =>
    setRows((rs) => [
      ...rs,
      {
        key: `other-${rs.length}-${invoiceNumber.length}-${Math.random().toString(36).slice(2, 8)}`,
        kind: "other", deliveryReceiptLineId: null, componentId: null, description: "Freight", quantity: 1, unitAmount: 0,
        taxType: defaultTax?.taxType ?? null, taxRatePercent: defaultTax?.rate ?? 0, accountCode: p.xero?.otherChargesAccountCode ?? null,
      },
    ]);

  const computed = rows.map((row) => ({ row, ...lineAmounts({ quantity: row.quantity, unitAmount: row.unitAmount, taxRatePercent: row.taxRatePercent }, mode) }));
  const totals = invoiceTotals(computed, mode);
  const printed = enteredTotal.trim() === "" || Number.isNaN(Number(enteredTotal)) ? null : Number(enteredTotal);
  const mismatch = totalMismatch(totals.total, printed);

  function save(thenPost: boolean) {
    setMessage(null);
    start(async () => {
      const saved = await saveSupplierInvoiceDraft({
        id: draftId, supplierId: p.supplier.id, purchaseOrderId: p.purchaseOrderId, invoiceNumber, invoiceDate, dueDate,
        amountsMode: mode, enteredTotal: printed, currency: p.currency, lines: rows.map(strip),
      });
      if (!saved.ok) return setMessage({ text: saved.message, ok: false });
      setDraftId(saved.id);
      if (!thenPost) {
        router.replace(`/app/purchasing/invoices/new?draft=${saved.id}`);
        return setMessage({ text: "Draft saved.", ok: true });
      }
      const posted = await postSupplierInvoice(saved.id, { updateComponentCosts: updateCosts, createContact });
      if (!posted.ok) {
        router.replace(`/app/purchasing/invoices/new?draft=${saved.id}`);
        return setMessage({ text: posted.message, ok: false });
      }
      router.push(`/app/purchasing/invoices/${saved.id}`);
    });
  }

  return (
    <>
      <div className={styles.formCard}>
        <div className={styles.fields}>
          <div className={styles.field}><span className={styles.caps}>Supplier</span><span>{p.supplier.name}</span></div>
          <label className={styles.field}>
            <span className={styles.caps}>Supplier invoice number</span>
            <input className={styles.input} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} required />
          </label>
          <label className={styles.field}>
            <span className={styles.caps}>Invoice date</span>
            <input type="date" className={styles.input} value={invoiceDate} required onChange={(e) => {
              setInvoiceDate(e.target.value);
              if (!dueTouched && e.target.value) setDueDate(dueDateFromTerms(e.target.value, p.supplier.paymentTerms));
            }} />
          </label>
          <label className={styles.field}>
            <span className={styles.caps}>Due date</span>
            <input type="date" className={styles.input} value={dueDate} required onChange={(e) => { setDueDate(e.target.value); setDueTouched(true); }} />
          </label>
          <label className={styles.field}>
            <span className={styles.caps}>Amounts are</span>
            <select className={styles.select} value={mode} onChange={(e) => setMode(e.target.value as AmountsMode)}>
              <option value="exclusive">Excluding GST</option>
              <option value="inclusive">Including GST</option>
            </select>
          </label>
          <label className={styles.field}>
            <span className={styles.caps}>Total printed on the invoice</span>
            <input inputMode="decimal" className={styles.input} value={enteredTotal} onChange={(e) => setEnteredTotal(e.target.value)} placeholder="Optional cross-check" />
          </label>
        </div>
        {p.xero ? (
          <SupplierLink supplierId={p.supplier.id} supplierName={p.supplier.name} linkedName={contactName} onLinked={(n) => { setContactName(n); setCreateContact(false); }} />
        ) : null}
        {p.xero && !contactName ? (
          <label className={styles.help}>
            <input type="checkbox" checked={createContact} onChange={(e) => setCreateContact(e.target.checked)} />
            Create {p.supplier.name} as a new contact in Xero when posting
          </label>
        ) : null}
        {p.supplier.currency && p.supplier.currency !== p.currency ? (
          <p className={styles.mismatch}>This supplier is set to {p.supplier.currency}. The bill will post in {p.currency}; multi-currency isn&apos;t supported yet.</p>
        ) : null}
        {p.xeroLoadError ? <p className={styles.error}>Couldn&apos;t load tax rates and accounts from Xero. You can save a draft and post once Xero responds.</p> : null}
      </div>

      <div className={styles.formCard}>
        <span className={styles.caps}>Receipts from {p.supplier.name}</span>
        {p.receipts.length === 0 ? (
          <p className={styles.help}>No supplier deliveries recorded for this supplier yet.</p>
        ) : (
          p.receipts.map((r) => {
            const open = r.lines.filter((l) => !l.taken).length;
            return (
              <label key={r.id} className={styles.receiptRow}>
                <input type="checkbox" checked={selected.has(r.id)} disabled={open === 0 && !selected.has(r.id)} onChange={() => toggleReceipt(r.id)} />
                <span>{r.label}</span>
                <span className={styles.help}>{open === 0 ? "Fully invoiced" : `${open} line${open === 1 ? "" : "s"} to invoice`}</span>
              </label>
            );
          })
        )}
      </div>

      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Description</th><th className={styles.num}>Qty</th><th className={styles.num}>Unit price</th><th>Tax</th>
              {p.accountOptions.length ? <th>Account</th> : null}
              <th className={styles.num}>Amount</th><th className={styles.num}>Qty vs received</th><th className={styles.num}>Price vs PO</th><th />
            </tr>
          </thead>
          <tbody>
            {computed.map(({ row, lineAmount, exTaxUnitAmount }) => {
              const src = row.deliveryReceiptLineId ? receiptLines.get(row.deliveryReceiptLineId) : undefined;
              const v = src ? lineVariance({ quantity: row.quantity, exTaxUnitAmount, receivedQty: src.received, poUnitCost: src.poUnitCost }) : null;
              return (
                <tr key={row.key}>
                  <td><input className={styles.input} value={row.description} onChange={(e) => update(row.key, { description: e.target.value })} aria-label="Description" /></td>
                  <td className={styles.num}><input type="number" step="0.0001" min="0" className={styles.input} value={row.quantity} onChange={(e) => update(row.key, { quantity: Number(e.target.value) })} aria-label="Quantity" /></td>
                  <td className={styles.num}><input type="number" step="0.0001" min="0" className={styles.input} value={row.unitAmount} onChange={(e) => update(row.key, { unitAmount: Number(e.target.value) })} aria-label="Unit price" /></td>
                  <td>
                    <select className={styles.select} value={taxKey({ taxType: row.taxType, rate: row.taxRatePercent })} aria-label="Tax rate"
                      onChange={(e) => { const t = p.taxOptions.find((o) => taxKey(o) === e.target.value); if (t) update(row.key, { taxType: t.taxType, taxRatePercent: t.rate }); }}>
                      {p.taxOptions.map((t) => <option key={taxKey(t)} value={taxKey(t)}>{t.name}</option>)}
                    </select>
                  </td>
                  {p.accountOptions.length ? (
                    <td>
                      <select className={styles.select} value={row.accountCode ?? ""} aria-label="Account" onChange={(e) => update(row.key, { accountCode: e.target.value || null })}>
                        <option value="">Not set</option>
                        {p.accountOptions.map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
                      </select>
                    </td>
                  ) : null}
                  <td className={styles.num}>{money(lineAmount)}</td>
                  <td className={`${styles.num} ${v && v.qtyVariance !== 0 ? styles.variance : ""}`}>{v ? (v.qtyVariance === 0 ? "—" : v.qtyVariance > 0 ? `+${v.qtyVariance}` : v.qtyVariance) : ""}</td>
                  <td className={`${styles.num} ${v?.priceVariance ? styles.variance : ""}`}>{v ? (v.priceVariance ? money(v.priceVariance) : "—") : ""}</td>
                  <td>{row.kind === "other" ? <button type="button" className={styles.secondaryBtn} onClick={() => setRows((rs) => rs.filter((x) => x.key !== row.key))}>Remove</button> : null}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={styles.formCard}>
        <div className={styles.actions}>
          <button type="button" className={styles.secondaryBtn} onClick={addOther}>Add freight or other charge</button>
        </div>
        <div className={styles.totals}>
          <span>Subtotal {money(totals.subtotal)}</span>
          <span>GST {money(totals.taxTotal)}</span>
          <strong>Total {money(totals.total)}</strong>
          {mismatch && printed !== null ? (
            <span className={styles.mismatch}>Differs from the printed total ({money(printed)}) by {money(Math.abs(totals.total - printed))}.</span>
          ) : null}
        </div>
        <label className={styles.help}>
          <input type="checkbox" checked={updateCosts} onChange={(e) => setUpdateCosts(e.target.checked)} />
          Update component costs to the invoiced price
        </label>
        {message ? <p className={message.ok ? styles.help : styles.error} role="status">{message.text}</p> : null}
        <div className={styles.actions}>
          <button type="button" className={styles.secondaryBtn} disabled={pending} onClick={() => save(false)}>Save draft</button>
          <button type="button" className={styles.primaryBtn} disabled={pending || rows.length === 0} onClick={() => save(true)}>
            {pending ? "Working…" : "Post invoice"}
          </button>
        </div>
      </div>
    </>
  );
}
