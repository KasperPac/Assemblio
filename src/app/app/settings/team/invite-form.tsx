"use client";

import { useActionState } from "react";
import { inviteMember } from "./actions";
import styles from "./team.module.css";

type State = { error?: string; success?: string } | null;

export default function InviteForm() {
  const [state, formAction, pending] = useActionState<State, FormData>(
    inviteMember,
    null
  );

  return (
    <form action={formAction} className={styles.inviteForm}>
      <input
        name="email"
        type="email"
        placeholder="colleague@company.com"
        className={styles.inviteInput}
        required
      />
      <select
        name="role"
        defaultValue="member"
        className={styles.inviteInput}
        aria-label="Role"
      >
        <option value="member">Member</option>
        <option value="admin">Admin</option>
      </select>
      <button
        type="submit"
        className={styles.primaryButton}
        disabled={pending}
      >
        {pending ? "Sending…" : "Invite member"}
      </button>
      {state?.success && (
        <span className={styles.feedback}>{state.success}</span>
      )}
      {state?.error && <span className={styles.errorMsg}>{state.error}</span>}
    </form>
  );
}
