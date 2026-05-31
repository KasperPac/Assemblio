import { describe, expect, it, beforeEach } from "vitest";
import {
  handleCustomersDataRequest,
  handleCustomersRedact,
  handleShopRedact,
} from "./gdpr";

/**
 * Lightweight in-memory mock of the Supabase admin client surface used by gdpr.ts.
 * Supports the subset of query builder methods our handlers exercise:
 * - .from(table)
 *   .select / .insert / .update / .delete
 *   .eq, .not, .in, .filter, .maybeSingle, .single, .select("...", {count, head})
 */

type Row = Record<string, unknown>;

class TableState {
  rows: Row[] = [];
  constructor(public name: string, rows: Row[] = []) {
    this.rows = rows.map((r) => ({ ...r }));
  }
}

function rowMatches(row: Row, filters: Array<(r: Row) => boolean>) {
  return filters.every((f) => f(row));
}

class QueryBuilder {
  private filters: Array<(r: Row) => boolean> = [];
  private op:
    | { kind: "select"; columns: string; count?: "exact"; head?: boolean }
    | { kind: "insert"; values: Row | Row[] }
    | { kind: "update"; values: Row }
    | { kind: "delete" }
    | null = null;
  private selectAfter: string | null = null;

  constructor(private table: TableState) {}

  select(columns: string, options?: { count?: "exact"; head?: boolean }) {
    if (this.op && this.op.kind !== "select") {
      this.selectAfter = columns;
      return this;
    }
    this.op = { kind: "select", columns, count: options?.count, head: options?.head };
    return this;
  }

  insert(values: Row | Row[]) {
    this.op = { kind: "insert", values };
    return this;
  }

  update(values: Row) {
    this.op = { kind: "update", values };
    return this;
  }

  delete() {
    this.op = { kind: "delete" };
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((r) => r[column] === value);
    return this;
  }

  not(column: string, _op: string, _value: unknown) {
    // We only use .not("shopify_order_id", "is", null) → keep rows where the column is set.
    this.filters.push((r) => r[column] !== null && r[column] !== undefined);
    return this;
  }

  in(column: string, values: unknown[]) {
    this.filters.push((r) => values.includes(r[column]));
    return this;
  }

  filter(column: string, op: string, value: unknown) {
    // We use .filter("payload->customer->>email", "eq", email)
    if (op !== "eq") throw new Error(`mock filter only supports eq, got ${op}`);
    const parts = column.split(/->>|->/);
    this.filters.push((r) => {
      let cur: unknown = r;
      for (const p of parts) {
        if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
          cur = (cur as Record<string, unknown>)[p];
        } else {
          return false;
        }
      }
      return cur === value;
    });
    return this;
  }

  async maybeSingle() {
    return this.execute({ singleish: "maybe" });
  }

  async single() {
    return this.execute({ singleish: "single" });
  }

  // Awaiting the builder without single/maybeSingle resolves the operation.
  then<T>(resolve: (val: { data: Row[] | Row | null; error: unknown; count?: number }) => T) {
    return Promise.resolve(this.execute({ singleish: null })).then(resolve);
  }

  private execute({ singleish }: { singleish: "single" | "maybe" | null }) {
    if (!this.op) {
      return { data: null, error: null };
    }

    if (this.op.kind === "select") {
      const matching = this.table.rows.filter((r) => rowMatches(r, this.filters));
      if (this.op.head) {
        return { data: null, error: null, count: this.op.count === "exact" ? matching.length : undefined };
      }
      if (singleish === "single") {
        return { data: matching[0] ?? null, error: matching[0] ? null : { message: "no rows" } };
      }
      if (singleish === "maybe") {
        return { data: matching[0] ?? null, error: null };
      }
      return { data: matching, error: null, count: this.op.count === "exact" ? matching.length : undefined };
    }

    if (this.op.kind === "insert") {
      const arr = Array.isArray(this.op.values) ? this.op.values : [this.op.values];
      const inserted = arr.map((v) => ({ id: `row-${this.table.rows.length + 1}`, ...v }));
      this.table.rows.push(...inserted);
      if (singleish === "single") return { data: inserted[0] ?? null, error: null };
      if (singleish === "maybe") return { data: inserted[0] ?? null, error: null };
      return { data: inserted, error: null };
    }

    if (this.op.kind === "update") {
      const matching = this.table.rows.filter((r) => rowMatches(r, this.filters));
      for (const row of matching) Object.assign(row, this.op.values);
      return { data: matching.map((r) => ({ ...r })), error: null };
    }

    if (this.op.kind === "delete") {
      const matching = this.table.rows.filter((r) => rowMatches(r, this.filters));
      this.table.rows = this.table.rows.filter((r) => !matching.includes(r));
      return { data: matching.map((r) => ({ ...r })), error: null };
    }

    return { data: null, error: null };
  }
}

class FakeSupabase {
  tables = new Map<string, TableState>();

  seed(name: string, rows: Row[]) {
    this.tables.set(name, new TableState(name, rows));
  }

  from(name: string) {
    if (!this.tables.has(name)) this.tables.set(name, new TableState(name));
    return new QueryBuilder(this.tables.get(name)!);
  }
}

function makeAdmin() {
  const fake = new FakeSupabase();
  fake.seed("shopify_store", [
    { id: "store_1", tenant_id: "tenant_1", store_domain: "demo.myshopify.com" },
  ]);
  fake.seed("orders", [
    { id: "ord_1", tenant_id: "tenant_1", shopify_order_id: "1001", customer_email: "alice@example.com", customer_first_name: "Alice" },
    { id: "ord_2", tenant_id: "tenant_1", shopify_order_id: "1002", customer_email: "bob@example.com", customer_first_name: "Bob" },
    { id: "ord_3", tenant_id: "tenant_1", shopify_order_id: null, customer_email: "manual@example.com", customer_first_name: null },
  ]);
  fake.seed("order_line", [
    { id: "ol_1", order_id: "ord_1", tenant_id: "tenant_1", variant_id: "v1" },
    { id: "ol_2", order_id: "ord_2", tenant_id: "tenant_1", variant_id: "v2" },
  ]);
  fake.seed("product", [
    { id: "p1", tenant_id: "tenant_1", source: "shopify", shopify_id: "100" },
    { id: "p2", tenant_id: "tenant_1", source: "manual", shopify_id: null },
  ]);
  fake.seed("product_variant", [
    { id: "v1", tenant_id: "tenant_1", source: "shopify", shopify_id: "200" },
    { id: "v2", tenant_id: "tenant_1", source: "shopify", shopify_id: "201" },
  ]);
  fake.seed("shopify_webhook_event", [
    {
      id: "evt_1",
      shop_domain: "demo.myshopify.com",
      topic: "orders/create",
      payload: { customer: { email: "alice@example.com" } },
    },
    {
      id: "evt_2",
      shop_domain: "demo.myshopify.com",
      topic: "orders/create",
      payload: { customer: { email: "bob@example.com" } },
    },
  ]);
  fake.seed("activity_log", []);
  fake.seed("shopify_install_tokens", [
    { id: "tok_1", shopify_store_id: "store_1", tenant_id: "tenant_1", access_token: "secret" },
  ]);
  return fake;
}

describe("handleCustomersDataRequest", () => {
  it("counts matching orders and writes an activity_log entry", async () => {
    const admin = makeAdmin();
    const result = await handleCustomersDataRequest(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      admin as any,
      { customer: { id: 1, email: "alice@example.com" }, orders_requested: [1001] },
      "demo.myshopify.com"
    );

    expect(result.tenantId).toBe("tenant_1");
    expect(result.orderEmailMatches).toBe(1);

    const log = admin.tables.get("activity_log")!.rows;
    expect(log).toHaveLength(1);
    expect(log[0].event).toBe("SHOPIFY_GDPR_DATA_REQUEST");
  });

  it("does not write activity_log when shop is unknown", async () => {
    const admin = makeAdmin();
    const result = await handleCustomersDataRequest(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      admin as any,
      { customer: { email: "alice@example.com" } },
      "unknown.myshopify.com"
    );

    expect(result.tenantId).toBeNull();
    expect(admin.tables.get("activity_log")!.rows).toHaveLength(0);
  });
});

describe("handleCustomersRedact", () => {
  it("nulls matching orders.customer_email and scrubs matching webhook event payloads", async () => {
    const admin = makeAdmin();
    const result = await handleCustomersRedact(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      admin as any,
      { customer: { id: 1, email: "alice@example.com" } },
      "demo.myshopify.com"
    );

    expect(result.tenantId).toBe("tenant_1");
    expect(result.ordersScrubbed).toBe(1);
    expect(result.webhookEventsScrubbed).toBe(1);

    const ord1 = admin.tables.get("orders")!.rows.find((r) => r.id === "ord_1");
    expect(ord1!.customer_email).toBeNull();
    expect(ord1!.customer_first_name).toBeNull();
    const ord2 = admin.tables.get("orders")!.rows.find((r) => r.id === "ord_2");
    expect(ord2!.customer_email).toBe("bob@example.com");
    expect(ord2!.customer_first_name).toBe("Bob");

    const evt1 = admin.tables.get("shopify_webhook_event")!.rows.find((r) => r.id === "evt_1");
    expect(evt1!.payload).toEqual({ redacted: true, reason: "customers/redact" });
  });
});

describe("handleShopRedact", () => {
  it("on a single-store tenant deletes all shopify-sourced rows and the store", async () => {
    const admin = makeAdmin();
    const result = await handleShopRedact(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      admin as any,
      { shop_id: 12345, shop_domain: "demo.myshopify.com" },
      "demo.myshopify.com"
    );

    expect(result.tenantId).toBe("tenant_1");
    expect(result.shopifyStoreDeleted).toBe(true);
    expect(result.multiStoreSkipped).toBe(false);
    expect(result.webhookEventsDeleted).toBe(2);
    expect(result.ordersDeleted).toBe(2);
    expect(result.productsDeleted).toBe(3); // 1 product + 2 variants

    // Manual product survives.
    const products = admin.tables.get("product")!.rows;
    expect(products).toHaveLength(1);
    expect(products[0].source).toBe("manual");

    // Manual order survives.
    const orders = admin.tables.get("orders")!.rows;
    expect(orders).toHaveLength(1);
    expect(orders[0].shopify_order_id).toBeNull();

    // Store gone.
    expect(admin.tables.get("shopify_store")!.rows).toHaveLength(0);

    // Webhook events gone.
    expect(admin.tables.get("shopify_webhook_event")!.rows).toHaveLength(0);
  });

  it("on a multi-store tenant deletes the store but skips product/order purge", async () => {
    const admin = makeAdmin();
    // Add a second store for the same tenant.
    admin.tables.get("shopify_store")!.rows.push({
      id: "store_2",
      tenant_id: "tenant_1",
      store_domain: "other.myshopify.com",
    });

    const result = await handleShopRedact(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      admin as any,
      { shop_id: 12345, shop_domain: "demo.myshopify.com" },
      "demo.myshopify.com"
    );

    expect(result.shopifyStoreDeleted).toBe(true);
    expect(result.multiStoreSkipped).toBe(true);
    expect(result.productsDeleted).toBe(0);
    expect(result.ordersDeleted).toBe(0);

    // Shopify-sourced products still present (skipped).
    expect(
      admin.tables.get("product")!.rows.filter((r) => r.source === "shopify")
    ).toHaveLength(1);
  });

  it("returns gracefully when the shop is not in our database", async () => {
    const admin = makeAdmin();
    const result = await handleShopRedact(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      admin as any,
      { shop_id: 999, shop_domain: "unknown.myshopify.com" },
      "unknown.myshopify.com"
    );
    expect(result.tenantId).toBeNull();
    expect(result.shopifyStoreDeleted).toBe(false);
  });
});

// Avoid unused-variable noise for beforeEach in some setups.
beforeEach(() => {});
