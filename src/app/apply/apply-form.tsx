"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import styles from "./apply.module.css";
import { submitBetaApplication, type ApplyState } from "./actions";

const initialState: ApplyState = { error: "", message: "" };

export default function ApplyForm() {
  const search = useSearchParams();
  const [state, action, pending] = useActionState(
    submitBetaApplication,
    initialState
  );

  const sourcePlan = search.get("plan") ?? "";
  const sourceBilling = search.get("billing") ?? "";

  const submitted = Boolean(state.message);

  return (
    <div className={styles.page}>
      <div className={styles.left}>
        <div className={styles.leftInner}>
          {submitted ? (
            <div className={styles.success}>
              <h1 className={styles.successHeading}>You&apos;re on the list.</h1>
              <p className={styles.successBody}>{state.message}</p>
              <p className={styles.signinLink}>
                Already approved? <Link href="/login">Sign in</Link>
              </p>
            </div>
          ) : (
            <>
              <div className={styles.heading}>
                <span className={styles.eyebrow}>Private beta</span>
                <h1>Apply for early access</h1>
                <p>
                  Manuva is in private beta. Tell us about your team and we&apos;ll
                  reach out when there&apos;s a spot.
                </p>
              </div>

              <form className={styles.form} action={action}>
                <input type="hidden" name="source_plan" value={sourcePlan} />
                <input
                  type="hidden"
                  name="source_billing"
                  value={sourceBilling}
                />

                <label>
                  Your name
                  <input
                    name="full_name"
                    type="text"
                    placeholder="Jane Smith"
                    autoComplete="name"
                    required
                  />
                </label>

                <label>
                  Work email
                  <input
                    name="email"
                    type="email"
                    placeholder="you@company.com"
                    autoComplete="email"
                    required
                  />
                </label>

                <label>
                  Company name
                  <input
                    name="company_name"
                    type="text"
                    placeholder="Acme Manufacturing"
                    autoComplete="organization"
                    required
                  />
                </label>

                <label>
                  Team size
                  <select name="team_size" defaultValue="">
                    <option value="" disabled>
                      Select team size
                    </option>
                    <option value="just-me">Just me</option>
                    <option value="2-10">2–10</option>
                    <option value="11-50">11–50</option>
                    <option value="51-200">51–200</option>
                    <option value="200+">200+</option>
                  </select>
                </label>

                <label>
                  What are you hoping to use Manuva for?
                  <textarea
                    name="use_case"
                    placeholder="e.g. We're a Shopify-based manufacturer of cosmetics, currently running on spreadsheets…"
                    rows={4}
                  />
                  <span className={styles.hint}>Optional, but helps us prioritise.</span>
                </label>

                {state.error ? (
                  <p className={styles.error}>{state.error}</p>
                ) : null}

                <button
                  className={styles.primary}
                  type="submit"
                  disabled={pending}
                >
                  {pending ? "Submitting…" : "Apply for access"}
                </button>

                <p className={styles.signinLink}>
                  Already have an account? <Link href="/login">Sign in</Link>
                </p>
              </form>
            </>
          )}
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
          <span className={styles.betaBadge}>Private beta</span>
          <h2 className={styles.tagline}>
            Manufacturing operations,
            <br />
            <span className={styles.taglineAccent}>finally simple.</span>
          </h2>
          <p className={styles.lede}>
            Inventory, BOMs, orders, and production — one workspace, no
            spreadsheets. Onboarding new teams as fast as we can.
          </p>
        </div>
      </aside>
    </div>
  );
}
