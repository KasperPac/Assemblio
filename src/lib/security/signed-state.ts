import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export type StateFields = Record<string, string | number>;
export type ReadStateResult<T extends StateFields> =
  | { ok: true; payload: T & { exp: number } }
  | { ok: false; reason: "malformed" | "bad-signature" | "expired" };

function sign(body: string, secret: string): string {
  if (!secret) throw new Error("signed-state: empty secret");
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export function createSignedState(
  fields: StateFields,
  secret: string,
  ttlMs: number,
  now: number = Date.now()
): string {
  const body = Buffer.from(JSON.stringify({ ...fields, exp: now + ttlMs })).toString("base64url");
  return `${body}.${sign(body, secret)}`;
}

export function readSignedState<T extends StateFields>(
  token: string,
  secret: string,
  now: number = Date.now()
): ReadStateResult<T> {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: "malformed" };
  const [body, sig] = parts;
  const expected = Buffer.from(sign(body, secret));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, reason: "bad-signature" };
  }
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!payload || typeof payload !== "object" || typeof (payload as { exp?: unknown }).exp !== "number") {
    return { ok: false, reason: "malformed" };
  }
  const p = payload as T & { exp: number };
  if (p.exp <= now) return { ok: false, reason: "expired" };
  return { ok: true, payload: p };
}

export function newNonce(): string {
  return randomBytes(16).toString("hex");
}
