"use client";

import { useState, useActionState } from "react";
import { useRouter } from "next/navigation";
import { updateBinLocation } from "../actions";
import styles from "./component-detail.module.css";

type Warehouse = { id: string; name: string };
type SubLocation = { id: string; name: string; warehouse_id: string };
type Aisle = { id: string; name: string; warehouse_id: string; sub_location_id: string | null };
type Bay = { id: string; name: string; aisle_id: string };

interface Props {
  componentId: string;
  warehouses: Warehouse[];
  subLocations: SubLocation[];
  aisles: Aisle[];
  bays: Bay[];
  currentWarehouseId: string | null;
  currentSubLocationId: string | null;
  currentAisleId: string | null;
  currentBayId: string | null;
}

function shortCode(id: string | null) {
  if (!id) return null;
  return id.replace(/-/g, "").slice(-6).toUpperCase();
}

export function BinLocationSelect({
  componentId, warehouses, subLocations, aisles, bays,
  currentWarehouseId, currentSubLocationId, currentAisleId, currentBayId,
}: Props) {
  const [whId, setWhId] = useState(currentWarehouseId ?? "");
  const [slId, setSlId] = useState(currentSubLocationId ?? "");
  const [aisleId, setAisleId] = useState(currentAisleId ?? "");
  const [bayId, setBayId] = useState(currentBayId ?? "");
  const [state, formAction] = useActionState(updateBinLocation, {});
  const router = useRouter();

  async function handleClear() {
    setWhId(""); setSlId(""); setAisleId(""); setBayId("");
    const fd = new FormData();
    fd.append("component_id", componentId);
    // Leave bin_*_id fields absent = null on server
    await updateBinLocation({}, fd);
    router.refresh();
  }

  const filteredSl = subLocations.filter((s) => s.warehouse_id === whId);
  const filteredAisles = slId ? aisles.filter((a) => a.sub_location_id === slId) : [];
  const filteredBays = bays.filter((b) => b.aisle_id === aisleId);

  const currentWh = warehouses.find((w) => w.id === whId);
  const currentSl = subLocations.find((s) => s.id === slId);
  const currentAisle = aisles.find((a) => a.id === aisleId);
  const currentBay = bays.find((b) => b.id === bayId);
  const assignedPath = [currentWh?.name, currentSl?.name, currentAisle?.name, currentBay?.name].filter(Boolean).join(" · ") || null;
  const assignedCode = shortCode(bayId || aisleId || slId || whId || null);

  return (
    <form action={formAction} className={styles.binForm}>
      <input type="hidden" name="component_id" value={componentId} />
      <input type="hidden" name="bin_sub_location_id" value={slId} />
      <input type="hidden" name="bin_aisle_id" value={aisleId} />
      <input type="hidden" name="bin_bay_id" value={bayId} />

      <div className={styles.binFieldRow}>
        <label className={styles.binField}>
          <span className={styles.binLabel}>Warehouse</span>
          <select
            className={styles.binInput}
            value={whId}
            onChange={(e) => { setWhId(e.target.value); setSlId(""); setAisleId(""); setBayId(""); }}
          >
            <option value="">— None —</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </label>

        <label className={styles.binField}>
          <span className={styles.binLabel}>Sub-location <span style={{ fontWeight: 400 }}>(optional)</span></span>
          <select
            className={styles.binInput}
            value={slId}
            disabled={!whId}
            onChange={(e) => { setSlId(e.target.value); setAisleId(""); setBayId(""); }}
          >
            <option value="">— None —</option>
            {filteredSl.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>

        <label className={styles.binField}>
          <span className={styles.binLabel}>Aisle <span style={{ fontWeight: 400 }}>(optional)</span></span>
          <select
            className={styles.binInput}
            value={aisleId}
            disabled={!slId}
            onChange={(e) => { setAisleId(e.target.value); setBayId(""); }}
          >
            <option value="">— None —</option>
            {filteredAisles.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>

        <label className={styles.binField}>
          <span className={styles.binLabel}>Bay <span style={{ fontWeight: 400 }}>(optional)</span></span>
          <select
            className={styles.binInput}
            value={bayId}
            disabled={!aisleId}
            onChange={(e) => setBayId(e.target.value)}
          >
            <option value="">— None —</option>
            {filteredBays.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
      </div>

      {assignedPath && (
        <div className={styles.binSummary}>
          <div>
            <div className={styles.binSummaryLabel}>Assigned location</div>
            <div className={styles.binSummaryPath}>{assignedPath}</div>
          </div>
          {assignedCode && <div className={styles.binSummaryCode}>{assignedCode}</div>}
        </div>
      )}

      <div className={styles.binActions}>
        <button type="submit" className={styles.binSaveBtn}>Save location</button>
        {(whId || slId || aisleId || bayId) && (
          <button type="button" className={styles.binClearBtn} onClick={handleClear}>
            Clear
          </button>
        )}
      </div>
      {state?.error && <p className={styles.locationTabDesc} style={{ color: "var(--danger)" }}>{state.error}</p>}
    </form>
  );
}
