import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { createSupabaseAdminClient } from "../../lib/supabase/admin";
import type { PlanTier, BillingInterval } from "../../lib/plans";
import styles from "./signup.module.css";
import SignupForm from "./signup-form";

export const metadata: Metadata = {
  title: "Sign up — Manuva",
  description: "Activate your Manuva beta access.",
};

const PLAN_OPTIONS: PlanTier[] = ["starter", "growth", "pro"];

function parsePlanParam(raw: string | undefined): PlanTier {
  if (raw && (PLAN_OPTIONS as string[]).includes(raw)) return raw as PlanTier;
  return "growth";
}

function parseBillingParam(raw: string | undefined): BillingInterval {
  return raw === "monthly" ? "monthly" : "annual";
}

interface BetaApplicationRow {
  email: string;
  company_name: string;
  source_plan: string | null;
  source_billing: string | null;
}

async function lookupApprovedApplication(
  token: string
): Promise<BetaApplicationRow | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("beta_applications")
    .select("email, company_name, source_plan, source_billing")
    .eq("signup_token", token)
    .eq("status", "approved")
    .maybeSingle();
  if (error) return null;
  return data as BetaApplicationRow | null;
}

interface SignupPageProps {
  searchParams: Promise<{
    token?: string;
    plan?: string;
    billing?: string;
  }>;
}

export default async function SignupPage({ searchParams }: SignupPageProps) {
  const params = await searchParams;
  const token = params.token?.trim();

  if (!token) {
    return <InviteOnlyView />;
  }

  const app = await lookupApprovedApplication(token);
  if (!app) {
    return <InviteOnlyView invalidToken />;
  }

  const plan = parsePlanParam(app.source_plan ?? params.plan);
  const billing = parseBillingParam(app.source_billing ?? params.billing);

  return (
    <SignupForm
      token={token}
      prefillEmail={app.email}
      prefillCompany={app.company_name}
      initialPlan={plan}
      initialBilling={billing}
    />
  );
}

function InviteOnlyView({ invalidToken = false }: { invalidToken?: boolean }) {
  return (
    <div className={styles.page}>
      <div className={styles.left}>
        <div className={styles.leftInner}>
          <div className={styles.heading}>
            <h1>
              {invalidToken ? "That invite isn't valid" : "Manuva is in private beta"}
            </h1>
            <p>
              {invalidToken
                ? "Your invite link looks like it's expired or already been used. Apply again and we'll sort it out."
                : "We're onboarding new teams a few at a time. Apply for early access and we'll be in touch."}
            </p>
          </div>

          <Link
            className={styles.primary}
            href="/apply"
            style={{ display: "block", textAlign: "center", textDecoration: "none" }}
          >
            Apply for early access
          </Link>

          <p className={styles.signinLink}>
            Already have an account? <Link href="/login">Sign in</Link>
          </p>
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
            Inventory, BOMs, orders, and production — one workspace, no
            spreadsheets.
          </p>
        </div>
      </aside>
    </div>
  );
}

