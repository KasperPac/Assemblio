import { describe, expect, it, vi } from "vitest";
import {
  releaseOrderAllocations,
  reconcileOrderAllocations,
} from "./reconcile-order";

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
  rpcMock: ReturnType<typeof vi.fn>,
  deleteQueue?: TableData[]
) {
  const chain: Record<string, unknown> = {};

  const returnSelf = () => chain;

  // Tracks whether this chain is a DELETE, so the awaited result can model
  // `.delete().select()` — which returns the rows the DELETE actually removed.
  // That distinction is the whole point of the concurrency tests below: a
  // release that deletes nothing must write no movement.
  let isDelete = false;

  chain.select = returnSelf;
  chain.insert = returnSelf;
  chain.upsert = returnSelf;
  chain.update = returnSelf;
  chain.delete = () => {
    isDelete = true;
    return chain;
  };
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
  ) => {
    const result =
      isDelete && deleteQueue
        ? { data: deleteQueue.shift() ?? [], error: null }
        : { data: rows ?? [], error: null };
    return Promise.resolve(result).then(onfulfilled, onrejected);
  };

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
  rpcMock: ReturnType<typeof vi.fn>,
  /**
   * Successive results for `.delete().select()` per table. Lets a test model
   * two concurrent releases: the first DELETE returns the rows, the second
   * returns none because the first already removed them.
   */
  deleteData?: Record<string, TableData[]>
) {
  return {
    from: (table: string) =>
      buildChain(tableData[table] ?? null, rpcMock, deleteData?.[table]),
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

describe("reconcileOrderAllocations", () => {
  it("never reserves stock for a historical order (defense in depth)", async () => {
    const rpcMock = vi.fn().mockResolvedValue({ data: null, error: null });

    const client = makeFakeClient(
      {
        // the order fetch returns a historical order
        orders: [{ id: "order-1", status: "open", historical: true }],
        location: [{ id: "loc-1" }],
        order_line: [{ id: "line-1", variant_id: "var-1", quantity: 5 }],
        product_bom: [{ id: "bom-1" }],
        product_bom_component: [{ component_id: "c1", quantity: 1 }],
        order_component_allocation: [],
      },
      rpcMock
    );

    const result = await reconcileOrderAllocations(
      client as Parameters<typeof reconcileOrderAllocations>[0],
      "tenant-1",
      "order-1"
    );

    expect(result).toEqual({
      applied: 0,
      skippedMissingBom: 0,
      clearedOnly: false,
      consumed: 0,
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Concurrency — MANUVA-20
// ---------------------------------------------------------------------------
// clearLineAllocations used to read the allocation rows, delete them, then
// write a compensating reserved movement unconditionally. Two concurrent
// releases for the same order both completed the read before either deleted,
// so both wrote a full -totalQty movement. Production shows exactly that:
// order 1fab7489 has four identical -1 release rows 613ms apart, and order
// d1e08db8 two identical rows 19ms apart, leaving 19 inventory_balance rows
// whose ledger sums negative while the balance correctly sits at 0.
//
// The movement must therefore be derived from what the DELETE actually
// removed, not from what the earlier read saw.
describe("releaseOrderAllocations — concurrent release", () => {
  const fixtures = {
    location: [{ id: "loc-1" }],
    order_line: [{ id: "line-1", variant_id: "var-1", quantity: 1 }],
    order_component_allocation: [{ id: "alloc-1", component_id: "c1", quantity: 5 }],
  };

  it("writes a movement for the quantity the DELETE actually removed", async () => {
    const rpcMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const client = makeFakeClient(fixtures, rpcMock, {
      order_component_allocation: [[{ id: "alloc-1", component_id: "c1", quantity: 5 }]],
    });

    await releaseOrderAllocations(
      client as Parameters<typeof releaseOrderAllocations>[0],
      "tenant-1",
      "order-1"
    );

    expect(rpcMock).toHaveBeenCalledTimes(1);
    const args = rpcMock.mock.calls[0][1] as Record<string, number>;
    expect(args.p_delta_reserved).toBe(-5);
  });

  it("writes NO movement when the DELETE removed nothing (lost the race)", async () => {
    const rpcMock = vi.fn().mockResolvedValue({ data: null, error: null });
    // The read still sees the allocation, but a concurrent release already
    // deleted it, so this DELETE returns no rows.
    const client = makeFakeClient(fixtures, rpcMock, {
      order_component_allocation: [[]],
    });

    await releaseOrderAllocations(
      client as Parameters<typeof releaseOrderAllocations>[0],
      "tenant-1",
      "order-1"
    );

    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("releases once across two sequential calls, not twice", async () => {
    const rpcMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const client = makeFakeClient(fixtures, rpcMock, {
      // first call deletes the row, second finds nothing left
      order_component_allocation: [
        [{ id: "alloc-1", component_id: "c1", quantity: 5 }],
        [],
      ],
    });

    await releaseOrderAllocations(
      client as Parameters<typeof releaseOrderAllocations>[0],
      "tenant-1",
      "order-1"
    );
    await releaseOrderAllocations(
      client as Parameters<typeof releaseOrderAllocations>[0],
      "tenant-1",
      "order-1"
    );

    expect(rpcMock).toHaveBeenCalledTimes(1);
  });
});

describe("reconcileOrderAllocations — retail consumption", () => {
  const retailLine = { id: "ol-r", variant_id: "v-r", quantity: 3, variant: { product: { kind: "retail" } } };
  const madeLine = { id: "ol-m", variant_id: "v-m", quantity: 1, variant: { product: { kind: "manufactured" } } };

  it("fulfilled retail line → apply_sale_consumption, no reserved release", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 1, error: null });
    const client = makeFakeClient(
      {
        orders: [{ id: "o1", status: "fulfilled", historical: false }],
        location: [{ id: "loc" }],
        order_line: [retailLine],
        order_component_allocation: [{ id: "a1", component_id: "c1", quantity: 3 }],
      },
      rpc
    );
    const result = await reconcileOrderAllocations(
      client as Parameters<typeof reconcileOrderAllocations>[0],
      "t",
      "o1"
    );
    expect(rpc).toHaveBeenCalledWith("apply_sale_consumption", {
      p_tenant_id: "t", p_order_line_id: "ol-r", p_location_id: "loc",
    });
    expect(rpc).not.toHaveBeenCalledWith("apply_reserved_movement", expect.anything());
    expect(result.consumed).toBe(1);
  });

  it("mixed order: retail line consumes, manufactured line only releases", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 1, error: null });
    const client = makeFakeClient(
      {
        orders: [{ id: "o1", status: "fulfilled", historical: false }],
        location: [{ id: "loc" }],
        order_line: [retailLine, madeLine],
        order_component_allocation: [{ id: "a1", component_id: "c1", quantity: 1 }],
      },
      rpc
    );
    await reconcileOrderAllocations(
      client as Parameters<typeof reconcileOrderAllocations>[0],
      "t",
      "o1"
    );
    const names = rpc.mock.calls.map((c) => c[0]);
    expect(names.filter((n) => n === "apply_sale_consumption")).toHaveLength(1);
    expect(names).toContain("apply_reserved_movement");
  });

  it("cancelled retail order releases, never consumes", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const client = makeFakeClient(
      {
        orders: [{ id: "o1", status: "cancelled", historical: false }],
        location: [{ id: "loc" }],
        order_line: [retailLine],
        order_component_allocation: [{ id: "a1", component_id: "c1", quantity: 3 }],
      },
      rpc
    );
    await reconcileOrderAllocations(
      client as Parameters<typeof reconcileOrderAllocations>[0],
      "t",
      "o1"
    );
    expect(rpc).not.toHaveBeenCalledWith("apply_sale_consumption", expect.anything());
  });

  it("consumption error propagates instead of reporting success", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "retail item has no active BOM" } });
    const client = makeFakeClient(
      {
        orders: [{ id: "o1", status: "fulfilled", historical: false }],
        location: [{ id: "loc" }],
        order_line: [retailLine],
      },
      rpc
    );
    await expect(
      reconcileOrderAllocations(
        client as Parameters<typeof reconcileOrderAllocations>[0],
        "t",
        "o1"
      )
    ).rejects.toThrow("no active BOM");
  });
});
