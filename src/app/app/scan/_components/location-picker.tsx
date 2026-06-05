"use client";

import { useState, useTransition, useEffect } from "react";
import {
  getWarehouses,
  getAislesForWarehouse,
  getBaysForAisle,
  type WarehouseItem,
  type AisleItem,
  type BayItem,
} from "../_actions/get-location-picker-data";
import type { ResolvedLocation } from "../_actions/resolve-barcode";
import styles from "../scan.module.css";

type Level = "warehouse" | "aisle" | "bay";

interface Props {
  onSelect: (loc: ResolvedLocation) => void;
  onCancel: () => void;
}

export function LocationPicker({ onSelect, onCancel }: Props) {
  const [level, setLevel] = useState<Level>("warehouse");
  const [warehouses, setWarehouses] = useState<WarehouseItem[] | null>(null);
  const [aisles, setAisles] = useState<AisleItem[]>([]);
  const [bays, setBays] = useState<BayItem[]>([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState<WarehouseItem | null>(null);
  const [selectedAisle, setSelectedAisle] = useState<AisleItem | null>(null);
  const [isPending, startTransition] = useTransition();

  // Load warehouses on mount
  useEffect(() => {
    startTransition(async () => {
      const data = await getWarehouses();
      setWarehouses(data);
    });
  }, []);

  function selectWarehouse(wh: WarehouseItem) {
    onSelect({
      type: "warehouse",
      id: wh.id,
      name: wh.name,
      path: wh.name,
      warehouseId: wh.id,
    });
  }

  function drillToAisles(wh: WarehouseItem) {
    setSelectedWarehouse(wh);
    startTransition(async () => {
      const data = await getAislesForWarehouse(wh.id);
      setAisles(data);
      setLevel("aisle");
    });
  }

  function selectAisle(a: AisleItem) {
    const parts = [selectedWarehouse?.name, a.subLocationName, a.name].filter(Boolean);
    onSelect({
      type: "aisle",
      id: a.id,
      name: a.name,
      path: parts.join(" · "),
      warehouseId: a.warehouseId,
    });
  }

  function drillToBays(a: AisleItem) {
    setSelectedAisle(a);
    startTransition(async () => {
      const data = await getBaysForAisle(a.id);
      setBays(data);
      setLevel("bay");
    });
  }

  function selectBay(b: BayItem) {
    if (!selectedAisle) return;
    const parts = [
      selectedWarehouse?.name,
      selectedAisle.subLocationName,
      selectedAisle.name,
      b.name,
    ].filter(Boolean);
    onSelect({
      type: "bay",
      id: b.id,
      name: b.name,
      path: parts.join(" · "),
      warehouseId: selectedAisle.warehouseId,
    });
  }

  function goBack() {
    if (level === "bay") {
      setLevel("aisle");
      setSelectedAisle(null);
    } else if (level === "aisle") {
      setLevel("warehouse");
      setSelectedWarehouse(null);
    } else {
      onCancel();
    }
  }

  const title =
    level === "warehouse"
      ? "Select a location"
      : level === "aisle"
        ? `${selectedWarehouse?.name} — select aisle`
        : `${selectedAisle?.name} — select bay`;

  return (
    <div
      className={styles.sheetBackdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className={styles.sheet} role="dialog" aria-modal aria-label="Choose a location">
        <button className={styles.pickerBack} onClick={goBack} type="button">
          ← {level === "warehouse" ? "Cancel" : "Back"}
        </button>
        <div className={styles.sheetTitle}>{title}</div>

        {isPending && <div className={styles.emptyState}>Loading…</div>}

        {!isPending && level === "warehouse" && (
          <div className={styles.sheetResults}>
            {warehouses !== null && warehouses.length === 0 && (
              <div className={styles.emptyState}>
                No warehouses found. Add them in the desktop app first.
              </div>
            )}
            {(warehouses ?? []).map((wh) => (
              <div key={wh.id} style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  className={styles.pickerRow}
                  style={{ flex: 1 }}
                  onClick={() => selectWarehouse(wh)}
                >
                  <span className={styles.pickerRowName}>{wh.name}</span>
                </button>
                <button
                  type="button"
                  className={styles.pickerRow}
                  style={{ flex: "none", padding: "12px 8px" }}
                  onClick={() => drillToAisles(wh)}
                  aria-label={`Browse aisles in ${wh.name}`}
                >
                  <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-muted)" }}>
                    Aisles →
                  </span>
                </button>
              </div>
            ))}
          </div>
        )}

        {!isPending && level === "aisle" && (
          <div className={styles.sheetResults}>
            {aisles.length === 0 && (
              <div className={styles.emptyState}>No aisles in this warehouse yet.</div>
            )}
            {aisles.map((a) => (
              <div key={a.id} style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  className={styles.pickerRow}
                  style={{ flex: 1 }}
                  onClick={() => selectAisle(a)}
                >
                  <span className={styles.pickerRowName}>
                    {a.name}
                    {a.subLocationName && (
                      <span style={{ color: "var(--ink-muted)", marginLeft: 6 }}>
                        · {a.subLocationName}
                      </span>
                    )}
                  </span>
                </button>
                <button
                  type="button"
                  className={styles.pickerRow}
                  style={{ flex: "none", padding: "12px 8px" }}
                  onClick={() => drillToBays(a)}
                  aria-label={`Browse bays in ${a.name}`}
                >
                  <span style={{ fontSize: "var(--fs-xs)", color: "var(--ink-muted)" }}>
                    Bays →
                  </span>
                </button>
              </div>
            ))}
          </div>
        )}

        {!isPending && level === "bay" && (
          <div className={styles.sheetResults}>
            {bays.length === 0 && (
              <div className={styles.emptyState}>No bays in this aisle yet.</div>
            )}
            {bays.map((b) => (
              <button
                key={b.id}
                type="button"
                className={styles.pickerRow}
                onClick={() => selectBay(b)}
              >
                <span className={styles.pickerRowName}>{b.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
