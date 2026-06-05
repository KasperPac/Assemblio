"use client";

import { useState, useCallback, useTransition, useRef, useEffect } from "react";
import Link from "next/link";
import { Scanner } from "../_components/scanner";
import { LocationPicker } from "../_components/location-picker";
import type { ResolvedLocation } from "../_actions/resolve-barcode";
import { getLocationComponents, type LocationComponent } from "../_actions/get-location-components";
import { scanAndFetchComponents } from "../_actions/scan-and-fetch";
import { assignComponentToLocation, removeComponentFromLocation } from "../_actions/assign-component";
import { searchComponents, type ComponentSearchResult } from "../_actions/search-components";
import styles from "../scan.module.css";

type ScanState = "scanning" | "showing";

export default function LocateScanPage() {
  const [scanState, setScanState] = useState<ScanState>("scanning");
  const [location, setLocation] = useState<ResolvedLocation | null>(null);
  const [components, setComponents] = useState<LocationComponent[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ComponentSearchResult[]>([]);
  const [isPending, startTransition] = useTransition();
  const [isSearching, startSearchTransition] = useTransition();
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }

  async function loadLocation(loc: ResolvedLocation) {
    const comps = await getLocationComponents(loc);
    setLocation(loc);
    setComponents(comps);
    setScanState("showing");
  }

  const handleScan = useCallback((code: string) => {
    if (scanState !== "scanning") return;
    startTransition(async () => {
      const result = await scanAndFetchComponents(code);
      if (!result.found) {
        showToast("Location not found — check the label");
        return;
      }
      setLocation(result.location);
      setComponents(result.components);
      setScanState("showing");
    });
  }, [scanState]);

  function handlePickerSelect(loc: ResolvedLocation) {
    setShowPicker(false);
    startTransition(() => loadLocation(loc));
  }

  async function handleRemove(componentId: string, componentName: string) {
    if (!location) return;
    const result = await removeComponentFromLocation(componentId, location.type);
    if (result.ok) {
      setComponents(prev => prev.filter(c => c.id !== componentId));
      showToast(`Removed ${componentName}`);
    } else {
      showToast("Failed to remove — try again");
    }
  }

  function handleSearchChange(q: string) {
    setSearchQuery(q);
    if (!q.trim()) { setSearchResults([]); return; }
    startSearchTransition(async () => {
      const results = await searchComponents(q);
      setSearchResults(results);
    });
  }

  async function handleAddComponent(comp: ComponentSearchResult) {
    if (!location) return;
    const result = await assignComponentToLocation(comp.id, location.id, location.type);
    if (result.ok) {
      setComponents(prev =>
        prev.find(c => c.id === comp.id)
          ? prev
          : [...prev, { id: comp.id, name: comp.name, sku: comp.sku }]
      );
      showToast(`Added ${comp.name}`);
    } else {
      showToast("Failed to add — try again");
    }
  }

  function resetToScan() {
    setLocation(null);
    setComponents([]);
    setScanState("scanning");
  }

  return (
    <main style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
      <div className={styles.topBar}>
        <Link href="/app/scan" className={styles.backBtn}>← Back</Link>
        <span className={styles.topBarTitle}>Set Locations</span>
      </div>

      <Scanner
        onScan={handleScan}
        active={scanState === "scanning"}
        label="Scan a location barcode"
      />

      <div className={styles.scanContent}>
        {!location && (
          <button className={styles.manualBtn} onClick={() => setShowPicker(true)} type="button">
            Can&apos;t scan? Choose location manually →
          </button>
        )}

        {isPending && <div className={styles.emptyState}>Loading…</div>}

        {location && !isPending && (
          <>
            <div className={styles.locationBadge}>📍 {location.path}</div>

            <div className={styles.lineList}>
              {components.length === 0 && (
                <div className={styles.emptyState}>No components assigned here yet.</div>
              )}
              {components.map(comp => (
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
              onClick={() => { setShowAddSheet(true); setSearchQuery(""); setSearchResults([]); }}
            >
              + Add component…
            </button>

            <button type="button" className={styles.manualBtn} onClick={resetToScan}>
              Scan a different location
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
              onChange={e => handleSearchChange(e.target.value)}
              autoFocus
              aria-label="Search components"
            />
            <div className={styles.sheetResults}>
              {isSearching && <div className={styles.emptyState}>Searching…</div>}
              {!isSearching && searchQuery && searchResults.length === 0 && (
                <div className={styles.emptyState}>No components found.</div>
              )}
              {!isSearching && searchResults.map(r => (
                <div key={r.id} className={styles.sheetRow}>
                  <span className={styles.sheetRowName}>
                    {r.name}
                    {r.sku && (
                      <span style={{ color: "var(--ink-faint)", marginLeft: 6, fontSize: "var(--fs-xs)" }}>
                        {r.sku}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    className={styles.addBtn}
                    onClick={() => handleAddComponent(r)}
                    aria-label={`Add ${r.name}`}
                  >
                    + Add
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
