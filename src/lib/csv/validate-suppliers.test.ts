import { describe, it, expect } from "vitest";
import { validateSupplierRows } from "./validate-suppliers";

const noExisting = new Set<string>();

describe("validateSupplierRows", () => {
  it("passes a fully-valid row", () => {
    const rows = [{ name: "Omron", website: "https://omron.com", default_lead_time_days: "14", contact_name: "Jane", contact_email: "", contact_phone: "", address: "", payment_terms: "", default_currency: "AUD" }];
    const results = validateSupplierRows(rows, noExisting);
    expect(results[0].error).toBeUndefined();
  });

  it("fails when name is blank", () => {
    const rows = [{ name: "", website: "", default_lead_time_days: "", contact_name: "", contact_email: "", contact_phone: "", address: "", payment_terms: "", default_currency: "" }];
    const results = validateSupplierRows(rows, noExisting);
    expect(results[0].error).toBe("Name is required");
  });

  it("fails when name is duplicated within file (case-insensitive)", () => {
    const rows = [
      { name: "Omron", website: "", default_lead_time_days: "", contact_name: "", contact_email: "", contact_phone: "", address: "", payment_terms: "", default_currency: "" },
      { name: "OMRON", website: "", default_lead_time_days: "", contact_name: "", contact_email: "", contact_phone: "", address: "", payment_terms: "", default_currency: "" },
    ];
    const results = validateSupplierRows(rows, noExisting);
    expect(results[0].error).toBeUndefined();
    expect(results[1].error).toBe("Duplicate name in file");
  });

  it("fails when name already exists in DB (case-insensitive)", () => {
    const existing = new Set(["siemens"]);
    const rows = [{ name: "Siemens", website: "", default_lead_time_days: "", contact_name: "", contact_email: "", contact_phone: "", address: "", payment_terms: "", default_currency: "" }];
    const results = validateSupplierRows(rows, existing);
    expect(results[0].error).toBe("Supplier already exists");
  });

  it("fails when default_lead_time_days is a decimal", () => {
    const rows = [{ name: "Omron", website: "", default_lead_time_days: "3.5", contact_name: "", contact_email: "", contact_phone: "", address: "", payment_terms: "", default_currency: "" }];
    const results = validateSupplierRows(rows, noExisting);
    expect(results[0].error).toBe("default_lead_time_days must be a non-negative integer");
  });

  it("fails when default_lead_time_days is non-numeric", () => {
    const rows = [{ name: "Omron", website: "", default_lead_time_days: "abc", contact_name: "", contact_email: "", contact_phone: "", address: "", payment_terms: "", default_currency: "" }];
    const results = validateSupplierRows(rows, noExisting);
    expect(results[0].error).toBe("default_lead_time_days must be a non-negative integer");
  });

  it("fails when default_lead_time_days is negative", () => {
    const rows = [{ name: "Omron", website: "", default_lead_time_days: "-1", contact_name: "", contact_email: "", contact_phone: "", address: "", payment_terms: "", default_currency: "" }];
    const results = validateSupplierRows(rows, noExisting);
    expect(results[0].error).toBe("default_lead_time_days must be a non-negative integer");
  });

  it("accepts default_lead_time_days of zero", () => {
    const rows = [{ name: "Omron", website: "", default_lead_time_days: "0", contact_name: "", contact_email: "", contact_phone: "", address: "", payment_terms: "", default_currency: "" }];
    const results = validateSupplierRows(rows, noExisting);
    expect(results[0].error).toBeUndefined();
  });

  it("assigns rowIndex starting at 2", () => {
    const rows = [{ name: "Omron", website: "", default_lead_time_days: "", contact_name: "", contact_email: "", contact_phone: "", address: "", payment_terms: "", default_currency: "" }];
    const results = validateSupplierRows(rows, noExisting);
    expect(results[0].rowIndex).toBe(2);
  });
});
