const SECRET_KEYS = /^(authorization|(access|refresh|id)[_-]?token|token|client[_-]?secret)$/i;
const BEARER = /Bearer\s+[A-Za-z0-9._~+/=-]+/g;
const BASIC = /Basic\s+[A-Za-z0-9+/=]{8,}/g;
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g;

export function scrubSecrets(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[depth]";
  if (typeof value === "string") return value.replace(BEARER, "Bearer [redacted]").replace(BASIC, "Basic [redacted]").replace(JWT, "[redacted-jwt]");
  if (Array.isArray(value)) return value.map((v) => scrubSecrets(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = SECRET_KEYS.test(k) ? "[redacted]" : scrubSecrets(v, depth + 1);
    return out;
  }
  return value;
}
