"use client";

import { useState } from "react";
import styles from "./page.module.css";
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

function InlineForm({ action, fields, onDone }: {
  action: (fd: FormData) => Promise<unknown>;
  fields: React.ReactNode;
  onDone: () => void;
}) {
  const [err, setErr] = useState<string | null>(null);
  async function submit(fd: FormData) {
    setErr(null);
    try {
      const result = (await action(fd)) as { error?: string } | undefined;
      if (result?.error) { setErr(result.error); return; }
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
      if (r2?.error) setErr(r2.error);
    }
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
  const [err, setErr] = useState<string | null>(null);
  async function submit(fd: FormData) {
    setErr(null);
    const result = await action(fd);
    if (result?.error) setErr(result.error);
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
  const [addingSl, setAddingSl] = useState<string | null>(null);
  const [editingSl, setEditingSl] = useState<string | null>(null);
  const [addingAisle, setAddingAisle] = useState<string | null>(null);
  const [editingAisle, setEditingAisle] = useState<string | null>(null);
  const [addingBay, setAddingBay] = useState<string | null>(null);
  const [editingBay, setEditingBay] = useState<string | null>(null);

  return (
    <div>
      {warehouses.map((wh) => {
        const subLocMap = new Map(wh.sub_locations.map((s) => [s.id, s.name]));
        const aisles = [...wh.aisles].sort((a, b) => a.name.localeCompare(b.name));
        const subLocs = [...wh.sub_locations].sort((a, b) => a.name.localeCompare(b.name));

        return (
          <div key={wh.id} className={styles.warehouseBlock}>
            {/* Warehouse row */}
            {editingWh === wh.id ? (
              <div className={styles.warehouseRow}>
                <InlineForm action={editWarehouse} onDone={() => setEditingWh(null)} fields={<>
                  <input type="hidden" name="id" value={wh.id} />
                  <input name="name" defaultValue={wh.name} className={styles.inlineInput} autoFocus />
                </>} />
              </div>
            ) : (
              <div className={styles.warehouseRow}>
                <span className={styles.typeTag}>Warehouse</span>
                <span className={styles.warehouseName}>{wh.name}</span>
                <span className={styles.countTag}>{subLocs.length} sub-loc</span>
                <span className={styles.countTag}>{aisles.length} aisles</span>
                <span className={styles.shortCode}>{shortCode(wh.id)}</span>
                <button className={styles.btnIcon} onClick={() => setAddingSl(wh.id)}>⊕ Sub-loc</button>
                <button className={styles.btnIcon} onClick={() => setAddingAisle(wh.id)}>⊕ Aisle</button>
                <button className={styles.btnIcon} onClick={() => setEditingWh(wh.id)}>✎ Edit</button>
              </div>
            )}

            {/* Add sub-location form */}
            {addingSl === wh.id && (
              <div className={styles.subLocRow}>
                <InlineForm action={addSubLocation} onDone={() => setAddingSl(null)} fields={<>
                  <input type="hidden" name="warehouse_id" value={wh.id} />
                  <input name="name" placeholder="Sub-location name" className={styles.inlineInput} autoFocus />
                </>} />
              </div>
            )}

            {/* Sub-location rows */}
            {subLocs.map((sl) => (
              <div key={sl.id} className={styles.subLocRow}>
                {editingSl === sl.id ? (
                  <InlineForm action={editSubLocation} onDone={() => setEditingSl(null)} fields={<>
                    <input type="hidden" name="id" value={sl.id} />
                    <input name="name" defaultValue={sl.name} className={styles.inlineInput} autoFocus />
                  </>} />
                ) : (
                  <>
                    <span className={styles.indent}>└</span>
                    <span className={styles.typeTag}>Sub-loc</span>
                    <span className={styles.entityName}>{sl.name}</span>
                    <span className={styles.shortCode}>{shortCode(sl.id)}</span>
                    <button className={styles.btnIcon} onClick={() => setEditingSl(sl.id)}>✎ Edit</button>
                    <SimpleDeleteButton id={sl.id} action={deleteSubLocation} />
                  </>
                )}
              </div>
            ))}

            {/* Add aisle form */}
            {addingAisle === wh.id && (
              <div className={styles.aisleRow}>
                <InlineForm action={addAisle} onDone={() => setAddingAisle(null)} fields={<>
                  <input type="hidden" name="warehouse_id" value={wh.id} />
                  <input name="name" placeholder="Aisle name" className={styles.inlineInput} autoFocus />
                  <select name="sub_location_id" className={styles.inlineSelect}>
                    <option value="">— No sub-location —</option>
                    {subLocs.map((sl) => <option key={sl.id} value={sl.id}>{sl.name}</option>)}
                  </select>
                </>} />
              </div>
            )}

            {/* Aisle rows */}
            {aisles.map((aisle) => {
              const bays = [...(aisle.bays ?? [])].sort((a, b) => a.name.localeCompare(b.name));
              const slName = aisle.sub_location_id ? subLocMap.get(aisle.sub_location_id) : null;
              return (
                <div key={aisle.id}>
                  {editingAisle === aisle.id ? (
                    <div className={styles.aisleRow}>
                      <InlineForm action={editAisle} onDone={() => setEditingAisle(null)} fields={<>
                        <input type="hidden" name="id" value={aisle.id} />
                        <input name="name" defaultValue={aisle.name} className={styles.inlineInput} autoFocus />
                        <select name="sub_location_id" className={styles.inlineSelect} defaultValue={aisle.sub_location_id ?? ""}>
                          <option value="">— No sub-location —</option>
                          {subLocs.map((sl) => <option key={sl.id} value={sl.id}>{sl.name}</option>)}
                        </select>
                      </>} />
                    </div>
                  ) : (
                    <div className={styles.aisleRow}>
                      <span className={styles.indent}>└</span>
                      <span className={styles.typeTag}>Aisle</span>
                      <span className={styles.entityName}>
                        {aisle.name}
                        {slName && <span className={styles.slTag}> · {slName}</span>}
                        <span className={styles.bayCount}> · {bays.length} bays</span>
                      </span>
                      <span className={styles.shortCode}>{shortCode(aisle.id)}</span>
                      <button className={styles.btnIcon} onClick={() => setAddingBay(aisle.id)}>⊕ Bay</button>
                      <button className={styles.btnIcon} onClick={() => setEditingAisle(aisle.id)}>✎ Edit</button>
                      <AisleDeleteButton aisleId={aisle.id} />
                    </div>
                  )}

                  {/* Add bay form */}
                  {addingBay === aisle.id && (
                    <div className={styles.bayRow}>
                      <InlineForm action={addBay} onDone={() => setAddingBay(null)} fields={<>
                        <input type="hidden" name="aisle_id" value={aisle.id} />
                        <input name="name" placeholder="Bay name" className={styles.inlineInput} autoFocus />
                      </>} />
                    </div>
                  )}

                  {/* Bay rows */}
                  {bays.map((bay) => (
                    <div key={bay.id} className={styles.bayRow}>
                      {editingBay === bay.id ? (
                        <InlineForm action={editBay} onDone={() => setEditingBay(null)} fields={<>
                          <input type="hidden" name="id" value={bay.id} />
                          <input name="name" defaultValue={bay.name} className={styles.inlineInput} autoFocus />
                        </>} />
                      ) : (
                        <>
                          <span className={styles.indent2}>└</span>
                          <span className={styles.typeTag}>Bay</span>
                          <span className={styles.entityName}>{bay.name}</span>
                          <span className={styles.pathHint}>{aisle.name} · {bay.name}</span>
                          <span className={styles.shortCode}>{shortCode(bay.id)}</span>
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
