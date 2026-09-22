"use client";

import { useState } from "react";
import { sortPrepared, type PreparedRow } from "./sortable-rows";
import styles from "./sortable-report-table.module.css";

export interface SortableHeader {
  key: string;
  header: string;
  align?: "left" | "right";
}

interface Props {
  headers: SortableHeader[];
  rows: PreparedRow[];
  defaultSortKey?: string;
  emptyMessage?: string;
}

/**
 * Client half of SortableReportTable. Receives cells already rendered by the
 * server and only re-orders them — nothing here needs a function prop.
 */
export function SortableReportTableClient({
  headers,
  rows,
  defaultSortKey = "",
  emptyMessage = "No data for this period.",
}: Props) {
  const [sortKey, setSortKey] = useState<string>(defaultSortKey);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function handleSort(key: string) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const colIndex = headers.findIndex((h) => h.key === sortKey);
  const sorted = sortPrepared(rows, colIndex, sortDir);

  if (rows.length === 0) {
    return (
      <div className={styles.wrapper}>
        <p className={styles.empty}>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            {headers.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={c.align === "right" ? styles.right : ""}
                aria-sort={
                  sortKey === c.key
                    ? sortDir === "asc"
                      ? "ascending"
                      : "descending"
                    : "none"
                }
              >
                <button
                  type="button"
                  className={`${styles.sortBtn} ${sortKey === c.key ? styles.sortBtnActive : ""}`}
                  onClick={() => handleSort(c.key)}
                >
                  {c.header}
                  {sortKey === c.key && (
                    <span aria-hidden="true">{sortDir === "asc" ? " ↑" : " ↓"}</span>
                  )}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.key}>
              {row.cells.map((cell, i) => (
                <td
                  key={headers[i].key}
                  className={headers[i].align === "right" ? styles.right : ""}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
