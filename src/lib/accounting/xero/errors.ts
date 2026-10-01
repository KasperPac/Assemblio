import type { XeroFailure } from "./client";

export type ErrorClass = "transient" | "fixable" | "auth" | "daily_limit";
export type ClassifiedError = { errorClass: ErrorClass; message: string; detail: unknown; retryAfterSec: number | null };

export const XERO_ERROR_CATALOGUE: ReadonlyArray<{ pattern: RegExp; message: string }> = [
  { pattern: /account code .*(is not a valid code|has been archived|cannot be used)/i, message: "The Xero account on this bill is archived or missing. Pick another account in Xero setup, then retry." },
  { pattern: /(taxtype|tax type|tax rate).*(not valid|cannot be used|does not exist|invalid)/i, message: "The tax rate on this bill can't be used in Xero any more. Update the tax mapping in Xero setup or change the line's tax rate, then retry." },
  { pattern: /contact.*archived/i, message: "This supplier's Xero contact is archived. Restore it in Xero or relink the supplier, then retry." },
  { pattern: /(lock date|period.*locked|locked period)/i, message: "Xero is locked for this invoice date. Change the invoice date or ask your accountant to move the lock date, then retry." },
  { pattern: /(invoice #|invoice number).*(must be unique|already)/i, message: "Xero already has a bill with this invoice number for this supplier. Check Xero for a duplicate before retrying." },
  { pattern: /contact name .* already (assigned|exists)/i, message: "A contact with this name already exists in Xero. Link the supplier to it instead of creating a new one." },
  { pattern: /(organisation|subscription).*(not active|expired|cancelled)/i, message: "The connected Xero organisation is not active. Check the Xero subscription, then retry." },
];

export function xeroValidationMessages(body: unknown): string[] {
  const out: string[] = [];
  const visit = (node: unknown, depth: number) => {
    if (depth > 6 || !node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      node.forEach((n) => visit(n, depth + 1));
      return;
    }
    const obj = node as Record<string, unknown>;
    if (Array.isArray(obj.ValidationErrors)) {
      for (const v of obj.ValidationErrors) {
        const m = (v as { Message?: unknown } | null)?.Message;
        if (typeof m === "string") out.push(m);
      }
    }
    for (const [k, v] of Object.entries(obj)) if (k !== "ValidationErrors") visit(v, depth + 1);
  };
  visit(body, 0);
  if (out.length === 0 && body && typeof body === "object" && typeof (body as { Message?: unknown }).Message === "string") {
    out.push((body as { Message: string }).Message);
  }
  return [...new Set(out)];
}

export function toUserMessage(xeroMessage: string): string {
  const hit = XERO_ERROR_CATALOGUE.find((e) => e.pattern.test(xeroMessage));
  return hit ? hit.message : `Xero rejected this: ${xeroMessage}`;
}

export function fixableError(message: string, detail: unknown = null): ClassifiedError {
  return { errorClass: "fixable", message, detail, retryAfterSec: null };
}

export function classifyXeroFailure(f: XeroFailure): ClassifiedError {
  const detail = { status: f.status, body: f.body, networkError: f.networkError ?? null };
  if (f.status === 0) return { errorClass: "transient", message: "Couldn't reach Xero. Manuva will retry automatically.", detail, retryAfterSec: null };
  if (f.status === 429) {
    const daily = (f.rate.problem ?? "").toLowerCase().includes("day");
    return daily
      ? { errorClass: "daily_limit", message: "Xero's daily limit for this organisation was reached. Manuva will continue when it resets.", detail, retryAfterSec: f.rate.retryAfterSec }
      : { errorClass: "transient", message: "Xero asked Manuva to slow down. Retrying shortly.", detail, retryAfterSec: f.rate.retryAfterSec };
  }
  if (f.status >= 500) return { errorClass: "transient", message: "Xero had a problem. Manuva will retry automatically.", detail, retryAfterSec: f.rate.retryAfterSec };
  if (f.status === 401) return { errorClass: "auth", message: "Xero no longer accepts Manuva's connection. An admin needs to reconnect Xero.", detail, retryAfterSec: null };
  if (f.status === 403) return { errorClass: "auth", message: "Manuva doesn't have permission for this in Xero. An admin needs to reconnect Xero and approve the requested access.", detail, retryAfterSec: null };
  if (f.status === 404) return fixableError("Xero couldn't find this record. It may have been deleted in Xero.", detail);
  const messages = xeroValidationMessages(f.body);
  return fixableError(messages.length ? toUserMessage(messages[0]) : `Xero rejected this request (HTTP ${f.status}).`, detail);
}
