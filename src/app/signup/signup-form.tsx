"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useActionState } from "react";
import styles from "./signup.module.css";
import { signUpTenant, type SignUpState } from "./actions";
import { PLANS, TRIAL_DAYS, type PlanTier, type BillingInterval } from "../../lib/plans";

const initialState: SignUpState = { error: "", message: "" };
const PLAN_OPTIONS: PlanTier[] = ["starter", "growth", "pro"];

export interface SignupFormProps {
  token: string;
  prefillEmail: string;
  prefillCompany: string;
  initialPlan: PlanTier;
  initialBilling: BillingInterval;
}

export default function SignupForm({
  token,
  prefillEmail,
  prefillCompany,
  initialPlan,
  initialBilling,
}: SignupFormProps) {
  const [state, action] = useActionState(signUpTenant, initialState);
  const [plan, setPlan] = useState<PlanTier>(initialPlan);
  const [billing, setBilling] = useState<BillingInterval>(initialBilling);

  const limits = PLANS[plan].limits;
  const locationsCopy =
    limits.locations === Infinity
      ? "Unlimited locations"
      : `${limits.locations} location${limits.locations === 1 ? "" : "s"}`;
  const usersCopy =
    limits.users === Infinity
      ? "Unlimited team members"
      : `${limits.users} team member${limits.users === 1 ? "" : "s"}`;

  return (
    <div className={styles.page}>
      <div className={styles.left}>
        <div className={styles.leftInner}>
          <div className={styles.heading}>
            <h1>Start your {TRIAL_DAYS}-day free trial</h1>
            <p>Full Pro-level access. No credit card required.</p>
          </div>

          <form className={styles.form} action={action}>
            <input type="hidden" name="plan" value={plan} />
            <input type="hidden" name="billing" value={billing} />
            <input type="hidden" name="token" value={token} />

            <label>
              Company name
              <input
                name="company_name"
                type="text"
                placeholder="Acme Manufacturing"
                autoComplete="organization"
                defaultValue={prefillCompany}
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
                defaultValue={prefillEmail}
                required
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                placeholder="At least 8 characters"
                autoComplete="new-password"
                required
                minLength={8}
              />
            </label>

            <fieldset className={styles.planSelector}>
              <legend>Plan after trial</legend>
              <div className={styles.planChips}>
                {PLAN_OPTIONS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={`${styles.planChip} ${plan === p ? styles.planChipActive : ""}`}
                    onClick={() => setPlan(p)}
                    aria-pressed={plan === p}
                  >
                    {PLANS[p].name}
                  </button>
                ))}
              </div>
              <div className={styles.billingToggle}>
                <label className={styles.billingOption}>
                  <input
                    type="radio"
                    name="billingRadio"
                    checked={billing === "annual"}
                    onChange={() => setBilling("annual")}
                  />
                  Annual (save ~20%)
                </label>
                <label className={styles.billingOption}>
                  <input
                    type="radio"
                    name="billingRadio"
                    checked={billing === "monthly"}
                    onChange={() => setBilling("monthly")}
                  />
                  Monthly
                </label>
              </div>
            </fieldset>

            <div className={styles.limitsPreview}>
              <strong>{PLANS[plan].name} — after your trial</strong>
              <p>
                {locationsCopy} · {usersCopy}
              </p>
            </div>

            {state.error ? <p className={styles.error}>{state.error}</p> : null}
            {state.message ? <p className={styles.message}>{state.message}</p> : null}

            <button className={styles.primary} type="submit">
              Start free trial
            </button>

            <p className={styles.signinLink}>
              Already have an account? <Link href="/login">Sign in</Link>
            </p>
          </form>
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
            {TRIAL_DAYS} days, full Pro access, no credit card.
          </p>
        </div>
      </aside>
    </div>
  );
}
