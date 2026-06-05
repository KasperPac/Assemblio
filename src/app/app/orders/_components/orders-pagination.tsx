"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import styles from "../orders.module.css";

export default function OrdersPagination({
  page, pageSize, total,
}: { page: number; pageSize: number; total: number }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const href = (p: number) => {
    const params = new URLSearchParams(sp.toString());
    params.set("page", String(p));
    return `${pathname}?${params.toString()}`;
  };

  return (
    <div className={styles.pagination}>
      <span className={styles.pageInfo}>
        {from}–{to} of {total}
      </span>
      <div className={styles.pageButtons}>
        {page > 1 ? (
          <Link href={href(page - 1)} className={styles.pageBtn}>← Prev</Link>
        ) : (
          <span className={`${styles.pageBtn} ${styles.pageBtnDisabled}`}>← Prev</span>
        )}
        {page < totalPages ? (
          <Link href={href(page + 1)} className={styles.pageBtn}>Next →</Link>
        ) : (
          <span className={`${styles.pageBtn} ${styles.pageBtnDisabled}`}>Next →</span>
        )}
      </div>
    </div>
  );
}
