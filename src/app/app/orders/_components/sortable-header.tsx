"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import styles from "../orders.module.css";

export default function SortableHeader({
  label, sortKey, className,
}: { label: string; sortKey: string; className?: string }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const activeSort = sp.get("sort") ?? "order_date";
  const activeDir = sp.get("dir") ?? "desc";
  const isActive = activeSort === sortKey;
  const nextDir = isActive && activeDir === "asc" ? "desc" : "asc";

  const params = new URLSearchParams(sp.toString());
  params.set("sort", sortKey);
  params.set("dir", isActive ? nextDir : "asc");
  params.set("page", "1");

  return (
    <th className={className}>
      <Link href={`${pathname}?${params.toString()}`} className={styles.sortLink}>
        {label}
        <span className={styles.sortIndicator}>
          {isActive ? (activeDir === "asc" ? " ▲" : " ▼") : ""}
        </span>
      </Link>
    </th>
  );
}
