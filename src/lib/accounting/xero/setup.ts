import { isDate } from "../supplier-invoice/draft";
import type { AmountsMode } from "../supplier-invoice/calc";
import { accountOptions, INVENTORY_ACCOUNT_TYPES, OTHER_CHARGE_ACCOUNT_TYPES, purchaseTaxOptions, type XeroAccount, type XeroTaxRate } from "./org";

export const SALES_SOURCES = ["a2x", "link_my_books", "xero_shopify", "square", "amaka", "none", "other"] as const;
export type SalesSource = (typeof SALES_SOURCES)[number];

export const SALES_SOURCE_LABELS: Record<SalesSource, string> = {
  a2x: "A2X",
  link_my_books: "Link My Books",
  xero_shopify: "Xero's Shopify integration",
  square: "Square's Xero integration",
  amaka: "Amaka",
  none: "Nothing — we enter sales ourselves",
  other: "Something else",
};

export const SALES_SOURCE_GUIDANCE: Record<SalesSource, string> = {
  a2x: "Keep A2X sending your sales. Manuva never posts sales. When Manuva's cost-of-goods journal arrives, turn off COGS in A2X so it isn't counted twice.",
  link_my_books: "Keep Link My Books sending your sales. Manuva never posts sales. When Manuva's cost-of-goods journal arrives, turn off COGS in Link My Books.",
  xero_shopify: "Keep Xero's Shopify integration sending your sales. Manuva never posts sales, so nothing is counted twice.",
  square: "Keep Square sending your sales to Xero. Manuva never posts sales, so nothing is counted twice.",
  amaka: "Keep Amaka sending your sales. Manuva never posts sales. When Manuva's cost-of-goods journal arrives, turn off COGS in Amaka.",
  none: "Manuva won't send sales to Xero. Keep recording sales in Xero the way you do today.",
  other: "Manuva never posts sales. If that tool also posts cost of goods, it will need turning off when Manuva's cost-of-goods journal arrives.",
};

export type SetupInput = {
  inventoryAccountCode: string;
  otherChargesAccountCode: string;
  purchaseTaxType: string;
  gstFreeTaxType: string;
  defaultAmountsMode: string;
  billsStartDate: string;
  salesSource: string;
};
export type SetupValue = Omit<SetupInput, "defaultAmountsMode" | "salesSource"> & { defaultAmountsMode: AmountsMode; salesSource: SalesSource };

export function validateSetup(input: SetupInput, accounts: XeroAccount[], rates: XeroTaxRate[]):
  | { ok: true; value: SetupValue }
  | { ok: false; errors: Partial<Record<keyof SetupInput, string>> } {
  const errors: Partial<Record<keyof SetupInput, string>> = {};
  const inv = new Set(accountOptions(accounts, INVENTORY_ACCOUNT_TYPES).map((a) => a.code));
  const other = new Set(accountOptions(accounts, OTHER_CHARGE_ACCOUNT_TYPES).map((a) => a.code));
  const tax = new Set(purchaseTaxOptions(rates).map((r) => r.taxType));
  if (!inv.has(input.inventoryAccountCode)) errors.inventoryAccountCode = "Choose an active current-asset account for inventory.";
  if (!other.has(input.otherChargesAccountCode)) errors.otherChargesAccountCode = "Choose an active expense account for freight and other charges.";
  if (!tax.has(input.purchaseTaxType)) errors.purchaseTaxType = "Choose a purchase tax rate from your Xero organisation.";
  if (!tax.has(input.gstFreeTaxType)) errors.gstFreeTaxType = "Choose a GST-free purchase tax rate from your Xero organisation.";
  if (input.defaultAmountsMode !== "inclusive" && input.defaultAmountsMode !== "exclusive") errors.defaultAmountsMode = "Choose whether amounts include GST.";
  if (!isDate(input.billsStartDate)) errors.billsStartDate = "Enter a valid start date.";
  if (!(SALES_SOURCES as readonly string[]).includes(input.salesSource)) errors.salesSource = "Tell us what sends your sales to Xero.";
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { ...input, defaultAmountsMode: input.defaultAmountsMode as AmountsMode, salesSource: input.salesSource as SalesSource } };
}

const percent = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
};

/** The live rates of the two chosen tax types, stored at setup (EffectiveRate, else DisplayTaxRate). */
export function setupTaxRates(rates: XeroTaxRate[], purchaseTaxType: string, gstFreeTaxType: string) {
  const rateOf = (taxType: string) => {
    const r = rates.find((x) => x.TaxType === taxType);
    return r ? (percent(r.EffectiveRate) ?? percent(r.DisplayTaxRate)) : null;
  };
  return { purchaseTaxRate: rateOf(purchaseTaxType), gstFreeTaxRate: rateOf(gstFreeTaxType) };
}

type StoredSetup = {
  inventory_account_code: string | null;
  other_charges_account_code: string | null;
  purchase_tax_type: string | null;
  purchase_tax_rate: number | string | null;
  gst_free_tax_type: string | null;
  gst_free_tax_rate: number | string | null;
};

/** Tax options from the stored setup, for when live Xero reads are unavailable (needs reconnect, read failed). */
export function storedTaxOptions(c: Pick<StoredSetup, "purchase_tax_type" | "purchase_tax_rate" | "gst_free_tax_type" | "gst_free_tax_rate">) {
  const out: Array<{ taxType: string; name: string; rate: number }> = [];
  const add = (label: string, taxType: string | null, raw: number | string | null) => {
    const rate = percent(raw);
    if (taxType && rate !== null && !out.some((o) => o.taxType === taxType)) out.push({ taxType, name: `${label}: ${taxType} (${rate}%)`, rate });
  };
  add("Purchases", c.purchase_tax_type, c.purchase_tax_rate);
  add("GST-free", c.gst_free_tax_type, c.gst_free_tax_rate);
  return out;
}

/** The two accounts chosen at setup, so lines carry codes while live Xero reads are unavailable. */
export function storedAccountOptions(c: Pick<StoredSetup, "inventory_account_code" | "other_charges_account_code">) {
  const out: Array<{ code: string; name: string }> = [];
  if (c.inventory_account_code) out.push({ code: c.inventory_account_code, name: "Inventory (from Xero setup)" });
  if (c.other_charges_account_code && c.other_charges_account_code !== c.inventory_account_code) {
    out.push({ code: c.other_charges_account_code, name: "Freight and other charges (from Xero setup)" });
  }
  return out;
}
