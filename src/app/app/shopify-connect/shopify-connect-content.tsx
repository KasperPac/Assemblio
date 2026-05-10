"use client";

import { useState, useActionState } from "react";
import styles from "./shopify-connect.module.css";
import { signInAndLink, signUpAndLink } from "./actions";

const initial = { error: undefined };

export default function ShopifyConnectContent({
  shopDomain,
}: {
  shopDomain: string;
}) {
  const [tab, setTab] = useState<"signin" | "signup">("signin");
  const [signInState, signInAction, signInPending] = useActionState(
    signInAndLink,
    initial
  );
  const [signUpState, signUpAction, signUpPending] = useActionState(
    signUpAndLink,
    initial
  );

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <div>
          <p className={styles.eyebrow}>Manuva</p>
          <h1 className={styles.title}>Connect your Shopify store</h1>
          <span className={styles.shopDomain}>{shopDomain}</span>
        </div>

        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${tab === "signin" ? styles.tabActive : ""}`}
            onClick={() => setTab("signin")}
            type="button"
          >
            Sign in
          </button>
          <button
            className={`${styles.tab} ${tab === "signup" ? styles.tabActive : ""}`}
            onClick={() => setTab("signup")}
            type="button"
          >
            Start free trial
          </button>
        </div>

        {tab === "signin" && (
          <form className={styles.form} action={signInAction}>
            <label>
              Email
              <input
                name="email"
                type="email"
                placeholder="you@company.com"
                required
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                placeholder="••••••••"
                required
              />
            </label>
            {signInState.error && (
              <p className={styles.error}>{signInState.error}</p>
            )}
            <button
              className={styles.submit}
              type="submit"
              disabled={signInPending}
            >
              {signInPending ? "Signing in…" : "Sign in and connect"}
            </button>
          </form>
        )}

        {tab === "signup" && (
          <form className={styles.form} action={signUpAction}>
            <label>
              Company name
              <input
                name="company"
                type="text"
                placeholder="Acme Manufacturing"
                required
              />
            </label>
            <label>
              Email
              <input
                name="email"
                type="email"
                placeholder="you@company.com"
                required
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                placeholder="Create a password"
                required
              />
            </label>
            {signUpState.error && (
              <p className={styles.error}>{signUpState.error}</p>
            )}
            <button
              className={styles.submit}
              type="submit"
              disabled={signUpPending}
            >
              {signUpPending ? "Creating account…" : "Create account and connect"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
