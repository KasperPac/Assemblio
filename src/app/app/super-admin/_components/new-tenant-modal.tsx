"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createTenant } from "../actions";
import styles from "./new-tenant-modal.module.css";

export default function NewTenantModal({ defaultTimezone }: { defaultTimezone: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className={styles.backdrop} onClick={() => router.push("/app/super-admin")}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>New tenant</h2>
        <form
          className={styles.form}
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(async () => {
              try {
                const id = await createTenant({
                  name: String(fd.get("name")),
                  timezone: String(fd.get("timezone")),
                  currency: String(fd.get("currency")),
                  tier: fd.get("tier") as "starter" | "growth" | "pro" | "enterprise",
                  trialDays: Number(fd.get("trialDays")),
                  reason: String(fd.get("reason") ?? ""),
                });
                router.push(`/app/super-admin/tenants/${id}`);
              } catch (err) {
                setError((err as Error).message);
              }
            });
          }}
        >
          <label className={styles.field}>
            <span>Name</span>
            <input name="name" required />
          </label>
          <label className={styles.field}>
            <span>Timezone</span>
            <input name="timezone" defaultValue={defaultTimezone} required />
          </label>
          <label className={styles.field}>
            <span>Currency</span>
            <input name="currency" defaultValue="AUD" required />
          </label>
          <label className={styles.field}>
            <span>Plan tier</span>
            <select name="tier" defaultValue="starter">
              <option value="starter">Starter</option>
              <option value="growth">Growth</option>
              <option value="pro">Pro</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </label>
          <label className={styles.field}>
            <span>Trial days</span>
            <input name="trialDays" type="number" defaultValue={14} min={0} max={365} required />
          </label>
          <label className={styles.field}>
            <span>Reason (optional)</span>
            <textarea name="reason" rows={2} />
          </label>
          {error && <p className={styles.error}>{error}</p>}
          <div className={styles.actions}>
            <button type="button" onClick={() => router.push("/app/super-admin")} disabled={pending}>Cancel</button>
            <button type="submit" disabled={pending}>{pending ? "Creating…" : "Create tenant"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
