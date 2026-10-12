import { SQUARE_API_VERSION, squareBaseUrl } from "./config";

export type SquareAccess = { baseUrl: string; accessToken: string };
export type SquareFailure = { ok: false; status: number; errorClass: "auth" | "rate_limit" | "transient" | "validation"; code: string };
export type SquareResult<T> = { ok: true; data: T } | SquareFailure;
const SAFE_CODES = new Set(["ACCESS_TOKEN_EXPIRED", "ACCESS_TOKEN_REVOKED", "UNAUTHORIZED", "FORBIDDEN", "RATE_LIMITED", "INVALID_GRANT", "invalid_grant", "INVALID_REQUEST", "NOT_FOUND", "INTERNAL_SERVER_ERROR", "SERVICE_UNAVAILABLE"]);
export function squareFailure(status: number, body: unknown): SquareFailure {
  const candidate = (body as { errors?: Array<{ code?: unknown }>; error?: unknown } | null)?.errors?.[0]?.code ?? (body as { error?: unknown } | null)?.error;
  const code = typeof candidate === "string" && SAFE_CODES.has(candidate) ? candidate : `http_${status}`;
  const errorClass = status === 401 || code === "INVALID_GRANT" || code === "invalid_grant" || code === "ACCESS_TOKEN_EXPIRED" || code === "ACCESS_TOKEN_REVOKED" ? "auth" : status === 429 ? "rate_limit" : status === 0 || status >= 500 ? "transient" : "validation";
  return { ok: false, status, errorClass, code };
}
export async function squareFetch<T>(access: SquareAccess, path: string, options: { method?: "GET" | "POST"; body?: unknown } = {}, fetchImpl: typeof fetch = fetch): Promise<SquareResult<T>> {
  // Never send seller credentials to a URL or origin supplied by a response or caller.
  if (![squareBaseUrl("production"), squareBaseUrl("sandbox")].includes(access.baseUrl) || !path.startsWith("/v2/") || path.includes("\\") || path.includes("..")) {
    return { ok: false, status: 0, errorClass: "validation", code: "invalid_path" };
  }
  try {
    const res = await fetchImpl(access.baseUrl + path, {
      method: options.method ?? "GET", redirect: "error", headers: { Authorization: `Bearer ${access.accessToken}`, "Square-Version": SQUARE_API_VERSION, "Content-Type": "application/json", Accept: "application/json" },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }), signal: AbortSignal.timeout(15_000),
    });
    const body: unknown = await res.json().catch(() => null);
    if (!res.ok) return squareFailure(res.status, body);
    if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, status: res.status, errorClass: "transient", code: "invalid_response" };
    if (Array.isArray((body as { errors?: unknown }).errors) && (body as { errors: unknown[] }).errors.length) return squareFailure(502, body);
    return { ok: true, data: body as T };
  } catch { return { ok: false, status: 0, errorClass: "transient", code: "network_error" }; }
}
