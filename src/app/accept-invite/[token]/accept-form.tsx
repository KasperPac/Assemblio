"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  acceptInviteExistingUser,
  acceptInviteNewUser,
  type AcceptResult,
} from "./actions";
import styles from "./accept-invite.module.css";

interface Props {
  token: string;
  email: string;
  mode: "new" | "existing";
  alreadySignedIn: boolean;
}

const initial: AcceptResult = { ok: true };

function ExistingUserForm({
  token,
  email,
  alreadySignedIn,
}: {
  token: string;
  email: string;
  alreadySignedIn: boolean;
}) {
  const [state, action, pending] = useActionState<AcceptResult, FormData>(
    async () => acceptInviteExistingUser(token),
    initial
  );

  if (!alreadySignedIn) {
    const next = `/accept-invite/${token}`;
    return (
      <div className={styles.body}>
        <p className={styles.note}>
          An account already exists for this email. Sign in to accept this
          invite.
        </p>
        <Link
          className={styles.primary}
          href={`/login?redirect=${encodeURIComponent(next)}&email=${encodeURIComponent(email)}`}
        >
          Sign in to accept →
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className={styles.body}>
      <p className={styles.note}>You&apos;re signed in as {email}. Tap the button to join.</p>
      <button type="submit" className={styles.primary} disabled={pending}>
        {pending ? "Joining…" : "Accept invitation"}
      </button>
      {state && !state.ok ? <p className={styles.error}>{state.error}</p> : null}
    </form>
  );
}

function NewUserForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState<AcceptResult, FormData>(
    async (_prev, formData) => acceptInviteNewUser(token, formData),
    initial
  );

  return (
    <form action={action} className={styles.body}>
      <label className={styles.field}>
        Full name
        <input
          name="full_name"
          type="text"
          placeholder="Alex Operator"
          autoComplete="name"
          required
        />
      </label>
      <label className={styles.field}>
        Password
        <input
          name="password"
          type="password"
          placeholder="At least 8 characters"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </label>
      <label className={styles.field}>
        Confirm password
        <input
          name="password_confirm"
          type="password"
          placeholder="Re-enter password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </label>
      <button type="submit" className={styles.primary} disabled={pending}>
        {pending ? "Creating account…" : "Accept invitation"}
      </button>
      {state && !state.ok ? <p className={styles.error}>{state.error}</p> : null}
    </form>
  );
}

export default function AcceptForm({ token, email, mode, alreadySignedIn }: Props) {
  if (mode === "existing") {
    return (
      <ExistingUserForm
        token={token}
        email={email}
        alreadySignedIn={alreadySignedIn}
      />
    );
  }
  return <NewUserForm token={token} />;
}
