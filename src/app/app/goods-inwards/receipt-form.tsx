"use client";

import { useRef, useState, useTransition } from "react";
import { createDeliveryReceipt, parseReceiptPdf } from "./actions";
import type { ParsedReceiptLine } from "./actions";
import styles from "./goods-inwards.module.css";

type Supplier = { id: string; name: string };
type Component = { id: string; name: string; sku: string | null };
type Location = { id: string; name: string; is_default: boolean };

type LineState = {
  key: string;
  component_id: string;
  quantity_delivered: string;
  cost_per_unit: string;
  notes: string;
  extractedName?: string;
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
    quantity_delivered: "",
    cost_per_unit: "",
    notes: "",
  };
}

function componentLabel(c: Component): string {
  return c.sku ? `${c.name} (${c.sku})` : c.name;
}

export default function ReceiptForm({
  suppliers,
  components,
  locations,
}: {
  suppliers: Supplier[];
  components: Component[];
  locations: Location[];
}) {
  const defaultLocation = locations.find((l) => l.is_default) ?? locations[0];

  const [supplierId, setSupplierId] = useState<string>("");
  const [showSupplierOverride, setShowSupplierOverride] = useState(false);
  const [locationId, setLocationId] = useState(defaultLocation?.id ?? "");
  const [lines, setLines] = useState<LineState[]>([blankLine()]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const [pdfParsing, setPdfParsing] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [parsedBadge, setParsedBadge] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supplierRefInputRef = useRef<HTMLInputElement>(null);
  const receivedAtInputRef = useRef<HTMLInputElement>(null);

  function handleSupplierChange(value: string) {
    setSupplierId(value === "__other__" ? "" : value);
    setShowSupplierOverride(value === "__other__");
  }

  function updateLine(key: string, patch: Partial<LineState>) {
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, ...patch } : l))
    );
  }

  function removeLine(key: string) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  }

  async function handlePdfParse() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setPdfError("File must be under 10 MB");
      return;
    }
    setPdfParsing(true);
    setPdfError(null);
    const fd = new FormData();
    fd.set("pdf", file);
    const result = await parseReceiptPdf(fd);
    setPdfParsing(false);

    if ("error" in result) {
      setPdfError(result.error);
      return;
    }

    if (supplierRefInputRef.current && result.supplier_reference) {
      supplierRefInputRef.current.value = result.supplier_reference;
    }
    if (receivedAtInputRef.current && result.received_at) {
      receivedAtInputRef.current.value = result.received_at;
    }

    if (result.lines.length > 0) {
      setLines(
        result.lines.map((l: ParsedReceiptLine) => ({
          key: crypto.randomUUID(),
          component_id: "",
          quantity_delivered: String(l.quantity),
          cost_per_unit: "",
          notes: "",
          extractedName: l.extracted_name,
        }))
      );
    }
    setParsedBadge(true);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const filledLines = lines.filter((l) => l.component_id && l.quantity_delivered);
    if (filledLines.length === 0) {
      setError("At least one complete line is required.");
      return;
    }

    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    if (showSupplierOverride) fd.set("supplier_id", "");
    fd.set(
      "lines",
      JSON.stringify(
        filledLines.map((l) => ({
          component_id: l.component_id,
          purchase_order_line_id: null,
          quantity_delivered: parseFloat(l.quantity_delivered),
          quantity_expected: null,
          cost_per_unit: l.cost_per_unit ? parseFloat(l.cost_per_unit) : null,
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

      {/* PDF parse section */}
      <div className={styles.formCard}>
        <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>
          Parse delivery docket (optional)
        </h2>
        <p style={{ margin: 0, color: "var(--ink-muted)", fontSize: "0.85rem" }}>
          Upload a PDF packing slip to pre-fill this form.
        </p>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            style={{ flex: 1 }}
          />
          <button
            type="button"
            className={styles.secondary}
            onClick={handlePdfParse}
            disabled={pdfParsing}
          >
            {pdfParsing ? "Parsing…" : "Parse PDF"}
          </button>
        </div>
        {pdfError && (
          <div className={styles.errorNotice}>{pdfError}</div>
        )}
        {parsedBadge && !pdfError && (
          <p style={{ margin: 0, color: "var(--ok)", fontSize: "0.85rem" }}>
            ✓ Pre-filled from PDF — review and adjust below.
          </p>
        )}
      </div>

      <div className={styles.formCard}>
        <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>
          Delivery details
        </h2>

        <div className={styles.formGrid}>
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
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
              <option value="__other__">Other / not in system</option>
            </select>
          </div>

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

          <div className={styles.field}>
            <label htmlFor="supplier_reference">Docket / reference number</label>
            <input
              ref={supplierRefInputRef}
              id="supplier_reference"
              name="supplier_reference"
              type="text"
              placeholder="e.g. DEL-10042"
              required
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="received_at">Date received</label>
            <input
              ref={receivedAtInputRef}
              id="received_at"
              name="received_at"
              type="date"
              defaultValue={new Date().toISOString().slice(0, 10)}
              required
            />
          </div>

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
                  {l.name}{l.is_default ? " (default)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor="stock_in_reason">Reason</label>
            <select id="stock_in_reason" name="stock_in_reason" required>
              <option value="">Select reason…</option>
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
          </div>

          <div className={styles.fieldFull}>
            <label htmlFor="notes">Notes (optional)</label>
            <textarea id="notes" name="notes" rows={2} placeholder="Any overall delivery notes…" />
          </div>
        </div>
      </div>

      <div className={styles.formCard}>
        <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700 }}>Lines</h2>
        <table className={styles.linesTable}>
          <thead>
            <tr>
              <th>Component</th>
              <th>Qty delivered</th>
              <th>Cost / unit (optional)</th>
              <th>Note</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.key}>
                <td>
                  {line.extractedName && (
                    <div style={{ fontSize: "0.75rem", color: "var(--ink-muted)", marginBottom: 4 }}>
                      From PDF: {line.extractedName}
                    </div>
                  )}
                  <select
                    value={line.component_id}
                    onChange={(e) => updateLine(line.key, { component_id: e.target.value })}
                  >
                    <option value="">Select component…</option>
                    {components.map((c) => (
                      <option key={c.id} value={c.id}>{componentLabel(c)}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={line.quantity_delivered}
                    onChange={(e) => updateLine(line.key, { quantity_delivered: e.target.value })}
                    style={{ width: 90 }}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={line.cost_per_unit}
                    onChange={(e) => updateLine(line.key, { cost_per_unit: e.target.value })}
                    placeholder="—"
                    style={{ width: 100 }}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    placeholder="Note…"
                    value={line.notes}
                    onChange={(e) => updateLine(line.key, { notes: e.target.value })}
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
            ))}
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
        <a href="/app/goods-inwards" className={styles.secondary}>Cancel</a>
        <button type="submit" className={styles.primary} disabled={isPending}>
          {isPending ? "Saving…" : "Save Receipt"}
        </button>
      </div>
    </form>
  );
}
