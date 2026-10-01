"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { disconnectXeroAction, retryAccountingJob } from "./xero/actions";
import styles from "./xero/xero.module.css";

export function DisconnectXeroButton({ orgName }: { orgName: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className={styles.secondaryBtn} onClick={() => dialog.current?.showModal()}>Disconnect</button>
      <dialog ref={dialog} className={styles.formCard}>
        <p className={styles.help}>Disconnect {orgName}? Manuva&apos;s access is revoked in Xero and queued bills are cancelled. Bills already in Xero stay there.</p>
        <form action={disconnectXeroAction} className={styles.actions}>
          <button type="button" className={styles.secondaryBtn} onClick={() => dialog.current?.close()}>Cancel</button>
          <button type="submit" className={styles.primaryBtn}>Disconnect</button>
        </form>
      </dialog>
    </>
  );
}

export function RetryJobButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  return (
    <>
      <button type="button" className={styles.secondaryBtn} disabled={pending} onClick={() => start(async () => {
        setMessage(null);
        try {
          const r = await retryAccountingJob(jobId);
          if (!r.ok) setMessage(r.message ?? "Couldn't retry.");
        } catch {
          setMessage("Couldn't retry.");
        }
        router.refresh();
      })}>Retry</button>
      {message ? <span className={styles.error}>{message}</span> : null}
    </>
  );
}
