"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import SearchInput from "../_ui/search-input";
import styles from "./products.module.css";

export default function ProductFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function setFilter(value: string) {
    const params = new URLSearchParams(sp.toString());
    params.set("filter", value);
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
        aria-label="Filter products by variants"
        value={sp.get("filter") ?? "all"}
        onChange={(e) => setFilter(e.target.value)}
      >
        <option value="all">All</option>
        <option value="with-variants">With variants</option>
        <option value="without-variants">Without variants</option>
      </select>
    </div>
  );
}
