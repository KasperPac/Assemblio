"use client";

import { Suspense } from "react";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import styles from "./login.module.css";
import { signIn, signUp } from "./actions";

const initialState = { error: "", message: "" };

function LoginPageContent() {
  const searchParams = useSearchParams();
  const [signInState, signInAction] = useActionState(signIn, initialState);
  const [signUpState, signUpAction] = useActionState(signUp, initialState);
  const redirectTo = searchParams.get("redirect") ?? "/app";

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <p className={styles.eyebrow}>Assemblio Access</p>
        <h1>Sign in to continue</h1>
        <p>
          Use Supabase email/password auth to get started. You can add OAuth
          providers later in Supabase.
        </p>

        <form className={styles.form} action={signInAction}>
          <input type="hidden" name="redirect" value={redirectTo} />
          <label>
            Email
            <input name="email" type="email" placeholder="you@company.com" />
          </label>
          <label>
            Password
            <input name="password" type="password" placeholder="********" />
          </label>
          {signInState.error ? (
            <p className={styles.error}>{signInState.error}</p>
          ) : null}
          <button className={styles.primary} type="submit">
            Sign in
          </button>
        </form>

        <div className={styles.divider}>
          <span>New here?</span>
        </div>

        <form className={styles.form} action={signUpAction}>
          <input type="hidden" name="redirect" value={redirectTo} />
          <label>
            Email
            <input name="email" type="email" placeholder="you@company.com" />
          </label>
          <label>
            Password
            <input name="password" type="password" placeholder="Create a password" />
          </label>
          {signUpState.error ? (
            <p className={styles.error}>{signUpState.error}</p>
          ) : signUpState.message ? (
            <p className={styles.message}>{signUpState.message}</p>
          ) : null}
          <button className={styles.secondary} type="submit">
            Create account
          </button>
        </form>

        <div className={styles.meta}>
          <span>Tenant routing is enforced server-side.</span>
          <span>Inventory is ledger-backed.</span>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className={styles.page} />}>
      <LoginPageContent />
    </Suspense>
  );
}
