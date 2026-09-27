import Link from "next/link";
import styles from "./components.module.css";

export type ComponentItem = {
  id: string;
  name: string;
  sku: string | null;
  /** Group name, or null when ungrouped. */
  groupName: string | null;
  onHand: number;
  available: number;
  reorder_point: number | null;
  status: "ok" | "low" | "critical";
  costPerUnit: number;
  description: string | null;
};

interface SortHeaderProps {
  col: string;
  label: string;
  currentSort: string;
  currentDir: string;
  /** Current search + filter params, carried through every link. */
  baseParams: string;
}

function sortHref(col: string, currentSort: string, currentDir: string, baseParams: string) {
  const newDir = currentSort === col && currentDir === "asc" ? "desc" : "asc";
  const p = new URLSearchParams(baseParams);
  p.set("sort", col);
  p.set("dir", newDir);
  return `/app/components?${p.toString()}`;
}

function detailHref(id: string, currentSort: string, currentDir: string, baseParams: string) {
  const p = new URLSearchParams(baseParams);
  if (currentSort !== "name" || currentDir !== "asc") {
    p.set("sort", currentSort);
    p.set("dir", currentDir);
  }
  const qs = p.toString();
  return qs ? `/app/components/${id}?${qs}` : `/app/components/${id}`;
}

function SortTh({ col, label, currentSort, currentDir, baseParams }: SortHeaderProps) {
  const active = currentSort === col;
  return (
    <th>
      <a href={sortHref(col, currentSort, currentDir, baseParams)} className={styles.sortHeader}>
        {label} {active ? (currentDir === "asc" ? "▲" : "▼") : ""}
      </a>
    </th>
  );
}

interface Props {
  items: ComponentItem[];
  sortCol: string;
  sortDir: string;
  baseParams: string;
}

export default function ComponentTable({ items, sortCol, sortDir, baseParams }: Props) {
  const th = { currentSort: sortCol, currentDir: sortDir, baseParams };
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <SortTh col="name" label="Component" {...th} />
          <SortTh col="sku" label="SKU" {...th} />
          <SortTh col="group" label="Group" {...th} />
          <SortTh col="on_hand" label="On hand" {...th} />
          <SortTh col="available" label="Available" {...th} />
          <SortTh col="reorder_point" label="Reorder point" {...th} />
          <SortTh col="cost" label="Unit cost" {...th} />
        </tr>
      </thead>
      <tbody>
        {items.map((component) => (
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
              <Link href={detailHref(component.id, sortCol, sortDir, baseParams)} className={styles.nameCell}>
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
                <span className={styles.nameWrap}>
                  <span>{component.name}</span>
                  {component.description && (
                    <span className={styles.descLine}>{component.description}</span>
                  )}
                </span>
              </Link>
            </td>
            <td className={styles.meta}>{component.sku ?? "—"}</td>
            <td className={styles.meta}>{component.groupName ?? "—"}</td>
            <td>{component.onHand}</td>
            <td className={component.status !== "ok" ? styles.availableLow : ""}>
              {component.available}
            </td>
            <td className={styles.meta}>{component.reorder_point ?? 0}</td>
            <td className={styles.meta}>${component.costPerUnit.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
