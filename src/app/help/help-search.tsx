"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { searchHelp, type SearchEntry } from "@/lib/help/search";
import styles from "./help.module.css";

export default function HelpSearch({ entries }: { entries: SearchEntry[] }) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchHelp(entries, query), [entries, query]);
  const searching = query.trim() !== "";

  return (
    <div className={styles.search} role="search">
      <label htmlFor="help-search" className={styles.searchLabel}>
        Search the manuals
      </label>
      <input
        id="help-search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="e.g. supplier invoice, stocktake, Xero"
        autoComplete="off"
        className={styles.searchInput}
      />
      {searching && results.length > 0 ? (
        <ul className={styles.results}>
          {results.map((r) => (
            <li key={r.href}>
              <Link href={r.href} className={styles.result}>
                <span className={styles.resultTitle}>{r.title}</span>
                {r.kind === "section" ? <span className={styles.resultManual}>{r.manualTitle}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {searching && results.length === 0 ? (
        <p className={styles.noResults}>Nothing in the manuals matches “{query.trim()}”.</p>
      ) : null}
    </div>
  );
}
