"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import Link from "next/link";
import { Scanner } from "../../_components/scanner";
import { LocationPicker } from "../../_components/location-picker";
import type { ResolvedLocation } from "../../_actions/resolve-barcode";
import { saveLineCountClient } from "@/app/app/stocktake/[sessionId]/actions";
import type { LocationsMap } from "../../_lib/build-locations-map";
import styles from "../../scan.module.css";

export type ScanLine = {
  id: string;
  componentId: string;
  name: string;
  sku: string | null;
  expectedOnHand: number | null;
  counted: number | null;
  binBayId: string | null;
  binAisleId: string | null;
  binSubLocationId: string | null;
  locationId: string | null;
};

type ScanState = "scanning" | "showing";

interface Props {
  sessionId: string;
  locationsMap: LocationsMap;
  allLines: ScanLine[];
}

function linesAt(all: ScanLine[], loc: ResolvedLocation): ScanLine[] {
  return all.filter((l) => {
    if (loc.type === "bay") return l.binBayId === loc.id;
    if (loc.type === "aisle") return l.binAisleId === loc.id;
    if (loc.type === "sub_location") return l.binSubLocationId === loc.id;
    return l.locationId === loc.warehouseId &&
      !l.binBayId && !l.binAisleId && !l.binSubLocationId;
  });
}

export function StocktakeClient({ sessionId, locationsMap, allLines }: Props) {
  // Local store of saved counts so they persist across scans without refetch
  const [lines, setLines] = useState<ScanLine[]>(allLines);
  const [scanState, setScanState] = useState<ScanState>("scanning");
  const [location, setLocation] = useState<ResolvedLocation | null>(null);
  const [counts, setCounts] = useState<Map<string, string>>(new Map());
  const [toast, setToast] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }

  const here = useMemo(
    () => (location ? linesAt(lines, location) : []),
    [lines, location]
  );

  function showLocation(loc: ResolvedLocation) {
    setLocation(loc);
    setCounts(new Map());
    setScanState("showing");
  }

  const handleScan = useCallback((code: string) => {
    const loc = locationsMap[code.toUpperCase()];
    if (!loc) {
      showToast("Location not found — check the label");
      return;
    }
    showLocation(loc);
  }, [locationsMap]);

  function handlePickerSelect(loc: ResolvedLocation) {
    setShowPicker(false);
    showLocation(loc);
  }

  function handleCountChange(lineId: string, value: string) {
    setCounts((prev) => {
      const next = new Map(prev);
      next.set(lineId, value);
      return next;
    });
  }

  async function handleSaveAndNext() {
    setIsSaving(true);
    const dirty = here.filter((l) => counts.has(l.id) && counts.get(l.id) !== "");
    let newlySaved = 0;
    for (const line of dirty) {
      const val = counts.get(line.id);
      const counted = val !== undefined && val !== "" ? Number(val) : null;
      const result = await saveLineCountClient({ lineId: line.id, sessionId, counted });
      if (result.ok) {
        newlySaved++;
        // Persist locally so the count shows if user revisits this location
        setLines((prev) => prev.map((l) => l.id === line.id ? { ...l, counted } : l));
      }
    }
    if (newlySaved > 0) {
      setSavedCount((prev) => prev + newlySaved);
      showToast(`✓ ${newlySaved} count${newlySaved > 1 ? "s" : ""} saved`);
    }
    setIsSaving(false);
    setLocation(null);
    setCounts(new Map());
    setScanState("scanning");
  }

  const showExpected = here.some((l) => l.expectedOnHand !== null);

  return (
    <main style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
      <div className={styles.topBar}>
        <Link href="/app/scan/stocktake" className={styles.backBtn}>← Sessions</Link>
        <span className={styles.topBarTitle}>Stocktake</span>
        {savedCount > 0 && <span className={styles.progressBadge}>{savedCount} saved</span>}
      </div>

      {scanState === "scanning" && (
        <Scanner onScan={handleScan} active label="Scan a location barcode" />
      )}

      <div className={styles.scanContent}>
        {scanState === "scanning" && (
          <button type="button" className={styles.manualBtn} onClick={() => setShowPicker(true)}>
            Can&apos;t scan? Choose location manually →
          </button>
        )}

        {scanState === "showing" && location && !isSaving && (
          <>
            <div className={styles.locationBadge}>📍 {location.path}</div>

            {here.length === 0 ? (
              <>
                <div className={styles.emptyState}>No components assigned to this location.</div>
                <button type="button" className={styles.manualBtn} onClick={() => setScanState("scanning")}>
                  ← Scan another location
                </button>
              </>
            ) : (
              <>
                <div className={styles.lineList}>
                  {here.map((line) => {
                    const val = counts.get(line.id) ?? (line.counted !== null ? String(line.counted) : "");
                    const inputClass = [styles.lineInput, val !== "" ? styles.lineSaved : ""].filter(Boolean).join(" ");
                    return (
                      <div key={line.id} className={styles.lineRow}>
                        <span className={styles.lineName}>
                          {line.name}
                          {line.sku && (
                            <span style={{ color: "var(--ink-faint)", marginLeft: 4, fontSize: "var(--fs-xs)" }}>
                              {line.sku}
                            </span>
                          )}
                        </span>
                        {showExpected && (
                          <span className={styles.lineExpected} title="Expected on hand">
                            {line.expectedOnHand !== null ? `exp ${line.expectedOnHand}` : ""}
                          </span>
                        )}
                        <input
                          className={inputClass}
                          type="number"
                          inputMode="numeric"
                          min="0"
                          value={val}
                          placeholder="qty"
                          aria-label={`Count for ${line.name}`}
                          onChange={(e) => handleCountChange(line.id, e.target.value)}
                        />
                      </div>
                    );
                  })}
                </div>

                <button
                  className={styles.saveBtn}
                  onClick={handleSaveAndNext}
                  disabled={isSaving}
                  type="button"
                >
                  Save &amp; scan next →
                </button>

                <button type="button" className={styles.manualBtn} onClick={() => setScanState("scanning")}>
                  ← Scan a different location
                </button>
              </>
            )}
          </>
        )}

        {isSaving && (
          <div className={styles.loadingState}>
            <div className={styles.spinner} aria-label="Saving" />
            <p className={styles.loadingText}>Saving counts…</p>
          </div>
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
    </main>
  );
}
