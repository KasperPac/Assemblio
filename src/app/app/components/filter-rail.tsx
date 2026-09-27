"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import styles from "./filter-rail.module.css";

type Option = { key: string; label: string; count: number };

type Props = {
  statuses: Option[];
  groups: Option[];
  suppliers: Option[];
  /** Selected keys per facet; empty = facet inactive. */
  selected: { statuses: string[]; groups: string[]; suppliers: string[] };
  cost: { bounds: { min: number; max: number }; min: number | null; max: number | null };
};

// Every change rewrites the URL; the server page re-filters. Read the live
// URL rather than a captured copy so a pending search debounce isn't lost.
function useUrlParams() {
  const router = useRouter();
  const pathname = usePathname();
  return (mutate: (params: URLSearchParams) => void) => {
    const params = new URLSearchParams(window.location.search);
    // The legacy tab link is replaced by the status facet.
    params.delete("filter");
    mutate(params);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
}

function setList(params: URLSearchParams, key: string, values: string[]) {
  if (values.length === 0) params.delete(key);
  else params.set(key, values.join(","));
}

function CheckboxFacet({
  title,
  param,
  options,
  selected,
  bulk,
}: {
  title: string;
  param: string;
  options: Option[];
  selected: string[];
  bulk?: boolean;
}) {
  const update = useUrlParams();
  const [open, setOpen] = useState(true);
  if (options.length === 0) return null;
  const chosen = new Set(selected);

  function toggle(key: string, checked: boolean) {
    update((p) => {
      const next = new Set((p.get(param) ?? "").split(",").filter(Boolean));
      if (checked) next.add(key);
      else next.delete(key);
      setList(p, param, Array.from(next));
    });
  }

  return (
    <section className={styles.facet}>
      <button type="button" className={styles.facetHeader} aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>{title}</span>
        <span aria-hidden="true" className={styles.chevron}>{open ? "−" : "+"}</span>
      </button>
      {open ? (
        <>
          {bulk ? (
            <div className={styles.bulk}>
              <button type="button" className={styles.linkBtn} onClick={() => update((p) => setList(p, param, options.map((o) => o.key)))}>
                Select all
              </button>
              <button type="button" className={styles.linkBtn} onClick={() => update((p) => p.delete(param))}>
                Clear
              </button>
            </div>
          ) : null}
          <ul className={styles.options}>
            {options.map((o) => (
              <li key={o.key} className={styles.option}>
                <label className={o.count === 0 && !chosen.has(o.key) ? styles.labelEmpty : styles.label}>
                  <input
                    type="checkbox"
                    checked={chosen.has(o.key)}
                    onChange={(e) => toggle(o.key, e.target.checked)}
                  />
                  <span className={styles.optionName} title={o.label}>{o.label}</span>
                </label>
                <button
                  type="button"
                  className={styles.only}
                  onClick={() => update((p) => setList(p, param, [o.key]))}
                  aria-label={`Show only ${o.label}`}
                >
                  only
                </button>
                <span className={styles.count}>{o.count}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}

function CostFacet({ cost }: { cost: Props["cost"] }) {
  const update = useUrlParams();
  const { bounds } = cost;
  const [lo, setLo] = useState(cost.min ?? bounds.min);
  const [hi, setHi] = useState(cost.max ?? bounds.max);
  const [open, setOpen] = useState(true);

  if (bounds.max <= bounds.min) return null;

  function commit(nextLo: number, nextHi: number) {
    const a = Math.max(bounds.min, Math.min(nextLo, nextHi));
    const b = Math.min(bounds.max, Math.max(nextLo, nextHi));
    update((p) => {
      if (a <= bounds.min) p.delete("cost_min");
      else p.set("cost_min", String(a));
      if (b >= bounds.max) p.delete("cost_max");
      else p.set("cost_max", String(b));
    });
  }

  const step = bounds.max - bounds.min > 100 ? 1 : 0.5;

  return (
    <section className={styles.facet}>
      <button type="button" className={styles.facetHeader} aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>Unit cost</span>
        <span aria-hidden="true" className={styles.chevron}>{open ? "−" : "+"}</span>
      </button>
      {open ? (
        <div className={styles.cost}>
          <div className={styles.range}>
            <input
              type="range"
              aria-label="Minimum unit cost"
              min={bounds.min}
              max={bounds.max}
              step={step}
              value={lo}
              onChange={(e) => setLo(Math.min(Number(e.target.value), hi))}
              onPointerUp={() => commit(lo, hi)}
              onKeyUp={() => commit(lo, hi)}
            />
            <input
              type="range"
              aria-label="Maximum unit cost"
              min={bounds.min}
              max={bounds.max}
              step={step}
              value={hi}
              onChange={(e) => setHi(Math.max(Number(e.target.value), lo))}
              onPointerUp={() => commit(lo, hi)}
              onKeyUp={() => commit(lo, hi)}
            />
          </div>
          <div className={styles.costInputs}>
            <label className={styles.costField}>
              <span className={styles.costLabel}>Min $</span>
              <input
                type="number"
                min={bounds.min}
                max={bounds.max}
                step="0.01"
                value={lo}
                onChange={(e) => setLo(Number(e.target.value))}
                onBlur={() => commit(lo, hi)}
                onKeyDown={(e) => { if (e.key === "Enter") commit(lo, hi); }}
              />
            </label>
            <label className={styles.costField}>
              <span className={styles.costLabel}>Max $</span>
              <input
                type="number"
                min={bounds.min}
                max={bounds.max}
                step="0.01"
                value={hi}
                onChange={(e) => setHi(Number(e.target.value))}
                onBlur={() => commit(lo, hi)}
                onKeyDown={(e) => { if (e.key === "Enter") commit(lo, hi); }}
              />
            </label>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default function FilterRail({ statuses, groups, suppliers, selected, cost }: Props) {
  // Narrow screens: the rail is a drawer behind a "Filters" button.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const activeCount =
    selected.statuses.length + selected.groups.length + selected.suppliers.length +
    (cost.min !== null || cost.max !== null ? 1 : 0);

  return (
    <div className={styles.railWrap}>
      <button type="button" className={styles.drawerToggle} aria-expanded={drawerOpen} onClick={() => setDrawerOpen(!drawerOpen)}>
        Filters{activeCount > 0 ? ` (${activeCount})` : ""}
      </button>
      <aside className={drawerOpen ? styles.railOpen : styles.rail} aria-label="Filters">
        <CheckboxFacet title="Stock status" param="status" options={statuses} selected={selected.statuses} />
        <CheckboxFacet title="Groups" param="groups" options={groups} selected={selected.groups} bulk />
        <CheckboxFacet title="Supplier" param="suppliers" options={suppliers} selected={selected.suppliers} bulk />
        {/* Keyed on the URL range so a chip removal or Clear all resets the slider. */}
        <CostFacet key={`${cost.min ?? ""}:${cost.max ?? ""}`} cost={cost} />
      </aside>
    </div>
  );
}

export type Chip = { label: string; param: string; value: string | null };

/** Active filters above the results, each removable, plus Clear all. */
export function ActiveFilterChips({ chips }: { chips: Chip[] }) {
  const update = useUrlParams();
  if (chips.length === 0) return null;

  function remove(chip: Chip) {
    update((p) => {
      // The cost range is one chip over two params.
      if (chip.param === "cost") {
        p.delete("cost_min");
        p.delete("cost_max");
        return;
      }
      if (chip.value === null) {
        p.delete(chip.param);
        return;
      }
      const rest = (p.get(chip.param) ?? "").split(",").filter((v) => v && v !== chip.value);
      setList(p, chip.param, rest);
    });
  }

  return (
    <div className={styles.chips}>
      {chips.map((chip) => (
        <button
          key={`${chip.param}:${chip.value ?? ""}`}
          type="button"
          className={styles.chip}
          onClick={() => remove(chip)}
          aria-label={`Remove filter ${chip.label}`}
        >
          {chip.label} <span aria-hidden="true">×</span>
        </button>
      ))}
      <button
        type="button"
        className={styles.linkBtn}
        onClick={() => update((p) => ["status", "groups", "suppliers", "cost_min", "cost_max"].forEach((k) => p.delete(k)))}
      >
        Clear all
      </button>
    </div>
  );
}
