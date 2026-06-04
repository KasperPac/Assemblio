import { describe, expect, it, vi } from "vitest";
import { releaseOrderAllocations } from "./reconcile-order";

// ---------------------------------------------------------------------------
// Fake DbClient / DbQuery builder
// ---------------------------------------------------------------------------
// The query chain in reconcile-order.ts works like:
//   client.from(table) -> DbQuery
//   DbQuery.select(...).eq(...).eq(...) -> DbQuery          (thenable or maybeSingle)
//   DbQuery.delete().eq(...).in(...)   -> DbQuery          (thenable)
//
// We need table-specific responses, so the fake dispatches on the table name.

type TableData = Record<string, unknown>[];

function makeQuery(
  rows: TableData | null,
  rpcMock: ReturnType<typeof vi.fn>
): ReturnType<typeof buildChain> {
  return buildChain(rows, rpcMock);
}

function buildChain(
  rows: TableData | null,
  rpcMock: ReturnType<typeof vi.fn>
) {
  // A chainable proxy that resolves to { data, error } when awaited.
  const result = { data: rows ?? [], error: null };

  const chain: Record<string, unknown> = {};

  const returnSelf = () => chain;

  chain.select = returnSelf;
  chain.insert = returnSelf;
  chain.upsert = returnSelf;
  chain.update = returnSelf;
  chain.delete = returnSelf;
  chain.eq = returnSelf;
  chain.in = returnSelf;

  // maybeSingle: returns first row or null
  chain.maybeSingle = () =>
    Promise.resolve({
      data: rows && rows.length > 0 ? rows[0] : null,
      error: null,
    });

  // thenable — lets `await query.select(...).eq(...)` resolve
  chain.then = (
    onfulfilled?: ((v: unknown) => unknown) | null,
    onrejected?: ((r: unknown) => unknown) | null
  ) => Promise.resolve(result).then(onfulfilled, onrejected);

  return chain;
}

/**
 * Build a fake DbClient.
 *
 * `tableData` maps table name -> rows returned for that table.
 * `rpcMock`   is a vi.fn() so tests can assert on calls.
 */
function makeFakeClient(
  tableData: Record<string, TableData | null>,
  rpcMock: ReturnType<typeof vi.fn>
) {
  return {
    from: (table: string) => buildChain(tableData[table] ?? null, rpcMock),
    rpc: rpcMock,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("releaseOrderAllocations", () => {
  it("releases allocations for an order with one line (qty 5 on component c1)", async () => {
    const rpcMock = vi.fn().mockResolvedValue({ data: null, error: null });

    const client = makeFakeClient(
      {
        // default location
        location: [{ id: "loc-1" }],

        // one order line
        order_line: [{ id: "line-1", variant_id: "var-1", quantity: 1 }],

        // one allocation of qty 5 on component c1 for that line
        order_component_allocation: [
          { id: "alloc-1", component_id: "c1", quantity: 5 },
        ],
      },
      rpcMock
    );

    const released = await releaseOrderAllocations(
      client as Parameters<typeof releaseOrderAllocations>[0],
      "tenant-1",
      "order-1"
    );

    // clearLineAllocations returns 1 per distinct component group released
    expect(released).toBeGreaterThan(0);

    // The RPC should have been called once with a negative delta for c1
    expect(rpcMock).toHaveBeenCalledOnce();
    expect(rpcMock).toHaveBeenCalledWith("apply_reserved_movement", {
      p_tenant_id: "tenant-1",
      p_component_id: "c1",
      p_location_id: "loc-1",
      p_order_id: "order-1",
      p_delta_reserved: -5,
    });
  });

  it("returns 0 and does not throw when there are no order lines (idempotent)", async () => {
    const rpcMock = vi.fn().mockResolvedValue({ data: null, error: null });

    const client = makeFakeClient(
      {
        location: [{ id: "loc-1" }],
        order_line: [], // no lines
        order_component_allocation: [],
      },
      rpcMock
    );

    const released = await releaseOrderAllocations(
      client as Parameters<typeof releaseOrderAllocations>[0],
      "tenant-1",
      "order-2"
    );

    expect(released).toBe(0);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("returns 0 when there is no default location", async () => {
    const rpcMock = vi.fn().mockResolvedValue({ data: null, error: null });

    const client = makeFakeClient(
      {
        location: [], // no default location
        order_line: [{ id: "line-1", variant_id: "var-1", quantity: 1 }],
        order_component_allocation: [
          { id: "alloc-1", component_id: "c1", quantity: 5 },
        ],
      },
      rpcMock
    );

    const released = await releaseOrderAllocations(
      client as Parameters<typeof releaseOrderAllocations>[0],
      "tenant-1",
      "order-3"
    );

    expect(released).toBe(0);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
