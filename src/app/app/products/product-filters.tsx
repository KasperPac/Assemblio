"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import SearchInput from "../_ui/search-input";
import styles from "./products.module.css";

type Props = {
  productTypes: string[];
  categories: string[];
  tags: string[];
  collections: Array<{ id: string; title: string }>;
};

export default function ProductFilters({
  productTypes,
  categories,
  tags,
  collections,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  function setParam(key: string, value: string) {
    // Read live search string so we don't clobber an in-flight search debounce.
    const params = new URLSearchParams(window.location.search);
    if (value === "" || value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function toggleMulti(key: string, value: string, checked: boolean) {
    const params = new URLSearchParams(window.location.search);
    const current = new Set((params.get(key) ?? "").split(",").filter(Boolean));
    if (checked) current.add(value);
    else current.delete(value);
    if (current.size === 0) params.delete(key);
    else params.set(key, Array.from(current).join(","));
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  const selectedTags = new Set((sp.get("tags") ?? "").split(",").filter(Boolean));
  const selectedCollections = new Set(
    (sp.get("collection") ?? "").split(",").filter(Boolean)
  );

  return (
    <div className={styles.filters}>
      <SearchInput param="q" placeholder="Search by name or SKU" ariaLabel="Search by name or SKU" />

      <select
        aria-label="Filter products by status"
        value={sp.get("status") ?? "all"}
        onChange={(e) => setParam("status", e.target.value)}
      >
        <option value="all">All statuses</option>
        <option value="active">Active</option>
        <option value="draft">Draft</option>
        <option value="archived">Archived</option>
      </select>

      {productTypes.length > 0 && (
        <select
          aria-label="Filter by product type"
          value={sp.get("type") ?? "all"}
          onChange={(e) => setParam("type", e.target.value)}
        >
          <option value="all">All types</option>
          {productTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      )}

      {categories.length > 0 && (
        <select
          aria-label="Filter by category"
          value={sp.get("category") ?? "all"}
          onChange={(e) => setParam("category", e.target.value)}
        >
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      )}

      <select
        aria-label="Group products by"
        value={sp.get("group") ?? "none"}
        onChange={(e) => setParam("group", e.target.value)}
      >
        <option value="none">No grouping</option>
        <option value="type">Group by type</option>
        <option value="category">Group by category</option>
        <option value="collection">Group by collection</option>
      </select>

      {(tags.length > 0 || collections.length > 0) && (
        <details className={styles.multiFilter}>
          <summary>More filters</summary>
          <div className={styles.multiFilterBody}>
            {tags.length > 0 && (
              <fieldset className={styles.multiGroup}>
                <legend>Tags</legend>
                {tags.map((t) => (
                  <label key={t} className={styles.checkOption}>
                    <input
                      type="checkbox"
                      checked={selectedTags.has(t)}
                      onChange={(e) => toggleMulti("tags", t, e.target.checked)}
                    />
                    {t}
                  </label>
                ))}
              </fieldset>
            )}
            {collections.length > 0 && (
              <fieldset className={styles.multiGroup}>
                <legend>Collections</legend>
                {collections.map((c) => (
                  <label key={c.id} className={styles.checkOption}>
                    <input
                      type="checkbox"
                      checked={selectedCollections.has(c.id)}
                      onChange={(e) => toggleMulti("collection", c.id, e.target.checked)}
                    />
                    {c.title}
                  </label>
                ))}
              </fieldset>
            )}
          </div>
        </details>
      )}
    </div>
  );
}
