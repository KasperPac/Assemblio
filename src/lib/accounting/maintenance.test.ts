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
  last_refreshed_at: "2026-10-07T00:00:00Z", last_alert_at: null, ...p,
});

type Res = { data?: unknown; count?: number | null; error: { message: string } | null };
// Minimal chainable fake: every builder method returns itself and awaiting resolves the table's result.
function fakeDb(results: { connections: Res; gaveUp?: Res; update?: Res }) {
  const updates: Array<{ table: string; values: unknown }> = [];
  const filters: Array<{ table: string; col: string; val: unknown }> = [];
  const from = (table: string) => {
    let isUpdate = false;
    const b: Record<string, unknown> = {};
    const result = (): Res => {
      if (isUpdate) return results.update ?? { error: null };
      if (table === "accounting_connection") return results.connections;
      return results.gaveUp ?? { count: 0, error: null };
    };
    for (const m of ["select", "neq", "gte"]) b[m] = () => b;
    b.eq = (col: string, val: unknown) => {
      filters.push({ table, col, val });
      return b;
    };
    b.update = (values: unknown) => {
      isUpdate = true;
      updates.push({ table, values });
      return b;
    };
    b.then = (ok: (r: Res) => unknown, bad: (e: unknown) => unknown) => Promise.resolve(result()).then(ok, bad);
    return b;
  };
  return { db: { from } as unknown as SupabaseClient, updates, filters };
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
  it("alerts on reconnect or problem jobs, at most once per 24h, only with a recipient", () => {
    expect(alertKind(c({ status: "needs_reconnect" }), 0, now)).toBe("reconnect");
    expect(alertKind(c(), 2, now)).toBe("failed");
    expect(alertKind(c(), 0, now)).toBeNull();
    expect(alertKind(c({ status: "needs_reconnect", last_alert_at: "2026-10-07T12:00:00Z" }), 0, now)).toBeNull();
    expect(alertKind(c({ status: "needs_reconnect", last_alert_at: "2026-10-06T23:00:00Z" }), 0, now)).toBe("reconnect");
    expect(alertKind(c({ status: "needs_reconnect", connected_by: null }), 0, now)).toBeNull();
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
  it("emails a reconnect, records last_alert_at, and counts only gave_up jobs", async () => {
    const { db, updates, filters } = fakeDb({
      connections: { data: [c({ status: "needs_reconnect" })], error: null },
    });
    const sendAlert = vi.fn(async () => true);
    const out = await sendDueAlerts(db, { sendAlert, now: () => now });
    expect(out).toEqual({ alerted: 1 });
    expect(sendAlert).toHaveBeenCalledWith(expect.objectContaining({ id: "c1" }), "reconnect", 0);
    expect(updates).toHaveLength(1);
    expect(updates[0].values).toEqual({ last_alert_at: now.toISOString() });
    expect(filters).toContainEqual({ table: "accounting_outbox", col: "status", val: "gave_up" });
  });

  it("emails a failed alert when a gave_up job exists", async () => {
    const { db } = fakeDb({
      connections: { data: [c()], error: null },
      gaveUp: { count: 2, error: null },
    });
    const sendAlert = vi.fn(async () => true);
    await sendDueAlerts(db, { sendAlert, now: () => now });
    expect(sendAlert).toHaveBeenCalledWith(expect.anything(), "failed", 2);
  });

  it("sends NO email for a connection whose only problems are fixable failures", async () => {
    // The query counts gave_up only, so fixable-failed jobs contribute 0.
    const { db, updates, filters } = fakeDb({
      connections: { data: [c()], error: null },
      gaveUp: { count: 0, error: null },
    });
    const sendAlert = vi.fn(async () => true);
    const out = await sendDueAlerts(db, { sendAlert, now: () => now });
    expect(out).toEqual({ alerted: 0 });
    expect(sendAlert).not.toHaveBeenCalled();
    expect(updates).toHaveLength(0);
    expect(filters.some((f) => f.col === "error_class")).toBe(false);
  });

  it("does not record last_alert_at when the send fails", async () => {
    const { db, updates } = fakeDb({ connections: { data: [c({ status: "needs_reconnect" })], error: null } });
    const out = await sendDueAlerts(db, { sendAlert: async () => false, now: () => now });
    expect(out).toEqual({ alerted: 0 });
    expect(updates).toHaveLength(0);
  });

  it("surfaces a failed problem-job count rather than silently succeeding", async () => {
    const { db } = fakeDb({
      connections: { data: [c()], error: null },
      gaveUp: { data: null, count: null, error: { message: "rls denied" } },
    });
    await expect(sendDueAlerts(db, { sendAlert: async () => true, now: () => now })).rejects.toThrow(
      /count problem jobs: rls denied/
    );
  });

  it("surfaces a failed last_alert_at write", async () => {
    const { db } = fakeDb({
      connections: { data: [c({ status: "needs_reconnect" })], error: null },
      update: { error: { message: "write failed" } },
    });
    await expect(sendDueAlerts(db, { sendAlert: async () => true, now: () => now })).rejects.toThrow(
      /record alert sent: write failed/
    );
  });
});
