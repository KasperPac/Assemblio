"use client";

import { use, useState, useCallback, useTransition, useRef, useEffect } from "react";
import Link from "next/link";
import { Scanner } from "../../_components/scanner";
import { LocationPicker } from "../../_components/location-picker";
import type { ResolvedLocation } from "../../_actions/resolve-barcode";
import { getSessionLines, type SessionLine } from "../../_actions/get-session-lines";
import { scanAndFetchLines } from "../../_actions/scan-and-fetch";
import { saveLineCountClient } from "@/app/app/stocktake/[sessionId]/actions";
import styles from "../../scan.module.css";

interface Props {
  params: Promise<{ sessionId: string }>;
}

type ScanState = "scanning" | "showing" | "saving";

export default function StocktakeScanPage({ params }: Props) {
  const { sessionId } = use(params);
  const [scanState, setScanState] = useState<ScanState>("scanning");
  const [location, setLocation] = useState<ResolvedLocation | null>(null);
  const [lines, setLines] = useState<SessionLine[]>([]);
  const [counts, setCounts] = useState<Map<string, string>>(new Map());
  const [toast, setToast] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [isPending, startTransition] = useTransition();
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }

  const handleScan = useCallback(
    (code: string) => {
      if (scanState !== "scanning") return;
      startTransition(async () => {
        const result = await scanAndFetchLines(code, sessionId);
        if (!result.found) {
          showToast("Location not found — check the label");
          return;
        }
        setLocation(result.location);
        setLines(result.lines);
        setCounts(new Map());
        setScanState("showing");
      });
    },
    [scanState, sessionId]
  );

  function handlePickerSelect(loc: ResolvedLocation) {
    setShowPicker(false);
    startTransition(async () => {
      const sessionLines = await getSessionLines(sessionId, loc);
      setLocation(loc);
      setLines(sessionLines);
      setCounts(new Map());
      setScanState("showing");
    });
  }

  function handleCountChange(lineId: string, value: string) {
    setCounts((prev) => {
      const next = new Map(prev);
      next.set(lineId, value);
      return next;
    });
  }

  async function handleSaveAndNext() {
    setScanState("saving");
    const dirty = lines.filter(
      (l) => counts.has(l.id) && counts.get(l.id) !== ""
    );
    let newlySaved = 0;
    for (const line of dirty) {
      const val = counts.get(line.id);
      const counted =
        val !== undefined && val !== "" ? Number(val) : null;
      const result = await saveLineCountClient({
        lineId: line.id,
        sessionId,
        counted,
      });
      if (result.ok) newlySaved++;
    }
    if (newlySaved > 0) {
      setSavedCount((prev) => prev + newlySaved);
      showToast(`✓ ${newlySaved} count${newlySaved > 1 ? "s" : ""} saved`);
    }
    setLocation(null);
    setLines([]);
    setCounts(new Map());
    setScanState("scanning");
  }

  const isScanning = scanState === "scanning";
  const isSaving = scanState === "saving";

  // Determine if ANY line has a non-null expectedOnHand (reveals blind status)
  const showExpected = lines.some((l) => l.expectedOnHand !== null);

  return (
    <main style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
      <div className={styles.topBar}>
        <Link href="/app/scan/stocktake" className={styles.backBtn}>
          ← Sessions
        </Link>
        <span className={styles.topBarTitle}>Stocktake</span>
        {savedCount > 0 && (
          <span className={styles.progressBadge}>{savedCount} saved</span>
        )}
      </div>

      <Scanner
        onScan={handleScan}
        active={isScanning}
        label={
          isScanning
            ? "Scan a location barcode"
            : "Paused — save counts to continue"
        }
      />

      <div className={styles.scanContent}>
        {!location && (
          <button
            type="button"
            className={styles.manualBtn}
            onClick={() => setShowPicker(true)}
          >
            Can&apos;t scan? Choose location manually →
          </button>
        )}

        {isPending && <div className={styles.emptyState}>Loading…</div>}

        {location && !isPending && (
          <>
            <div className={styles.locationBadge}>📍 {location.path}</div>

            {lines.length === 0 ? (
              <div className={styles.emptyState}>
                No components assigned to this location.
              </div>
            ) : (
              <>
                <div className={styles.lineList}>
                  {lines.map((line) => {
                    const val =
                      counts.get(line.id) ??
                      (line.counted !== null ? String(line.counted) : "");
                    const inputClass = [
                      styles.lineInput,
                      val !== "" ? styles.lineSaved : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <div key={line.id} className={styles.lineRow}>
                        <span className={styles.lineName}>
                          {line.name}
                          {line.sku && (
                            <span
                              style={{
                                color: "var(--ink-faint)",
                                marginLeft: 4,
                                fontSize: "var(--fs-xs)",
                              }}
                            >
                              {line.sku}
                            </span>
                          )}
                        </span>
                        {showExpected && (
                          <span
                            className={styles.lineExpected}
                            title="Expected on hand"
                          >
                            {line.expectedOnHand !== null
                              ? `exp ${line.expectedOnHand}`
                              : ""}
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
                          onChange={(e) =>
                            handleCountChange(line.id, e.target.value)
                          }
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
                  {isSaving ? "Saving…" : "Save & scan next →"}
                </button>

                <button
                  type="button"
                  className={styles.manualBtn}
                  onClick={() => setShowPicker(true)}
                  disabled={isSaving}
                >
                  Change location
                </button>
              </>
            )}
          </>
        )}
      </div>

      {toast && (
        <div className={styles.toastWrap}>
          <div className={styles.toast}>{toast}</div>
        </div>
      )}

      {showPicker && (
        <LocationPicker
          onSelect={handlePickerSelect}
          onCancel={() => setShowPicker(false)}
        />
      )}
    </main>
  );
}
