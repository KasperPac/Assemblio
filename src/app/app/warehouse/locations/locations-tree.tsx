"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";
import { BarcodeModal } from "./barcode-modal";
import {
  addWarehouse, editWarehouse,
  addSubLocation, editSubLocation, deleteSubLocation,
  addAisle, editAisle, deleteAisle,
  addBay, editBay, deleteBay,
} from "./actions";

type Bay = { id: string; name: string; aisle_id: string };
type Aisle = { id: string; name: string; sub_location_id: string | null; bays: Bay[] };
type SubLocation = { id: string; name: string };
export type Warehouse = {
  id: string; name: string; is_default: boolean;
  sub_locations: SubLocation[];
  aisles: Aisle[];
};

function shortCode(id: string) {
  return id.replace(/-/g, "").slice(-6).toUpperCase();
}

function toggle(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
}

function InlineForm({ action, fields, onDone }: {
  action: (fd: FormData) => Promise<unknown>;
  fields: React.ReactNode;
  onDone: () => void;
}) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  async function submit(fd: FormData) {
    setErr(null);
    try {
      const result = (await action(fd)) as { error?: string } | undefined;
      if (result?.error) { setErr(result.error); return; }
      router.refresh();
      onDone();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Error");
    }
  }
  return (
    <form action={submit} className={styles.inlineForm}>
      {fields}
      {err && <span className={styles.formError}>{err}</span>}
      <button type="submit" className={styles.btnSave}>Save</button>
      <button type="button" className={styles.btnCancel} onClick={onDone}>Cancel</button>
    </form>
  );
}

function AisleDeleteButton({ aisleId }: { aisleId: string }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  async function submit(fd: FormData) {
    setErr(null);
    const result = await deleteAisle(fd) as { error?: string; bayCount?: number };
    if (result?.error) { setErr(result.error); return; }
    if (result?.bayCount) {
      if (!window.confirm(`This aisle has ${result.bayCount} bay(s) that will also be deleted. Continue?`)) return;
      const fd2 = new FormData();
      fd2.append("id", aisleId);
      fd2.append("confirmed", "true");
      const r2 = await deleteAisle(fd2) as { error?: string };
      if (r2?.error) { setErr(r2.error); return; }
    }
    router.refresh();
  }
  return (
    <span>
      <form action={submit} style={{ display: "inline" }}>
        <input type="hidden" name="id" value={aisleId} />
        <button type="submit" className={styles.btnDelete}>✕ Delete</button>
      </form>
      {err && <span className={styles.deleteError}>{err}</span>}
    </span>
  );
}

function SimpleDeleteButton({ id, action }: {
  id: string;
  action: (fd: FormData) => Promise<{ error?: string }>;
}) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  async function submit(fd: FormData) {
    setErr(null);
    const result = await action(fd);
    if (result?.error) { setErr(result.error); return; }
    router.refresh();
  }
  return (
    <span>
      <form action={submit} style={{ display: "inline" }}>
        <input type="hidden" name="id" value={id} />
        <button type="submit" className={styles.btnDelete}>✕ Delete</button>
      </form>
      {err && <span className={styles.deleteError}>{err}</span>}
    </span>
  );
}

export function LocationsTree({ warehouses }: { warehouses: Warehouse[] }) {
  const [addingWh, setAddingWh] = useState(false);
  const [editingWh, setEditingWh] = useState<string | null>(null);
  const [addingSl, setAddingSl] = useState<string | null>(null);    // warehouse id
  const [editingSl, setEditingSl] = useState<string | null>(null);  // sub-location id
  const [addingAisle, setAddingAisle] = useState<string | null>(null); // sub-location id
  const [editingAisle, setEditingAisle] = useState<string | null>(null);
  const [addingBay, setAddingBay] = useState<string | null>(null);
  const [editingBay, setEditingBay] = useState<string | null>(null);
  const [barcode, setBarcode] = useState<{ id: string; type: string; name: string; path: string } | null>(null);
  const [collapsedWh, setCollapsedWh] = useState<Set<string>>(new Set());
  const [collapsedSl, setCollapsedSl] = useState<Set<string>>(new Set());
  const [collapsedAisle, setCollapsedAisle] = useState<Set<string>>(new Set());

  return (
    <div>
      {barcode && (
        <BarcodeModal
          entityId={barcode.id}
          entityType={barcode.type}
          entityName={barcode.name}
          path={barcode.path}
          onClose={() => setBarcode(null)}
        />
      )}

      {warehouses.map((wh) => {
        const whCollapsed = collapsedWh.has(wh.id);
        const subLocs = [...wh.sub_locations].sort((a, b) => a.name.localeCompare(b.name));

        // Group aisles by sub-location
        const aislesBySl = new Map<string, Aisle[]>();
        for (const aisle of wh.aisles) {
          if (!aisle.sub_location_id) continue;
          const arr = aislesBySl.get(aisle.sub_location_id) ?? [];
          arr.push(aisle);
          aislesBySl.set(aisle.sub_location_id, arr);
        }

        return (
          <div key={wh.id} className={styles.warehouseBlock}>

            {/* ── Warehouse row ── */}
            {editingWh === wh.id ? (
              <div className={styles.warehouseRow}>
                <InlineForm action={editWarehouse} onDone={() => setEditingWh(null)} fields={<>
                  <input type="hidden" name="id" value={wh.id} />
                  <input name="name" defaultValue={wh.name} className={styles.inlineInput} autoFocus />
                </>} />
              </div>
            ) : (
              <div className={styles.warehouseRow}>
                <button
                  className={styles.collapseBtn}
                  onClick={() => setCollapsedWh(toggle(collapsedWh, wh.id))}
                  aria-label={whCollapsed ? "Expand warehouse" : "Collapse warehouse"}
                >
                  {whCollapsed ? "▶" : "▼"}
                </button>
                <span className={styles.levelTagWh}>Warehouse</span>
                <span className={styles.warehouseName}>{wh.name}</span>
                <span className={styles.shortCode}>{shortCode(wh.id)}</span>
                <button className={styles.btnIcon} onClick={() => { setAddingSl(wh.id); setCollapsedWh(s => { const n = new Set(s); n.delete(wh.id); return n; }); }}>⊕ Sub-loc</button>
                <button className={styles.btnIcon} onClick={() => setBarcode({ id: wh.id, type: "Warehouse", name: wh.name, path: wh.name })}>▦ Barcode</button>
                <button className={styles.btnIcon} onClick={() => setEditingWh(wh.id)}>✎ Edit</button>
              </div>
            )}

            {/* ── Warehouse children ── */}
            {!whCollapsed && (
              <div className={styles.warehouseChildren}>

                {/* Add sub-location form */}
                {addingSl === wh.id && (
                  <div className={styles.addSlRow}>
                    <InlineForm action={addSubLocation} onDone={() => setAddingSl(null)} fields={<>
                      <input type="hidden" name="warehouse_id" value={wh.id} />
                      <input name="name" placeholder="Sub-location name" className={styles.inlineInput} autoFocus />
                    </>} />
                  </div>
                )}

                {subLocs.length === 0 && addingSl !== wh.id && (
                  <p className={styles.emptyHint}>No sub-locations yet — add one to organise aisles.</p>
                )}

                {/* ── Sub-location groups ── */}
                {subLocs.map((sl) => {
                  const slCollapsed = collapsedSl.has(sl.id);
                  const aisles = (aislesBySl.get(sl.id) ?? []).sort((a, b) => a.name.localeCompare(b.name));

                  return (
                    <div key={sl.id} className={styles.subLocGroup}>

                      {/* Sub-location row */}
                      {editingSl === sl.id ? (
                        <div className={styles.subLocRow}>
                          <InlineForm action={editSubLocation} onDone={() => setEditingSl(null)} fields={<>
                            <input type="hidden" name="id" value={sl.id} />
                            <input name="name" defaultValue={sl.name} className={styles.inlineInput} autoFocus />
                          </>} />
                        </div>
                      ) : (
                        <div className={styles.subLocRow}>
                          <button
                            className={styles.collapseBtn}
                            onClick={() => setCollapsedSl(toggle(collapsedSl, sl.id))}
                            aria-label={slCollapsed ? "Expand sub-location" : "Collapse sub-location"}
                          >
                            {slCollapsed ? "▶" : "▼"}
                          </button>
                          <span className={styles.levelTagSl}>Sub-loc</span>
                          <span className={styles.entityName}>{sl.name}</span>
                          <span className={styles.countTag}>{aisles.length} aisle{aisles.length !== 1 ? "s" : ""}</span>
                          <span className={styles.shortCode}>{shortCode(sl.id)}</span>
                          <button className={styles.btnIcon} onClick={() => { setAddingAisle(sl.id); setCollapsedSl(s => { const n = new Set(s); n.delete(sl.id); return n; }); }}>⊕ Aisle</button>
                          <button className={styles.btnIcon} onClick={() => setBarcode({ id: sl.id, type: "Sub-location", name: sl.name, path: `${wh.name} · ${sl.name}` })}>▦ Barcode</button>
                          <button className={styles.btnIcon} onClick={() => setEditingSl(sl.id)}>✎ Edit</button>
                          <SimpleDeleteButton id={sl.id} action={deleteSubLocation} />
                        </div>
                      )}

                      {/* Sub-location children (aisles) */}
                      {!slCollapsed && (
                        <div className={styles.slChildren}>

                          {/* Add aisle form — sub_location_id is implicit */}
                          {addingAisle === sl.id && (
                            <div className={styles.aisleRow}>
                              <InlineForm action={addAisle} onDone={() => setAddingAisle(null)} fields={<>
                                <input type="hidden" name="warehouse_id" value={wh.id} />
                                <input type="hidden" name="sub_location_id" value={sl.id} />
                                <input name="name" placeholder="Aisle name" className={styles.inlineInput} autoFocus />
                              </>} />
                            </div>
                          )}

                          {aisles.length === 0 && addingAisle !== sl.id && (
                            <p className={styles.emptyHintSl}>No aisles — click ⊕ Aisle to add one.</p>
                          )}

                          {/* ── Aisle rows ── */}
                          {aisles.map((aisle) => {
                            const bays = [...(aisle.bays ?? [])].sort((a, b) => a.name.localeCompare(b.name));
                            const aisleCollapsed = collapsedAisle.has(aisle.id);

                            return (
                              <div key={aisle.id}>
                                {editingAisle === aisle.id ? (
                                  <div className={styles.aisleRow}>
                                    <InlineForm action={editAisle} onDone={() => setEditingAisle(null)} fields={<>
                                      <input type="hidden" name="id" value={aisle.id} />
                                      <input type="hidden" name="sub_location_id" value={sl.id} />
                                      <input name="name" defaultValue={aisle.name} className={styles.inlineInput} autoFocus />
                                    </>} />
                                  </div>
                                ) : (
                                  <div className={styles.aisleRow}>
                                    <button
                                      className={styles.collapseBtn}
                                      onClick={() => setCollapsedAisle(toggle(collapsedAisle, aisle.id))}
                                      aria-label={aisleCollapsed ? "Expand aisle" : "Collapse aisle"}
                                    >
                                      {aisleCollapsed ? "▶" : "▼"}
                                    </button>
                                    <span className={styles.levelTagAisle}>Aisle</span>
                                    <span className={styles.entityName}>{aisle.name}</span>
                                    <span className={styles.countTag}>{bays.length} bay{bays.length !== 1 ? "s" : ""}</span>
                                    <span className={styles.shortCode}>{shortCode(aisle.id)}</span>
                                    <button className={styles.btnIcon} onClick={() => { setAddingBay(aisle.id); setCollapsedAisle(s => { const n = new Set(s); n.delete(aisle.id); return n; }); }}>⊕ Bay</button>
                                    <button className={styles.btnIcon} onClick={() => setBarcode({ id: aisle.id, type: "Aisle", name: aisle.name, path: `${wh.name} · ${sl.name} · ${aisle.name}` })}>▦ Barcode</button>
                                    <button className={styles.btnIcon} onClick={() => setEditingAisle(aisle.id)}>✎ Edit</button>
                                    <AisleDeleteButton aisleId={aisle.id} />
                                  </div>
                                )}

                                {/* Add bay form and bay rows — hidden when aisle is collapsed */}
                                {!aisleCollapsed && addingBay === aisle.id && (
                                  <div className={styles.bayRow}>
                                    <InlineForm action={addBay} onDone={() => setAddingBay(null)} fields={<>
                                      <input type="hidden" name="aisle_id" value={aisle.id} />
                                      <input name="name" placeholder="Bay name" className={styles.inlineInput} autoFocus />
                                    </>} />
                                  </div>
                                )}

                                {/* Bay rows */}
                                {!aisleCollapsed && bays.map((bay) => (
                                  <div key={bay.id} className={styles.bayRow}>
                                    {editingBay === bay.id ? (
                                      <InlineForm action={editBay} onDone={() => setEditingBay(null)} fields={<>
                                        <input type="hidden" name="id" value={bay.id} />
                                        <input name="name" defaultValue={bay.name} className={styles.inlineInput} autoFocus />
                                      </>} />
                                    ) : (
                                      <>
                                        <span className={styles.levelTagBay}>Bay</span>
                                        <span className={styles.entityName}>{bay.name}</span>
                                        <span className={styles.shortCode}>{shortCode(bay.id)}</span>
                                        <button className={styles.btnIcon} onClick={() => setBarcode({ id: bay.id, type: "Bay", name: bay.name, path: `${wh.name} · ${sl.name} · ${aisle.name} · ${bay.name}` })}>▦ Barcode</button>
                                        <button className={styles.btnIcon} onClick={() => setEditingBay(bay.id)}>✎ Edit</button>
                                        <SimpleDeleteButton id={bay.id} action={deleteBay} />
                                      </>
                                    )}
                                  </div>
                                ))}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Add warehouse */}
      <div className={styles.addWarehouseRow}>
        {addingWh ? (
          <InlineForm action={addWarehouse} onDone={() => setAddingWh(false)} fields={
            <input name="name" placeholder="Warehouse name" className={styles.inlineInput} autoFocus />
          } />
        ) : (
          <>
            <button className={styles.btnAddWarehouse} onClick={() => setAddingWh(true)}>⊕ Add Warehouse</button>
            <span className={styles.addHint}>Multi-warehouse supported — add more any time</span>
          </>
        )}
      </div>
    </div>
  );
}
