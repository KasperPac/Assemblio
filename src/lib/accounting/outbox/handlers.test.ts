// src/lib/accounting/outbox/handlers.test.ts
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createOrgCache, handleCreateBill, handleCreateContact, handleVoidBill, supabaseHandlerStore, type BillSource, type HandlerStore, type OutboxJob } from "./handlers";

const access = { accessToken: "tok", xeroTenantId: "org-1" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

type Route = { method: string; path: RegExp; respond: (body: unknown) => Response };
function fakeXero(routes: Route[]) {
  const calls: Array<{ method: string; url: string; body: unknown }> = [];
  const f = vi.fn(async (url: string, init: RequestInit) => {
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });
    const r = routes.find((x) => x.method === method && x.path.test(url));
    if (!r) throw new Error(`unexpected ${method} ${url}`);
    return r.respond(body);
  }) as unknown as typeof fetch;
  return { f, calls };
}

const ORG = { method: "GET", path: /\/Organisation$/, respond: () => json({ Organisations: [{ Name: "Acme Pty", BaseCurrency: "AUD", PeriodLockDate: "/Date(1782777600000+0000)/" }] }) };
const ACCOUNTS = { method: "GET", path: /\/Accounts\?/, respond: () => json({ Accounts: [{ AccountID: "a", Code: "630", Name: "Inv", Type: "CURRENT", Status: "ACTIVE" }, { AccountID: "b", Code: "425", Name: "Freight", Type: "EXPENSE", Status: "ACTIVE" }] }) };
const TAX = { method: "GET", path: /\/TaxRates\?/, respond: () => json({ TaxRates: [{ TaxType: "INPUT", Name: "GST", Status: "ACTIVE", CanApplyToExpenses: true, EffectiveRate: 10 }] }) };

const source = (patch: Partial<BillSource["invoice"]> = {}): BillSource => ({
  invoice: { id: "inv-1", tenant_id: "t1", supplier_id: "s1", invoice_number: "INV-9", invoice_date: "2026-10-02", due_date: "2026-11-01", amounts_mode: "exclusive", currency: "AUD", status: "posted", total: 33, external_id: null, po_number: "PO-12", ...patch },
  lines: [
    { kind: "stock", description: "Bolt", quantity: 10, unit_amount: 2, account_code: "630", tax_type: "INPUT", component_name: "Bolt", component_sku: "B-1", receipt_ref: "DN-1" },
    { kind: "other", description: "Freight", quantity: 1, unit_amount: 10, account_code: "425", tax_type: "INPUT", component_name: null, component_sku: null, receipt_ref: null },
  ],
});

function memoryStore(src: BillSource | null, link: string | null = "contact-1") {
  const recorded: unknown[] = [];
  const store: HandlerStore = {
    loadBillSource: async () => src,
    contactLink: async () => link,
    recordBill: async (...args) => { recorded.push(args); },
    loadInvoiceExternal: async () => ({ external_id: "xero-inv-1" }),
    markVoidedInXero: async (id) => { recorded.push(["voided", id]); },
    loadSupplier: async () => ({ name: "Acme", contact_email: null, contact_phone: null, address: null }),
    saveContactLink: async (...args) => { recorded.push(["link", ...args]); },
  };
  return { store, recorded };
}

const job = (patch: Partial<OutboxJob> = {}): OutboxJob => ({
  id: "job-1", tenant_id: "t1", connection_id: "c1", operation: "create_bill", entity_type: "supplier_invoice", entity_id: "inv-1",
  attempts: 0, first_attempt_at: null, idempotency_key: "si-inv-1-create", external_id: null, depends_on: null, ...patch,
});

function ctxFor(f: typeof fetch, store: HandlerStore) {
  return { store, access, fetchImpl: f, cache: createOrgCache(access, f) };
}

describe("handleCreateBill", () => {
  it("creates a SUBMITTED bill with PO in the description and records it", async () => {
    const x = fakeXero([ORG, ACCOUNTS, TAX, { method: "POST", path: /\/Invoices\?unitdp=4&summarizeErrors=false$/, respond: () => json({ Invoices: [{ InvoiceID: "xero-inv-1", Status: "SUBMITTED", Total: 33 }] }) }]);
    const m = memoryStore(source());
    const out = await handleCreateBill(job(), ctxFor(x.f, m.store));
    expect(out).toEqual({ kind: "sent", externalId: "xero-inv-1" });
    const post = x.calls.find((c) => c.method === "POST")!;
    const bill = (post.body as { Invoices: Array<Record<string, unknown>> }).Invoices[0];
    expect(bill).toMatchObject({ Type: "ACCPAY", InvoiceNumber: "INV-9", Status: "SUBMITTED", CurrencyCode: "AUD", Contact: { ContactID: "contact-1" } });
    expect((bill.LineItems as Array<Record<string, unknown>>)[0].Description).toBe("B-1 Bolt · PO-12 · receipt DN-1");
    expect(m.recorded).toEqual([["inv-1", "xero-inv-1", "https://go.xero.com/AccountsPayable/View.aspx?InvoiceID=xero-inv-1", 33]]);
  });

  it("adopts an existing bill on a retry", async () => {
    const x = fakeXero([ORG, ACCOUNTS, TAX, { method: "GET", path: /\/Invoices\?where=/, respond: () => json({ Invoices: [{ InvoiceID: "xero-existing", Status: "AUTHORISED", Total: 33 }] }) }]);
    const m = memoryStore(source());
    const out = await handleCreateBill(job({ attempts: 1 }), ctxFor(x.f, m.store));
    expect(out).toEqual({ kind: "sent", externalId: "xero-existing", note: { adopted: true } });
    expect(x.calls.some((c) => c.method === "POST")).toBe(false);
    expect(m.recorded).toEqual([["inv-1", "xero-existing", "https://go.xero.com/AccountsPayable/View.aspx?InvoiceID=xero-existing", 33]]);
  });

  it("blocks a bill dated on or before the lock date", async () => {
    const x = fakeXero([ORG, ACCOUNTS, TAX]);
    const m = memoryStore(source({ invoice_date: "2026-06-30" }));
    const out = await handleCreateBill(job(), ctxFor(x.f, m.store));
    expect(out.kind).toBe("error");
    if (out.kind === "error") {
      expect(out.error.errorClass).toBe("fixable");
      expect(out.error.message).toMatch(/2026-06-30/);
    }
    expect(x.calls.some((c) => c.method === "POST")).toBe(false);
  });

  it.each([
    ["missing contact link", source(), null, /Link this supplier/],
    ["archived account", { ...source(), lines: [{ ...source().lines[0], account_code: "999" }] }, "contact-1", /Account 999/],
    ["currency mismatch", source({ currency: "NZD" }), "contact-1", /NZD/],
  ])("fails as fixable on %s", async (_n, src, link, re) => {
    const x = fakeXero([ORG, ACCOUNTS, TAX]);
    const m = memoryStore(src as BillSource, link as string | null);
    const out = await handleCreateBill(job(), ctxFor(x.f, m.store));
    expect(out.kind === "error" && out.error.errorClass).toBe("fixable");
    expect(out.kind === "error" && out.error.message).toMatch(re);
  });

  it("maps a 200 with HasErrors to a fixable catalogue message", async () => {
    const x = fakeXero([ORG, ACCOUNTS, TAX, { method: "POST", path: /\/Invoices/, respond: () => json({ Invoices: [{ HasErrors: true, ValidationErrors: [{ Message: "Invoice # must be unique." }] }] }) }]);
    const out = await handleCreateBill(job(), ctxFor(x.f, memoryStore(source()).store));
    expect(out.kind === "error" && out.error.message).toMatch(/already has a bill with this invoice number/);
  });

  it("is a no-op success when the invoice already has a Xero id", async () => {
    const x = fakeXero([]);
    const out = await handleCreateBill(job(), ctxFor(x.f, memoryStore(source({ external_id: "xero-inv-1" })).store));
    expect(out).toEqual({ kind: "sent", externalId: "xero-inv-1" });
  });
});

describe("handleVoidBill", () => {
  const voidJob = job({ operation: "void_bill", idempotency_key: "si-inv-1-void" });
  it("deletes a SUBMITTED bill", async () => {
    const x = fakeXero([
      { method: "GET", path: /\/Invoices\/xero-inv-1$/, respond: () => json({ Invoices: [{ InvoiceID: "xero-inv-1", Status: "SUBMITTED" }] }) },
      { method: "POST", path: /\/Invoices\/xero-inv-1$/, respond: () => json({ Invoices: [{ InvoiceID: "xero-inv-1", Status: "DELETED" }] }) },
    ]);
    const m = memoryStore(source());
    expect(await handleVoidBill(voidJob, ctxFor(x.f, m.store))).toEqual({ kind: "sent", externalId: "xero-inv-1" });
    expect((x.calls[1].body as { Invoices: Array<{ Status: string }> }).Invoices[0].Status).toBe("DELETED");
    expect(m.recorded).toContainEqual(["voided", "inv-1"]);
  });
  it("refuses a paid bill", async () => {
    const x = fakeXero([{ method: "GET", path: /\/Invoices\/xero-inv-1$/, respond: () => json({ Invoices: [{ InvoiceID: "xero-inv-1", Status: "PAID", AmountPaid: 33 }] }) }]);
    const out = await handleVoidBill(voidJob, ctxFor(x.f, memoryStore(source()).store));
    expect(out.kind === "error" && out.error.errorClass).toBe("fixable");
  });
});

describe("handleCreateContact", () => {
  const contactJob = job({ operation: "create_contact", entity_type: "supplier", entity_id: "s1", idempotency_key: "sup-s1-contact" });
  it("skips creation when a link already exists", async () => {
    const x = fakeXero([]);
    expect(await handleCreateContact(contactJob, ctxFor(x.f, memoryStore(null, "contact-9").store))).toEqual({ kind: "sent", externalId: "contact-9" });
  });
  it("creates the contact and saves the link", async () => {
    const x = fakeXero([{ method: "POST", path: /\/Contacts\?summarizeErrors=false$/, respond: () => json({ Contacts: [{ ContactID: "contact-new", Name: "Acme" }] }) }]);
    const m = memoryStore(null, null);
    expect(await handleCreateContact(contactJob, ctxFor(x.f, m.store))).toEqual({ kind: "sent", externalId: "contact-new" });
    expect(m.recorded).toContainEqual(["link", "t1", "s1", "contact-new", "Acme"]);
  });
});

describe("handleCreateBill: adoption and totals", () => {
  const POST_OK = (total: number) => ({ method: "POST", path: /\/Invoices\?unitdp=4&summarizeErrors=false$/, respond: () => json({ Invoices: [{ InvoiceID: "xero-new", Status: "SUBMITTED", Total: total }] }) });

  it("does not adopt a VOIDED or DELETED bill with the same number: it creates instead", async () => {
    const x = fakeXero([
      ORG, ACCOUNTS, TAX,
      { method: "GET", path: /\/Invoices\?where=/, respond: () => json({ Invoices: [{ InvoiceID: "old-voided", Status: "VOIDED", Total: 33 }, { InvoiceID: "old-deleted", Status: "DELETED", Total: 33 }] }) },
      POST_OK(33),
    ]);
    const m = memoryStore(source());
    const out = await handleCreateBill(job({ attempts: 1 }), ctxFor(x.f, m.store));
    expect(out).toEqual({ kind: "sent", externalId: "xero-new" });
    expect(x.calls.filter((c) => c.method === "POST")).toHaveLength(1);
    expect(m.recorded).toEqual([["inv-1", "xero-new", "https://go.xero.com/AccountsPayable/View.aspx?InvoiceID=xero-new", 33]]);
  });

  it("sends the Idempotency-Key and the exact create URL", async () => {
    const x = fakeXero([ORG, ACCOUNTS, TAX, POST_OK(33)]);
    await handleCreateBill(job(), ctxFor(x.f, memoryStore(source()).store));
    const call = (x.f as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock.calls.find((c) => c[1].method === "POST")!;
    expect(call[0]).toMatch(/\/Invoices\?unitdp=4&summarizeErrors=false$/);
    expect(new Headers(call[1].headers).get("Idempotency-Key")).toBe("si-inv-1-create");
  });

  it("stores Xero's total and reports the rounding difference when totals differ", async () => {
    const x = fakeXero([ORG, ACCOUNTS, TAX, POST_OK(33.01)]);
    const m = memoryStore(source());
    const out = await handleCreateBill(job(), ctxFor(x.f, m.store));
    expect(out).toEqual({ kind: "sent", externalId: "xero-new", note: { rounding: { manuva: 33, xero: 33.01 } } });
    expect(m.recorded).toEqual([["inv-1", "xero-new", "https://go.xero.com/AccountsPayable/View.aspx?InvoiceID=xero-new", 33.01]]);
  });
});

describe("handleCreateContact: duplicate name", () => {
  const contactJob = job({ operation: "create_contact", entity_type: "supplier", entity_id: "s1", idempotency_key: "sup-s1-contact" });
  const dupMsg = "The contact name Acme is already assigned to another contact. The contact name must be unique across all active contacts.";

  it.each([
    ["HTTP 400", () => json({ Elements: [{ ValidationErrors: [{ Message: dupMsg }] }] }, 400)],
    ["200 with HasErrors", () => json({ Contacts: [{ HasErrors: true, ValidationErrors: [{ Message: dupMsg }] }] })],
  ])("fails fixable and never links (%s)", async (_n, respond) => {
    const x = fakeXero([{ method: "POST", path: /\/Contacts\?summarizeErrors=false$/, respond }]);
    const m = memoryStore(null, null);
    const out = await handleCreateContact(contactJob, ctxFor(x.f, m.store));
    expect(out.kind === "error" && out.error.errorClass).toBe("fixable");
    expect(out.kind === "error" && out.error.message).toBe("A contact named Acme already exists in Xero — link to it instead.");
    expect(m.recorded).toEqual([]);
  });
});

type Result = { data: unknown; error: { message: string } | null };
function fakeDb(results: Record<string, Result>) {
  const log: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
  const db = {
    from(table: string) {
      const entry = { table, filters: [] as Array<[string, unknown]> };
      log.push(entry);
      const res = results[table] ?? { data: null, error: null };
      const b: Record<string, unknown> = {};
      for (const m of ["select", "order", "update", "upsert"]) b[m] = () => b;
      b.eq = (c: string, v: unknown) => { entry.filters.push([c, v]); return b; };
      b.in = (c: string, v: unknown) => { entry.filters.push([c, v]); return b; };
      b.neq = (c: string, v: unknown) => { entry.filters.push([`${c}!`, v]); return b; };
      b.maybeSingle = async () => res;
      b.then = (ok: (r: Result) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(res).then(ok, bad);
      return b;
    },
  };
  return { db: db as unknown as SupabaseClient, log };
}

describe("supabaseHandlerStore", () => {
  it("reads the suppliers table (not the active-only view), filtered by tenant", async () => {
    const f = fakeDb({ suppliers: { data: { name: "Acme", contact_email: null, contact_phone: null, address: null }, error: null } });
    expect((await supabaseHandlerStore(f.db).loadSupplier("t1", "s1"))?.name).toBe("Acme");
    expect(f.log[0]).toEqual({ table: "suppliers", filters: [["tenant_id", "t1"], ["id", "s1"]] });
  });

  it("throws when Supabase returns { data: null, error }", async () => {
    const f = fakeDb({ suppliers: { data: null, error: { message: "boom" } } });
    await expect(supabaseHandlerStore(f.db).loadSupplier("t1", "s1")).rejects.toThrow(/load suppliers: boom/);
    const g = fakeDb({ supplier_invoice: { data: null, error: { message: "denied" } } });
    await expect(supabaseHandlerStore(g.db).loadInvoiceExternal("inv-1", "t1")).rejects.toThrow(/denied/);
    await expect(supabaseHandlerStore(g.db).markVoidedInXero("inv-1", "t1")).rejects.toThrow(/denied/);
    await expect(supabaseHandlerStore(g.db).recordBill("inv-1", "x", "u", null)).rejects.toThrow(/denied/);
  });

  it("loadBillSource filters every read by tenant and assembles the source", async () => {
    const f = fakeDb({
      supplier_invoice: { data: { id: "inv-1", tenant_id: "t1", supplier_id: "s1", purchase_order_id: "po-1", invoice_number: "INV-9", invoice_date: "2026-10-02", due_date: "2026-11-01", amounts_mode: "exclusive", currency: "AUD", status: "posted", total: "33.00", external_id: null }, error: null },
      purchase_order: { data: { po_number: "PO-12" }, error: null },
      supplier_invoice_line: { data: [{ kind: "stock", description: "Bolt", quantity: "10", unit_amount: "2", account_code: "630", tax_type: "INPUT", component_id: "c1", delivery_receipt_line_id: "rl1" }], error: null },
      component: { data: [{ id: "c1", name: "Bolt", sku: "B-1" }], error: null },
      delivery_receipt_line: { data: [{ id: "rl1", delivery_receipt_id: "r1" }], error: null },
      delivery_receipt: { data: [{ id: "r1", supplier_reference: "DN-1" }], error: null },
    });
    const src = await supabaseHandlerStore(f.db).loadBillSource("inv-1", "t1");
    expect(src?.invoice).toMatchObject({ po_number: "PO-12", total: 33 });
    expect(src?.lines[0]).toMatchObject({ quantity: 10, unit_amount: 2, component_sku: "B-1", receipt_ref: "DN-1" });
    expect(f.log.map((l) => l.table)).toEqual(["supplier_invoice", "purchase_order", "supplier_invoice_line", "component", "delivery_receipt_line", "delivery_receipt"]);
    for (const l of f.log) expect(l.filters).toContainEqual(["tenant_id", "t1"]);
  });

  it("loadBillSource throws when a related read fails", async () => {
    const f = fakeDb({
      supplier_invoice: { data: { id: "inv-1", tenant_id: "t1", supplier_id: "s1", purchase_order_id: "po-1", total: 1 }, error: null },
      purchase_order: { data: null, error: { message: "po down" } },
    });
    await expect(supabaseHandlerStore(f.db).loadBillSource("inv-1", "t1")).rejects.toThrow(/load purchase_order: po down/);
  });
});

const keyOf = (f: typeof fetch, method: string) => {
  const call = (f as unknown as { mock: { calls: Array<[string, RequestInit]> } }).mock.calls.find((c) => c[1].method === method)!;
  return new Headers(call[1].headers).get("Idempotency-Key");
};
const SEARCH = (invoices: unknown[]) => ({ method: "GET", path: /\/Invoices\?where=/, respond: () => json({ Invoices: invoices }) });

describe("handleCreateBill: exactly-once hardening", () => {
  it("adoption records Xero's total and reports a difference", async () => {
    const x = fakeXero([ORG, ACCOUNTS, TAX, SEARCH([{ InvoiceID: "xero-existing", Status: "AUTHORISED", Total: 33.02 }])]);
    const m = memoryStore(source());
    const out = await handleCreateBill(job({ attempts: 1 }), ctxFor(x.f, m.store));
    expect(out).toEqual({ kind: "sent", externalId: "xero-existing", note: { adopted: true, rounding: { manuva: 33, xero: 33.02 } } });
    expect(m.recorded).toEqual([["inv-1", "xero-existing", "https://go.xero.com/AccountsPayable/View.aspx?InvoiceID=xero-existing", 33.02]]);
  });

  it("adopts on a retry even when a pre-check would now fail", async () => {
    const x = fakeXero([SEARCH([{ InvoiceID: "xero-existing", Status: "SUBMITTED", Total: 33 }])]);
    const m = memoryStore(source({ invoice_date: "2026-06-30" }));
    const out = await handleCreateBill(job({ attempts: 2 }), ctxFor(x.f, m.store));
    expect(out).toEqual({ kind: "sent", externalId: "xero-existing", note: { adopted: true } });
    expect(x.calls.map((c) => c.method)).toEqual(["GET"]);
  });

  it.each([
    ["503", () => json({ Message: "down" }, 503)],
    ["a thrown fetch", () => { throw new Error("socket hang up"); }],
    ["an empty 200", () => new Response("", { status: 200 })],
  ])("a failed duplicate search (%s) is transient and never creates", async (_n, respond) => {
    const x = fakeXero([ORG, ACCOUNTS, TAX, { method: "GET", path: /\/Invoices\?where=/, respond }, { method: "POST", path: /\/Invoices/, respond: () => json({ Invoices: [{ InvoiceID: "dup", Status: "SUBMITTED" }] }) }]);
    const out = await handleCreateBill(job({ attempts: 1 }), ctxFor(x.f, memoryStore(source()).store));
    expect(out.kind === "error" && out.error.errorClass).toBe("transient");
    expect(x.calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("a 2xx create with no invoice in the body is transient", async () => {
    const x = fakeXero([ORG, ACCOUNTS, TAX, { method: "POST", path: /\/Invoices/, respond: () => new Response("", { status: 200 }) }]);
    const m = memoryStore(source());
    const out = await handleCreateBill(job(), ctxFor(x.f, m.store));
    expect(out.kind === "error" && out.error.errorClass).toBe("transient");
    expect(m.recorded).toEqual([]);
  });

  it("fails fixable when the tax type is active but cannot apply to purchases", async () => {
    const salesOnly = { ...TAX, respond: () => json({ TaxRates: [{ TaxType: "INPUT", Name: "GST", Status: "ACTIVE", CanApplyToExpenses: false, EffectiveRate: 10 }] }) };
    const x = fakeXero([ORG, ACCOUNTS, salesOnly]);
    const out = await handleCreateBill(job(), ctxFor(x.f, memoryStore(source()).store));
    expect(out.kind === "error" && out.error.errorClass).toBe("fixable");
    expect(out.kind === "error" && out.error.message).toMatch(/Tax rate INPUT .*purchases/);
    expect(x.calls.some((c) => c.method === "POST")).toBe(false);
  });
});

describe("handleVoidBill: keys and untracked bills", () => {
  const voidJob = job({ operation: "void_bill", idempotency_key: "si-inv-1-void" });
  const GET_ONE = (status: string) => ({ method: "GET", path: /\/Invoices\/xero-inv-1$/, respond: () => json({ Invoices: [{ InvoiceID: "xero-inv-1", Status: status }] }) });
  const POST_ONE = { method: "POST", path: /\/Invoices\/xero-inv-1$/, respond: () => json({ Invoices: [{ InvoiceID: "xero-inv-1" }] }) };

  it("sends si-{id}-void as the Idempotency-Key", async () => {
    const x = fakeXero([GET_ONE("SUBMITTED"), POST_ONE]);
    await handleVoidBill(voidJob, ctxFor(x.f, memoryStore(source()).store));
    expect(keyOf(x.f, "POST")).toBe("si-inv-1-void");
  });

  it("does not mark anything voided when the invoice is not found for this tenant", async () => {
    const m = memoryStore(source());
    m.store.loadInvoiceExternal = async () => null;
    const x = fakeXero([]);
    const out = await handleVoidBill(voidJob, ctxFor(x.f, m.store));
    expect(out.kind === "error" && out.error.errorClass).toBe("fixable");
    expect(m.recorded).toEqual([]);
  });

  const untracked = () => {
    const m = memoryStore(source());
    m.store.loadInvoiceExternal = async () => ({ external_id: null, supplier_id: "s1", invoice_number: "INV-9" });
    return m;
  };

  it("with no external_id, finds the bill that reached Xero, voids it and marks voided_in_xero", async () => {
    const x = fakeXero([SEARCH([{ InvoiceID: "xero-inv-1", Status: "AUTHORISED", Total: 33 }]), POST_ONE]);
    const m = untracked();
    expect(await handleVoidBill(voidJob, ctxFor(x.f, m.store))).toEqual({ kind: "sent", externalId: "xero-inv-1" });
    expect((x.calls.find((c) => c.method === "POST")!.body as { Invoices: Array<{ Status: string }> }).Invoices[0].Status).toBe("VOIDED");
    expect(m.recorded).toContainEqual(["voided", "inv-1"]);
  });

  it("with no external_id and no match, succeeds as nothing-to-void", async () => {
    const x = fakeXero([SEARCH([{ InvoiceID: "gone", Status: "DELETED" }])]);
    const m = untracked();
    expect(await handleVoidBill(voidJob, ctxFor(x.f, m.store))).toEqual({ kind: "sent", externalId: null });
    expect(m.recorded).toContainEqual(["voided", "inv-1"]);
    expect(x.calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("with no external_id and a failed search, is transient and marks nothing", async () => {
    const x = fakeXero([{ method: "GET", path: /\/Invoices\?where=/, respond: () => json({}, 503) }]);
    const m = untracked();
    const out = await handleVoidBill(voidJob, ctxFor(x.f, m.store));
    expect(out.kind === "error" && out.error.errorClass).toBe("transient");
    expect(m.recorded).toEqual([]);
  });
});

describe("handleCreateContact: key and empty body", () => {
  const contactJob = job({ operation: "create_contact", entity_type: "supplier", entity_id: "s1", idempotency_key: "sup-s1-contact" });
  it("sends sup-{id}-contact as the Idempotency-Key", async () => {
    const x = fakeXero([{ method: "POST", path: /\/Contacts\?summarizeErrors=false$/, respond: () => json({ Contacts: [{ ContactID: "c", Name: "Acme" }] }) }]);
    await handleCreateContact(contactJob, ctxFor(x.f, memoryStore(null, null).store));
    expect(keyOf(x.f, "POST")).toBe("sup-s1-contact");
  });
  it("an empty 2xx is transient", async () => {
    const x = fakeXero([{ method: "POST", path: /\/Contacts/, respond: () => new Response("", { status: 200 }) }]);
    const out = await handleCreateContact(contactJob, ctxFor(x.f, memoryStore(null, null).store));
    expect(out.kind === "error" && out.error.errorClass).toBe("transient");
  });
});

describe("supabaseHandlerStore: tenant-filtered void writes", () => {
  it("markVoidedInXero and loadInvoiceExternal filter by tenant_id", async () => {
    const f = fakeDb({ supplier_invoice: { data: { external_id: null, supplier_id: "s1", invoice_number: "INV-9" }, error: null } });
    const store = supabaseHandlerStore(f.db);
    await store.markVoidedInXero("inv-1", "t1");
    await store.loadInvoiceExternal("inv-1", "t1");
    for (const l of f.log) expect(l.filters).toEqual([["tenant_id", "t1"], ["id", "inv-1"]]);
  });
});

describe("pre-check messages name fixes that work on a posted invoice", () => {
  it("lock date: move it in Xero, or void and re-enter", async () => {
    const x = fakeXero([ORG, ACCOUNTS, TAX]);
    const out = await handleCreateBill(job(), ctxFor(x.f, memoryStore(source({ invoice_date: "2026-06-30" })).store));
    expect(out.kind === "error" && out.error.message).toBe(
      "Xero is locked up to 2026-06-30. Ask your accountant to move the lock date in Xero, or void this invoice and re-enter it with a later date. Then retry."
    );
  });
  it("archived account: restore it in Xero, or void and re-enter", async () => {
    const x = fakeXero([ORG, ACCOUNTS, TAX]);
    const src = { ...source(), lines: [{ ...source().lines[0], account_code: "999" }] };
    const out = await handleCreateBill(job(), ctxFor(x.f, memoryStore(src).store));
    expect(out.kind === "error" && out.error.message).toBe(
      "Account 999 is archived or inactive in Xero. Restore it in Xero and retry, or void this invoice and re-enter it with a different account or tax rate."
    );
  });
  it("inactive tax rate: restore it in Xero, or void and re-enter", async () => {
    const x = fakeXero([ORG, ACCOUNTS, TAX]);
    const src = { ...source(), lines: [{ ...source().lines[0], tax_type: "OLDGST" }] };
    const out = await handleCreateBill(job(), ctxFor(x.f, memoryStore(src).store));
    expect(out.kind === "error" && out.error.message).toBe(
      "Tax rate OLDGST is archived or inactive in Xero, or can't be used on purchases. Restore it in Xero and retry, or void this invoice and re-enter it with a different account or tax rate."
    );
  });
});

describe("duplicate search never adopts another invoice's bill", () => {
  const linkedElsewhere = (ids: string[]) => {
    const m = memoryStore(source());
    const asked: unknown[] = [];
    m.store.billIdsLinkedElsewhere = async (...args) => { asked.push(args); return ids; };
    return { ...m, asked };
  };
  const POST_NEW = { method: "POST", path: /\/Invoices\?unitdp=4&summarizeErrors=false$/, respond: () => json({ Invoices: [{ InvoiceID: "xero-new", Status: "SUBMITTED", Total: 33 }] }) };

  it("ignores a live bill already linked to another invoice, so the create proceeds", async () => {
    const x = fakeXero([ORG, ACCOUNTS, TAX, SEARCH([{ InvoiceID: "xero-other", Status: "AUTHORISED", Total: 33 }]), POST_NEW]);
    const m = linkedElsewhere(["xero-other"]);
    const out = await handleCreateBill(job({ attempts: 1 }), ctxFor(x.f, m.store));
    expect(out).toEqual({ kind: "sent", externalId: "xero-new" });
    expect(m.asked).toEqual([["t1", ["xero-other"], "inv-1"]]);
    expect(m.recorded).toEqual([["inv-1", "xero-new", "https://go.xero.com/AccountsPayable/View.aspx?InvoiceID=xero-new", 33]]);
  });

  it("adopts the one unlinked candidate when another candidate is linked elsewhere", async () => {
    const x = fakeXero([SEARCH([{ InvoiceID: "xero-other", Status: "SUBMITTED", Total: 33 }, { InvoiceID: "xero-mine", Status: "SUBMITTED", Total: 33 }])]);
    const m = linkedElsewhere(["xero-other"]);
    const out = await handleCreateBill(job({ attempts: 1 }), ctxFor(x.f, m.store));
    expect(out).toEqual({ kind: "sent", externalId: "xero-mine", note: { adopted: true } });
  });

  it("fails as fixable, and creates nothing, when two unlinked live bills match", async () => {
    const x = fakeXero([ORG, ACCOUNTS, TAX, SEARCH([{ InvoiceID: "a", Status: "SUBMITTED" }, { InvoiceID: "b", Status: "AUTHORISED" }]), POST_NEW]);
    const m = memoryStore(source());
    const out = await handleCreateBill(job({ attempts: 1 }), ctxFor(x.f, m.store));
    expect(out.kind === "error" && out.error.errorClass).toBe("fixable");
    expect(out.kind === "error" && out.error.message).toBe(
      "Xero has several bills from this supplier with invoice number INV-9. Void the extra one in Xero, then retry."
    );
    expect(x.calls.some((c) => c.method === "POST")).toBe(false);
    expect(m.recorded).toEqual([]);
  });

  const voidJob = job({ operation: "void_bill", idempotency_key: "si-inv-1-void" });
  const chase = (linked: string[]) => {
    const m = linkedElsewhere(linked);
    m.store.loadInvoiceExternal = async () => ({ external_id: null, supplier_id: "s1", invoice_number: "INV-9" });
    return m;
  };

  it("a void chase ignores another invoice's bill and voids nothing", async () => {
    const x = fakeXero([SEARCH([{ InvoiceID: "xero-other", Status: "AUTHORISED" }])]);
    const m = chase(["xero-other"]);
    expect(await handleVoidBill(voidJob, ctxFor(x.f, m.store))).toEqual({ kind: "sent", externalId: null });
    expect(x.calls.some((c) => c.method === "POST")).toBe(false);
    expect(m.recorded).toEqual([["voided", "inv-1"]]);
  });

  it("a void chase with two unlinked candidates is fixable and voids nothing", async () => {
    const x = fakeXero([SEARCH([{ InvoiceID: "a", Status: "SUBMITTED" }, { InvoiceID: "b", Status: "SUBMITTED" }])]);
    const m = chase([]);
    const out = await handleVoidBill(voidJob, ctxFor(x.f, m.store));
    expect(out.kind === "error" && out.error.errorClass).toBe("fixable");
    expect(out.kind === "error" && out.error.message).toMatch(/several bills .* invoice number INV-9/);
    expect(x.calls.some((c) => c.method === "POST")).toBe(false);
    expect(m.recorded).toEqual([]);
  });
});

describe("supabaseHandlerStore.billIdsLinkedElsewhere", () => {
  it("reads other invoices' external_id in this tenant, excluding this invoice", async () => {
    const f = fakeDb({ supplier_invoice: { data: [{ external_id: "x1" }, { external_id: "x1" }], error: null } });
    expect(await supabaseHandlerStore(f.db).billIdsLinkedElsewhere!("t1", ["x1", "x2"], "inv-1")).toEqual(["x1"]);
    expect(f.log[0]).toEqual({ table: "supplier_invoice", filters: [["tenant_id", "t1"], ["external_id", ["x1", "x2"]], ["id!", "inv-1"]] });
  });
  it("throws when the read fails", async () => {
    const f = fakeDb({ supplier_invoice: { data: null, error: { message: "down" } } });
    await expect(supabaseHandlerStore(f.db).billIdsLinkedElsewhere!("t1", ["x1"], "inv-1")).rejects.toThrow(/down/);
  });
});
