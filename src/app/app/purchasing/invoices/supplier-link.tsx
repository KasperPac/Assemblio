"use client";

import { useState, useTransition } from "react";
import { linkSupplierToXeroContact, searchXeroContactsAction } from "./actions";
import styles from "./invoices.module.css";

type Props = { supplierId: string; supplierName: string; linkedName: string | null; onLinked: (name: string) => void };

export default function SupplierLink({ supplierId, supplierName, linkedName, onLinked }: Props) {
  const [editing, setEditing] = useState(!linkedName);
  const [term, setTerm] = useState(supplierName);
  const [results, setResults] = useState<{ id: string; name: string }[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (linkedName && !editing) {
    return (
      <div className={styles.receiptRow}>
        <span className={styles.caps}>Xero contact</span>
        <span>{linkedName}</span>
        <button type="button" className={styles.secondaryBtn} onClick={() => setEditing(true)}>Change</button>
      </div>
    );
  }

  const search = () =>
    start(async () => {
      setMessage(null);
      const r = await searchXeroContactsAction(term);
      if (!r.ok) return setMessage(r.message);
      setResults(r.contacts);
      if (r.contacts.length === 0) setMessage("No matching contacts in Xero.");
    });

  const link = (id: string) =>
    start(async () => {
      const r = await linkSupplierToXeroContact(supplierId, id);
      if (!r.ok) return setMessage(r.message);
      onLinked(r.name);
      setEditing(false);
      setResults([]);
    });

  return (
    <div className={styles.field}>
      <span className={styles.caps}>Link {supplierName} to a Xero contact</span>
      <div className={styles.actions}>
        <input className={styles.input} value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search Xero contacts" aria-label="Search Xero contacts" />
        <button type="button" className={styles.secondaryBtn} disabled={pending} onClick={search}>Search</button>
      </div>
      {results.map((c) => (
        <button key={c.id} type="button" className={styles.secondaryBtn} disabled={pending} onClick={() => link(c.id)}>Link to {c.name}</button>
      ))}
      {message ? <p className={styles.help}>{message}</p> : null}
    </div>
  );
}
