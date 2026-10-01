import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export type TokenKey = { key: Buffer; version: number };

export function loadTokenKey(env: Record<string, string | undefined> = process.env): TokenKey {
  const raw = env.ACCOUNTING_TOKEN_KEY;
  if (!raw) throw new Error("ACCOUNTING_TOKEN_KEY is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("ACCOUNTING_TOKEN_KEY must be 32 bytes, base64-encoded");
  const version = Number.parseInt(env.ACCOUNTING_TOKEN_KEY_VERSION ?? "1", 10);
  if (!Number.isInteger(version) || version < 1) {
    throw new Error("ACCOUNTING_TOKEN_KEY_VERSION must be a positive integer");
  }
  return { key, version };
}

export function encryptToken(plaintext: string, k: TokenKey): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k.key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v${k.version}.${iv.toString("base64url")}.${tag.toString("base64url")}.${ct.toString("base64url")}`;
}

export function decryptToken(envelope: string, k: TokenKey): string {
  const parts = envelope.split(".");
  if (parts.length !== 4 || !/^v\d+$/.test(parts[0])) throw new Error("Malformed token envelope");
  const version = Number.parseInt(parts[0].slice(1), 10);
  if (version !== k.version) {
    throw new Error(`Token encrypted with key v${version}; current key is v${k.version}`);
  }
  const decipher = createDecipheriv("aes-256-gcm", k.key, Buffer.from(parts[1], "base64url"));
  decipher.setAuthTag(Buffer.from(parts[2], "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(parts[3], "base64url")), decipher.final()]).toString("utf8");
}
