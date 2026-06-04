"use client";

import React, { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import type {
  Supplier,
  SupplierContact,
  SupplierComponent,
  SupplierComponentPriceBreak,
  AvgLeadTime,
} from "@/lib/suppliers/types";
import StatusBadge from "../../_ui/status-badge";
import styles from "./supplier-tabs.module.css";

type PoRow = {
  id: string;
  status: string;
  created_at: string;
  expected_date: string | null;
  purchase_order_line: Array<{ quantity: number; unit_cost: number | null }>;
  delivery_receipt: Array<{ id: string; received_at: string }>;
};

type CatalogRow = SupplierComponent & {
  supplier_component_price_breaks: SupplierComponentPriceBreak[];
  component: { id: string; name: string; unit: string | null } | null;
};

type ActionResult = { success?: boolean; error?: string };

type Actions = {
  updateSupplier: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  addContact: (formData: FormData) => Promise<void>;
  removeContact: (formData: FormData) => Promise<void>;
  linkComponent: (prevState: ActionResult, formData: FormData) => Promise<ActionResult>;
  updateSupplierComponent: (formData: FormData) => Promise<void>;
  unlinkComponent: (formData: FormData) => Promise<void>;
  togglePreferred: (formData: FormData) => Promise<void>;
  addPriceBreak: (formData: FormData) => Promise<void>;
  removePriceBreak: (formData: FormData) => Promise<void>;
};

type Props = {
  supplier: Supplier;
  contacts: SupplierContact[];
  catalog: CatalogRow[];
  avgLeadTimes: Map<string, AvgLeadTime>;
  allComponents: Array<{ id: string; name: string; sku: string | null }>;
  pos: PoRow[];
  actions: Actions;
};

const TABS = ["Overview", "Components", "Purchase Orders"] as const;
type Tab = (typeof TABS)[number];

export default function SupplierTabs({
  supplier,
  contacts,
  catalog,
  avgLeadTimes,
  allComponents,
  pos,
  actions,
}: Props) {
  const [active, setActive] = useState<Tab>("Overview");
  const [editMode, setEditMode] = useState(false);
  const [linkComponentOpen, setLinkComponentOpen] = useState(false);
  const [poFilter, setPoFilter] = useState<"all" | "open" | "received">("all");
  const filteredPos = pos.filter((p) => poFilter === "all" || p.status === poFilter);

  const [updateState, updateAction] = useActionState(actions.updateSupplier, {});
  useEffect(() => {
    if (updateState.success) setEditMode(false);
  }, [updateState]);

  const [linkState, linkAction] = useActionState(actions.linkComponent, {});
  useEffect(() => {
    if (linkState.success) setLinkComponentOpen(false);
  }, [linkState]);

  return (
    <div className={styles.tabsContainer}>
      <div className={styles.tabBar}>
        {TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            className={`${styles.tab} ${active === tab ? styles.tabActive : ""}`}
            onClick={() => setActive(tab)}
          >
            {tab === "Components" ? `Components (${catalog.length})` : tab}
          </button>
        ))}
      </div>

      {active === "Overview" && (
        <div className={styles.tabContent}>
          {editMode ? (
            <form action={updateAction}>
              <input type="hidden" name="supplier_id" value={supplier.id} />
              <div className={styles.editGrid}>
                {(
                  [
                    ["contact_name", "Contact Name", supplier.contact_name ?? ""],
                    ["contact_email", "Email", supplier.contact_email ?? ""],
                    ["contact_phone", "Phone", supplier.contact_phone ?? ""],
                    ["website", "Website", supplier.website ?? ""],
                    ["address", "Address", supplier.address ?? ""],
                    ["payment_terms", "Payment Terms", supplier.payment_terms ?? ""],
                    ["default_currency", "Currency", supplier.default_currency ?? ""],
                    [
                      "default_lead_time_days",
                      "Default Lead Time (days)",
                      String(supplier.default_lead_time_days ?? ""),
                    ],
                  ] as [string, string, string][]
                ).map(([name, label, value]) => (
                  <label key={name} className={styles.editField}>
                    <span>{label}</span>
                    <input
                      name={name}
                      defaultValue={value}
                      className={styles.editInput}
                    />
                  </label>
                ))}
                <label className={`${styles.editField} ${styles.editFieldFull}`}>
                  <span>Notes</span>
                  <textarea
                    name="notes"
                    defaultValue={supplier.notes ?? ""}
                    className={styles.editTextarea}
                    rows={3}
                  />
                </label>
              </div>
              <div className={styles.editActions}>
                <button type="submit" className={styles.btnPrimary}>
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditMode(false)}
                  className={styles.btnSecondary}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className={styles.infoGrid}>
                {(
                  [
                    ["Contact Name", supplier.contact_name],
                    ["Email", supplier.contact_email],
                    ["Phone", supplier.contact_phone],
                    ["Website", supplier.website],
                    ["Address", supplier.address],
                    ["Payment Terms", supplier.payment_terms],
                    ["Currency", supplier.default_currency],
                    [
                      "Default Lead Time",
                      supplier.default_lead_time_days != null
                        ? `${supplier.default_lead_time_days} days`
                        : null,
                    ],
                  ] as [string, string | null][]
                ).map(([label, value]) => (
                  <div key={label} className={styles.infoField}>
                    <dt className={styles.infoLabel}>{label}</dt>
                    <dd className={styles.infoValue}>
                      {value ?? <span className={styles.empty}>—</span>}
                    </dd>
                  </div>
                ))}
              </div>
              {supplier.notes && (
                <div className={styles.notesSection}>
                  <div className={styles.sectionHeading}>Notes</div>
                  <p className={styles.notesText}>{supplier.notes}</p>
                </div>
              )}
              <button
                onClick={() => setEditMode(true)}
                className={styles.btnSecondary}
                type="button"
              >
                Edit
              </button>
            </>
          )}

          <div className={styles.sectionHeading}>Additional Contacts</div>
          {contacts.length === 0 ? (
            <p className={styles.empty}>No additional contacts.</p>
          ) : (
            <div className={styles.contactsList}>
              {contacts.map((c) => (
                <div key={c.id} className={styles.contactRow}>
                  <span className={styles.contactName}>{c.name}</span>
                  {c.role && (
                    <span className={styles.contactRole}>{c.role}</span>
                  )}
                  {c.email && (
                    <span className={styles.contactEmail}>{c.email}</span>
                  )}
                  {c.phone && (
                    <span className={styles.contactPhone}>{c.phone}</span>
                  )}
                  <form action={actions.removeContact} className={styles.contactRemove}>
                    <input type="hidden" name="contact_id" value={c.id} />
                    <input type="hidden" name="supplier_id" value={supplier.id} />
                    <button type="submit" className={styles.btnDanger}>
                      Remove
                    </button>
                  </form>
                </div>
              ))}
            </div>
          )}
          <form action={actions.addContact} className={styles.addContactForm}>
            <input type="hidden" name="supplier_id" value={supplier.id} />
            <input
              name="name"
              placeholder="Name"
              required
              aria-label="Contact name"
              className={styles.editInput}
            />
            <input
              name="email"
              placeholder="Email"
              type="email"
              aria-label="Contact email"
              className={styles.editInput}
            />
            <input
              name="phone"
              placeholder="Phone"
              aria-label="Contact phone"
              className={styles.editInput}
            />
            <input
              name="role"
              placeholder="Role (e.g. Accounts)"
              aria-label="Contact role"
              className={styles.editInput}
            />
            <button type="submit" className={styles.btnPrimary}>
              Add Contact
            </button>
          </form>
        </div>
      )}

      {active === "Components" && (
        <div className={styles.tabContent}>
          <div className={styles.tabToolbar}>
            <span className={styles.tabCount}>{catalog.length} components</span>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => setLinkComponentOpen(true)}
            >
              + Link Component
            </button>
          </div>

          {linkComponentOpen && (
            <form action={linkAction} className={styles.linkForm}>
              <input type="hidden" name="supplier_id" value={supplier.id} />
              <select name="component_id" required aria-label="Component" className={styles.editInput}>
                <option value="">Select component…</option>
                {allComponents.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.sku ? `(${c.sku})` : ""}
                  </option>
                ))}
              </select>
              <input name="supplier_part_number" placeholder="Supplier part #" aria-label="Supplier part number" className={styles.editInput} />
              <input name="unit_cost" type="number" step="0.01" placeholder="Unit cost" aria-label="Unit cost" className={styles.editInput} />
              <input name="currency" placeholder="Currency (e.g. AUD)" aria-label="Currency" className={styles.editInput} />
              <input name="lead_time_days" type="number" placeholder="Lead time (days)" aria-label="Lead time in days" className={styles.editInput} />
              <input name="moq" type="number" step="0.01" placeholder="MOQ" aria-label="Minimum order quantity" className={styles.editInput} />
              <button type="submit" className={styles.btnPrimary}>Link</button>
              <button type="button" onClick={() => setLinkComponentOpen(false)} className={styles.btnSecondary}>Cancel</button>
            </form>
          )}

          <div className={styles.tableCard}>
            <div className={styles.catalogHeader}>
              <span>Component</span>
              <span>Part #</span>
              <span>Unit Cost</span>
              <span>MOQ</span>
              <span>Lead Time</span>
              <span>Avg Actual</span>
              <span className={styles.centerCell}>Pref</span>
              <span />
            </div>
            {catalog.map((row) => {
              const lt = avgLeadTimes.get(row.component_id);
              const avgDaysDisplay = lt ? `${lt.avgDays.toFixed(1)}d` : "—";
              const ltColor =
                lt && row.lead_time_days != null
                  ? lt.avgDays <= row.lead_time_days
                    ? styles.ltGreen
                    : styles.ltRed
                  : "";
              return (
                <CatalogRowItem
                  key={row.id}
                  row={row}
                  avgDaysDisplay={avgDaysDisplay}
                  ltColor={ltColor}
                  supplierId={supplier.id}
                  actions={actions}
                />
              );
            })}
          </div>
        </div>
      )}

      {active === "Purchase Orders" && (
        <div className={styles.tabContent}>
          <div className={styles.tabToolbar}>
            <div className={styles.filterTabs}>
              {(["all", "open", "received"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`${styles.filterChip} ${poFilter === f ? styles.filterChipActive : ""}`}
                  onClick={() => setPoFilter(f)}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.tableCard}>
            <div className={styles.poHeader}>
              <span>PO Ref</span>
              <span>Created</span>
              <span>Status</span>
              <span>Expected</span>
              <span>Received</span>
              <span>Value</span>
            </div>
            {filteredPos.length === 0 ? (
              <p className={styles.empty}>No purchase orders.</p>
            ) : (
              filteredPos.map((po) => {
                const latestReceipt = po.delivery_receipt
                  .slice()
                  .sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime())[0];
                const value = po.purchase_order_line.reduce(
                  (sum, l) => sum + l.quantity * (l.unit_cost ?? 0),
                  0
                );
                let onTimePill: React.ReactNode = null;
                if (latestReceipt && po.expected_date) {
                  const late =
                    new Date(latestReceipt.received_at) > new Date(po.expected_date);
                  if (late) {
                    const diffDays = Math.round(
                      (new Date(latestReceipt.received_at).getTime() -
                        new Date(po.expected_date).getTime()) /
                        (1000 * 60 * 60 * 24)
                    );
                    onTimePill = (
                      <span className={styles.lateTag}>+{diffDays}d late</span>
                    );
                  } else {
                    onTimePill = <span className={styles.onTimeTag}>✓ on time</span>;
                  }
                }
                return (
                  <div key={po.id} className={styles.poRow}>
                    <Link href={`/app/purchasing/${po.id}`} className={styles.poRef}>
                      {po.id.slice(0, 8).toUpperCase()}
                    </Link>
                    <span>
                      {new Date(po.created_at).toLocaleDateString("en-AU", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                    <span>
                      {po.status === "received" ? (
                        <StatusBadge variant="success">Received</StatusBadge>
                      ) : po.status === "in_transit" ? (
                        <StatusBadge variant="info">In transit</StatusBadge>
                      ) : po.status === "cancelled" || po.status === "archived" ? (
                        <StatusBadge>{po.status.charAt(0).toUpperCase() + po.status.slice(1)}</StatusBadge>
                      ) : (
                        <StatusBadge>Open</StatusBadge>
                      )}
                    </span>
                    <span>
                      {po.expected_date
                        ? new Date(po.expected_date).toLocaleDateString("en-AU", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "—"}
                    </span>
                    <span>
                      {latestReceipt ? (
                        <Link
                          href={`/app/goods-inwards/${latestReceipt.id}`}
                          className={styles.receiptLink}
                        >
                          {new Date(latestReceipt.received_at).toLocaleDateString("en-AU", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </Link>
                      ) : "—"}
                      {onTimePill}
                    </span>
                    <span>
                      {value > 0
                        ? `$${value.toLocaleString("en-AU", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}`
                        : "—"}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CatalogRowItem({
  row,
  avgDaysDisplay,
  ltColor,
  supplierId,
  actions,
}: {
  row: CatalogRow;
  avgDaysDisplay: string;
  ltColor: string;
  supplierId: string;
  actions: Actions;
}) {
  const [breaksOpen, setBreaksOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  return (
    <>
      <div className={styles.catalogRow}>
        <div>
          {row.component?.id ? (
            <Link
              href={`/app/components/${row.component.id}`}
              className={styles.componentLink}
            >
              {row.component.name}
            </Link>
          ) : (
            <span>{row.component?.name ?? row.component_id}</span>
          )}
          {row.component?.unit && (
            <span className={styles.catalogUnit}> / {row.component.unit}</span>
          )}
        </div>
        <span className={styles.catalogPartNum}>{row.supplier_part_number ?? "—"}</span>
        <div>
          <span>{row.unit_cost != null ? `$${row.unit_cost.toFixed(2)}` : "—"}</span>
          {row.supplier_component_price_breaks.length > 0 && (
            <button
              type="button"
              className={styles.breaksToggle}
              onClick={() => setBreaksOpen((v) => !v)}
            >
              {breaksOpen ? "▴" : "▾"} {row.supplier_component_price_breaks.length} breaks
            </button>
          )}
          <button
            type="button"
            className={styles.breaksToggle}
            onClick={() => setEditOpen((v) => !v)}
            aria-label="Edit supplier pricing"
            aria-expanded={editOpen}
          >
            {editOpen ? "▴ Edit" : "✎ Edit"}
          </button>
        </div>
        <span>{row.moq != null ? String(row.moq) : "—"}</span>
        <span>{row.lead_time_days != null ? `${row.lead_time_days}d` : "—"}</span>
        <span className={ltColor}>{avgDaysDisplay}</span>
        <form action={actions.togglePreferred} className={styles.centerCell}>
          <input type="hidden" name="supplier_component_id" value={row.id} />
          <input type="hidden" name="component_id" value={row.component_id} />
          <input type="hidden" name="supplier_id" value={supplierId} />
          <button
            type="submit"
            className={styles.starBtn}
            aria-label={row.is_preferred ? "Unset preferred supplier" : "Set preferred supplier"}
          >
            {row.is_preferred ? "★" : "☆"}
          </button>
        </form>
        <form action={actions.unlinkComponent}>
          <input type="hidden" name="supplier_component_id" value={row.id} />
          <input type="hidden" name="supplier_id" value={supplierId} />
          <input type="hidden" name="component_id" value={row.component_id} />
          <button type="submit" className={styles.btnDanger}>Remove</button>
        </form>
      </div>
      {editOpen && (
        <form
          action={actions.updateSupplierComponent}
          className={styles.editComponentForm}
        >
          <input type="hidden" name="supplier_component_id" value={row.id} />
          <input type="hidden" name="supplier_id" value={supplierId} />
          <input type="hidden" name="component_id" value={row.component_id} />
          <input
            name="supplier_part_number"
            defaultValue={row.supplier_part_number ?? ""}
            placeholder="Part #"
            aria-label="Supplier part number"
            className={`${styles.editInput} ${styles.inputMd}`}
          />
          <input
            name="unit_cost"
            type="number"
            step="0.01"
            min="0"
            defaultValue={row.unit_cost ?? ""}
            placeholder="Unit cost"
            aria-label="Unit cost"
            className={`${styles.editInput} ${styles.inputMd}`}
          />
          <input
            name="moq"
            type="number"
            step="0.01"
            min="0"
            defaultValue={row.moq ?? ""}
            placeholder="MOQ"
            aria-label="Minimum order quantity"
            className={`${styles.editInput} ${styles.inputSm}`}
          />
          <input
            name="lead_time_days"
            type="number"
            step="1"
            min="0"
            defaultValue={row.lead_time_days ?? ""}
            placeholder="Lead days"
            aria-label="Lead time in days"
            className={`${styles.editInput} ${styles.inputSm}`}
          />
          <button type="submit" className={styles.btnAddBreak}>Save</button>
        </form>
      )}
      {breaksOpen && (
        <>
          {row.supplier_component_price_breaks
            .slice()
            .sort((a, b) => a.min_quantity - b.min_quantity)
            .map((pb) => (
              <div key={pb.id} className={styles.priceBreakRow}>
                <span className={styles.breakQty}>↳ {pb.min_quantity}+</span>
                <span />
                <span>${pb.unit_cost.toFixed(2)}</span>
                <span /><span /><span /><span />
                <form action={actions.removePriceBreak}>
                  <input type="hidden" name="price_break_id" value={pb.id} />
                  <input type="hidden" name="supplier_component_id" value={row.id} />
                  <input type="hidden" name="supplier_id" value={supplierId} />
                  <button type="submit" className={styles.btnDanger} aria-label="Remove price break">×</button>
                </form>
              </div>
            ))}
          <form action={actions.addPriceBreak} className={styles.addPriceBreakForm}>
            <input type="hidden" name="supplier_component_id" value={row.id} />
            <input type="hidden" name="supplier_id" value={supplierId} />
            <input
              name="min_quantity"
              type="number"
              step="0.01"
              placeholder="Min qty"
              required
              className={`${styles.editInput} ${styles.inputSm}`}
            />
            <input
              name="unit_cost"
              type="number"
              step="0.01"
              placeholder="Unit cost"
              required
              className={`${styles.editInput} ${styles.inputMd}`}
            />
            <button type="submit" className={styles.btnAddBreak}>
              + Add break
            </button>
          </form>
        </>
      )}
    </>
  );
}
