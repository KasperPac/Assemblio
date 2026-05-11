"use client";

import Image from "next/image";
import { Suspense, useState } from "react";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import styles from "./login.module.css";
import { signIn, signUp } from "./actions";

const initialState = { error: "", message: "" };
type Tab = "signin" | "signup";

function LoginPageContent() {
  const searchParams = useSearchParams();
  const [signInState, signInAction] = useActionState(signIn, initialState);
  const [signUpState, signUpAction] = useActionState(signUp, initialState);
  const redirectTo = searchParams.get("redirect") ?? "/app";
  const [tab, setTab] = useState<Tab>("signin");

  return (
    <div className={styles.page}>
      <div className={styles.left}>
        <div className={styles.leftInner}>
          <div className={styles.heading}>
            <h1>{tab === "signin" ? "Welcome back" : "Create your workspace"}</h1>
            <p>
              {tab === "signin"
                ? "Sign in with your workspace email and password."
                : "Spin up a new Manuva workspace in seconds."}
            </p>
          </div>

          <div className={styles.tabs} role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "signin"}
              className={`${styles.tab} ${tab === "signin" ? styles.tabActive : ""}`}
              onClick={() => setTab("signin")}
            >
              Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "signup"}
              className={`${styles.tab} ${tab === "signup" ? styles.tabActive : ""}`}
              onClick={() => setTab("signup")}
            >
              Sign up
            </button>
          </div>

          {tab === "signin" ? (
            <form className={styles.form} action={signInAction}>
              <input type="hidden" name="redirect" value={redirectTo} />
              <label>
                Email
                <input name="email" type="email" placeholder="you@company.com" autoComplete="email" />
              </label>
              <label>
                Password
                <input name="password" type="password" placeholder="••••••••" autoComplete="current-password" />
              </label>
              {signInState.error ? (
                <p className={styles.error}>{signInState.error}</p>
              ) : null}
              <button className={styles.primary} type="submit">
                Sign in
              </button>
            </form>
          ) : (
            <form className={styles.form} action={signUpAction}>
              <input type="hidden" name="redirect" value={redirectTo} />
              <label>
                Email
                <input name="email" type="email" placeholder="you@company.com" autoComplete="email" />
              </label>
              <label>
                Password
                <input name="password" type="password" placeholder="Create a password" autoComplete="new-password" />
              </label>
              {signUpState.error ? (
                <p className={styles.error}>{signUpState.error}</p>
              ) : signUpState.message ? (
                <p className={styles.message}>{signUpState.message}</p>
              ) : null}
              <button className={styles.primary} type="submit">
                Create account
              </button>
            </form>
          )}

          <p className={styles.meta}>Manufacturing operations by Manuva</p>
        </div>
      </div>

      <aside className={styles.right} aria-hidden="true">
        <div className={styles.rightInner}>
          <Image
            src="/manuva-logo.png"
            alt="Manuva"
            width={170}
            height={38}
            className={styles.rightLogo}
            priority
          />
          <h2 className={styles.tagline}>
            Manufacturing operations,
            <br />
            <span className={styles.taglineAccent}>finally simple.</span>
          </h2>
          <p className={styles.lede}>
            Inventory, BOMs, orders, and production — one workspace, no spreadsheets.
          </p>

          <div className={styles.quote}>
            <p>
              &ldquo;Manuva replaced four tools and a small mountain of spreadsheets.
              We ship faster and know exactly what&apos;s in stock.&rdquo;
            </p>
            <span className={styles.quoteAttribution}>Operations Lead &middot; Pac Technologies</span>
          </div>
        </div>
      </aside>
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
