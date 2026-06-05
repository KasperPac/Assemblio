"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { Scanner } from "../_components/scanner";
import { LocationPicker } from "../_components/location-picker";
import type { ResolvedLocation } from "../_actions/resolve-barcode";
import { assignComponentToLocation, removeComponentFromLocation } from "../_actions/assign-component";
import type { LocationsMap } from "../_lib/build-locations-map";
import styles from "../scan.module.css";

export type ScanComponent = {
  id: string;
  name: string;
  sku: string | null;
  bin_bay_id: string | null;
  bin_aisle_id: string | null;
  bin_sub_location_id: string | null;
  location_id: string | null;
};

type ScanState = "scanning" | "showing";

interface Props {
  locationsMap: LocationsMap;
  allComponents: ScanComponent[];
}

// Pure client-side: which components live at a given location?
function componentsAt(all: ScanComponent[], loc: ResolvedLocation): ScanComponent[] {
  return all.filter((c) => {
    if (loc.type === "bay") return c.bin_bay_id === loc.id;
    if (loc.type === "aisle") return c.bin_aisle_id === loc.id;
    if (loc.type === "sub_location") return c.bin_sub_location_id === loc.id;
    // warehouse: assigned to this warehouse with no finer bin set
    return c.location_id === loc.warehouseId &&
      !c.bin_bay_id && !c.bin_aisle_id && !c.bin_sub_location_id;
  });
}

export function LocateClient({ locationsMap, allComponents }: Props) {
  // Local mutable copy of components so assign/remove update instantly
  const [components, setComponents] = useState<ScanComponent[]>(allComponents);
  const [scanState, setScanState] = useState<ScanState>("scanning");
  const [location, setLocation] = useState<ResolvedLocation | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }

  // Components at the current location — derived, recomputed on every change
  const here = useMemo(
    () => (location ? componentsAt(components, location) : []),
    [components, location]
  );

  // Search results — pure local filter, instant
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return components
      .filter((c) =>
        c.name.toLowerCase().includes(q) ||
        (c.sku ?? "").toLowerCase().includes(q)
      )
      .slice(0, 30);
  }, [searchQuery, components]);

  const handleScan = useCallback((code: string) => {
    const loc = locationsMap[code.toUpperCase()];
    if (!loc) {
      showToast("Location not found — check the label");
      return;
    }
    setLocation(loc);
    setScanState("showing");
  }, [locationsMap]);

  function handlePickerSelect(loc: ResolvedLocation) {
    setShowPicker(false);
    setLocation(loc);
    setScanState("showing");
  }

  // Optimistic local update; reconcile via server write
  function applyAssignment(componentId: string, loc: ResolvedLocation | null) {
    setComponents((prev) =>
      prev.map((c) => {
        if (c.id !== componentId) return c;
        return {
          ...c,
          bin_bay_id: loc?.type === "bay" ? loc.id : null,
          bin_aisle_id: loc?.type === "aisle" ? loc.id : null,
          bin_sub_location_id: loc?.type === "sub_location" ? loc.id : null,
          location_id: loc?.type === "warehouse" ? loc.warehouseId : (loc ? c.location_id : null),
        };
      })
    );
  }

  async function handleRemove(componentId: string, componentName: string) {
    if (!location) return;
    applyAssignment(componentId, null); // optimistic
    const result = await removeComponentFromLocation(componentId, location.type);
    if (result.ok) {
      showToast(`Removed ${componentName}`);
    } else {
      showToast("Failed to remove — refresh");
    }
  }

  async function handleAddComponent(comp: ScanComponent) {
    if (!location) return;
    applyAssignment(comp.id, location); // optimistic
    const result = await assignComponentToLocation(comp.id, location.id, location.type);
    if (result.ok) {
      showToast(`Added ${comp.name}`);
    } else {
      showToast("Failed to add — refresh");
    }
  }

  function resetToScan() {
    setLocation(null);
    setScanState("scanning");
  }

  return (
    <main style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
      <div className={styles.topBar}>
        <Link href="/app/scan" className={styles.backBtn}>← Back</Link>
        <span className={styles.topBarTitle}>Set Locations</span>
      </div>

      {scanState === "scanning" && (
        <Scanner onScan={handleScan} active label="Scan a location barcode" />
      )}

      <div className={styles.scanContent}>
        {scanState === "scanning" && (
          <button className={styles.manualBtn} onClick={() => setShowPicker(true)} type="button">
            Can&apos;t scan? Choose location manually →
          </button>
        )}

        {scanState === "showing" && location && (
          <>
            <div className={styles.locationBadge}>📍 {location.path}</div>

            <div className={styles.lineList}>
              {here.length === 0 && (
                <div className={styles.emptyState}>No components assigned here yet.</div>
              )}
              {here.map(comp => (
                <div key={comp.id} className={styles.compRow}>
                  <span className={styles.compName}>{comp.name}</span>
                  {comp.sku && <span className={styles.compSku}>{comp.sku}</span>}
                  <button
                    type="button"
                    className={styles.removeBtn}
                    aria-label={`Remove ${comp.name} from this location`}
                    onClick={() => handleRemove(comp.id, comp.name)}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <button
              type="button"
              className={styles.addCompBtn}
              onClick={() => { setShowAddSheet(true); setSearchQuery(""); }}
            >
              + Add component…
            </button>

            <button type="button" className={styles.manualBtn} onClick={resetToScan}>
              ← Scan a different location
            </button>
          </>
        )}
      </div>

      {toast && (
        <div className={styles.toastWrap}>
          <div className={styles.toast}>{toast}</div>
        </div>
      )}

      {showPicker && (
        <LocationPicker onSelect={handlePickerSelect} onCancel={() => setShowPicker(false)} />
      )}

      {showAddSheet && location && (
        <div
          className={styles.sheetBackdrop}
          onClick={(e) => { if (e.target === e.currentTarget) setShowAddSheet(false); }}
        >
          <div className={styles.sheet}>
            <div className={styles.sheetTitle}>Add to {location.name}</div>
            <input
              className={styles.sheetSearch}
              type="search"
              placeholder="Search components…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              autoFocus
              aria-label="Search components"
            />
            <div className={styles.sheetResults}>
              {searchQuery && searchResults.length === 0 && (
                <div className={styles.emptyState}>No components found.</div>
              )}
              {searchResults.map(r => {
                const alreadyHere = here.some((c) => c.id === r.id);
                return (
                  <div key={r.id} className={styles.sheetRow}>
                    <span className={styles.sheetRowName}>
                      {r.name}
                      {r.sku && (
                        <span style={{ color: "var(--ink-faint)", marginLeft: 6, fontSize: "var(--fs-xs)" }}>
                          {r.sku}
                        </span>
                      )}
                    </span>
                    {alreadyHere ? (
                      <span style={{ color: "var(--ok)", fontSize: "var(--fs-xs)" }}>✓ Here</span>
                    ) : (
                      <button
                        type="button"
                        className={styles.addBtn}
                        onClick={() => handleAddComponent(r)}
                        aria-label={`Add ${r.name}`}
                      >
                        + Add
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
