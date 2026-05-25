import { describe, expect, it } from "vitest";
import { handleAppUninstalled } from "./uninstall";

/**
 * Reuses the lightweight Supabase mock pattern from gdpr.test.ts.
 * Kept minimal — only the methods uninstall.ts actually calls.
 */

type Row = Record<string, unknown>;

function rowMatches(row: Row, filters: Array<(r: Row) => boolean>) {
  return filters.every((f) => f(row));
}

class QueryBuilder {
  private filters: Array<(r: Row) => boolean> = [];
  private op: { kind: "select" } | { kind: "insert"; values: Row } | { kind: "update"; values: Row } | { kind: "delete" } | null = null;

  constructor(private rows: Row[]) {}

  select(_columns?: string) {
    if (!this.op) this.op = { kind: "select" };
    return this;
  }
  insert(values: Row) {
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

  async maybeSingle() {
    const matching = this.rows.filter((r) => rowMatches(r, this.filters));
    return { data: matching[0] ?? null, error: null };
  }

  then<T>(resolve: (val: { data: Row[] | null; error: unknown }) => T) {
    if (!this.op) return Promise.resolve(resolve({ data: null, error: null }));
    if (this.op.kind === "delete") {
      const matching = this.rows.filter((r) => rowMatches(r, this.filters));
      // Splice out matching rows.
      for (const r of matching) {
        const idx = this.rows.indexOf(r);
        if (idx !== -1) this.rows.splice(idx, 1);
      }
      return Promise.resolve(resolve({ data: matching.map((r) => ({ ...r })), error: null }));
    }
    if (this.op.kind === "update") {
      const matching = this.rows.filter((r) => rowMatches(r, this.filters));
      for (const r of matching) Object.assign(r, this.op.values);
      return Promise.resolve(resolve({ data: matching.map((r) => ({ ...r })), error: null }));
    }
    if (this.op.kind === "insert") {
      const row = { id: `row-${this.rows.length + 1}`, ...this.op.values };
      this.rows.push(row);
      return Promise.resolve(resolve({ data: [row], error: null }));
    }
    return Promise.resolve(resolve({ data: this.rows.filter((r) => rowMatches(r, this.filters)), error: null }));
  }
}

function fakeAdmin(seed: {
  shopify_store?: Row[];
  shopify_install_tokens?: Row[];
  activity_log?: Row[];
} = {}) {
  const tables: Record<string, Row[]> = {
    shopify_store: seed.shopify_store ?? [],
    shopify_install_tokens: seed.shopify_install_tokens ?? [],
    activity_log: seed.activity_log ?? [],
  };
  return {
    from(name: string) {
      if (!tables[name]) tables[name] = [];
      return new QueryBuilder(tables[name]);
    },
    _tables: tables,
  };
}

describe("handleAppUninstalled", () => {
  it("deletes the token, flips status, and writes activity_log", async () => {
    const admin = fakeAdmin({
      shopify_store: [
        { id: "store_1", tenant_id: "tenant_1", store_domain: "demo.myshopify.com", status: "connected" },
      ],
      shopify_install_tokens: [
        { id: "tok_1", shopify_store_id: "store_1", tenant_id: "tenant_1", access_token: "secret" },
      ],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await handleAppUninstalled(admin as any, "demo.myshopify.com");

    expect(result.storeId).toBe("store_1");
    expect(result.tokenDeleted).toBe(true);
    expect(result.statusChanged).toBe(true);
    expect(admin._tables.shopify_install_tokens).toHaveLength(0);
    expect(admin._tables.shopify_store[0].status).toBe("uninstalled");
    expect(admin._tables.activity_log).toHaveLength(1);
    expect(admin._tables.activity_log[0].event).toBe("SHOPIFY_APP_UNINSTALLED");
  });

  it("is idempotent on repeat uninstall (no token, status already uninstalled)", async () => {
    const admin = fakeAdmin({
      shopify_store: [
        { id: "store_1", tenant_id: "tenant_1", store_domain: "demo.myshopify.com", status: "uninstalled" },
      ],
      shopify_install_tokens: [],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await handleAppUninstalled(admin as any, "demo.myshopify.com");

    expect(result.storeId).toBe("store_1");
    expect(result.tokenDeleted).toBe(false);
    expect(result.statusChanged).toBe(false);
    // Still writes an activity_log entry so we have a record of the duplicate webhook delivery.
    expect(admin._tables.activity_log).toHaveLength(1);
  });

  it("returns nulls when store is unknown", async () => {
    const admin = fakeAdmin();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await handleAppUninstalled(admin as any, "unknown.myshopify.com");
    expect(result.storeId).toBeNull();
    expect(result.tokenDeleted).toBe(false);
    expect(admin._tables.activity_log).toHaveLength(0);
  });
});
