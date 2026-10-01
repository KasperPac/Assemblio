import { describe, expect, it } from "vitest";
import { validateSetup } from "./setup";

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
