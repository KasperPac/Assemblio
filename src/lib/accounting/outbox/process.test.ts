import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { kickOutbox, processConnectionOutbox, processOutbox } from "./process";
import { XeroAuthError } from "../xero/tokens";
import type { OutboxJob } from "./handlers";

type Filter = [string, string, unknown];
type Write = { table: string; op: string; values: Record<string, unknown>; filters: Filter[] };
type St = { op: string; values: Record<string, unknown>; filters: Filter[]; selected: boolean };
type Result = { data: unknown; error: { message: string } | null };

function fakeDb(opts: {
  connection: Record<string, unknown> | null;
  jobs: OutboxJob[];
  rpcError?: string;
  outboxUpdate?: (st: St) => Result;
  selectRows?: Record<string, unknown[]>;
}) {
  const writes: Write[] = [];
  const from = (table: string) => {
    const st: St = { op: "select", values: {}, filters: [], selected: false };
    const b: Record<string, unknown> = {};
    const chain = (name: string) => (c?: string, v?: unknown) => {
      if (c !== undefined) st.filters.push([name, c, v]);
      return b;
    };
    Object.assign(b, {
      select: () => {
        if (st.op === "update") st.selected = true;
        return b;
      },
      update: (values: Record<string, unknown>) => {
        st.op = "update";
        st.values = values;
        return b;
      },
      insert: (values: Record<string, unknown>) => {
        st.op = "insert";
        st.values = values;
        return b;
      },
      eq: chain("eq"), neq: chain("neq"), in: chain("in"), lte: chain("lte"), lt: chain("lt"), or: chain("or"),
      limit: () => b,
      order: () => b,
      maybeSingle: async () => ({ data: table === "accounting_connection" ? opts.connection : null, error: null }),
      then: (resolve: (v: Result) => void) => {
        if (st.op !== "select") writes.push({ table, op: st.op, values: st.values, filters: st.filters });
        if (table === "accounting_outbox" && st.op === "update" && opts.outboxUpdate) return resolve(opts.outboxUpdate(st));
        if (table === "accounting_outbox" && st.op === "update" && st.selected) {
          const id = st.filters.find(([o, c]) => o === "eq" && c === "id")?.[2];
          return resolve({ data: id ? [{ id }] : [], error: null });
        }
        resolve({ data: opts.selectRows?.[table] ?? [], error: null });
      },
    });
    return b;
  };
  const rpc = vi.fn(async () => (opts.rpcError ? { data: null, error: { message: opts.rpcError } } : { data: opts.jobs, error: null }));
  const db = { from, rpc } as unknown as SupabaseClient;
  return { db, writes, rpc };
}

const conn = { id: "c1", tenant_id: "t1", external_org_id: "org-1", status: "connected" };
const job = (id: string, operation: OutboxJob["operation"] = "create_bill"): OutboxJob => ({
  id, tenant_id: "t1", connection_id: "c1", operation, entity_type: operation === "create_contact" ? "supplier" : "supplier_invoice",
  entity_id: `inv-${id}`, attempts: 0, first_attempt_at: "2026-10-01T00:00:00Z", idempotency_key: `si-inv-${id}-create`, external_id: null, depends_on: null,
});
const getAccess = async () => ({ accessToken: "t", xeroTenantId: "org-1" });
const now = () => new Date("2026-10-01T00:05:00Z");
const isPilotTenant = () => true;
const base = { getAccess, now, isPilotTenant, worker: "w1" };
const outboxWrites = (w: Write[]) => w.filter((x) => x.table === "accounting_outbox");
const activityWrites = (w: Write[]) => w.filter((x) => x.table === "activity_log");
const errResult = (errorClass: "auth" | "fixable" | "daily_limit") =>
  ({ kind: "error" as const, error: { errorClass, message: "msg", detail: null, retryAfterSec: null } });

describe("processConnectionOutbox", () => {
  it("records a sent job conditionally on it still being ours", async () => {
    const f = fakeDb({ connection: conn, jobs: [job("1")] });
    const create_bill = vi.fn(async () => ({ kind: "sent" as const, externalId: "x1" }));
    const r = await processConnectionOutbox("c1", { db: f.db, ...base, handlers: { create_bill } });
    expect(r).toEqual({ claimed: 1, sent: 1, failed: 0 });
    const w = outboxWrites(f.writes)[0];
    expect(w.values).toMatchObject({ status: "sent", external_id: "x1" });
    expect(w.filters).toEqual(expect.arrayContaining([["eq", "id", "1"], ["eq", "status", "working"], ["eq", "locked_by", "w1"]]));
  });

  it("persists the handler note and writes accounting.bill_sent on create and adoption", async () => {
    const f = fakeDb({ connection: conn, jobs: [job("1")] });
    const note = { adopted: true, rounding: { manuva: 10, xero: 10.01 } };
    const create_bill = vi.fn(async () => ({ kind: "sent" as const, externalId: "x1", note }));
    await processConnectionOutbox("c1", { db: f.db, ...base, handlers: { create_bill } });
    expect(outboxWrites(f.writes)[0].values).toMatchObject({ error_class: null, error_detail: note });
    const a = activityWrites(f.writes);
    expect(a).toHaveLength(1);
    expect(a[0].values).toMatchObject({ event: "accounting.bill_sent", entity_type: "supplier_invoice", entity_id: "inv-1" });
    expect(a[0].values.metadata).toMatchObject({ adopted: true, rounding: { manuva: 10, xero: 10.01 } });
  });

  it("does not log bill_sent for a void_bill job", async () => {
    const f = fakeDb({ connection: conn, jobs: [job("1", "void_bill")] });
    await processConnectionOutbox("c1", { db: f.db, ...base, handlers: { void_bill: async () => ({ kind: "sent", externalId: null }) } });
    expect(activityWrites(f.writes)).toHaveLength(0);
  });

  it("never overwrites a job cancelled mid-flight and skips follow-up writes", async () => {
    const f = fakeDb({ connection: conn, jobs: [job("1")], outboxUpdate: () => ({ data: [], error: null }) });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const create_bill = vi.fn(async () => errResult("fixable"));
    const r = await processConnectionOutbox("c1", { db: f.db, ...base, handlers: { create_bill } });
    expect(r.sent + r.failed).toBe(0);
    expect(f.writes.some((w) => w.table === "supplier_invoice")).toBe(false);
    expect(activityWrites(f.writes)).toHaveLength(0);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("mirrors a fixable failure onto the invoice and logs sync_failed", async () => {
    const f = fakeDb({ connection: conn, jobs: [job("1")] });
    const create_bill = vi.fn(async () => errResult("fixable"));
    const r = await processConnectionOutbox("c1", { db: f.db, ...base, handlers: { create_bill } });
    expect(r).toEqual({ claimed: 1, sent: 0, failed: 1 });
    expect(f.writes.find((w) => w.table === "supplier_invoice")?.values).toMatchObject({ sync_status: "failed" });
    expect(activityWrites(f.writes)[0].values).toMatchObject({ event: "accounting.sync_failed" });
  });

  it("stops on an auth error, releases the rest and marks the connection", async () => {
    const f = fakeDb({ connection: conn, jobs: [job("1"), job("2")] });
    const create_bill = vi.fn(async () => errResult("auth"));
    await processConnectionOutbox("c1", { db: f.db, ...base, handlers: { create_bill } });
    expect(create_bill).toHaveBeenCalledTimes(1);
    const released = outboxWrites(f.writes).find((w) => w.filters.some(([op, c, v]) => op === "in" && c === "id" && Array.isArray(v) && v.includes("2")));
    expect(released?.values).toMatchObject({ status: "pending", locked_at: null });
    expect(outboxWrites(f.writes)[0].values).toMatchObject({ status: "pending", attempts: 0, error_class: "auth" });
    expect(f.writes.some((w) => w.table === "accounting_connection" && w.values.status === "needs_reconnect")).toBe(true);
  });

  it("defers every pending and transient-failed job on the connection on daily_limit", async () => {
    const f = fakeDb({ connection: conn, jobs: [job("1"), job("2")] });
    const create_bill = vi.fn(async () => errResult("daily_limit"));
    await processConnectionOutbox("c1", { db: f.db, ...base, handlers: { create_bill } });
    expect(create_bill).toHaveBeenCalledTimes(1);
    const wide = outboxWrites(f.writes).find((w) => w.filters.some(([o, c, v]) => o === "eq" && c === "connection_id" && v === "c1"));
    expect(wide).toBeDefined();
    expect(wide!.values).toEqual({ next_attempt_at: "2026-10-02T00:00:00.000Z" });
    const orFilter = wide!.filters.find(([o]) => o === "or");
    expect(String(orFilter?.[1])).toContain("pending");
    expect(String(orFilter?.[1])).toContain("transient");
    const released = outboxWrites(f.writes).find((w) => w.filters.some(([o, c, v]) => o === "in" && c === "id" && Array.isArray(v) && v.includes("2")));
    expect(released?.values).toMatchObject({ status: "pending", next_attempt_at: "2026-10-02T00:00:00.000Z" });
  });

  it("pauses every claimed job when the token cannot be obtained", async () => {
    const f = fakeDb({ connection: conn, jobs: [job("1"), job("2")] });
    const r = await processConnectionOutbox("c1", { db: f.db, ...base, getAccess: async () => { throw new XeroAuthError("dead"); } });
    expect(r.failed).toBe(2);
    expect(outboxWrites(f.writes).every((w) => w.values.status === "pending")).toBe(true);
  });

  it("does nothing for a disconnected connection", async () => {
    const f = fakeDb({ connection: { ...conn, status: "needs_reconnect" }, jobs: [job("1")] });
    expect(await processConnectionOutbox("c1", { db: f.db, ...base })).toEqual({ claimed: 0, sent: 0, failed: 0 });
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it("does nothing for a tenant outside the pilot", async () => {
    const f = fakeDb({ connection: conn, jobs: [job("1")] });
    expect(await processConnectionOutbox("c1", { db: f.db, ...base, isPilotTenant: () => false })).toEqual({ claimed: 0, sent: 0, failed: 0 });
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it("stops at the deadline and releases unrun claimed jobs back to pending", async () => {
    let t = Date.parse("2026-10-01T00:05:00Z");
    const clock = () => new Date(t);
    const f = fakeDb({ connection: conn, jobs: [job("1"), job("2"), job("3")] });
    const create_bill = vi.fn(async () => {
      t += 40_000;
      return { kind: "sent" as const, externalId: "x" };
    });
    const r = await processConnectionOutbox("c1", { db: f.db, ...base, now: clock, handlers: { create_bill } });
    expect(create_bill).toHaveBeenCalledTimes(1);
    expect(r.sent).toBe(1);
    const released = outboxWrites(f.writes).find((w) => w.filters.some(([o, c, v]) => o === "in" && c === "id" && Array.isArray(v) && v.includes("2") && v.includes("3")));
    expect(released?.values).toMatchObject({ status: "pending", locked_at: null, locked_by: null });
    expect(released?.filters).toEqual(expect.arrayContaining([["eq", "status", "working"], ["eq", "locked_by", "w1"]]));
  });

  it("does not claim at all when the budget is already spent", async () => {
    const f = fakeDb({ connection: conn, jobs: [job("1")] });
    const r = await processConnectionOutbox("c1", { db: f.db, ...base }, 25, 0);
    expect(r.claimed).toBe(0);
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it("surfaces a claim RPC error instead of continuing", async () => {
    const f = fakeDb({ connection: conn, jobs: [], rpcError: "rpc exploded" });
    await expect(processConnectionOutbox("c1", { db: f.db, ...base })).rejects.toThrow(/claim_accounting_jobs: rpc exploded/);
  });

  it("surfaces a completion update error instead of continuing", async () => {
    const f = fakeDb({ connection: conn, jobs: [job("1")], outboxUpdate: () => ({ data: null, error: { message: "write failed" } }) });
    const create_bill = vi.fn(async () => ({ kind: "sent" as const, externalId: "x1" }));
    await expect(processConnectionOutbox("c1", { db: f.db, ...base, handlers: { create_bill } })).rejects.toThrow(/write failed/);
    expect(activityWrites(f.writes)).toHaveLength(0);
  });
});

describe("processOutbox and kickOutbox pilot gate", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("processOutbox skips connections whose tenant is not in the pilot", async () => {
    const f = fakeDb({ connection: conn, jobs: [job("1")], selectRows: { accounting_outbox: [{ connection_id: "c1" }] } });
    const r = await processOutbox({ db: f.db, ...base, isPilotTenant: () => false });
    expect(r.claimed).toBe(0);
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it("kickOutbox checks the pilot list and never throws", async () => {
    vi.stubEnv("XERO_PILOT_TENANTS", "other-tenant");
    const f = fakeDb({ connection: conn, jobs: [job("1")] });
    await expect(kickOutbox({ connectionId: "c1" }, { db: f.db, getAccess, now })).resolves.toBeUndefined();
    expect(f.rpc).not.toHaveBeenCalled();
    vi.stubEnv("XERO_PILOT_TENANTS", "t1");
    await kickOutbox({ connectionId: "c1" }, { db: f.db, getAccess, now, handlers: { create_bill: async () => ({ kind: "sent", externalId: "x" }) } });
    expect(f.rpc).toHaveBeenCalledTimes(1);
  });
});
