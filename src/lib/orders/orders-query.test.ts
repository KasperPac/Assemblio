import { describe, expect, it } from "vitest";
import { parseOrdersQuery, ORDER_SORT_KEYS } from "./orders-query";

describe("parseOrdersQuery", () => {
  it("applies defaults for empty input", () => {
    const q = parseOrdersQuery({});
    expect(q).toMatchObject({
      search: null, status: null, source: null, historical: "all",
      dateFrom: null, dateTo: null, sort: "order_date", dir: "desc",
      page: 1, pageSize: 25, limit: 25, offset: 0,
    });
  });

  it("whitelists sort and falls back to order_date", () => {
    expect(parseOrdersQuery({ sort: "total" }).sort).toBe("total");
    expect(parseOrdersQuery({ sort: "drop_table" }).sort).toBe("order_date");
    expect(ORDER_SORT_KEYS).toContain("order_date");
  });

  it("validates dir and historical", () => {
    expect(parseOrdersQuery({ dir: "asc" }).dir).toBe("asc");
    expect(parseOrdersQuery({ dir: "sideways" }).dir).toBe("desc");
    expect(parseOrdersQuery({ historical: "hide" }).historical).toBe("hide");
    expect(parseOrdersQuery({ historical: "weird" }).historical).toBe("all");
  });

  it("clamps page and computes offset", () => {
    expect(parseOrdersQuery({ page: "3" })).toMatchObject({ page: 3, offset: 50 });
    expect(parseOrdersQuery({ page: "0" }).page).toBe(1);
    expect(parseOrdersQuery({ page: "-5" }).page).toBe(1);
    expect(parseOrdersQuery({ page: "abc" }).page).toBe(1);
  });

  it("normalizes empty-string filters to null and trims search", () => {
    expect(parseOrdersQuery({ search: "  ", status: "" })).toMatchObject({
      search: null, status: null,
    });
    expect(parseOrdersQuery({ search: "  PO-123 " }).search).toBe("PO-123");
  });
});
