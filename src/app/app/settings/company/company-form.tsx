"use client";

import { useActionState } from "react";
import { updateCompany, uploadLogo } from "./actions";
import styles from "./company.module.css";

type State = { error?: string; success?: string } | null;

const TIMEZONES = [
  "Pacific/Auckland",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Brisbane",
  "Australia/Perth",
  "Asia/Singapore",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "UTC",
];

const CURRENCIES = [
  { code: "NZD", label: "NZD — New Zealand Dollar" },
  { code: "AUD", label: "AUD — Australian Dollar" },
  { code: "USD", label: "USD — US Dollar" },
  { code: "GBP", label: "GBP — British Pound" },
  { code: "EUR", label: "EUR — Euro" },
  { code: "SGD", label: "SGD — Singapore Dollar" },
];

type Props = {
  name: string;
  timezone: string;
  currency: string;
  logoUrl: string | null;
  createdAt: string;
};

export default function CompanyForm({
  name,
  timezone,
  currency,
  logoUrl,
  createdAt,
}: Props) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    updateCompany,
    null
  );
  const [logoState, logoAction, logoPending] = useActionState<State, FormData>(
    uploadLogo,
    null
  );

  return (
    <div className={styles.sections}>
      <section className={styles.section}>
        <h2 className={styles.heading}>Company details</h2>
        <form action={formAction} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="name">
              Company name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              className={styles.input}
              defaultValue={name}
              required
            />
          </div>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="timezone">
                Timezone
              </label>
              <select
                id="timezone"
                name="timezone"
                className={styles.select}
                defaultValue={timezone}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="currency">
                Currency
              </label>
              <select
                id="currency"
                name="currency"
                className={styles.select}
                defaultValue={currency}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
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
        <h2 className={styles.heading}>Logo</h2>
        <p className={styles.description}>
          PNG, JPEG, WebP, or SVG. Max 2 MB. Used in exported reports.
        </p>
        {logoUrl && (
          <img
            src={logoUrl}
            alt="Company logo"
            className={styles.logoPreview}
          />
        )}
        <form action={logoAction} className={styles.form}>
          <input
            name="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className={styles.fileInput}
            required
          />
          <div className={styles.actions}>
            <button
              type="submit"
              className={styles.secondaryButton}
              disabled={logoPending}
            >
              {logoPending ? "Uploading…" : "Upload logo"}
            </button>
            {logoState?.success && (
              <span className={styles.feedback}>{logoState.success}</span>
            )}
            {logoState?.error && (
              <span className={styles.errorMsg}>{logoState.error}</span>
            )}
          </div>
        </form>
      </section>

      <hr className={styles.divider} />

      <section className={styles.section}>
        <h2 className={styles.heading}>Workspace info</h2>
        <div className={styles.infoGrid}>
          <div className={styles.infoField}>
            <span className={styles.label}>Plan</span>
            <span className={styles.readOnly}>Manuva Pro</span>
          </div>
          <div className={styles.infoField}>
            <span className={styles.label}>Member since</span>
            <span className={styles.readOnly}>
              {new Date(createdAt).toLocaleDateString("en-AU", {
                month: "long",
                year: "numeric",
              })}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
