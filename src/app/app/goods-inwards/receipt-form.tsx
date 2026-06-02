"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { createDeliveryReceipt, parseReceiptPdf } from "./actions";
import type { ParsedReceiptLine } from "./actions";
import ComponentPicker, { type PickerComponent } from "./component-picker";
import styles from "./goods-inwards.module.css";

type Supplier = { id: string; name: string };
type Component = PickerComponent;
type Location = { id: string; name: string; is_default: boolean };

type POLine = {
  id: string;
  component_id: string;
  quantity: number;
  quantity_received: number;
};

type AvailablePO = {
  id: string;
  supplier_id: string | null;
  supplier_name: string | null;
  lines: POLine[];
};

type LineState = {
  key: string;
  component_id: string;
  quantity_delivered: string;
  cost_per_unit: string;
  notes: string;
  extractedName?: string;
  quantity_expected?: number | null;
  purchase_order_line_id?: string | null;
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

function ComponentThumbnail({
  imageUrl,
  name,
}: {
  imageUrl: string | null;
  name: string;
}) {
  const slotStyle: React.CSSProperties = {
    width: 36,
    height: 36,
    borderRadius: 6,
    background: "var(--surface-1)",
    border: "1px solid var(--stroke-card)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexShrink: 0,
  };

  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={name}
        style={{ ...slotStyle, objectFit: "contain" }}
      />
    );
  }

  return (
    <div style={slotStyle} aria-hidden="true">
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--ink-faint)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
      </svg>
    </div>
  );
}

export default function ReceiptForm({
  suppliers,
  components,
  locations,
  supplierComponentMap,
  availablePOs,
  initialPoId,
  initialComponentId,
}: {
  suppliers: Supplier[];
  components: Component[];
  locations: Location[];
  supplierComponentMap: Record<string, string[]>;
  availablePOs: AvailablePO[];
  initialPoId?: string;
  initialComponentId?: string | null;
}) {
  const defaultLocation = locations.find((l) => l.is_default) ?? locations[0];

  const initialPo = initialPoId
    ? (availablePOs.find((p) => p.id === initialPoId) ?? null)
    : null;

  const [supplierId, setSupplierId] = useState<string>(initialPo?.supplier_id ?? "");
  const [showSupplierOverride, setShowSupplierOverride] = useState(false);
  const [locationId, setLocationId] = useState(defaultLocation?.id ?? "");
  const [lines, setLines] = useState<LineState[]>(() => {
    if (initialPo) {
      const poLines = initialPo.lines
        .filter((l) => l.quantity - l.quantity_received > 0)
        .map((l) => {
          const remaining = l.quantity - l.quantity_received;
          return {
            key: crypto.randomUUID(),
            component_id: l.component_id,
            quantity_delivered: String(remaining),
            cost_per_unit: "",
            notes: "",
            quantity_expected: remaining,
            purchase_order_line_id: l.id,
          };
        });
      if (poLines.length > 0) return poLines;
    }
    return [
      initialComponentId
        ? { ...blankLine(), component_id: initialComponentId }
        : blankLine(),
    ];
  });
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pickerLineKey, setPickerLineKey] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const [selectedPoId, setSelectedPoId] = useState<string>(initialPo?.id ?? "");

  function handlePoSelect(poId: string) {
    setSelectedPoId(poId);
    if (!poId) {
      // Cleared — reset supplier and lines
      setSupplierId("");
      setShowSupplierOverride(false);
      setLines([blankLine()]);
      return;
    }
    const po = availablePOs.find((p) => p.id === poId);
    if (!po) return;
    // Auto-fill supplier from PO
    setSupplierId(po.supplier_id ?? "");
    setShowSupplierOverride(false);
    setParsedBadge(false);
    // Pre-populate lines from remaining PO quantities
    const poLines = po.lines
      .filter((l) => l.quantity - l.quantity_received > 0)
      .map((l) => {
        const remaining = l.quantity - l.quantity_received;
        return {
          key: crypto.randomUUID(),
          component_id: l.component_id,
          quantity_delivered: String(remaining),
          cost_per_unit: "",
          notes: "",
          quantity_expected: remaining,
          purchase_order_line_id: l.id,
        };
      });
    setLines(poLines.length > 0 ? poLines : [blankLine()]);
  }

  const preferredIds = useMemo<Set<string> | undefined>(() => {
    if (!supplierId) return undefined;
    const ids = supplierComponentMap[supplierId];
    return ids && ids.length > 0 ? new Set(ids) : undefined;
  }, [supplierId, supplierComponentMap]);

  const sortedComponents = useMemo(() => {
    if (!preferredIds) return components;
    const preferred: Component[] = [];
    const others: Component[] = [];
    for (const c of components) {
      if (preferredIds.has(c.id)) preferred.push(c);
      else others.push(c);
    }
    return [...preferred, ...others];
  }, [components, preferredIds]);

  const supplierName = supplierId
    ? suppliers.find((s) => s.id === supplierId)?.name
    : undefined;
  const preferredCount = preferredIds?.size ?? 0;

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
    setParsedBadge(false);
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

    // When a PO is selected, supplier select is disabled (won't appear in FormData)
    // so we explicitly set both fields.
    if (selectedPoId) {
      fd.set("purchase_order_id", selectedPoId);
      fd.set("supplier_id", supplierId);
    }

    fd.set(
      "lines",
      JSON.stringify(
        filledLines.map((l) => ({
          component_id: l.component_id,
          purchase_order_line_id: l.purchase_order_line_id ?? null,
          quantity_delivered: parseFloat(l.quantity_delivered),
          quantity_expected: l.quantity_expected ?? null,
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

      {/* PO linking banner */}
      {availablePOs.length > 0 && (
        <div
          className={styles.formCard}
          style={{
            background: "var(--bg-card-alt)",
            borderColor: "var(--brand-1, #3b82f6)",
            borderWidth: "1.5px",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label htmlFor="po_select" style={{ fontWeight: 700, fontSize: "0.9rem" }}>
              Link to Purchase Order{" "}
              <span style={{ fontWeight: 400, color: "var(--ink-muted)" }}>(optional)</span>
            </label>
            <select
              id="po_select"
              value={selectedPoId}
              onChange={(e) => handlePoSelect(e.target.value)}
              style={{ maxWidth: 420 }}
            >
              <option value="">Select a PO to pre-fill this receipt…</option>
              {availablePOs.map((po) => (
                <option key={po.id} value={po.id}>
                  PO-{po.id.slice(0, 8).toUpperCase()} &middot; {po.supplier_name ?? "Unknown supplier"} &middot;{" "}
                  {po.lines.length} line{po.lines.length !== 1 ? "s" : ""}
                </option>
              ))}
            </select>
            {selectedPoId ? (
              <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--ok, green)" }}>
                ✓ Supplier and lines pre-filled from PO — adjust delivered quantities below.
              </p>
            ) : (
              <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--ink-muted)" }}>
                Fills supplier, lines &amp; quantities automatically.
              </p>
            )}
          </div>
        </div>
      )}

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
              disabled={!!selectedPoId}
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

          {!selectedPoId && (
            <div className={styles.field}>
              <label htmlFor="stock_in_reason">Reason</label>
              <select id="stock_in_reason" name="stock_in_reason" required>
                <option value="">Select reason…</option>
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          )}

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
              <th style={{ width: 40 }} aria-label="Image" />
              <th>Component</th>
              {selectedPoId && <th>Expected</th>}
              <th>Qty delivered</th>
              <th>Cost / unit (optional)</th>
              <th>Note</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.key}>
                <td style={{ width: 40, paddingRight: 0, verticalAlign: "middle" }}>
                  {(() => {
                    const c = components.find((c) => c.id === line.component_id);
                    return (
                      <ComponentThumbnail
                        imageUrl={c?.image_url ?? null}
                        name={c?.name ?? ""}
                      />
                    );
                  })()}
                </td>
                <td>
                  {line.extractedName && (
                    <div style={{ fontSize: "0.75rem", color: "var(--ink-muted)", marginBottom: 4 }}>
                      From PDF: {line.extractedName}
                    </div>
                  )}
                  {line.purchase_order_line_id ? (
                    // PO-sourced line: component is locked
                    <span style={{ fontSize: "0.9rem" }}>
                      {(() => {
                        const c = components.find((c) => c.id === line.component_id);
                        return c ? componentLabel(c) : line.component_id;
                      })()}
                    </span>
                  ) : (
                    // Free line: editable component select + picker
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <select
                        value={line.component_id}
                        onChange={(e) => updateLine(line.key, { component_id: e.target.value })}
                        style={{ flex: 1, minWidth: 0 }}
                      >
                        <option value="">Select component…</option>
                        {preferredIds && preferredCount > 0 ? (
                          <>
                            <optgroup label={`From ${supplierName ?? "supplier"}`}>
                              {sortedComponents
                                .filter((c) => preferredIds.has(c.id))
                                .map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {componentLabel(c)}
                                  </option>
                                ))}
                            </optgroup>
                            <optgroup label="Other components">
                              {sortedComponents
                                .filter((c) => !preferredIds.has(c.id))
                                .map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {componentLabel(c)}
                                  </option>
                                ))}
                            </optgroup>
                          </>
                        ) : (
                          sortedComponents.map((c) => (
                            <option key={c.id} value={c.id}>
                              {componentLabel(c)}
                            </option>
                          ))
                        )}
                      </select>
                      <button
                        type="button"
                        className={styles.secondary}
                        onClick={() => setPickerLineKey(line.key)}
                        style={{ padding: "4px 10px", whiteSpace: "nowrap" }}
                        title="Browse all components"
                      >
                        Browse…
                      </button>
                    </div>
                  )}
                </td>
                {selectedPoId && (
                  <td style={{ color: "var(--ink-muted)" }}>
                    {line.quantity_expected != null ? line.quantity_expected : "—"}
                  </td>
                )}
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
        {!selectedPoId && (
          <button
            type="button"
            onClick={() => setLines((prev) => [...prev, blankLine()])}
            className={styles.secondary}
            style={{ alignSelf: "flex-start" }}
          >
            + Add line
          </button>
        )}
      </div>

      <div className={styles.actions}>
        <a href="/app/goods-inwards" className={styles.secondary}>Cancel</a>
        <button type="submit" className={styles.primary} disabled={isPending || pdfParsing}>
          {isPending ? "Saving…" : "Save Receipt"}
        </button>
      </div>

      {pickerLineKey && (
        <ComponentPicker
          components={components}
          preferredIds={preferredIds}
          supplierName={supplierName}
          onPick={(id) => {
            updateLine(pickerLineKey, { component_id: id });
            setPickerLineKey(null);
          }}
          onClose={() => setPickerLineKey(null)}
        />
      )}
    </form>
  );
}
