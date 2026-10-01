import { describe, expect, it } from "vitest";
import { createSignedState, readSignedState, newNonce } from "./signed-state";

const SECRET = "test-secret";
const NOW = 1_800_000_000_000;

describe("signed state", () => {
  it("round-trips fields and adds exp", () => {
    const token = createSignedState({ tenantId: "t1", userId: "u1", nonce: "n1" }, SECRET, 600_000, NOW);
    const r = readSignedState<{ tenantId: string; userId: string; nonce: string }>(token, SECRET, NOW + 1000);
    expect(r).toEqual({ ok: true, payload: { tenantId: "t1", userId: "u1", nonce: "n1", exp: NOW + 600_000 } });
  });

  it("rejects a token signed with another secret", () => {
    const token = createSignedState({ a: "1" }, "other", 600_000, NOW);
    expect(readSignedState(token, SECRET, NOW)).toEqual({ ok: false, reason: "bad-signature" });
  });

  it("rejects a tampered body", () => {
    const token = createSignedState({ tenantId: "t1" }, SECRET, 600_000, NOW);
    const [, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ tenantId: "t2", exp: NOW + 600_000 })).toString("base64url");
    expect(readSignedState(`${forged}.${sig}`, SECRET, NOW)).toEqual({ ok: false, reason: "bad-signature" });
  });

  it("rejects an expired token", () => {
    const token = createSignedState({ a: "1" }, SECRET, 1000, NOW);
    expect(readSignedState(token, SECRET, NOW + 1000)).toEqual({ ok: false, reason: "expired" });
  });

  it("rejects malformed input", () => {
    expect(readSignedState("nodot", SECRET, NOW)).toEqual({ ok: false, reason: "malformed" });
    expect(readSignedState("a.b.c", SECRET, NOW)).toEqual({ ok: false, reason: "malformed" });
  });

  it("refuses to sign with an empty secret", () => {
    expect(() => createSignedState({ a: "1" }, "", 1000, NOW)).toThrow(/empty secret/);
  });

  it("makes 32-hex-char nonces that differ", () => {
    const a = newNonce();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(newNonce()).not.toBe(a);
  });
});
