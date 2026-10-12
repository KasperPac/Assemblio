"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { disconnectSquareAction, saveSquareItem, saveSquareLocation, setSquareStockWrites, syncSquareAction, type SquareActionState } from "./actions";
import type { LocationOption } from "./data";
import styles from "./square.module.css";

function Notice({ state }: { state: SquareActionState }) {
  return state.message ? <p className={state.ok ? styles.success : styles.error} role="status">{state.message}</p> : null;
}

export function SquareConnectionActions() {
  const [state, setState] = useState<SquareActionState>({});
  const [pending, start] = useTransition();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const run = (action: () => Promise<SquareActionState>) => start(async () => {
    const result = await action(); setState(result);
    if (result.ok) { dialog.current?.close(); router.refresh(); }
  });
  return <>
    <div className={styles.actions}>
      <button className={styles.primaryBtn} disabled={pending} onClick={() => run(syncSquareAction)}>{pending ? "Working…" : "Sync Square"}</button>
      <button className={styles.secondaryBtn} disabled={pending} onClick={() => dialog.current?.showModal()}>Disconnect Square</button>
    </div>
    <Notice state={state} />
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="disconnect-title">
      <div className={styles.page}>
        <h2 id="disconnect-title" className={styles.heading}>Disconnect Square?</h2>
        <p className={styles.help}>Stop sales sync and stock updates. Manuva products, movements, and balances remain.</p>
        <div className={styles.actions}>
          <button className={styles.secondaryBtn} disabled={pending} onClick={() => dialog.current?.close()}>Cancel</button>
          <button className={styles.primaryBtn} disabled={pending} onClick={() => run(disconnectSquareAction)}>Disconnect Square</button>
        </div>
        <Notice state={state} />
      </div>
    </dialog>
  </>;
}

export function LocationMappingForm({ squareLocations, locations, current }: {
  squareLocations: LocationOption[]; locations: LocationOption[];
  current: Array<{ square_location_id: string; location_id: string }>;
}) {
  const [state, action, pending] = useActionState(saveSquareLocation, {});
  const dialog = useRef<HTMLDialogElement>(null);
  return <>
    <h2 className={styles.heading}>Location mappings</h2>
    <p className={styles.help}>Choose which Manuva location supplies stock for each active Square location. Saving a mapping pauses stock updates to Square.</p>
    {squareLocations.map((l) => <p key={l.id} className={styles.help}>
      {l.name} → {locations.find((m) => m.id === current.find((c) => c.square_location_id === l.id)?.location_id)?.name ?? "Not mapped"}
    </p>)}
    <button className={styles.secondaryBtn} onClick={() => dialog.current?.showModal()} disabled={!squareLocations.length || !locations.length}>Map location</button>
    {!locations.length ? <p className={styles.error}>Create a Manuva location and set a default before mapping Square.</p> : null}
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="location-title">
      <form action={action} className={styles.page}>
        <h2 id="location-title" className={styles.heading}>Map Square location</h2>
        <label className={styles.label}>Square location<select name="squareLocationId" required className={styles.select}><option value="">Choose a location</option>{squareLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <label className={styles.label}>Manuva location<select name="locationId" required className={styles.select}><option value="">Choose a location</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
        <Notice state={state} />
        <div className={styles.actions}><button type="button" className={styles.secondaryBtn} onClick={() => dialog.current?.close()}>Close</button><button className={styles.primaryBtn} disabled={pending}>{pending ? "Saving…" : "Save mapping"}</button></div>
      </form>
    </dialog>
  </>;
}

export type MappingItem = { id: string; name: string; sku: string | null; barcode: string | null; status: string; variant_id: string | null; ignored_reason: string | null; tracked_location_ids: string[]; stock_conversion_ratio: number | null; origin: "catalog" | "order" };
export type VariantOption = { id: string; label: string };

export function ItemMappingForm({ item, variants }: { item: MappingItem; variants: VariantOption[] }) {
  const [state, action, pending] = useActionState(saveSquareItem, {});
  const stockTracked = item.tracked_location_ids.length > 0;
  const [operation, setOperation] = useState(stockTracked ? "link" : "ignore");
  const dialog = useRef<HTMLDialogElement>(null);
  return <>
    <button className={styles.secondaryBtn} onClick={() => dialog.current?.showModal()}>Resolve mapping</button>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={`mapping-${item.id}`}>
      <form action={action} className={styles.page}>
        <h2 id={`mapping-${item.id}`} className={styles.heading}>{item.name}</h2>
        {item.origin === "order" ? <p className={styles.help}>This sale line has no current Square catalogue mapping. Link it to the retail stock actually sold, create a retail item, or ignore it with a reason. It consumes mapped stock but receives no Square stock update.</p> : null}
        <input type="hidden" name="linkId" value={item.id} />
        <label className={styles.label}>Action<select className={styles.select} name="operation" value={operation} onChange={(e) => setOperation(e.target.value)}>
          <option value="link" disabled={!stockTracked}>Link existing retail variant</option><option value="create" disabled={!stockTracked}>Create retail item</option><option value="ignore">Ignore non-stock item</option><option value="unlink">Remove link</option>
        </select></label>
        {operation === "link" ? <label className={styles.label}>Retail variant<select required className={styles.select} name="variantId" defaultValue={item.variant_id ?? ""}><option value="">Choose a retail variant</option>{variants.map((v) => <option value={v.id} key={v.id}>{v.label}</option>)}</select></label> : null}
        {operation === "create" ? <p className={styles.help}>Create a product, variant, component, and 1:1 BOM using the Square name, SKU, and barcode. Stock starts at zero. Count it in Manuva before enabling Square stock updates.</p> : null}
        {operation === "ignore" ? <label className={styles.label}>Ignore reason<input className={styles.input} required maxLength={240} name="reason" defaultValue={item.ignored_reason ?? ""} placeholder="For example, a hair service" /></label> : null}
        {!stockTracked ? <p className={styles.help}>Services and items without Square inventory tracking cannot be linked to retail stock.</p> : item.origin !== "order" && item.stock_conversion_ratio !== null ? <p className={styles.help}>This converted variation consumes {item.stock_conversion_ratio} units of its stockable item per Square unit. It does not receive a separate full-stock update.</p> : null}
        <p className={styles.help}>Saving pauses stock updates to Square. An order with unresolved products waits until every stock line is mapped or ignored.</p>
        <Notice state={state} />
        <div className={styles.actions}><button type="button" className={styles.secondaryBtn} onClick={() => dialog.current?.close()}>Close</button><button className={styles.primaryBtn} disabled={pending}>{pending ? "Saving…" : "Save mapping"}</button></div>
      </form>
    </dialog>
  </>;
}

export function StockWritesForm({ enabled, baselineConfirmedAt }: { enabled: boolean; baselineConfirmedAt: string | null }) {
  const [state, action, pending] = useActionState(setSquareStockWrites, {});
  return <form action={action} className={styles.formCard}>
    <h2 className={styles.heading}>Stock updates to Square</h2>
    <p className={styles.help}>{enabled ? "Enabled" : "Disabled"}. Manuva remains the stock source of truth. Receiving, counts, and completed sales can change Square stock after setup.</p>
    <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
    {!enabled ? <label className={styles.check}><input type="checkbox" name="baselineConfirmed" required />
      <span>{baselineConfirmedAt ? "I have checked stock counts and mappings before resuming Square stock updates." : "I have completed the opening stock count in Manuva and checked every product and location mapping."}</span>
    </label> : null}
    <p className={styles.help}>{baselineConfirmedAt ? `Opening stock confirmed ${new Date(baselineConfirmedAt).toLocaleString("en-AU")}. Re-enabling preserves the original sales baseline.` : "The first confirmation records the sales baseline. Earlier sales are covered by the opening count and are not deducted again."}</p>
    <Notice state={state} />
    <div className={styles.actions}><button className={styles.primaryBtn} disabled={pending}>{pending ? "Saving…" : enabled ? "Disable stock updates" : "Enable stock updates"}</button></div>
  </form>;
}
