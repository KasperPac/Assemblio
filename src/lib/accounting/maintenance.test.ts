import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  alertKind,
  isRefreshDue,
  refreshStaleTokens,
  sendDueAlerts,
  type MaintenanceConnection,
} from "./maintenance";

const now = new Date("2026-10-08T00:00:00Z");
const c = (p: Partial<MaintenanceConnection> = {}): MaintenanceConnection => ({
  id: "c1", tenant_id: "t1", external_org_id: "o1", org_name: "Acme", status: "connected", connected_by: "u1",
  last_refreshed_at: "2026-10-07T00:00:00Z", last_alert_at: null, updated_at: "2026-10-01T00:00:00Z", ...p,
});

type Res = { data?: unknown; count?: number | null; error: { message: string } | null };
type Upd = { id: unknown; values: Record<string, unknown> };
// Minimal chainable fake: every builder method returns itself and awaiting resolves the table's result.
function fakeDb(results: {
  connections: Res;
  gaveUp?: Res | ((connId: string) => Res);
  update?: Res | ((u: Upd) => Res);
}) {
  const updates: Upd[] = [];
  const filters: Array<{ table: string; col: string; val: unknown; op: string }> = [];
  const log: string[] = [];
  const from = (table: string) => {
    let upd: Upd | null = null;
    let connId = "";
    const b: Record<string, unknown> = {};
    const result = (): Res => {
      if (upd) {
        log.push(`update:${String(upd.values.last_alert_at)}`);
        return typeof results.update === "function" ? results.update(upd) : (results.update ?? { error: null });
      }
      if (table === "accounting_connection") return results.connections;
      const g = results.gaveUp ?? { count: 0, error: null };
      return typeof g === "function" ? g(connId) : g;
    };
    for (const m of ["select", "neq"]) b[m] = () => b;
    b.gt = (col: string, val: unknown) => {
      filters.push({ table, col, val, op: "gt" });
      return b;
    };
    b.eq = (col: string, val: unknown) => {
      filters.push({ table, col, val, op: "eq" });
      if (col === "connection_id") connId = String(val);
      if (upd && col === "id") upd.id = val;
      return b;
    };
    b.update = (values: Record<string, unknown>) => {
      upd = { id: undefined, values };
      updates.push(upd);
      return b;
    };
    b.then = (ok: (r: Res) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(result()).then(ok, bad);
    return b;
  };
  return { db: { from } as unknown as SupabaseClient, updates, filters, log };
}

describe("isRefreshDue", () => {
  it("refreshes connected tokens older than 7 days, or never refreshed", () => {
    expect(isRefreshDue(c(), now)).toBe(false);
    expect(isRefreshDue(c({ last_refreshed_at: "2026-09-30T23:59:00Z" }), now)).toBe(true);
    expect(isRefreshDue(c({ last_refreshed_at: null }), now)).toBe(true);
    expect(isRefreshDue(c({ status: "needs_reconnect", last_refreshed_at: null }), now)).toBe(false);
  });
});

describe("alertKind", () => {
  it("alerts on a reconnect transition or new gave_up jobs, at most once per 24h, only with a recipient", () => {
    expect(alertKind(c({ status: "needs_reconnect" }), 0, now)).toBe("reconnect");
    expect(alertKind(c(), 2, now)).toBe("failed");
    expect(alertKind(c(), 0, now)).toBeNull();
    // within 24h of the last alert: nothing, even for a fresh transition
    expect(alertKind(c({ status: "needs_reconnect", last_alert_at: "2026-10-07T12:00:00Z", updated_at: "2026-10-07T13:00:00Z" }), 0, now)).toBeNull();
    // flipped after the last alert and the window has passed: alert
    expect(alertKind(c({ status: "needs_reconnect", last_alert_at: "2026-10-06T23:00:00Z", updated_at: "2026-10-07T00:00:00Z" }), 0, now)).toBe("reconnect");
    expect(alertKind(c({ status: "needs_reconnect", connected_by: null }), 0, now)).toBeNull();
  });

  it("does not re-alert a connection that stays needs_reconnect after its alert", () => {
    const stayed = c({ status: "needs_reconnect", last_alert_at: "2026-10-03T00:00:00Z", updated_at: "2026-10-02T00:00:00Z" });
    expect(alertKind(stayed, 0, now)).toBeNull();
  });
});

describe("refreshStaleTokens", () => {
  it("refreshes only due connections and one failure does not stop the others", async () => {
    const { db } = fakeDb({
      connections: {
        data: [
          c({ id: "a", last_refreshed_at: "2026-09-01T00:00:00Z" }),
          c({ id: "b", last_refreshed_at: "2026-09-01T00:00:00Z" }),
          c({ id: "fresh" }),
          c({ id: "needs", status: "needs_reconnect", last_refreshed_at: null }),
        ],
        error: null,
      },
    });
    const refresh = vi.fn(async (x: MaintenanceConnection) => {
      if (x.id === "a") throw new Error("Xero rejected the refresh token");
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await refreshStaleTokens(db, { now: () => now, refresh });
    spy.mockRestore();
    expect(refresh.mock.calls.map(([x]) => x.id)).toEqual(["a", "b"]);
    expect(out).toEqual({ refreshed: 1, refreshFailed: 1 });
  });

  it("surfaces a failed connection list instead of reporting success", async () => {
    const { db } = fakeDb({ connections: { data: null, error: { message: "boom" } } });
    await expect(refreshStaleTokens(db, { now: () => now, refresh: async () => {} })).rejects.toThrow(
      /list accounting connections: boom/
    );
  });
});

describe("sendDueAlerts", () => {
  it("emails a reconnect and claims last_alert_at before sending", async () => {
    const { db, updates, filters, log } = fakeDb({
      connections: { data: [c({ status: "needs_reconnect" })], error: null },
    });
    const sendAlert = vi.fn(async () => {
      log.push("send");
      return true;
    });
    const out = await sendDueAlerts(db, { sendAlert, now: () => now });
    expect(out).toEqual({ alerted: 1, failed: 0 });
    expect(sendAlert).toHaveBeenCalledWith(expect.objectContaining({ id: "c1" }), "reconnect", 0);
    expect(updates).toHaveLength(1);
    expect(updates[0].values).toEqual({ last_alert_at: now.toISOString() });
    expect(log).toEqual([`update:${now.toISOString()}`, "send"]);
    expect(filters).toContainEqual({ table: "accounting_outbox", col: "status", val: "gave_up", op: "eq" });
  });

  it("emails a failed alert for a job that gave up after the last alert", async () => {
    const { db, filters } = fakeDb({
      connections: { data: [c({ last_alert_at: "2026-10-05T00:00:00Z" })], error: null },
      gaveUp: { count: 2, error: null },
    });
    const sendAlert = vi.fn(async () => true);
    await sendDueAlerts(db, { sendAlert, now: () => now });
    expect(sendAlert).toHaveBeenCalledWith(expect.anything(), "failed", 2);
    // the query is scoped to completed_at after the last alert
    expect(filters).toContainEqual({ table: "accounting_outbox", col: "completed_at", val: "2026-10-05T00:00:00Z", op: "gt" });
  });

  it("does not email for a gave_up job from before the last alert (query returns 0)", async () => {
    const { db } = fakeDb({
      connections: { data: [c({ last_alert_at: "2026-10-05T00:00:00Z" })], error: null },
      gaveUp: { count: 0, error: null },
    });
    const sendAlert = vi.fn(async () => true);
    const out = await sendDueAlerts(db, { sendAlert, now: () => now });
    expect(out).toEqual({ alerted: 0, failed: 0 });
    expect(sendAlert).not.toHaveBeenCalled();
  });

  it("sends NO email for a connection whose only problems are fixable failures", async () => {
    // The query counts gave_up only, so fixable-failed jobs contribute 0.
    const { db, updates, filters } = fakeDb({
      connections: { data: [c()], error: null },
      gaveUp: { count: 0, error: null },
    });
    const sendAlert = vi.fn(async () => true);
    const out = await sendDueAlerts(db, { sendAlert, now: () => now });
    expect(out).toEqual({ alerted: 0, failed: 0 });
    expect(sendAlert).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
    expect(filters.some((f) => f.col === "error_class")).toBe(false);
  });

  it("restores the previous throttle when the send returns false, so it retries", async () => {
    const { db, updates } = fakeDb({
      connections: { data: [c({ status: "needs_reconnect", last_alert_at: "2026-10-05T00:00:00Z", updated_at: "2026-10-06T00:00:00Z" })], error: null },
    });
    const out = await sendDueAlerts(db, { sendAlert: async () => false, now: () => now });
    expect(out).toEqual({ alerted: 0, failed: 0 });
    expect(updates.map((u) => u.values.last_alert_at)).toEqual([now.toISOString(), "2026-10-05T00:00:00Z"]);
  });

  it("restores the throttle, logs, and continues when a send throws", async () => {
    const { db, updates } = fakeDb({
      connections: {
        data: [c({ id: "a", status: "needs_reconnect" }), c({ id: "b", status: "needs_reconnect" })],
        error: null,
      },
    });
    const sendAlert = vi.fn(async (x: MaintenanceConnection) => {
      if (x.id === "a") throw new Error("smtp down");
      return true;
    });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await sendDueAlerts(db, { sendAlert, now: () => now });
    spy.mockRestore();
    expect(out).toEqual({ alerted: 1, failed: 1 });
    expect(sendAlert).toHaveBeenCalledTimes(2);
    // a: claim then restore to null; b: claim only
    expect(updates.map((u) => [u.id, u.values.last_alert_at])).toEqual([
      ["a", now.toISOString()],
      ["a", null],
      ["b", now.toISOString()],
    ]);
  });

  it("does not send when the throttle claim fails, and still processes the next connection", async () => {
    const { db } = fakeDb({
      connections: {
        data: [c({ id: "a", status: "needs_reconnect" }), c({ id: "b", status: "needs_reconnect" })],
        error: null,
      },
      update: (u) => (u.id === "a" ? { error: { message: "write failed" } } : { error: null }),
    });
    const sendAlert = vi.fn(async () => true);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await sendDueAlerts(db, { sendAlert, now: () => now });
    spy.mockRestore();
    expect(out).toEqual({ alerted: 1, failed: 1 });
    expect(sendAlert).toHaveBeenCalledTimes(1);
    expect(sendAlert).toHaveBeenCalledWith(expect.objectContaining({ id: "b" }), "reconnect", 0);
  });

  it("keeps the claim after a successful send even when a later connection throws", async () => {
    const { db, updates } = fakeDb({
      connections: {
        data: [c({ id: "a", status: "needs_reconnect" }), c({ id: "b" })],
        error: null,
      },
      gaveUp: (id) => (id === "b" ? { data: null, count: null, error: { message: "rls denied" } } : { count: 0, error: null }),
    });
    const sendAlert = vi.fn(async () => true);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = await sendDueAlerts(db, { sendAlert, now: () => now });
    spy.mockRestore();
    expect(out).toEqual({ alerted: 1, failed: 1 });
    // a's throttle was claimed and never rolled back, so the next run does not resend
    expect(updates).toEqual([{ id: "a", values: { last_alert_at: now.toISOString() } }]);
  });

  it("surfaces a failed connection list", async () => {
    const { db } = fakeDb({ connections: { data: null, error: { message: "boom" } } });
    await expect(sendDueAlerts(db, { sendAlert: async () => true, now: () => now })).rejects.toThrow(
      /list accounting connections: boom/
    );
  });
});
