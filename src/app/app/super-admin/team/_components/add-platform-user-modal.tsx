"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addPlatformUser } from "../actions";
import styles from "../team.module.css";

export default function AddPlatformUserModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        await addPlatformUser({
          email: String(fd.get("email")),
          role: fd.get("role") as "super_admin" | "platform_observer",
          reason: String(fd.get("reason") ?? ""),
        });
        onClose();
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>Add platform user</h2>
        <form onSubmit={handleSubmit}>
          <label className={styles.field}>
            <span>Email address</span>
            <input name="email" type="email" required placeholder="user@example.com" />
          </label>
          <label className={styles.field}>
            <span>Role</span>
            <select name="role" defaultValue="platform_observer">
              <option value="platform_observer">Observer (read-only)</option>
              <option value="super_admin">Super admin (full access)</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>Reason (optional)</span>
            <textarea name="reason" rows={2} />
          </label>
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} disabled={pending}>Cancel</button>
            <button type="submit" disabled={pending}>{pending ? "Adding…" : "Add user"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
