"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "./components.module.css";

export type ComponentItem = {
  id: string;
  name: string;
  sku: string | null;
  onHand: number;
  available: number;
  reorder_point: number | null;
  status: "ok" | "low" | "critical";
};

export type ComponentSection = {
  groupId: string | null;
  groupName: string | null;
  items: ComponentItem[];
};

interface SortHeaderProps {
  col: string;
  label: string;
  currentSort: string;
  currentDir: string;
  rawQ: string;
  filterLowStock: boolean;
}

function sortHref(col: string, currentSort: string, currentDir: string, rawQ: string, filterLowStock: boolean) {
  const newDir = currentSort === col && currentDir === "asc" ? "desc" : "asc";
  const p = new URLSearchParams();
  if (filterLowStock) p.set("filter", "lowstock");
  if (rawQ) p.set("q", rawQ);
  p.set("sort", col);
  p.set("dir", newDir);
  return `/app/components?${p.toString()}`;
}

function SortTh({ col, label, currentSort, currentDir, rawQ, filterLowStock }: SortHeaderProps) {
  const active = currentSort === col;
  return (
    <th>
      <a href={sortHref(col, currentSort, currentDir, rawQ, filterLowStock)} className={styles.sortHeader}>
        {label} {active ? (currentDir === "asc" ? "▲" : "▼") : ""}
      </a>
    </th>
  );
}

interface Props {
  sections: ComponentSection[];
  sortCol: string;
  sortDir: string;
  rawQ: string;
  filterLowStock: boolean;
}

export default function ComponentTable({ sections, sortCol, sortDir, rawQ, filterLowStock }: Props) {
  // All groups start expanded; keyed by groupId (null → "ungrouped")
  const [collapsed, setCollapsed] = useState<Set<string | null>>(new Set());

  function toggle(groupId: string | null) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <SortTh col="name" label="Component" currentSort={sortCol} currentDir={sortDir} rawQ={rawQ} filterLowStock={filterLowStock} />
          <SortTh col="sku" label="SKU" currentSort={sortCol} currentDir={sortDir} rawQ={rawQ} filterLowStock={filterLowStock} />
          <SortTh col="on_hand" label="On hand" currentSort={sortCol} currentDir={sortDir} rawQ={rawQ} filterLowStock={filterLowStock} />
          <SortTh col="available" label="Available" currentSort={sortCol} currentDir={sortDir} rawQ={rawQ} filterLowStock={filterLowStock} />
          <SortTh col="reorder_point" label="Reorder point" currentSort={sortCol} currentDir={sortDir} rawQ={rawQ} filterLowStock={filterLowStock} />
        </tr>
      </thead>
      <tbody>
        {sections.map((section) => {
          const isCollapsed = collapsed.has(section.groupId);
          return (
            <>
              {section.groupName !== null && (
                <tr
                  key={`group-${section.groupId}`}
                  className={styles.groupHeaderRow}
                  onClick={() => toggle(section.groupId)}
                  aria-expanded={!isCollapsed}
                >
                  <td colSpan={5} className={styles.groupHeader}>
                    <span className={styles.groupChevron} aria-hidden="true">
                      {isCollapsed ? "▶" : "▼"}
                    </span>
                    {section.groupName}
                    <span className={styles.groupCount}>{section.items.length}</span>
                  </td>
                </tr>
              )}
              {!isCollapsed &&
                section.items.map((component) => (
                  <tr
                    key={component.id}
                    className={
                      component.status === "critical"
                        ? styles.rowCritical
                        : component.status === "low"
                        ? styles.rowLow
                        : ""
                    }
                  >
                    <td>
                      <Link href={`/app/components/${component.id}`} className={styles.nameCell}>
                        <span
                          className={`${styles.dot} ${
                            component.status === "critical"
                              ? styles.dotCritical
                              : component.status === "low"
                              ? styles.dotLow
                              : styles.dotOk
                          }`}
                        >
                          <span className={styles.srOnly}>
                            {component.status === "critical" ? "Critical" : component.status === "low" ? "Low" : "OK"}
                          </span>
                        </span>
                        {component.name}
                      </Link>
                    </td>
                    <td className={styles.meta}>{component.sku ?? "—"}</td>
                    <td>{component.onHand}</td>
                    <td className={component.status !== "ok" ? styles.availableLow : ""}>
                      {component.available}
                    </td>
                    <td className={styles.meta}>{component.reorder_point ?? 0}</td>
                  </tr>
                ))}
            </>
          );
        })}
      </tbody>
    </table>
  );
}
