"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import SearchInput from "../_ui/search-input";
import styles from "./products.module.css";

export default function ProductFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function setStatus(value: string) {
    const params = new URLSearchParams(sp.toString());
    params.set("status", value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className={styles.filters}>
      <SearchInput
        param="q"
        placeholder="Search by name or SKU"
        ariaLabel="Search by name or SKU"
      />
      <select
        aria-label="Filter products by status"
        value={sp.get("status") ?? "all"}
        onChange={(e) => setStatus(e.target.value)}
      >
        <option value="all">All statuses</option>
        <option value="active">Active</option>
        <option value="draft">Draft</option>
        <option value="archived">Archived</option>
      </select>
    </div>
  );
}
