import { xeroRequest, type XeroAccess } from "./client";

export type XeroAccount = { AccountID: string; Code?: string; Name: string; Type: string; Status: string };
export type XeroTaxRate = { TaxType: string; Name: string; Status: string; CanApplyToExpenses?: boolean; EffectiveRate?: number | string };
export type XeroOrganisation = { Name: string; BaseCurrency: string; PeriodLockDate?: string | null; EndOfYearLockDate?: string | null };
export type XeroContact = { ContactID: string; Name: string; ContactStatus?: string; EmailAddress?: string };

type F = typeof fetch;

export const fetchOrganisation = (access: XeroAccess, f: F = fetch) =>
  xeroRequest<{ Organisations: XeroOrganisation[] }>(access, { method: "GET", path: "/Organisation" }, f);
export const fetchAccounts = (access: XeroAccess, f: F = fetch) =>
  xeroRequest<{ Accounts: XeroAccount[] }>(access, { method: "GET", path: "/Accounts", query: { where: 'Status=="ACTIVE"' } }, f);
export const fetchTaxRates = (access: XeroAccess, f: F = fetch) =>
  xeroRequest<{ TaxRates: XeroTaxRate[] }>(access, { method: "GET", path: "/TaxRates", query: { where: 'Status=="ACTIVE"' } }, f);
export const searchContacts = (access: XeroAccess, term: string, f: F = fetch) =>
  xeroRequest<{ Contacts: XeroContact[] }>(access, { method: "GET", path: "/Contacts", query: { searchTerm: term, summaryOnly: "true", page: "1" } }, f);
export const getContact = (access: XeroAccess, contactId: string, f: F = fetch) =>
  xeroRequest<{ Contacts: XeroContact[] }>(access, { method: "GET", path: `/Contacts/${encodeURIComponent(contactId)}` }, f);

/** CURRENT, not INVENTORY: manual journals (the COGS release) cannot post to INVENTORY-type accounts. */
export const INVENTORY_ACCOUNT_TYPES = ["CURRENT"] as const;
export const OTHER_CHARGE_ACCOUNT_TYPES = ["EXPENSE", "DIRECTCOSTS", "OVERHEADS"] as const;

export function accountOptions(accounts: XeroAccount[], types: readonly string[]) {
  return accounts
    .filter((a) => a.Status === "ACTIVE" && !!a.Code && types.includes(a.Type))
    .map((a) => ({ code: a.Code!, name: a.Name, type: a.Type }))
    .sort((x, y) => x.code.localeCompare(y.code));
}

export function purchaseTaxOptions(rates: XeroTaxRate[]) {
  return rates
    .filter((r) => r.Status === "ACTIVE" && r.CanApplyToExpenses !== false)
    .map((r) => ({ taxType: r.TaxType, name: r.Name, rate: Number(r.EffectiveRate ?? 0) }));
}

export function parseXeroDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const ms = value.match(/\/Date\((-?\d+)/);
  if (ms) return new Date(Number(ms[1])).toISOString().slice(0, 10);
  const iso = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : null;
}

/** Returns the lock date that blocks this invoice date, or null. Xero locks dates on or before the lock date. */
export function lockDateBlocking(invoiceDate: string, org: Pick<XeroOrganisation, "PeriodLockDate" | "EndOfYearLockDate">): string | null {
  const dates = [parseXeroDate(org.PeriodLockDate), parseXeroDate(org.EndOfYearLockDate)].filter((d): d is string => !!d).sort();
  const latest = dates[dates.length - 1];
  return latest && invoiceDate <= latest ? latest : null;
}
