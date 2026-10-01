import { XERO_API_BASE } from "./config";
import { scrubSecrets } from "./scrub";

export type XeroAccess = { accessToken: string; xeroTenantId: string };
export type RateInfo = { minRemaining: number | null; dayRemaining: number | null; retryAfterSec: number | null; problem: string | null };
export type XeroRequest = { method: "GET" | "POST" | "PUT"; path: string; query?: Record<string, string>; body?: unknown; idempotencyKey?: string };
export type XeroFailure = { ok: false; status: number; body: unknown; rate: RateInfo; networkError?: string };
export type XeroResult<T> = { ok: true; status: number; data: T; rate: RateInfo } | XeroFailure;

const EMPTY_RATE: RateInfo = { minRemaining: null, dayRemaining: null, retryAfterSec: null, problem: null };
const num = (v: string | null) => (v === null || v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v));

export function parseRateHeaders(h: Headers): RateInfo {
  return {
    minRemaining: num(h.get("x-minlimit-remaining")),
    dayRemaining: num(h.get("x-daylimit-remaining")),
    retryAfterSec: num(h.get("retry-after")),
    problem: h.get("x-rate-limit-problem"),
  };
}

export async function xeroRequest<T>(
  access: XeroAccess,
  req: XeroRequest,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 15_000
): Promise<XeroResult<T>> {
  const url = new URL(`${XERO_API_BASE}${req.path}`);
  for (const [k, v] of Object.entries(req.query ?? {})) url.searchParams.set(k, v);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${access.accessToken}`,
    "xero-tenant-id": access.xeroTenantId,
    Accept: "application/json",
  };
  if (req.body !== undefined) headers["Content-Type"] = "application/json";
  if (req.idempotencyKey) headers["Idempotency-Key"] = req.idempotencyKey;

  let res: Response;
  try {
    res = await fetchImpl(url.toString(), {
      method: req.method,
      headers,
      body: req.body === undefined ? undefined : JSON.stringify(req.body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, status: 0, body: null, rate: EMPTY_RATE, networkError: String(scrubSecrets(message)) };
  }
  const rate = parseRateHeaders(res.headers);
  const text = await res.text().catch(() => "");
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text.slice(0, 2000);
    }
  }
  if (!res.ok) return { ok: false, status: res.status, body: scrubSecrets(parsed), rate };
  return { ok: true, status: res.status, data: parsed as T, rate };
}
