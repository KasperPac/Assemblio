import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { decryptToken, encryptToken, loadTokenKey } from "./token-crypto";

const key = { key: randomBytes(32), version: 1 };

describe("token-crypto", () => {
  it("round-trips a token", () => {
    const env = encryptToken("refresh-abc", key);
    expect(env).toMatch(/^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(env).not.toContain("refresh-abc");
    expect(decryptToken(env, key)).toBe("refresh-abc");
  });

  it("uses a fresh IV per call", () => {
    expect(encryptToken("same", key)).not.toBe(encryptToken("same", key));
  });

  it("fails on a tampered ciphertext", () => {
    const [v, iv, tag, ct] = encryptToken("secret", key).split(".");
    const flipped = Buffer.from(ct, "base64url");
    flipped[0] ^= 0xff;
    expect(() => decryptToken([v, iv, tag, flipped.toString("base64url")].join("."), key)).toThrow();
  });

  it("fails on a truncated auth tag", () => {
    const [v, iv, tag, ct] = encryptToken("secret", key).split(".");
    const truncated = Buffer.from(tag, "base64url").slice(0, 4).toString("base64url");
    expect(() => decryptToken([v, iv, truncated, ct].join("."), key)).toThrow();
  });

  it("fails on the wrong key or version", () => {
    const env = encryptToken("secret", key);
    expect(() => decryptToken(env, { key: randomBytes(32), version: 1 })).toThrow();
    expect(() => decryptToken(env, { key: key.key, version: 2 })).toThrow(/v1.*v2/);
  });

  it("loads a 32-byte base64 key and rejects bad ones", () => {
    const b64 = randomBytes(32).toString("base64");
    expect(loadTokenKey({ ACCOUNTING_TOKEN_KEY: b64, ACCOUNTING_TOKEN_KEY_VERSION: "3" }).version).toBe(3);
    expect(loadTokenKey({ ACCOUNTING_TOKEN_KEY: b64 }).version).toBe(1);
    expect(() => loadTokenKey({})).toThrow(/not set/);
    expect(() => loadTokenKey({ ACCOUNTING_TOKEN_KEY: randomBytes(16).toString("base64") })).toThrow(/32 bytes/);
    expect(() => loadTokenKey({ ACCOUNTING_TOKEN_KEY: b64, ACCOUNTING_TOKEN_KEY_VERSION: "0" })).toThrow(/positive integer/);
  });
});
