import { describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import { createSignedState } from "@/lib/security/signed-state";
import {
  disconnectXero,
  openPending,
  saveConnection,
  sealPending,
  supabaseConnectionRepo,
  validateCallback,
  type ConnectionRepo,
  type ConnectionRow,
} from "./connection";

const key = { key: randomBytes(32), version: 1 };
const SECRET = "client-secret";
const NOW = 1_800_000_000_000;
const tokens = { accessToken: "a", refreshToken: "r", expiresInSec: 1800 };

function stateFor(tenantId: string, userId: string, nonce: string, ttl = 600_000) {
  return createSignedState({ tenantId, userId, nonce }, SECRET, ttl, NOW);
}

describe("validateCallback", () => {
  const base = { error: null, code: "c", nonceCookie: "n1", session: { tenantId: "t1", userId: "u1", role: "admin" }, secret: SECRET, now: NOW + 1000 };
  it("accepts a matching admin session", () => {
    expect(validateCallback({ ...base, state: stateFor("t1", "u1", "n1") })).toEqual({ ok: true, tenantId: "t1", userId: "u1" });
  });
  it.each([
    [{ error: "access_denied" }, "xero-denied"],
    [{ error: "invalid_scope" }, "xero-error"],
    [{ session: null }, "no-session"],
    [{ session: { tenantId: "t1", userId: "u1", role: "member" } }, "not-admin"],
    [{ nonceCookie: "other" }, "nonce-mismatch"],
    [{ session: { tenantId: "t2", userId: "u1", role: "admin" } }, "session-mismatch"],
    [{ session: { tenantId: "t1", userId: "u2", role: "admin" } }, "session-mismatch"],
    [{ now: NOW + 600_001 }, "expired"],
    [{ code: null }, "bad-state"],
  ])("rejects %j as %s", (patch, reason) => {
    expect(validateCallback({ ...base, state: stateFor("t1", "u1", "n1"), ...patch })).toEqual({ ok: false, reason });
  });
  it("rejects a forged state", () => {
    const forged = createSignedState({ tenantId: "t1", userId: "u1", nonce: "n1" }, "attacker", 600_000, NOW);
    expect(validateCallback({ ...base, state: forged })).toEqual({ ok: false, reason: "bad-state" });
  });
  it("returns a config error instead of throwing when the secret is empty", () => {
    const input = { ...base, secret: "", state: stateFor("t1", "u1", "n1") };
    expect(() => validateCallback(input)).not.toThrow();
    expect(validateCallback(input)).toEqual({ ok: false, reason: "not-configured" });
  });
});

describe("pending cookie", () => {
  it("round-trips and expires", () => {
    const p = { tenantId: "t1", userId: "u1", tokens, orgs: [{ connectionId: "c1", tenantId: "o1", name: "A" }], exp: NOW + 600_000 };
    const sealed = sealPending(p, key);
    expect(sealed).not.toContain('"r"');
    expect(openPending(sealed, key, NOW)).toEqual(p);
    expect(openPending(sealed, key, NOW + 600_000)).toBeNull();
    expect(openPending("garbage", key, NOW)).toBeNull();
  });
});

function memoryRepo(existing: Partial<ConnectionRow> | null, opts: { failOn?: string } = {}) {
  const calls: string[] = [];
  const state: Partial<ConnectionRow> | null = existing ? { ...existing } : null;
  let upserted: Record<string, unknown> | null = null;
  const maybeFail = (name: string) => {
    if (opts.failOn === name) throw new Error(`${name} failed`);
  };
  const repo: ConnectionRepo = {
    async findByTenant() { return state as ConnectionRow | null; },
    async upsertConnection(row) {
      calls.push("upsertConnection");
      upserted = row;
      if (state) Object.assign(state, row);
      return (state?.id as string) ?? "new-id";
    },
    async upsertCredential() { calls.push("upsertCredential"); maybeFail("upsertCredential"); },
    async markConnected() { calls.push("markConnected"); if (state) state.status = "connected"; },
    async cancelOpenJobs(_id, reason) { calls.push(`cancelOpenJobs:${reason}`); maybeFail("cancelOpenJobs"); },
    async deleteContactLinks() { calls.push("deleteContactLinks"); },
    async deleteCredential() { calls.push("deleteCredential"); maybeFail("deleteCredential"); },
    async markDisconnected() { calls.push("markDisconnected"); if (state) state.status = "disconnected"; },
  };
  return { repo, calls, state, get upserted() { return upserted; } };
}

describe("saveConnection", () => {
  const args = { tenantId: "t1", userId: "u1", org: { connectionId: "c2", tenantId: "o2", name: "B" }, baseCurrency: "AUD", tokens, key, now: NOW };

  it("keeps setup when reconnecting the same organisation", async () => {
    const m = memoryRepo({ id: "conn-1", external_org_id: "o2" });
    expect(await saveConnection(m.repo, args)).toEqual({ connectionId: "conn-1", orgChanged: false });
    expect(m.upserted).not.toHaveProperty("setup_completed_at");
    expect(m.calls).toEqual(["upsertConnection", "upsertCredential", "markConnected"]);
  });

  it("saveConnection cancels jobs and drops links when the organisation changes", async () => {
    const m = memoryRepo({ id: "conn-1", external_org_id: "o1" });
    expect(await saveConnection(m.repo, args)).toEqual({ connectionId: "conn-1", orgChanged: true });
    expect(m.upserted).toMatchObject({ setup_completed_at: null, inventory_account_code: null, external_org_id: "o2" });
    expect(m.calls).toEqual(["cancelOpenJobs:Xero organisation changed", "deleteContactLinks", "upsertConnection", "upsertCredential", "markConnected"]);
  });

  it("writes needs_reconnect first and only flips to connected after the credential is stored", async () => {
    const m = memoryRepo(null);
    await saveConnection(m.repo, args);
    expect(m.upserted).toMatchObject({ status: "needs_reconnect" });
  });

  it("never reads as connected when the credential write throws, on first connect", async () => {
    const m = memoryRepo(null, { failOn: "upsertCredential" });
    await expect(saveConnection(m.repo, args)).rejects.toThrow("upsertCredential failed");
    expect(m.calls).not.toContain("markConnected");
    expect(m.upserted).toMatchObject({ status: "needs_reconnect" });
  });

  it("an org change whose credential write fails has already cancelled and dropped, and is not connected", async () => {
    const m = memoryRepo({ id: "conn-1", external_org_id: "o1", status: "connected" }, { failOn: "upsertCredential" });
    await expect(saveConnection(m.repo, args)).rejects.toThrow();
    expect(m.state?.status).toBe("needs_reconnect");
    expect(m.calls.slice(0, 3)).toEqual(["cancelOpenJobs:Xero organisation changed", "deleteContactLinks", "upsertConnection"]);
  });

  it("a failed cleanup leaves the old organisation in place so a retry still cleans up", async () => {
    const m = memoryRepo({ id: "conn-1", external_org_id: "o1", status: "connected" }, { failOn: "cancelOpenJobs" });
    await expect(saveConnection(m.repo, args)).rejects.toThrow();
    expect(m.state?.external_org_id).toBe("o1");
    expect(m.state?.status).toBe("connected");
    expect(m.calls).not.toContain("upsertConnection");
    const retry = memoryRepo({ id: "conn-1", external_org_id: "o1", status: "connected" });
    expect((await saveConnection(retry.repo, args)).orgChanged).toBe(true);
  });
});

describe("disconnectXero", () => {
  it("disconnects locally even when Xero calls fail, marking disconnected before cancelling jobs", async () => {
    const m = memoryRepo({ id: "conn-1" });
    const r = await disconnectXero(m.repo, {
      connection: { id: "conn-1", external_connection_id: "xc-1" },
      getAccessToken: vi.fn().mockRejectedValue(new Error("down")),
      readRefreshToken: vi.fn().mockResolvedValue("rt"),
      revoke: vi.fn().mockResolvedValue(false),
      deleteXeroConnection: vi.fn(),
    });
    expect(r).toEqual({ revokedAtXero: false });
    expect(m.calls).toEqual(["markDisconnected", "cancelOpenJobs:Xero disconnected", "deleteCredential"]);
  });
  it("reports success when Xero revokes", async () => {
    const m = memoryRepo({ id: "conn-1" });
    const deleteXeroConnection = vi.fn().mockResolvedValue(true);
    const r = await disconnectXero(m.repo, {
      connection: { id: "conn-1", external_connection_id: "xc-1" },
      getAccessToken: vi.fn().mockResolvedValue("at"),
      readRefreshToken: vi.fn().mockResolvedValue("rt"),
      revoke: vi.fn().mockResolvedValue(true),
      deleteXeroConnection,
    });
    expect(deleteXeroConnection).toHaveBeenCalledWith("at", "xc-1");
    expect(r).toEqual({ revokedAtXero: true });
  });
  it("retries local cleanup for an already-disconnected row without calling Xero", async () => {
    const m = memoryRepo({ id: "conn-1", status: "disconnected" });
    const deleteXeroConnection = vi.fn();
    const revoke = vi.fn();
    const r = await disconnectXero(m.repo, {
      connection: { id: "conn-1", external_connection_id: "xc-1", status: "disconnected" },
      getAccessToken: vi.fn(),
      readRefreshToken: vi.fn(),
      revoke,
      deleteXeroConnection,
    });
    expect(r).toEqual({ revokedAtXero: false });
    expect(deleteXeroConnection).not.toHaveBeenCalled();
    expect(revoke).not.toHaveBeenCalled();
    expect(m.calls).toEqual(["cancelOpenJobs:Xero disconnected", "deleteCredential"]);
  });
  it("a failed cleanup throws, and a second attempt completes it", async () => {
    const deps = (status: string) => ({
      connection: { id: "conn-1", external_connection_id: "xc-1", status },
      getAccessToken: async () => "at",
      readRefreshToken: async () => "rt",
      revoke: async () => true,
      deleteXeroConnection: async () => true,
    });
    const first = memoryRepo({ id: "conn-1", status: "connected" }, { failOn: "cancelOpenJobs" });
    await expect(disconnectXero(first.repo, deps("connected"))).rejects.toThrow();
    expect(first.state?.status).toBe("disconnected");
    const second = memoryRepo({ id: "conn-1", status: "disconnected" });
    await disconnectXero(second.repo, deps(first.state?.status as string));
    expect(second.calls).toEqual(["cancelOpenJobs:Xero disconnected", "deleteCredential"]);
  });
  it("logs when Xero declines the delete or the revoke", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const m = memoryRepo({ id: "conn-1" });
    await disconnectXero(m.repo, {
      connection: { id: "conn-1", external_connection_id: "xc-1" },
      getAccessToken: async () => "at",
      readRefreshToken: async () => "rt",
      revoke: async () => false,
      deleteXeroConnection: async () => false,
    });
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });
  it("calls DELETE /connections before revoking the refresh token", async () => {
    const m = memoryRepo({ id: "conn-1" });
    const order: string[] = [];
    await disconnectXero(m.repo, {
      connection: { id: "conn-1", external_connection_id: "xc-1" },
      getAccessToken: async () => "at",
      readRefreshToken: async () => "rt",
      revoke: async () => { order.push("revoke"); return true; },
      deleteXeroConnection: async () => { order.push("delete"); return true; },
    });
    expect(order).toEqual(["delete", "revoke"]);
  });
});

type Scripted = { data: unknown; error: { message: string } | null };

// A minimal chainable supabase fake. Every builder method returns the chain; awaiting
// it (or .single()/.maybeSingle()) resolves to the next scripted result for that table.
function fakeDb(results: Record<string, Scripted[]>) {
  const log: { table: string; ops: string[] }[] = [];
  const db = {
    from(table: string) {
      const entry = { table, ops: [] as string[] };
      log.push(entry);
      const next = (): Scripted => (results[table] ?? []).shift() ?? { data: null, error: null };
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "update", "upsert", "delete", "eq", "in", "not"]) {
        chain[m] = (...a: unknown[]) => {
          entry.ops.push(`${m}:${JSON.stringify(a)}`);
          return chain;
        };
      }
      chain.single = () => Promise.resolve(next());
      chain.maybeSingle = () => Promise.resolve(next());
      chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) => Promise.resolve(next()).then(res, rej);
      return chain;
    },
  };
  return { db: db as never, log };
}

describe("supabaseConnectionRepo", () => {
  const err = { message: "boom" };
  it("upsertConnection throws on a failed write rather than reporting connected", async () => {
    const f = fakeDb({ accounting_connection: [{ data: null, error: err }] });
    await expect(
      supabaseConnectionRepo(f.db).upsertConnection({
        tenant_id: "t1", provider: "xero", status: "connected", external_org_id: "o", external_connection_id: "c", org_name: "n", base_currency: "AUD",
      })
    ).rejects.toThrow("upsert accounting_connection: boom");
  });
  it("upsertCredential, markDisconnected and deleteCredential throw on error", async () => {
    await expect(supabaseConnectionRepo(fakeDb({ accounting_credential: [{ data: null, error: err }] }).db).upsertCredential("c", {} as never)).rejects.toThrow("boom");
    await expect(supabaseConnectionRepo(fakeDb({ accounting_connection: [{ data: null, error: err }] }).db).markDisconnected("c")).rejects.toThrow("boom");
    await expect(supabaseConnectionRepo(fakeDb({ accounting_credential: [{ data: null, error: err }] }).db).deleteCredential("c")).rejects.toThrow("boom");
  });
  it("upsertCredential bumps the existing version instead of resetting it to 1", async () => {
    const f = fakeDb({ accounting_credential: [{ data: { version: 4 }, error: null }, { data: null, error: null }] });
    await supabaseConnectionRepo(f.db).upsertCredential("c", {} as never);
    expect(f.log[1].ops.join()).toContain('"version":5');
  });
  it("cancelOpenJobs also cancels gave_up jobs", async () => {
    const f = fakeDb({ accounting_outbox: [{ data: [], error: null }] });
    await supabaseConnectionRepo(f.db).cancelOpenJobs("c", "r");
    expect(f.log[0].ops.join()).toContain("gave_up");
  });
  it("cancelOpenJobs throws when the cancel fails and when the invoice reset fails", async () => {
    await expect(
      supabaseConnectionRepo(fakeDb({ accounting_outbox: [{ data: null, error: err }] }).db).cancelOpenJobs("c", "r")
    ).rejects.toThrow("cancel accounting_outbox jobs: boom");
    const f = fakeDb({
      accounting_outbox: [{ data: [{ entity_id: "i1", operation: "create_bill" }], error: null }],
      supplier_invoice: [{ data: null, error: err }],
    });
    await expect(supabaseConnectionRepo(f.db).cancelOpenJobs("c", "r")).rejects.toThrow("reset supplier_invoice sync_status: boom");
  });
  it("cancelOpenJobs resets posted bills to not_synced and voided bills to sent, from the update's returned rows", async () => {
    const f = fakeDb({
      accounting_outbox: [
        {
          data: [
            { entity_id: "i1", operation: "create_bill" },
            { entity_id: "i2", operation: "void_bill" },
            { entity_id: "s1", operation: "create_contact" },
          ],
          error: null,
        },
      ],
      supplier_invoice: [{ data: null, error: null }, { data: null, error: null }],
    });
    await supabaseConnectionRepo(f.db).cancelOpenJobs("c", "r");
    const inv = f.log.filter((l) => l.table === "supplier_invoice");
    expect(inv).toHaveLength(2);
    expect(inv[0].ops.join()).toContain('"sync_status":"not_synced"');
    expect(inv[0].ops.join()).toContain('["i1"]');
    expect(inv[1].ops.join()).toContain('"sync_status":"sent"');
    expect(inv[1].ops.join()).toContain('["i2"]');
  });
});
