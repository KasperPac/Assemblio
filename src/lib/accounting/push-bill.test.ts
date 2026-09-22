import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock the admin client and the Xero HTTP layer before importing the SUT.
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: vi.fn(),
}));
vi.mock("@/lib/accounting/xero", () => ({
  refreshXeroToken: vi.fn(),
  createXeroBill: vi.fn(),
}));

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { refreshXeroToken, createXeroBill } from "@/lib/accounting/xero";
import { pushBillToAccounting } from "./push-bill";

type Row = Record<string, unknown>;

const HOUR = 60 * 60 * 1000;

function activeConnection(overrides: Row = {}): Row {
  return {
    id: "conn_1",
    tenant_id: "t1",
    provider: "xero",
    is_active: true,
    access_token: "access_current",
    refresh_token: "refresh_current",
    // Comfortably in the future so the refresh branch is not taken.
    token_expires_at: new Date(Date.now() + HOUR).toISOString(),
    provider_org_id: "org_1",
    default_account_code: "300",
    ...overrides,
  };
}

function receiptWithLines(lines: Row[], overrides: Row = {}): Row {
  return {
    supplier_reference: "INV-99",
    received_at: "2026-09-03T04:05:06.000Z",
    supplier_name_override: null,
    supplier: { name: "Acme Supplies" },
    delivery_receipt_line: lines,
    ...overrides,
  };
}

/**
 * Fake admin client. `connection` / `receipt` are what the two reads return;
 * every insert and update is recorded so the test can assert on the
 * accounting_sync_event row that gets written.
 */
function fakeAdmin(opts: { connection?: Row | null; receipt?: Row | null } = {}) {
  const inserted: Row[] = [];
  const updated: Row[] = [];

  const client = {
    inserted,
    updated,
    from(table: string) {
      return {
        select: () => ({
          eq: function () {
            return this;
          },
          maybeSingle: async () => ({
            data: opts.connection === undefined ? activeConnection() : opts.connection,
            error: null,
          }),
          single: async () => ({
            data: opts.receipt === undefined ? null : opts.receipt,
            error: null,
          }),
        }),
        insert: async (row: Row) => {
          inserted.push({ table, ...row });
          return { data: null, error: null };
        },
        update: (row: Row) => ({
          eq: async () => {
            updated.push({ table, ...row });
            return { data: null, error: null };
          },
        }),
      };
    },
  };

  return client;
}

function useAdmin(client: ReturnType<typeof fakeAdmin>) {
  vi.mocked(createSupabaseAdminClient).mockReturnValue(
    client as unknown as ReturnType<typeof createSupabaseAdminClient>
  );
  return client;
}

function syncEvents(client: ReturnType<typeof fakeAdmin>) {
  return client.inserted.filter((r) => r.table === "accounting_sync_event");
}

beforeEach(() => {
  vi.mocked(createXeroBill).mockReset();
  vi.mocked(refreshXeroToken).mockReset();
  vi.mocked(createSupabaseAdminClient).mockReset();
});

describe("pushBillToAccounting", () => {
  it("does nothing when the tenant has no active Xero connection", async () => {
    const admin = useAdmin(fakeAdmin({ connection: null }));

    await pushBillToAccounting("t1", "receipt_1");

    expect(createXeroBill).not.toHaveBeenCalled();
    expect(admin.inserted).toHaveLength(0);
  });

  it("pushes a bill and records a synced event", async () => {
    const admin = useAdmin(
      fakeAdmin({
        receipt: receiptWithLines([
          { quantity_delivered: 10, cost_per_unit: 2.5, notes: null, component: { name: "M8 Bolt" } },
        ]),
      })
    );
    vi.mocked(createXeroBill).mockResolvedValue("xero_bill_1");

    await pushBillToAccounting("t1", "receipt_1");

    expect(createXeroBill).toHaveBeenCalledTimes(1);
    const [token, orgId, bill] = vi.mocked(createXeroBill).mock.calls[0];
    expect(token).toBe("access_current");
    expect(orgId).toBe("org_1");
    expect(bill).toMatchObject({
      contactName: "Acme Supplies",
      date: "2026-09-03",
      dueDate: "2026-09-03",
      reference: "INV-99",
      lines: [
        { description: "M8 Bolt", quantity: 10, unitAmount: 2.5, accountCode: "300" },
      ],
    });

    expect(syncEvents(admin)).toHaveLength(1);
    expect(syncEvents(admin)[0]).toMatchObject({
      entity_type: "bill",
      entity_id: "receipt_1",
      external_id: "xero_bill_1",
      status: "synced",
      error: null,
    });
  });

  it("records a failed event, and does not throw, when Xero rejects the bill", async () => {
    // A receipt must never fail to save because the accounting push failed.
    const admin = useAdmin(
      fakeAdmin({
        receipt: receiptWithLines([
          { quantity_delivered: 1, cost_per_unit: 5, notes: null, component: { name: "Nut" } },
        ]),
      })
    );
    vi.mocked(createXeroBill).mockRejectedValue(new Error("Xero says no"));

    await expect(pushBillToAccounting("t1", "receipt_1")).resolves.toBeUndefined();

    expect(syncEvents(admin)[0]).toMatchObject({
      status: "failed",
      external_id: null,
      error: "Xero says no",
    });
  });

  it("refreshes an expiring token and stores the new one before pushing", async () => {
    const admin = useAdmin(
      fakeAdmin({
        connection: activeConnection({
          token_expires_at: new Date(Date.now() + 5_000).toISOString(),
        }),
        receipt: receiptWithLines([
          { quantity_delivered: 2, cost_per_unit: 3, notes: null, component: { name: "Washer" } },
        ]),
      })
    );
    vi.mocked(refreshXeroToken).mockResolvedValue({
      access_token: "access_new",
      refresh_token: "refresh_new",
      expires_in: 1800,
    } as Awaited<ReturnType<typeof refreshXeroToken>>);
    vi.mocked(createXeroBill).mockResolvedValue("xero_bill_2");

    await pushBillToAccounting("t1", "receipt_1");

    expect(refreshXeroToken).toHaveBeenCalledWith("refresh_current");
    expect(admin.updated[0]).toMatchObject({
      table: "accounting_connection",
      access_token: "access_new",
      refresh_token: "refresh_new",
    });
    // The bill must go out on the refreshed token, not the stale one.
    expect(vi.mocked(createXeroBill).mock.calls[0][0]).toBe("access_new");
  });

  it("logs a failure and gives up when the token refresh fails", async () => {
    const admin = useAdmin(
      fakeAdmin({
        connection: activeConnection({
          token_expires_at: new Date(Date.now() + 5_000).toISOString(),
        }),
      })
    );
    vi.mocked(refreshXeroToken).mockRejectedValue(new Error("refresh expired"));

    await pushBillToAccounting("t1", "receipt_1");

    expect(createXeroBill).not.toHaveBeenCalled();
    expect(syncEvents(admin)[0]).toMatchObject({ status: "failed" });
    expect(String(syncEvents(admin)[0].error)).toContain("Token refresh failed");
  });

  it("skips lines with no unit cost, and pushes nothing when none are priced", async () => {
    const admin = useAdmin(
      fakeAdmin({
        receipt: receiptWithLines([
          { quantity_delivered: 4, cost_per_unit: null, notes: null, component: { name: "Freebie" } },
        ]),
      })
    );

    await pushBillToAccounting("t1", "receipt_1");

    expect(createXeroBill).not.toHaveBeenCalled();
    expect(admin.inserted).toHaveLength(0);
  });

  it("keeps only the priced lines when a receipt mixes both", async () => {
    useAdmin(
      fakeAdmin({
        receipt: receiptWithLines([
          { quantity_delivered: 4, cost_per_unit: null, notes: null, component: { name: "Freebie" } },
          { quantity_delivered: 6, cost_per_unit: 1.25, notes: "back order", component: { name: "Spring" } },
        ]),
      })
    );
    vi.mocked(createXeroBill).mockResolvedValue("xero_bill_3");

    await pushBillToAccounting("t1", "receipt_1");

    expect(vi.mocked(createXeroBill).mock.calls[0][2].lines).toEqual([
      { description: "Spring — back order", quantity: 6, unitAmount: 1.25, accountCode: "300" },
    ]);
  });

  it("falls back through supplier name, override, then Unknown Supplier", async () => {
    vi.mocked(createXeroBill).mockResolvedValue("x");
    const line = {
      quantity_delivered: 1,
      cost_per_unit: 1,
      notes: null,
      component: { name: "C" },
    };

    useAdmin(
      fakeAdmin({
        receipt: receiptWithLines([line], { supplier: null, supplier_name_override: "Ad-hoc Vendor" }),
      })
    );
    await pushBillToAccounting("t1", "r");
    expect(vi.mocked(createXeroBill).mock.calls[0][2].contactName).toBe("Ad-hoc Vendor");

    vi.mocked(createXeroBill).mockClear();
    useAdmin(
      fakeAdmin({
        receipt: receiptWithLines([line], { supplier: null, supplier_name_override: null }),
      })
    );
    await pushBillToAccounting("t1", "r");
    expect(vi.mocked(createXeroBill).mock.calls[0][2].contactName).toBe("Unknown Supplier");
  });

  it("names an unnamed component rather than sending an empty description", async () => {
    useAdmin(
      fakeAdmin({
        receipt: receiptWithLines([
          { quantity_delivered: 1, cost_per_unit: 9, notes: null, component: null },
        ]),
      })
    );
    vi.mocked(createXeroBill).mockResolvedValue("x");

    await pushBillToAccounting("t1", "r");

    expect(vi.mocked(createXeroBill).mock.calls[0][2].lines[0].description).toBe("Component");
  });

  it("does nothing when the receipt cannot be read", async () => {
    const admin = useAdmin(fakeAdmin({ receipt: null }));

    await pushBillToAccounting("t1", "missing");

    expect(createXeroBill).not.toHaveBeenCalled();
    expect(admin.inserted).toHaveLength(0);
  });
});
