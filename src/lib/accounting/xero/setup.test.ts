import { describe, expect, it } from "vitest";
import { setupTaxRates, storedAccountOptions, storedTaxOptions, validateSetup } from "./setup";

const accounts = [
  { AccountID: "a1", Code: "630", Name: "Inventory", Type: "CURRENT", Status: "ACTIVE" },
  { AccountID: "a3", Code: "425", Name: "Freight", Type: "EXPENSE", Status: "ACTIVE" },
];
const rates = [
  { TaxType: "INPUT", Name: "GST on Expenses", Status: "ACTIVE", CanApplyToExpenses: true, EffectiveRate: 10 },
  { TaxType: "EXEMPTEXPENSES", Name: "GST Free Expenses", Status: "ACTIVE", CanApplyToExpenses: true, EffectiveRate: 0 },
];
const good = { inventoryAccountCode: "630", otherChargesAccountCode: "425", purchaseTaxType: "INPUT", gstFreeTaxType: "EXEMPTEXPENSES", defaultAmountsMode: "exclusive", billsStartDate: "2026-10-01", salesSource: "a2x" };

describe("validateSetup", () => {
  it("accepts a valid setup", () => {
    expect(validateSetup(good, accounts, rates)).toEqual({ ok: true, value: { ...good, defaultAmountsMode: "exclusive", salesSource: "a2x" } });
  });
  it("rejects an expense account as inventory and every other bad field", () => {
    const r = validateSetup({ ...good, inventoryAccountCode: "425", otherChargesAccountCode: "630", purchaseTaxType: "OUTPUT", gstFreeTaxType: "", defaultAmountsMode: "gross", billsStartDate: "1/10/2026", salesSource: "shopify" }, accounts, rates);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["billsStartDate", "defaultAmountsMode", "gstFreeTaxType", "inventoryAccountCode", "otherChargesAccountCode", "purchaseTaxType", "salesSource"]);
  });
  it("rejects impossible start dates like 2026-02-31", () => {
    const r = validateSetup({ ...good, billsStartDate: "2026-02-31" }, accounts, rates);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.billsStartDate).toBeDefined();
  });
});

describe("setupTaxRates", () => {
  it("stores Xero's EffectiveRate for the two chosen tax types", () => {
    expect(setupTaxRates(rates, "INPUT", "EXEMPTEXPENSES")).toEqual({ purchaseTaxRate: 10, gstFreeTaxRate: 0 });
  });
  it("falls back to DisplayTaxRate, and to null when Xero gives no usable rate", () => {
    const r = [
      { TaxType: "A", Name: "A", Status: "ACTIVE", DisplayTaxRate: "15" },
      { TaxType: "B", Name: "B", Status: "ACTIVE", EffectiveRate: "abc" },
    ];
    expect(setupTaxRates(r, "A", "B")).toEqual({ purchaseTaxRate: 15, gstFreeTaxRate: null });
    expect(setupTaxRates(r, "A", "MISSING").gstFreeTaxRate).toBeNull();
  });
});

describe("stored setup options (live Xero reads unavailable)", () => {
  const conn = {
    inventory_account_code: "630", other_charges_account_code: "425",
    purchase_tax_type: "INPUT", purchase_tax_rate: 10, gst_free_tax_type: "EXEMPTEXPENSES", gst_free_tax_rate: 0,
  };
  it("offers the purchase and GST-free tax types at their stored rates", () => {
    expect(storedTaxOptions(conn)).toEqual([
      { taxType: "INPUT", name: "Purchases: INPUT (10%)", rate: 10 },
      { taxType: "EXEMPTEXPENSES", name: "GST-free: EXEMPTEXPENSES (0%)", rate: 0 },
    ]);
  });
  it("reads numeric strings and leaves out a tax type with no stored rate", () => {
    expect(storedTaxOptions({ ...conn, purchase_tax_rate: "10.0000", gst_free_tax_rate: null })).toEqual([
      { taxType: "INPUT", name: "Purchases: INPUT (10%)", rate: 10 },
    ]);
  });
  it("offers the two stored accounts", () => {
    expect(storedAccountOptions(conn)).toEqual([
      { code: "630", name: "Inventory (from Xero setup)" },
      { code: "425", name: "Freight and other charges (from Xero setup)" },
    ]);
    expect(storedAccountOptions({ inventory_account_code: "630", other_charges_account_code: null })).toEqual([{ code: "630", name: "Inventory (from Xero setup)" }]);
  });
});
