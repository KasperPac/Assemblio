import { describe, expect, it } from "vitest";
import { prepareRows, sortPrepared } from "./sortable-rows";

type Row = { id: string; name: string; qty: number; note: string | null };

const columns = [
  { key: "name", header: "Name", render: (r: Row) => r.name.toUpperCase() },
  { key: "qty", header: "Qty", align: "right" as const, render: (r: Row) => String(r.qty) },
  { key: "note", header: "Note", render: (r: Row) => r.note ?? "—" },
];
const rows: Row[] = [
  { id: "b", name: "bolt", qty: 10, note: null },
  { id: "a", name: "anvil", qty: 2, note: "heavy" },
  { id: "c", name: "cable", qty: 7, note: "spool" },
];

describe("prepareRows", () => {
  it("renders every cell on the server side and keeps the raw sort values", () => {
    const prepared = prepareRows(columns, rows, (r) => r.id);
    expect(prepared.map((p) => p.key)).toEqual(["b", "a", "c"]);
    expect(prepared[0].cells.map((c) => (c as { props: { children: string } }).props.children)).toEqual(["BOLT", "10", "—"]);
    expect(prepared[0].sort).toEqual(["bolt", 10, null]);
  });
});

describe("sortPrepared", () => {
  const prepared = prepareRows(columns, rows, (r) => r.id);

  it("sorts numbers numerically", () => {
    expect(sortPrepared(prepared, 1, "asc").map((p) => p.key)).toEqual(["a", "c", "b"]);
    expect(sortPrepared(prepared, 1, "desc").map((p) => p.key)).toEqual(["b", "c", "a"]);
  });

  it("sorts strings with locale compare and treats null as empty", () => {
    expect(sortPrepared(prepared, 2, "asc").map((p) => p.key)).toEqual(["b", "a", "c"]);
  });

  it("returns the input order when no column is selected", () => {
    expect(sortPrepared(prepared, -1, "asc")).toBe(prepared);
  });
});
