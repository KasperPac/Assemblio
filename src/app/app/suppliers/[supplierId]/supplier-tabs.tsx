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
  actions,
}: Props) {
  const [active, setActive] = useState<Tab>("Overview");
  const [editMode, setEditMode] = useState(false);

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
          <p className={styles.empty}>Components tab — built in Task 5.</p>
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
