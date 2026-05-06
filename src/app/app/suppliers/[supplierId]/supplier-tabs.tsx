"use client";

import { useState } from "react";
import type {
  Supplier,
  SupplierContact,
  SupplierComponent,
  SupplierComponentPriceBreak,
  AvgLeadTime,
} from "@/lib/suppliers/types";
import styles from "./supplier-tabs.module.css";

type CatalogRow = SupplierComponent & {
  supplier_component_price_breaks: SupplierComponentPriceBreak[];
  component: { id: string; name: string; unit: string | null } | null;
};

type Actions = {
  updateSupplier: (formData: FormData) => Promise<void>;
  addContact: (formData: FormData) => Promise<void>;
  removeContact: (formData: FormData) => Promise<void>;
  linkComponent: (formData: FormData) => Promise<void>;
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
  actions,
}: Props) {
  const [active, setActive] = useState<Tab>("Overview");
  const [editMode, setEditMode] = useState(false);
  const [linkComponentOpen, setLinkComponentOpen] = useState(false);

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
            <form
              action={actions.updateSupplier}
              onSubmit={() => setEditMode(false)}
            >
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
              className={styles.editInput}
            />
            <input
              name="email"
              placeholder="Email"
              type="email"
              className={styles.editInput}
            />
            <input
              name="phone"
              placeholder="Phone"
              className={styles.editInput}
            />
            <input
              name="role"
              placeholder="Role (e.g. Accounts)"
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
            <form
              action={actions.linkComponent}
              onSubmit={() => setLinkComponentOpen(false)}
              className={styles.linkForm}
            >
              <input type="hidden" name="supplier_id" value={supplier.id} />
              <select name="component_id" required className={styles.editInput}>
                <option value="">Select component…</option>
                {allComponents.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.sku ? `(${c.sku})` : ""}
                  </option>
                ))}
              </select>
              <input name="supplier_part_number" placeholder="Supplier part #" className={styles.editInput} />
              <input name="unit_cost" type="number" step="0.01" placeholder="Unit cost" className={styles.editInput} />
              <input name="currency" placeholder="Currency (e.g. AUD)" className={styles.editInput} />
              <input name="lead_time_days" type="number" placeholder="Lead time (days)" className={styles.editInput} />
              <input name="moq" type="number" step="0.01" placeholder="MOQ" className={styles.editInput} />
              <button type="submit" className={styles.btnPrimary}>Link</button>
              <button type="button" onClick={() => setLinkComponentOpen(false)} className={styles.btnSecondary}>Cancel</button>
            </form>
          )}

          <div className={styles.catalogTable}>
            <div className={styles.catalogHeader}>
              <span>Component</span>
              <span>Part #</span>
              <span>Unit Cost</span>
              <span>MOQ</span>
              <span>Lead Time</span>
              <span>Avg Actual</span>
              <span style={{ textAlign: "center" }}>Pref</span>
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
          <p className={styles.empty}>Purchase Orders tab — built in Task 6.</p>
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

  return (
    <>
      <div className={styles.catalogRow}>
        <div>
          <span>{row.component?.name ?? row.component_id}</span>
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
        </div>
        <span>{row.moq != null ? String(row.moq) : "—"}</span>
        <span>{row.lead_time_days != null ? `${row.lead_time_days}d` : "—"}</span>
        <span className={ltColor}>{avgDaysDisplay}</span>
        <form action={actions.togglePreferred} style={{ textAlign: "center" }}>
          <input type="hidden" name="supplier_component_id" value={row.id} />
          <input type="hidden" name="component_id" value={row.component_id} />
          <input type="hidden" name="supplier_id" value={supplierId} />
          <button type="submit" className={styles.starBtn}>
            {row.is_preferred ? "★" : "☆"}
          </button>
        </form>
        <form action={actions.unlinkComponent}>
          <input type="hidden" name="supplier_component_id" value={row.id} />
          <input type="hidden" name="supplier_id" value={supplierId} />
          <button type="submit" className={styles.btnDanger}>Remove</button>
        </form>
      </div>
      {breaksOpen &&
        row.supplier_component_price_breaks
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
                <button type="submit" className={styles.btnDanger}>×</button>
              </form>
            </div>
          ))}
    </>
  );
}
