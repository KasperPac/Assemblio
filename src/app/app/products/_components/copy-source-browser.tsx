"use client";

import { useEffect, useRef, useState } from "react";
import {
  fetchCopySourceProducts,
  fetchCopySourceVariants,
  searchCopySources,
} from "../actions";
import type {
  CopySourceProduct,
  CopySourceProductGroup,
  CopySourceVariant,
} from "@/lib/bom/copy-sources";
import styles from "../bom-lightbox.module.css";

type Props = {
  onPick: (bomId: string, label: string) => void | Promise<void>;
};

export default function CopySourceBrowser({ onPick }: Props) {
  const [products, setProducts] = useState<CopySourceProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<CopySourceProductGroup[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [variantsByProduct, setVariantsByProduct] = useState<
    Record<string, CopySourceVariant[]>
  >({});
  const [loadingProduct, setLoadingProduct] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    fetchCopySourceProducts()
      .then((list) => {
        if (!cancelled) setProducts(list);
      })
      .catch(() => {
        if (!cancelled) setError("Failed to load products.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function handleSearchChange(value: string) {
    setSearch(value);
    setError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      seqRef.current++;
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      const seq = ++seqRef.current;
      try {
        const groups = await searchCopySources(trimmed);
        if (seq !== seqRef.current) return;
        setResults(groups);
      } catch {
        if (seq !== seqRef.current) return;
        setError("Search failed.");
      } finally {
        if (seq === seqRef.current) setSearching(false);
      }
    }, 300);
  }

  async function toggleProduct(productId: string) {
    if (expanded === productId) {
      setExpanded(null);
      return;
    }
    setExpanded(productId);
    if (!variantsByProduct[productId]) {
      setLoadingProduct(productId);
      try {
        const variants = await fetchCopySourceVariants(productId);
        setVariantsByProduct((prev) => ({ ...prev, [productId]: variants }));
      } catch {
        setError("Failed to load variants.");
      } finally {
        setLoadingProduct(null);
      }
    }
  }

  function renderVariantButtons(
    variants: CopySourceVariant[],
    productTitle: string
  ) {
    return variants.map((v) => (
      <button
        key={v.bomId}
        type="button"
        className={styles.startFromBtn}
        onClick={() => onPick(v.bomId, `${productTitle} / ${v.label}`)}
      >
        {v.label}
      </button>
    ));
  }

  return (
    <div className={styles.copyBrowsePanel}>
      <input
        type="search"
        value={search}
        onChange={(e) => handleSearchChange(e.target.value)}
        placeholder="Search products, variants, SKUs…"
        className={styles.browseSearch}
        autoFocus
      />
      {error && <p className={styles.browseError}>{error}</p>}

      {results !== null || searching ? (
        searching ? (
          <p className={styles.browseEmpty}>Searching…</p>
        ) : results && results.length === 0 ? (
          <p className={styles.browseEmpty}>No matching variants with a BOM.</p>
        ) : (
          <ul className={styles.browseList}>
            {(results ?? []).map((group) => (
              <li key={group.productId} className={styles.browseItem}>
                <span className={styles.browseProductTitle}>
                  {group.productTitle}
                </span>
                <div className={styles.browseVariants}>
                  {renderVariantButtons(group.variants, group.productTitle)}
                </div>
              </li>
            ))}
          </ul>
        )
      ) : products === null ? (
        <p className={styles.browseEmpty}>Loading products…</p>
      ) : products.length === 0 ? (
        <p className={styles.browseEmpty}>No other variants have a BOM yet.</p>
      ) : (
        <ul className={styles.browseList}>
          {products.map((p) => (
            <li key={p.productId} className={styles.browseItem}>
              <button
                type="button"
                className={styles.browseProductRow}
                onClick={() => toggleProduct(p.productId)}
                aria-expanded={expanded === p.productId}
              >
                <span>{p.productTitle}</span>
                <span className={styles.browseCount}>
                  {p.variantCount} variant{p.variantCount === 1 ? "" : "s"}{" "}
                  <span aria-hidden="true">{expanded === p.productId ? "▾" : "▸"}</span>
                </span>
              </button>
              {expanded === p.productId && (
                <div className={styles.browseVariants}>
                  {loadingProduct === p.productId ? (
                    <span className={styles.browseEmpty}>Loading…</span>
                  ) : (
                    renderVariantButtons(
                      variantsByProduct[p.productId] ?? [],
                      p.productTitle
                    )
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
