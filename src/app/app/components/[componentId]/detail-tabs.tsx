"use client";

import { useState } from "react";
import styles from "./component-detail.module.css";
import { togglePreferred, linkComponent } from "@/app/app/suppliers/[supplierId]/actions";
import { BinLocationSelect } from "./bin-location-select";

type StatCard = {
  label: string;
  value: string;
  color?: "default" | "green" | "red" | "orange" | "blue";
  highlight?: "warning" | "danger";
  subText?: string;
  subTextDanger?: boolean;
};

type MovementRow = {
  id: string;
  date: string;
  deltaOnHand: number;
  deltaInProd: number;
  reason: string;
  refType: string;
};

type BomRow = {
  bomId: string;
  product: string;
  variant: string;
  version: number;
  quantity: number;
  active: boolean;
};

type ReceiptRow = {
  date: string;
  supplierName: string;
  reference: string;
  qty: number;
};

type SupplierCatalogItem = {
  id: string;
  supplierId: string;
  supplierName: string;
  partNumber: string | null;
  unitCost: number | null;
  moq: number | null;
  leadTimeDays: number | null;
  isPreferred: boolean;
  avgActualDays: number | null;
};

type Warehouse = { id: string; name: string };
type SubLocation = { id: string; name: string; warehouse_id: string };
type Aisle = { id: string; name: string; warehouse_id: string; sub_location_id: string | null };
type Bay = { id: string; name: string; aisle_id: string };

type Props = {
  stats: StatCard[];
  movements: MovementRow[];
  bomUsage: BomRow[];
  recentReceipts: ReceiptRow[];
  supplierCatalog: SupplierCatalogItem[];
  allSuppliers: Array<{ id: string; name: string }>;
  componentId: string;
  isAdmin: boolean;
  warehouses: Warehouse[];
  subLocations: SubLocation[];
  aisles: Aisle[];
  bays: Bay[];
  currentWarehouseId: string | null;
  currentSubLocationId: string | null;
  currentAisleId: string | null;
  currentBayId: string | null;
};

type Tab = "Overview" | "Movements" | "BOM Usage" | "Suppliers" | "Location";
const baseTabs: Tab[] = ["Overview", "Movements", "BOM Usage", "Suppliers"];

export default function DetailTabs({
  stats, movements, bomUsage, recentReceipts, supplierCatalog, allSuppliers, componentId,
  isAdmin, warehouses, subLocations, aisles, bays,
  currentWarehouseId, currentSubLocationId, currentAisleId, currentBayId,
}: Props) {
  const tabs: Tab[] = isAdmin ? [...baseTabs, "Location"] : baseTabs;
  const [active, setActive] = useState<Tab>("Overview");

  return (
    <div className={styles.tabsContainer}>
      <div className={styles.tabBar}>
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            className={`${styles.tab} ${active === tab ? styles.tabActive : ""}`}
            onClick={() => setActive(tab)}
          >
            {tab === "Suppliers" ? `Suppliers (${supplierCatalog.length})` : tab}
          </button>
        ))}
      </div>

      {active === "Overview" && (
        <div className={styles.overviewContent}>
          <div className={styles.statsGrid}>
            {stats.map((s) => (
              <div
                key={s.label}
                className={`${styles.statCard} ${
                    s.highlight === "danger"
                      ? styles.statCardHighlight
                      : s.highlight === "warning"
                      ? styles.statCardHighlightWarning
                      : ""
                  }`}
              >
                <span className={styles.statLabel}>{s.label}</span>
                <span
                  className={`${styles.statValue} ${
                    s.color === "green"
                      ? styles.statGreen
                      : s.color === "red"
                      ? styles.statRed
                      : s.color === "orange"
                      ? styles.statOrange
                      : s.color === "blue"
                      ? styles.statBlue
                      : ""
                  }`}
                >
                  {s.value}
                </span>
                {s.subText && (
                  <span
                    className={`${styles.statSub} ${s.subTextDanger ? styles.statSubDanger : ""}`}
                  >
                    {s.subText}
                  </span>
                )}
              </div>
            ))}
          </div>

          {recentReceipts.length > 0 && (
            <div className={styles.recentReceipts}>
              <div className={styles.recentTitle}>Recent receipts</div>
              <div className={styles.miniTable}>
                <div className={`${styles.miniHeader} ${styles.receiptCols}`}>
                  <span>Date</span>
                  <span>Supplier</span>
                  <span>Docket</span>
                  <span>Qty received</span>
                </div>
                {recentReceipts.map((r, i) => (
                  <div key={i} className={`${styles.miniRow} ${styles.receiptCols}`}>
                    <span>{r.date}</span>
                    <span>{r.supplierName}</span>
                    <span className={styles.refCell}>{r.reference}</span>
                    <span className={styles.positive}>+{r.qty}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {active === "Movements" && (
        <div className={styles.tabContent}>
          {movements.length === 0 ? (
            <p className={styles.empty}>No inventory movements recorded.</p>
          ) : (
            <div className={styles.miniTable}>
              <div className={`${styles.miniHeader} ${styles.movementCols}`}>
                <span>Date</span>
                <span>On Hand</span>
                <span>In Prod</span>
                <span>Reason</span>
                <span>Ref</span>
              </div>
              {movements.map((m) => (
                <div key={m.id} className={`${styles.miniRow} ${styles.movementCols}`}>
                  <span>{m.date}</span>
                  <span className={m.deltaOnHand > 0 ? styles.positive : m.deltaOnHand < 0 ? styles.negative : ""}>
                    {m.deltaOnHand > 0 ? "+" : ""}{m.deltaOnHand}
                  </span>
                  <span className={m.deltaInProd > 0 ? styles.positive : m.deltaInProd < 0 ? styles.negative : ""}>
                    {m.deltaInProd > 0 ? "+" : ""}{m.deltaInProd}
                  </span>
                  <span>{m.reason}</span>
                  <span className={styles.refCell}>{m.refType}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {active === "Suppliers" && (
        <div className={styles.tabContent}>
          <ComponentSuppliersTab
            componentId={componentId}
            catalog={supplierCatalog}
            allSuppliers={allSuppliers}
          />
        </div>
      )}

      {active === "BOM Usage" && (
        <div className={styles.tabContent}>
          {bomUsage.length === 0 ? (
            <p className={styles.empty}>Not used in any BOMs.</p>
          ) : (
            <>
              <p className={styles.bomIntro}>
                This component is specified in{" "}
                <strong>
                  {bomUsage.length} bill{bomUsage.length !== 1 ? "s" : ""} of material
                </strong>
                . Any product using these BOMs requires it to manufacture.
              </p>
              <div className={styles.miniTable}>
                <div className={`${styles.miniHeader} ${styles.bomTableCols}`}>
                  <span>BOM / Product</span>
                  <span>Qty per unit</span>
                  <span>Status</span>
                </div>
                {bomUsage.map((row) => (
                  <div key={row.bomId} className={`${styles.miniRow} ${styles.bomTableCols}`}>
                    <span>
                      <a href="/app/bom" className={styles.bomLink}>
                        {row.product}
                        {row.variant && row.variant !== "--" ? ` — ${row.variant}` : ""}
                      </a>
                      {row.version > 0 && (
                        <span className={styles.bomVersion}> v{row.version}</span>
                      )}
                    </span>
                    <span className={styles.bomQty}>{row.quantity}</span>
                    <span>
                      <span className={row.active ? styles.badge : styles.badgeMuted}>
                        {row.active ? "Active" : "Draft"}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      {active === "Location" && isAdmin && (
        <div className={styles.tabContent}>
          <div className={styles.binCard}>
            <BinLocationSelect
              componentId={componentId}
              warehouses={warehouses}
              subLocations={subLocations}
              aisles={aisles}
              bays={bays}
              currentWarehouseId={currentWarehouseId}
              currentSubLocationId={currentSubLocationId}
              currentAisleId={currentAisleId}
              currentBayId={currentBayId}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function ComponentSuppliersTab({
  componentId,
  catalog,
  allSuppliers,
}: {
  componentId: string;
  catalog: SupplierCatalogItem[];
  allSuppliers: Array<{ id: string; name: string }>;
}) {
  const [linkOpen, setLinkOpen] = useState(false);

  const minCost = catalog.length > 0 ? Math.min(...catalog.filter(r => r.unitCost != null).map((r) => r.unitCost!)) : Infinity;
  const minLt = catalog.length > 0 ? Math.min(...catalog.filter(r => r.leadTimeDays != null).map((r) => r.leadTimeDays!)) : Infinity;

  return (
    <div>
      <div className={styles.tabToolbar}>
        <span className={styles.tabCount}>
          {catalog.length} supplier{catalog.length !== 1 ? "s" : ""}
        </span>
        <button type="button" className={styles.btnSmall} onClick={() => setLinkOpen(true)}>
          + Link Supplier
        </button>
      </div>

      {linkOpen && (
        <form action={linkComponent} className={styles.linkForm}>
          <input type="hidden" name="component_id" value={componentId} />
          <select name="supplier_id" required className={styles.miniInput}>
            <option value="">Select supplier…</option>
            {allSuppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <input name="supplier_part_number" placeholder="Part #" className={styles.miniInput} />
          <input name="unit_cost" type="number" step="0.01" placeholder="Unit cost" className={styles.miniInput} />
          <input name="lead_time_days" type="number" placeholder="Lead time (days)" className={styles.miniInput} />
          <input name="moq" type="number" step="0.01" placeholder="MOQ" className={styles.miniInput} />
          <button type="submit" className={styles.btnSmall}>Link</button>
          <button type="button" className={styles.btnSmall} onClick={() => setLinkOpen(false)}>Cancel</button>
        </form>
      )}

      <div className={styles.suppliersTable}>
        <div className={styles.suppliersHeader}>
          <span>Supplier</span>
          <span>Part #</span>
          <span>Unit Cost</span>
          <span>MOQ</span>
          <span>Lead Time</span>
          <span>Avg Actual</span>
          <span style={{ textAlign: "center" }}>Pref</span>
        </div>
        {catalog.length === 0 ? (
          <p className={styles.empty}>No suppliers linked to this component yet.</p>
        ) : (
          catalog.map((row) => {
            const isBestPrice = row.unitCost != null && row.unitCost === minCost;
            const isFastest = row.leadTimeDays != null && row.leadTimeDays === minLt;
            const ltColor =
              row.avgActualDays != null && row.leadTimeDays != null
                ? row.avgActualDays <= row.leadTimeDays
                  ? styles.ltGreen
                  : styles.ltRed
                : "";
            return (
              <div key={row.id} className={styles.suppliersRow}>
                <div>
                  <span className={styles.supplierLink}>{row.supplierName}</span>
                  {isBestPrice && <span className={styles.tagGreen}>best price</span>}
                  {isFastest && !isBestPrice && <span className={styles.tagBlue}>fastest</span>}
                </div>
                <span className={styles.catalogPartNum}>{row.partNumber ?? "—"}</span>
                <span>{row.unitCost != null ? `$${row.unitCost.toFixed(2)}` : "—"}</span>
                <span>{row.moq != null ? String(row.moq) : "—"}</span>
                <span>{row.leadTimeDays != null ? `${row.leadTimeDays}d` : "—"}</span>
                <span className={ltColor}>
                  {row.avgActualDays != null ? `${row.avgActualDays.toFixed(1)}d` : "—"}
                </span>
                <form action={togglePreferred} style={{ textAlign: "center" }}>
                  <input type="hidden" name="supplier_component_id" value={row.id} />
                  <input type="hidden" name="component_id" value={componentId} />
                  <input type="hidden" name="supplier_id" value={row.supplierId} />
                  <button type="submit" className={styles.starBtn}>
                    {row.isPreferred ? "★" : "☆"}
                  </button>
                </form>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
