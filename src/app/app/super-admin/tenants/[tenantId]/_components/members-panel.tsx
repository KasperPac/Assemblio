"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addMember, removeMember, changeMemberRole } from "../actions";
import styles from "./members-panel.module.css";

type Member = { profile_id: string; role: string; email: string | null };

export default function MembersPanel({ tenantId, members, canMutate }: { tenantId: string; members: Member[]; canMutate: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        setAddOpen(false);
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <div>
      <div className={styles.headerRow}>
        <h2 className={styles.title}>Members ({members.length})</h2>
        <button
          onClick={() => canMutate && setAddOpen(true)}
          className={styles.addButton}
          disabled={!canMutate}
          title={!canMutate ? "Observers cannot make changes" : undefined}
        >
          + Add member
        </button>
      </div>

      <table className={styles.table}>
        <thead><tr><th>Email</th><th>Role</th><th></th></tr></thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.profile_id}>
              <td>{m.email ?? m.profile_id}</td>
              <td>
                <select
                  defaultValue={m.role}
                  onChange={(e) =>
                    run(() =>
                      changeMemberRole({
                        tenantId,
                        profileId: m.profile_id,
                        newRole: e.target.value as "admin" | "member",
                      })
                    )
                  }
                  disabled={!canMutate || pending}
                  title={!canMutate ? "Observers cannot make changes" : undefined}
                >
                  <option value="admin">admin</option>
                  <option value="member">member</option>
                </select>
              </td>
              <td>
                <button
                  className={styles.removeButton}
                  onClick={() => canMutate && run(() => removeMember({ tenantId, profileId: m.profile_id }))}
                  disabled={!canMutate || pending}
                  title={!canMutate ? "Observers cannot make changes" : undefined}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
          {members.length === 0 && <tr><td colSpan={3} className={styles.empty}>No members.</td></tr>}
        </tbody>
      </table>

      {error && <p className={styles.error}>{error}</p>}

      {addOpen && (
        <div className={styles.backdrop} onClick={() => setAddOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.title}>Add member</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                run(() =>
                  addMember({
                    tenantId,
                    profileId: String(fd.get("profileId")),
                    role: fd.get("role") as "admin" | "member",
                    reason: String(fd.get("reason") ?? ""),
                  })
                );
              }}
            >
              <label className={styles.field}>
                <span>Profile ID (auth.users.id)</span>
                <input name="profileId" required />
              </label>
              <label className={styles.field}>
                <span>Role</span>
                <select name="role" defaultValue="member">
                  <option value="admin">admin</option>
                  <option value="member">member</option>
                </select>
              </label>
              <label className={styles.field}>
                <span>Reason</span>
                <textarea name="reason" rows={2} />
              </label>
              <div className={styles.modalActions}>
                <button type="button" onClick={() => setAddOpen(false)} disabled={pending}>Cancel</button>
                <button type="submit" disabled={pending}>{pending ? "Adding…" : "Add"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
