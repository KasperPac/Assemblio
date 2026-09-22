import { Fragment, type ReactNode } from "react";
import type { TableColumn } from "./report-table";

export type SortValue = string | number | null;

/** A row after the server has rendered its cells — safe to hand to a client component. */
export interface PreparedRow {
  key: string;
  cells: ReactNode[];
  sort: SortValue[];
}

function sortValue(v: unknown): SortValue {
  if (typeof v === "number" || typeof v === "string") return v;
  if (v == null) return null;
  if (v instanceof Date) return v.getTime();
  return String(v);
}

/**
 * Pre-renders each column's cell on the server and keeps only the primitive
 * value the column sorts by. Functions never cross into the client table.
 */
export function prepareRows<T extends Record<string, unknown>>(
  columns: TableColumn<T>[],
  rows: T[],
  rowKey: (row: T) => string
): PreparedRow[] {
  return rows.map((row) => ({
    key: rowKey(row),
    cells: columns.map((c) => <Fragment key={c.key}>{c.render(row)}</Fragment>),
    sort: columns.map((c) => sortValue(row[c.key])),
  }));
}

export function sortPrepared(
  rows: PreparedRow[],
  colIndex: number,
  dir: "asc" | "desc"
): PreparedRow[] {
  if (colIndex < 0) return rows;
  return [...rows].sort((a, b) => {
    const av = a.sort[colIndex];
    const bv = b.sort[colIndex];
    const cmp =
      typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av ?? "").localeCompare(String(bv ?? ""));
    return dir === "asc" ? cmp : -cmp;
  });
}
