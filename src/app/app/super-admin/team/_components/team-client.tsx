"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { changePlatformUserRole, removePlatformUser } from "../actions";
import AddPlatformUserModal from "./add-platform-user-modal";
import styles from "../team.module.css";

type Row = {
  profileId: string;
  email: string | null;
  role: "super_admin" | "platform_observer";
  lastSignIn: string | null;
  isSelf: boolean;
};

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super admin",
  platform_observer: "Observer",
};

/** UI-only gate. Server actions enforce the same check via requireSuperAdmin(). */
type TeamClientProps = {
  rows: Row[];
  canMutate: boolean;
  superAdminCount: number;
};

export default function TeamClient({ rows, canMutate, superAdminCount }: TeamClientProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          onClick={() => setAddOpen(true)}
          disabled={!canMutate}
          title={!canMutate ? "Observers cannot make changes" : undefined}
        >
          + Add platform user
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Email</th>
              <th>Role</th>
              <th>Last sign-in</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const isLastSuperAdmin = row.role === "super_admin" && superAdminCount <= 1;
              return (
                <tr key={row.profileId}>
                  <td>{row.email ?? row.profileId}</td>
                  <td>
                    <span className={`${styles.rolePill} ${styles[`role_${row.role}`]}`}>
                      {ROLE_LABEL[row.role] ?? row.role}
                    </span>
                  </td>
                  <td>
                    {row.lastSignIn ? new Date(row.lastSignIn).toLocaleString() : "—"}
                  </td>
                  <td>
                    {canMutate && !row.isSelf ? (
                      <div className={styles.actions}>
                        {row.role === "platform_observer" && (
                          <button
                            disabled={pending}
                            onClick={() =>
                              run(() =>
                                changePlatformUserRole({
                                  profileId: row.profileId,
                                  newRole: "super_admin",
                                })
                              )
                            }
                          >
                            Promote
                          </button>
                        )}
                        {row.role === "super_admin" && !isLastSuperAdmin && (
                          <button
                            disabled={pending}
                            onClick={() =>
                              run(() =>
                                changePlatformUserRole({
                                  profileId: row.profileId,
                                  newRole: "platform_observer",
                                })
                              )
                            }
                          >
                            Demote
                          </button>
                        )}
                        <button
                          disabled={pending || isLastSuperAdmin}
                          title={isLastSuperAdmin ? "Cannot remove last super-admin" : undefined}
                          onClick={() => run(() => removePlatformUser({ profileId: row.profileId }))}
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <span style={{ color: "var(--ink-muted)", fontSize: "var(--text-sm)" }}>
                        {row.isSelf ? "(you)" : "—"}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className={styles.empty}>
                  No platform operators.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {addOpen && <AddPlatformUserModal onClose={() => setAddOpen(false)} />}
    </>
  );
}
