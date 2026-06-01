"use client";

import styles from "./products.module.css";

type Props = {
  defaultQ?: string;
  defaultFilter: string;
};

export default function ProductFilters({ defaultQ, defaultFilter }: Props) {
  return (
    <form className={styles.filters} method="get">
      <input
        name="q"
        defaultValue={defaultQ ?? ""}
        placeholder="Search by name or SKU"
        aria-label="Search by name or SKU"
      />
      <select
        name="filter"
        defaultValue={defaultFilter}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        <option value="all">All</option>
        <option value="with-variants">With variants</option>
        <option value="without-variants">Without variants</option>
      </select>
    </form>
  );
}
