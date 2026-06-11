"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import styles from "./products.module.css";

export default function SortableHeader({
  label,
  sortKey,
}: {
  label: string;
  sortKey: string;
}) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const activeSort = sp.get("sort");
  const activeDir = sp.get("dir") === "desc" ? "desc" : "asc";
  const isActive = activeSort === sortKey;
  const nextDir = isActive && activeDir === "asc" ? "desc" : "asc";

  const params = new URLSearchParams(sp.toString());
  params.set("sort", sortKey);
  params.set("dir", isActive ? nextDir : "asc");

  return (
    <span>
      <Link href={`${pathname}?${params.toString()}`} className={styles.sortLink}>
        {label}
        <span className={styles.sortIndicator}>
          {isActive ? (activeDir === "asc" ? " ▲" : " ▼") : ""}
        </span>
      </Link>
    </span>
  );
}
