"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "../orders.module.css";

export default function OrdersFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [search, setSearch] = useState(sp.get("search") ?? "");

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.set("page", "1");
    router.replace(`${pathname}?${params.toString()}`);
  }

  // Debounce the search box -> URL.
  useEffect(() => {
    const current = sp.get("search") ?? "";
    if (search === current) return;
    const t = setTimeout(() => setParam("search", search.trim()), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div className={styles.filterBar}>
      <input
        className={styles.filterSearch}
        type="search"
        placeholder="Search order # or customer"
        aria-label="Search orders"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <select className={styles.filterSelect} aria-label="Filter by status" value={sp.get("status") ?? ""}
        onChange={(e) => setParam("status", e.target.value)}>
        <option value="">All statuses</option>
        <option value="open">Open</option>
        <option value="fulfilled">Fulfilled</option>
        <option value="cancelled">Cancelled</option>
      </select>
      <select className={styles.filterSelect} aria-label="Filter by source" value={sp.get("source") ?? ""}
        onChange={(e) => setParam("source", e.target.value)}>
        <option value="">All sources</option>
        <option value="shopify">Shopify</option>
        <option value="manual">B2B</option>
      </select>
      <select className={styles.filterSelect} aria-label="Filter by historical" value={sp.get("historical") ?? "all"}
        onChange={(e) => setParam("historical", e.target.value)}>
        <option value="all">All orders</option>
        <option value="hide">Hide historical</option>
        <option value="only">Only historical</option>
      </select>
      <input className={styles.filterDate} type="date" aria-label="Order date from"
        value={sp.get("dateFrom") ?? ""} onChange={(e) => setParam("dateFrom", e.target.value)} />
      <input className={styles.filterDate} type="date" aria-label="Order date to"
        value={sp.get("dateTo") ?? ""} onChange={(e) => setParam("dateTo", e.target.value)} />
    </div>
  );
}
