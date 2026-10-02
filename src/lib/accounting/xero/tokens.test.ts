// src/lib/accounting/xero/tokens.test.ts
import { describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptToken, decryptToken } from "@/lib/security/token-crypto";
import { getXeroAccessToken, supabaseCredentialStore, XeroAuthError, type CredentialRow, type CredentialStore } from "./tokens";

const key = { key: randomBytes(32), version: 1 };
const T0 = Date.parse("2026-10-01T00:00:00Z");

function setup(opts: { accessExpiresInMs: number; leaseHeldUntil?: number }) {
  let clock = T0;
  let row: CredentialRow = {
    connection_id: "conn",
    access_token_enc: encryptToken("access-old", key),
    refresh_token_enc: encryptToken("refresh-old", key),
    key_version: 1,
    access_expires_at: new Date(T0 + opts.accessExpiresInMs).toISOString(),
    refresh_expires_at: new Date(T0 + 50 * 86_400_000).toISOString(),
    refresh_lease_until: opts.leaseHeldUntil ? new Date(opts.leaseHeldUntil).toISOString() : null,
    version: 1,
  };
  const needsReconnect: string[] = [];
  const store: CredentialStore = {
    async read() { return { ...row }; },
    async claimLease(_id, secs) {
      if (row.refresh_lease_until && Date.parse(row.refresh_lease_until) > clock) return null;
      row = { ...row, refresh_lease_until: new Date(clock + secs * 1000).toISOString() };
      return { ...row };
    },
    async writeRefreshed(_id, expected, next) {
      if (row.version !== expected) return false;
      row = { ...row, ...next, version: expected + 1, refresh_lease_until: null };
      return true;
    },
    async releaseLease() { row = { ...row, refresh_lease_until: null }; },
    async markNeedsReconnect(_id, reason) { needsReconnect.push(reason); },
    async markRefreshed() {},
  };
  return {
    store,
    needsReconnect,
    get row() { return row; },
    set row(r: CredentialRow) { row = r; },
    now: () => clock,
    advance: (ms: number) => { clock += ms; },
  };
}

const okRefresh = vi.fn(async () => ({ ok: true as const, tokens: { accessToken: "access-new", refreshToken: "refresh-new", expiresInSec: 1800 } }));

describe("getXeroAccessToken", () => {
  it("returns the stored token when it has more than 2 minutes left", async () => {
    const s = setup({ accessExpiresInMs: 10 * 60_000 });
    const refresh = vi.fn();
    expect(await getXeroAccessToken("conn", { store: s.store, key, refresh, now: s.now })).toBe("access-old");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes an expiring token and stores the rotated refresh token encrypted", async () => {
    const s = setup({ accessExpiresInMs: 60_000 });
    expect(await getXeroAccessToken("conn", { store: s.store, key, refresh: okRefresh, now: s.now })).toBe("access-new");
    expect(s.row.version).toBe(2);
    expect(decryptToken(s.row.refresh_token_enc, key)).toBe("refresh-new");
    expect(s.row.refresh_token_enc).not.toContain("refresh-new");
  });

  it("a lease loser waits and uses the winner's token", async () => {
    const s = setup({ accessExpiresInMs: 0 });
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const refresh = vi.fn(async () => {
      await gate;
      return { ok: true as const, tokens: { accessToken: "access-new", refreshToken: "refresh-new", expiresInSec: 1800 } };
    });
    const sleep = async (ms: number) => {
      s.advance(ms);
      release();
      await new Promise((r) => setTimeout(r, 0));
    };
    const deps = { store: s.store, key, refresh, now: s.now, sleep };
    const [a, b] = await Promise.all([getXeroAccessToken("conn", deps), getXeroAccessToken("conn", deps)]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(a).toBe("access-new");
    expect(b).toBe("access-new");
  });

  it("marks needs_reconnect and throws XeroAuthError on invalid_grant", async () => {
    const s = setup({ accessExpiresInMs: 0 });
    const refresh = vi.fn(async () => ({ ok: false as const, status: 400, error: "invalid_grant" }));
    await expect(getXeroAccessToken("conn", { store: s.store, key, refresh, now: s.now })).rejects.toBeInstanceOf(XeroAuthError);
    expect(s.needsReconnect).toHaveLength(1);
    expect(s.row.refresh_lease_until).toBeNull();
  });

  it("treats a network failure as transient: plain Error, lease released, no reconnect", async () => {
    const s = setup({ accessExpiresInMs: 0 });
    const refresh = vi.fn(async () => ({ ok: false as const, status: 0, error: "network_error" }));
    const err = await getXeroAccessToken("conn", { store: s.store, key, refresh, now: s.now }).catch((e) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(XeroAuthError);
    expect(s.needsReconnect).toHaveLength(0);
    expect(s.row.refresh_lease_until).toBeNull();
  });

  it("forceRefresh refreshes a still-valid token", async () => {
    const s = setup({ accessExpiresInMs: 20 * 60_000 });
    expect(await getXeroAccessToken("conn", { store: s.store, key, refresh: okRefresh, now: s.now }, { forceRefresh: true })).toBe("access-new");
  });

  it("scrubs token-like text out of a transient refresh error", async () => {
    const s = setup({ accessExpiresInMs: 0 });
    const refresh = vi.fn(async () => ({ ok: false as const, status: 500, error: "upstream said Bearer abc.def.ghi" }));
    const err = await getXeroAccessToken("conn", { store: s.store, key, refresh, now: s.now }).catch((e) => e);
    expect(String(err.message)).not.toContain("abc.def.ghi");
  });
});

describe("supabaseCredentialStore", () => {
  it("throws when the read returns { data: null, error } instead of proceeding", async () => {
    const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: null, error: { message: "boom" } }) };
    const db = { from: () => chain } as unknown as SupabaseClient;
    await expect(supabaseCredentialStore(db).read("conn")).rejects.toThrow(/read accounting_credential: boom/);
  });

  it("throws when the lease rpc returns an error", async () => {
    const db = { rpc: async () => ({ data: null, error: { message: "forbidden" } }) } as unknown as SupabaseClient;
    await expect(supabaseCredentialStore(db).claimLease("conn", 30)).rejects.toThrow(/claim_accounting_refresh_lease: forbidden/);
  });

  it("throws when the compare-and-swap write returns an error", async () => {
    const chain = { update: () => chain, eq: () => chain, select: async () => ({ data: null, error: { message: "denied" } }) };
    const db = { from: () => chain } as unknown as SupabaseClient;
    await expect(
      supabaseCredentialStore(db).writeRefreshed("conn", 1, {
        access_token_enc: "a", refresh_token_enc: "b", key_version: 1, access_expires_at: "x", refresh_expires_at: "y",
      })
    ).rejects.toThrow(/write accounting_credential: denied/);
  });

  it("scrubs the reason before it is stored in last_error", async () => {
    let stored: { last_error?: string } = {};
    const chain = { update: (v: { last_error?: string }) => { stored = v; return chain; }, eq: () => chain, then: (r: (v: unknown) => void) => r({ error: null }) };
    const db = { from: () => chain } as unknown as SupabaseClient;
    await supabaseCredentialStore(db).markNeedsReconnect("conn", "rejected Bearer abc.def.ghi");
    expect(stored.last_error).not.toContain("abc.def.ghi");
  });
});
