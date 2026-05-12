"use client";

import { useActionState } from "react";
import { updateProfile, sendPasswordReset, uploadAvatar } from "./actions";
import styles from "./profile.module.css";

type State = { error?: string; success?: string } | null;

type Props = {
  fullName: string | null;
  avatarUrl: string | null;
  email: string;
  role: string;
};

export default function ProfileForm({ fullName, avatarUrl, email, role }: Props) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    updateProfile,
    null
  );
  const [avatarState, avatarAction, avatarPending] = useActionState<State, FormData>(
    uploadAvatar,
    null
  );
  const [resetState, resetAction, resetPending] = useActionState<State, FormData>(
    sendPasswordReset,
    null
  );

  const initial = (fullName?.trim()?.[0] ?? email?.[0] ?? "U").toUpperCase();

  return (
    <div className={styles.sections}>
      <div className={styles.card}>
        <h2 className={styles.cardHeading}>Personal information</h2>
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
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardHeading}>Avatar</h2>
        <p className={styles.description}>
          PNG, JPEG, or WebP. Max 2 MB. Shown in the top bar and member lists.
        </p>
        <div className={styles.avatarPreview}>
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl} alt="Your avatar" className={styles.avatarImage} />
          ) : (
            <span className={styles.avatarFallback}>{initial}</span>
          )}
        </div>
        <form action={avatarAction} className={styles.form}>
          <input
            name="avatar"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className={styles.fileInput}
            required
          />
          <div className={styles.actions}>
            <button
              type="submit"
              className={styles.secondaryButton}
              disabled={avatarPending}
            >
              {avatarPending ? "Uploading…" : "Upload avatar"}
            </button>
            {avatarState?.success && (
              <span className={styles.feedback}>{avatarState.success}</span>
            )}
            {avatarState?.error && (
              <span className={styles.errorMsg}>{avatarState.error}</span>
            )}
          </div>
        </form>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardHeading}>Password</h2>
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
      </div>
    </div>
  );
}
