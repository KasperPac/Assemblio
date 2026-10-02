export const DEFAULT_TERM_DAYS = 30;

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function endOfMonth(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

/** Spec §3.4a. Unparseable terms fall back to +30 days; the due date stays editable. */
export function dueDateFromTerms(invoiceDate: string, terms: string | null | undefined): string {
  const t = (terms ?? "").trim().toLowerCase();
  if (t === "eom") return endOfMonth(invoiceDate);
  let m = t.match(/^(\d{1,3})\s*(?:days?\s*)?eom$/);
  if (m) return addDays(endOfMonth(invoiceDate), Number(m[1]));
  m = t.match(/^(?:net\s*)?(\d{1,3})(?:\s*days?)?$/);
  if (m) return addDays(invoiceDate, Number(m[1]));
  return addDays(invoiceDate, DEFAULT_TERM_DAYS);
}
