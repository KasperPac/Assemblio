"use client";

import { useActionState } from "react";
import { resendInvite, revokeInvite } from "./actions";
import styles from "./team.module.css";

type State = { error?: string; success?: string } | null;

export default function PendingInviteActions({
  invitationId,
}: {
  invitationId: string;
}) {
  const [resendState, resendAction, resendPending] = useActionState<State, FormData>(
    resendInvite,
    null
  );
  const [revokeState, revokeAction, revokePending] = useActionState<State, FormData>(
    revokeInvite,
    null
  );

  return (
    <div className={styles.inviteRowActions}>
      <form action={resendAction} className={styles.inlineForm}>
        <input type="hidden" name="invitation_id" value={invitationId} />
        <button
          type="submit"
          className={styles.linkButton}
          disabled={resendPending}
        >
          {resendPending ? "Resending…" : "Resend"}
        </button>
      </form>
      <form action={revokeAction} className={styles.inlineForm}>
        <input type="hidden" name="invitation_id" value={invitationId} />
        <button
          type="submit"
          className={styles.linkButtonDanger}
          disabled={revokePending}
        >
          {revokePending ? "Revoking…" : "Revoke"}
        </button>
      </form>
      {(resendState?.error ?? revokeState?.error) ? (
        <span className={styles.errorMsg}>
          {resendState?.error ?? revokeState?.error}
        </span>
      ) : null}
    </div>
  );
}
