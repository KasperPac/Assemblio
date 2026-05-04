"use client";

import { useRef, useState, useTransition } from "react";
import { createDeliveryReceipt } from "./actions";
import { computeVariance } from "./helpers";
import styles from "./goods-inwards.module.css";

type Supplier = { id: string; name: string };
type Component = { id: string; name: string; sku: string | null };
type Location = { id: string; name: string; is_default: boolean };
type POLine = {
  id: string;
  component_id: string;
  quantity: number;
  quantity_received: number;
  component:
    | { name: string; sku: string | null }
    | Array<{ name: string; sku: string | null }>
    | null;
};
type OpenPO = { id: string; supplier_id: string; purchase_order_line: POLine[] };

type LineState = {
  key: string;
  component_id: string;
  purchase_order_line_id: string | null;
  quantity_delivered: string;
  quantity_expected: number | null;
  notes: string;
};

const REASONS = [
  { value: "supplier_delivery", label: "Supplier delivery" },
  { value: "customer_return", label: "Customer return" },
  { value: "opening_stock", label: "Opening stock" },
  { value: "sample", label: "Sample" },
  { value: "adjustment", label: "Adjustment" },
  { value: "other", label: "Other" },
];

function blankLine(): LineState {
  return {
    key: crypto.randomUUID(),
    component_id: "",
    purchase_order_line_id: null,
    quantity_delivered: "",
    quantity_expected: null,
    notes: "",
  };
}

function componentName(c: Component): string {
  return c.sku ? `${c.name} (${c.sku})` : c.name;
}

export default function ReceiptForm({
  suppliers,
  components,
  locations,
  openPOs,
}: {
  suppliers: Supplier[];
  components: Component[];
  locations: Location[];
  openPOs: OpenPO[];
}) {
  const defaultLocation = locations.find((l) => l.is_default) ?? locations[0];

  const [supplierId, setSupplierId] = useState<string>("");
  const [showSupplierOverride, setShowSupplierOverride] = useState(false);
  const [locationId, setLocationId] = useState(defaultLocation?.id ?? "");
  const [selectedPoId, setSelectedPoId] = useState<string>("");
  const [lines, setLines] = useState<LineState[]>([blankLine()]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const filteredPOs = showSupplierOverride
    ? []
    : supplierId
    ? openPOs.filter((po) => po.supplier_id === supplierId)
    : openPOs;

  function handleSupplierChange(value: string) {
    setSupplierId(value === "__other__" ? "" : value);
    setShowSupplierOverride(value === "__other__");
    setSelectedPoId("");
    setLines([blankLine()]);
  }

  function handlePoChange(poId: string) {
    setSelectedPoId(poId);
    if (!poId) {
      setLines([blankLine()]);
      return;
    }
    const po = openPOs.find((p) => p.id === poId);
    if (!po) return;
    const newLines: LineState[] = po.purchase_order_line.map((pol) => ({
      key: crypto.randomUUID(),
      component_id: pol.component_id,
      purchase_order_line_id: pol.id,
      quantity_delivered: "",
      quantity_expected: pol.quantity - pol.quantity_received,
      notes: "",
    }));
    setLines(newLines.length > 0 ? newLines : [blankLine()]);
  }

  function updateLine(key: string, patch: Partial<LineState>) {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l))
    );
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const filledLines = lines.filter(
      (l) => l.component_id && l.quantity_delivered
    );
    if (filledLines.length === 0) {
      setError("At least one complete line is required.");
      return;
    }

    const fd = new FormData(formRef.current!);
    // Override supplier_id: "__other__" sentinel must not reach the server
    if (showSupplierOverride) {
      fd.set("supplier_id", "");
    }
    fd.set(
      "lines",
      JSON.stringify(
        filledLines.map((l) => ({
          component_id: l.component_id,
          purchase_order_line_id: l.purchase_order_line_id,
          quantity_delivered: parseFloat(l.quantity_delivered),
          quantity_expected: l.quantity_expected,
          notes: l.notes || null,
        }))
      )
    );

    startTransition(async () => {
      const result = await createDeliveryReceipt(fd);
      if (result?.error) setError(result.error);
    });
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className={styles.page}>
      {error && <div className={styles.errorNotice}>{error}</div>}

      <div className={styles.formCard}>
        <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>
          Delivery details
        </h2>

        <div className={styles.formGrid}>
          {/* Supplier */}
          <div className={styles.field}>
            <label htmlFor="supplier_id">Supplier</label>
            <select
              id="supplier_id"
              name="supplier_id"
              value={showSupplierOverride ? "__other__" : supplierId}
              onChange={(e) => handleSupplierChange(e.target.value)}
            >
              <option value="">Select supplier…</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value="__other__">Other / not in system</option>
            </select>
          </div>

          {/* Supplier name override */}
          {showSupplierOverride && (
            <div className={styles.field}>
              <label htmlFor="supplier_name_override">Supplier name</label>
              <input
                id="supplier_name_override"
                name="supplier_name_override"
                type="text"
                placeholder="Enter supplier name"
                required
              />
            </div>
          )}

          {/* Reference */}
          <div className={styles.field}>
            <label htmlFor="supplier_reference">Docket / reference number</label>
            <input
              id="supplier_reference"
              name="supplier_reference"
              type="text"
              placeholder="e.g. DEL-10042"
              required
            />
          </div>

          {/* Date */}
          <div className={styles.field}>
            <label htmlFor="received_at">Date received</label>
            <input
              id="received_at"
              name="received_at"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              required
            />
          </div>

          {/* Location */}
          <div className={styles.field}>
            <label htmlFor="location_id">Location</label>
            <select
              id="location_id"
              name="location_id"
              value={locationId}
              onChange={(e) => setLocationId(e.target.value)}
              required
            >
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                  {l.is_default ? " (default)" : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Link to PO */}
          <div className={styles.field}>
            <label htmlFor="purchase_order_id">Link to PO (optional)</label>
            <select
              id="purchase_order_id"
              name="purchase_order_id"
              value={selectedPoId}
              onChange={(e) => handlePoChange(e.target.value)}
            >
              <option value="">No PO — manual stock-in</option>
              {filteredPOs.map((po) => (
                <option key={po.id} value={po.id}>
                  PO {po.id.slice(0, 8).toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          {/* Reason — only when no PO */}
          {!selectedPoId && (
            <div className={styles.field}>
              <label htmlFor="stock_in_reason">Reason</label>
              <select id="stock_in_reason" name="stock_in_reason" required>
                <option value="">Select reason…</option>
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Notes */}
          <div className={styles.fieldFull}>
            <label htmlFor="notes">Notes (optional)</label>
            <textarea
              id="notes"
              name="notes"
              rows={2}
              placeholder="Any overall delivery notes…"
            />
          </div>
        </div>
      </div>

      {/* Lines */}
      <div className={styles.formCard}>
        <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>Lines</h2>

        <table className={styles.linesTable}>
          <thead>
            <tr>
              <th>Component</th>
              <th>Expected</th>
              <th>Delivered</th>
              <th>Variance</th>
              <th>Note</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const variance = computeVariance(
                parseFloat(line.quantity_delivered) || 0,
                line.quantity_expected
              );
              return (
                <tr key={line.key}>
                  <td>
                    <select
                      value={line.component_id}
                      onChange={(e) =>
                        updateLine(line.key, { component_id: e.target.value })
                      }
                      disabled={!!line.purchase_order_line_id}
                    >
                      <option value="">Select component…</option>
                      {components.map((c) => (
                        <option key={c.id} value={c.id}>
                          {componentName(c)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    {line.quantity_expected !== null
                      ? line.quantity_expected
                      : "—"}
                  </td>
                  <td>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={line.quantity_delivered}
                      onChange={(e) =>
                        updateLine(line.key, {
                          quantity_delivered: e.target.value,
                        })
                      }
                      style={{ width: 90 }}
                    />
                  </td>
                  <td>
                    {variance !== null ? (
                      <span
                        className={`${styles.variance} ${
                          variance < 0
                            ? styles.varianceShort
                            : variance > 0
                            ? styles.varianceOver
                            : ""
                        }`}
                      >
                        {variance > 0 ? `+${variance}` : variance}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <input
                      type="text"
                      placeholder="Note…"
                      value={line.notes}
                      onChange={(e) =>
                        updateLine(line.key, { notes: e.target.value })
                      }
                      style={{ width: 140 }}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => removeLine(line.key)}
                      className={styles.secondary}
                      style={{ padding: "4px 10px" }}
                      disabled={lines.length === 1}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <button
          type="button"
          onClick={() => setLines((prev) => [...prev, blankLine()])}
          className={styles.secondary}
          style={{ alignSelf: "flex-start" }}
        >
          + Add line
        </button>
      </div>

      <div className={styles.actions}>
        <a href="/app/goods-inwards" className={styles.secondary}>
          Cancel
        </a>
        <button type="submit" className={styles.primary} disabled={isPending}>
          {isPending ? "Saving…" : "Save Receipt"}
        </button>
      </div>
    </form>
  );
}
