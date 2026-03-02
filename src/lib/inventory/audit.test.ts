import { describe, expect, it } from "vitest";
import { loadInventoryIntegrityAudit, type AuditClient } from "./audit";

function makeAuditClient(
  rowsByTable: Record<string, Array<Record<string, unknown>>>
) {
  const eqCalls: Array<{ table: string; column: string; value: string }> = [];

  const client: AuditClient = {
    from: (table: string) => ({
      select: () => ({
        eq: async (column: string, value: string) => {
          eqCalls.push({ table, column, value });
          return { data: rowsByTable[table] ?? [], error: null };
        },
      }),
    }),
  };

  return { client, eqCalls };
}

describe("inventory audit loader", () => {
  it("aggregates invariant, reconciliation, duplicate, and over-receipt issues", async () => {
    const { client } = makeAuditClient({
      inventory_balance: [
        {
          component_id: "comp_1",
          location_id: "loc_1",
          on_hand: -1,
          in_prod: 0,
          reserved: 2,
          component: { name: "Motor" },
          location: { name: "Main" },
        },
      ],
      inventory_movement: [
        {
          component_id: "comp_1",
          location_id: "loc_1",
          delta_on_hand: 0,
          delta_in_prod: 0,
        },
      ],
      order_component_allocation: [
        { order_line_id: "line_1", component_id: "comp_1" },
        { order_line_id: "line_1", component_id: "comp_1" },
      ],
      purchase_order_line: [{ id: "pol_1", quantity: 5, quantity_received: 7 }],
    });

    const audit = await loadInventoryIntegrityAudit(client, "tenant_1");

    expect(audit.invariantIssues.length).toBeGreaterThan(0);
    expect(audit.reconciliationIssues).toHaveLength(1);
    expect(audit.duplicateAllocationKeys).toHaveLength(1);
    expect(audit.poOverReceipt).toHaveLength(1);
  });

  it("scopes each audit query to tenant_id", async () => {
    const { client, eqCalls } = makeAuditClient({
      inventory_balance: [],
      inventory_movement: [],
      order_component_allocation: [],
      purchase_order_line: [],
    });

    await loadInventoryIntegrityAudit(client, "tenant_scope_test");

    expect(eqCalls).toHaveLength(4);
    for (const call of eqCalls) {
      expect(call.column).toBe("tenant_id");
      expect(call.value).toBe("tenant_scope_test");
    }
  });
});
