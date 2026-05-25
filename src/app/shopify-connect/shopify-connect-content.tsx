"use client";

import Link from "next/link";
import { useState, useActionState } from "react";
import styles from "./shopify-connect.module.css";
import { signInAndLink } from "./actions";

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

  return (
    <div className={styles.page}>
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
            New here?
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
          <div className={styles.form}>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>
              Manuva is currently in private beta. Apply for early access and
              we&apos;ll reach out — you can connect your Shopify store as soon
              as you&apos;re approved.
            </p>
            <Link
              href={`/apply?shop=${encodeURIComponent(shopDomain)}`}
              className={styles.submit}
              style={{ display: "block", textAlign: "center", textDecoration: "none" }}
            >
              Apply for early access
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
