"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./component-picker.module.css";

export type PickerComponent = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  cost_per_unit: number | null;
  group: string | null;
  image_url: string | null;
};

type Props = {
  components: PickerComponent[];
  preferredIds?: Set<string>;
  supplierName?: string;
  title?: string;
  onPick: (id: string) => void;
  onClose: () => void;
};

const PREFERRED_KEY = "__preferred__";

export default function ComponentPicker({
  components,
  preferredIds,
  supplierName,
  title = "Select component",
  onPick,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [search, setSearch] = useState("");
  const hasPreferred = !!preferredIds && preferredIds.size > 0;
  const [activeCategory, setActiveCategory] = useState<string | null>(
    hasPreferred ? PREFERRED_KEY : null
  );

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const categories = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of components) {
      const g = c.group ?? "Uncategorised";
      map[g] = (map[g] ?? 0) + 1;
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  }, [components]);

  const filtered = useMemo(() => {
    let list = components;
    if (activeCategory === PREFERRED_KEY && preferredIds) {
      list = list.filter((c) => preferredIds.has(c.id));
    } else if (activeCategory !== null) {
      list = list.filter((c) => (c.group ?? "Uncategorised") === activeCategory);
    }
    const q = search.toLowerCase().trim();
    if (q) {
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.sku ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [components, activeCategory, preferredIds, search]);

  function handleClose() {
    dialogRef.current?.close();
    onClose();
  }

  function handlePick(id: string) {
    dialogRef.current?.close();
    onPick(id);
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.overlay}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        handleClose();
      }}
    >
      <div className={styles.backdrop} onClick={handleClose} />
      <div className={styles.panel}>
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>{title}</h2>
            {supplierName && (
              <p className={styles.sub}>
                Supplier: <strong>{supplierName}</strong>
              </p>
            )}
          </div>
          <button type="button" className={styles.closeBtn} onClick={handleClose}>
            &times;
          </button>
        </div>

        <div className={styles.searchRow}>
          <input
            type="search"
            placeholder="Search by name or SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={styles.searchInput}
            autoFocus
          />
        </div>

        <div className={styles.browsePanel}>
          <div className={styles.categorySidebar}>
            {hasPreferred && (
              <button
                type="button"
                className={`${styles.catBtn} ${activeCategory === PREFERRED_KEY ? styles.catBtnActive : ""}`}
                onClick={() => setActiveCategory(PREFERRED_KEY)}
              >
                <span>{supplierName ? `From ${supplierName}` : "Preferred"}</span>
                <span className={styles.catCount}>{preferredIds!.size}</span>
              </button>
            )}
            <button
              type="button"
              className={`${styles.catBtn} ${activeCategory === null ? styles.catBtnActive : ""}`}
              onClick={() => setActiveCategory(null)}
            >
              <span>All</span>
              <span className={styles.catCount}>{components.length}</span>
            </button>
            {categories.map(([name, count]) => (
              <button
                key={name}
                type="button"
                className={`${styles.catBtn} ${activeCategory === name ? styles.catBtnActive : ""}`}
                onClick={() => setActiveCategory(name)}
              >
                <span>{name}</span>
                <span className={styles.catCount}>{count}</span>
              </button>
            ))}
          </div>

          <div className={styles.componentList}>
            {filtered.map((c) => {
              const isPreferred = !!preferredIds?.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  className={styles.componentRow}
                  onClick={() => handlePick(c.id)}
                >
                  <div className={styles.componentInfo}>
                    <span className={styles.componentName}>
                      {c.name}
                      {isPreferred && activeCategory !== PREFERRED_KEY && (
                        <span className={styles.preferredTag}>supplier</span>
                      )}
                    </span>
                    {c.sku && <span className={styles.componentSku}>{c.sku}</span>}
                  </div>
                  <span className={styles.componentUnit}>{c.unit ?? "—"}</span>
                  <span className={styles.componentCost}>
                    {c.cost_per_unit !== null
                      ? `$${c.cost_per_unit.toFixed(2)}`
                      : <span className={styles.noCost}>no cost</span>}
                  </span>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className={styles.emptyList}>No components match your search.</p>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
}
