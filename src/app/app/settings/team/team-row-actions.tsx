"use client";

import { useActionState } from "react";
import { updateMemberRole, deactivateMember } from "./actions";
import styles from "./team.module.css";

type State = { error?: string; success?: string } | null;

type Props = {
  profileId: string;
  currentRole: string;
  status: string;
  isSelf: boolean;
};

export default function TeamRowActions({
  profileId,
  currentRole,
  status,
  isSelf,
}: Props) {
  const [roleState, roleAction, rolePending] = useActionState<State, FormData>(
    updateMemberRole,
    null
  );
  const [deactivateState, deactivateAction, deactivatePending] =
    useActionState<State, FormData>(deactivateMember, null);

  if (status === "deactivated") {
    return <span className={styles.deactivatedBadge}>Deactivated</span>;
  }

  return (
    <div className={styles.rowActions}>
      <form action={roleAction} className={styles.roleForm}>
        <input type="hidden" name="profile_id" value={profileId} />
        <select
          name="role"
          defaultValue={currentRole}
          className={styles.roleSelect}
          onChange={(e) => {
            const form = e.currentTarget.form;
            if (form) form.requestSubmit();
          }}
          disabled={rolePending}
        >
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
      </form>

      {!isSelf && (
        <form action={deactivateAction}>
          <input type="hidden" name="profile_id" value={profileId} />
          <button
            type="submit"
            className={styles.dangerButton}
            disabled={deactivatePending}
            onClick={(e) => {
              if (
                !confirm(
                  "Deactivate this member? They will lose access immediately."
                )
              ) {
                e.preventDefault();
              }
            }}
          >
            Deactivate
          </button>
        </form>
      )}

      {roleState?.error && (
        <span className={styles.errorMsg}>{roleState.error}</span>
      )}
      {deactivateState?.error && (
        <span className={styles.errorMsg}>{deactivateState.error}</span>
      )}
    </div>
  );
}
