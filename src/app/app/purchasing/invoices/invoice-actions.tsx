"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { voidSupplierInvoice } from "./actions";
import { retryAccountingJob } from "../../settings/integrations/xero/actions";
import styles from "./invoices.module.css";

/** Rendered inside the page's PageHeader `actions`. */
export default function InvoiceActions({ invoiceId, canVoid, retryJobId }: { invoiceId: string; canVoid: boolean; retryJobId: string | null }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [voidMessage, setVoidMessage] = useState<string | null>(null);
  // Shown after a void that left something to do in Xero (it was disconnected); outlives the refresh.
  const [voidNotice, setVoidNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const doVoid = () =>
    start(async () => {
      setVoidMessage(null);
      const r = await voidSupplierInvoice(invoiceId, reason);
      if (!r.ok) return setVoidMessage(r.message);
      setVoidNotice(r.message ?? null);
      dialog.current?.close();
      router.refresh();
    });
  const doRetry = () =>
    start(async () => {
      if (!retryJobId) return;
      setRetryMessage(null);
      const r = await retryAccountingJob(retryJobId);
      if (!r.ok) return setRetryMessage(r.message ?? "Couldn't retry.");
      router.refresh();
    });

  if (!canVoid && !retryJobId && !voidNotice) return null;
  return (
    <>
      {voidNotice ? <p className={styles.error} role="status">{voidNotice}</p> : null}
      {retryMessage ? <p className={styles.error} role="status">{retryMessage}</p> : null}
      {retryJobId ? <button type="button" className={styles.secondaryBtn} disabled={pending} onClick={doRetry}>Retry sending to Xero</button> : null}
      {canVoid ? <button type="button" className={styles.dangerBtn} onClick={() => { setVoidMessage(null); dialog.current?.showModal(); }}>Void invoice</button> : null}
      <dialog ref={dialog} className={styles.dialog}>
        <div className={styles.field}>
          <label className={styles.caps} htmlFor="void-reason">Reason for voiding</label>
          <textarea id="void-reason" className={styles.input} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          <p className={styles.help}>The bill is deleted or voided in Xero, and the receipt lines can be invoiced again.</p>
          {voidMessage ? <p className={styles.error} role="alert">{voidMessage}</p> : null}
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.secondaryBtn} onClick={() => dialog.current?.close()}>Cancel</button>
          <button type="button" className={styles.dangerBtn} disabled={pending || !reason.trim()} onClick={doVoid}>Void invoice</button>
        </div>
      </dialog>
    </>
  );
}
