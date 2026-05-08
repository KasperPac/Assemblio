"use client";

import { useActionState } from "react";
import { updateProfile, sendPasswordReset } from "./actions";
import styles from "./profile.module.css";

type State = { error?: string; success?: string } | null;

type Props = {
  fullName: string | null;
  email: string;
  role: string;
};

export default function ProfileForm({ fullName, email, role }: Props) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    updateProfile,
    null
  );
  const [resetState, resetAction, resetPending] = useActionState<State, FormData>(
    sendPasswordReset,
    null
  );

  return (
    <div className={styles.sections}>
      <section className={styles.section}>
        <h2 className={styles.heading}>Personal information</h2>
        <form action={formAction} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="full_name">
              Display name
            </label>
            <input
              id="full_name"
              name="full_name"
              type="text"
              className={styles.input}
              defaultValue={fullName ?? ""}
              placeholder="Your name"
              required
            />
          </div>
          <div className={styles.field}>
            <span className={styles.label}>Email</span>
            <span className={styles.readOnly}>{email}</span>
          </div>
          <div className={styles.field}>
            <span className={styles.label}>Role</span>
            <span className={styles.readOnly}>{role}</span>
          </div>
          <div className={styles.actions}>
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={pending}
            >
              {pending ? "Saving…" : "Save changes"}
            </button>
            {state?.success && (
              <span className={styles.feedback}>{state.success}</span>
            )}
            {state?.error && (
              <span className={styles.errorMsg}>{state.error}</span>
            )}
          </div>
        </form>
      </section>

      <hr className={styles.divider} />

      <section className={styles.section}>
        <h2 className={styles.heading}>Password</h2>
        <p className={styles.description}>
          We&apos;ll send a reset link to your email address.
        </p>
        <form action={resetAction}>
          <div className={styles.actions}>
            <button
              type="submit"
              className={styles.secondaryButton}
              disabled={resetPending}
            >
              {resetPending ? "Sending…" : "Send password reset email"}
            </button>
            {resetState?.success && (
              <span className={styles.feedback}>{resetState.success}</span>
            )}
            {resetState?.error && (
              <span className={styles.errorMsg}>{resetState.error}</span>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
