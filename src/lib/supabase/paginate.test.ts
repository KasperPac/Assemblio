import { describe, expect, it, vi } from "vitest";
import { fetchAllRows } from "./paginate";

describe("fetchAllRows", () => {
  it("returns a single short page without requesting more", async () => {
    const buildQuery = vi.fn(async () => ({ data: [1, 2], error: null }));
    const result = await fetchAllRows<number>(buildQuery, 3);
    expect(result.data).toEqual([1, 2]);
    expect(result.error).toBeNull();
    expect(buildQuery).toHaveBeenCalledTimes(1);
    expect(buildQuery).toHaveBeenCalledWith(0, 2);
  });

  it("paginates across multiple full pages until a short page", async () => {
    const pages: Record<number, number[]> = { 0: [1, 2], 2: [3, 4], 4: [5] };
    const buildQuery = vi.fn(async (from: number) => ({ data: pages[from] ?? [], error: null }));
    const result = await fetchAllRows<number>(buildQuery, 2);
    expect(result.data).toEqual([1, 2, 3, 4, 5]);
    expect(result.error).toBeNull();
    expect(buildQuery).toHaveBeenCalledTimes(3);
    expect(buildQuery.mock.calls).toEqual([[0, 1], [2, 3], [4, 5]]);
  });

  it("stops after an exactly-full final page returns an empty next page", async () => {
    const pages: Record<number, number[]> = { 0: [1, 2], 2: [] };
    const buildQuery = vi.fn(async (from: number) => ({ data: pages[from] ?? [], error: null }));
    const result = await fetchAllRows<number>(buildQuery, 2);
    expect(result.data).toEqual([1, 2]);
    expect(buildQuery).toHaveBeenCalledTimes(2);
  });

  it("returns accumulated data and the error when a page fails", async () => {
    const buildQuery = vi.fn(async (from: number) =>
      from === 0
        ? { data: [1, 2], error: null }
        : { data: null, error: { message: "boom" } }
    );
    const result = await fetchAllRows<number>(buildQuery, 2);
    expect(result.data).toEqual([1, 2]);
    expect(result.error).toEqual({ message: "boom" });
  });
});
