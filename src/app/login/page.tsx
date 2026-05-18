"use client";

import Image from "next/image";
import Link from "next/link";
import { Suspense } from "react";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import styles from "./login.module.css";
import { signIn } from "./actions";

const initialState = { error: "", message: "" };

function LoginPageContent() {
  const searchParams = useSearchParams();
  const [signInState, signInAction, isPending] = useActionState(signIn, initialState);
  const redirectTo = searchParams.get("redirect") ?? "/app";

  return (
    <div className={styles.page}>
      <div className={styles.left}>
        <div className={styles.leftInner}>
          <div className={styles.heading}>
            <h1>Welcome back</h1>
            <p>Sign in with your workspace email and password.</p>
          </div>

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
            <button className={styles.primary} type="submit" disabled={isPending} aria-busy={isPending}>
              {isPending ? (
                <span className={styles.buttonInner}>
                  <span className={styles.spinner} aria-hidden="true" />
                  Signing in…
                </span>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          <div className={styles.applyDivider}>New to Manuva</div>

          <Link href="/apply" className={styles.applyCta}>
            Apply for early access
            <span className={styles.applyArrow} aria-hidden="true">→</span>
          </Link>

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
