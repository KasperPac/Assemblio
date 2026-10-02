// src/app/app/settings/integrations/xero/setup/setup-form.tsx
"use client";

import { useActionState, useState, type ChangeEvent } from "react";
import { saveXeroSetup, type SetupState } from "../actions";
import styles from "../xero.module.css";

type Option = { value: string; label: string };
type Props = {
  orgName: string;
  baseCurrency: string;
  inventoryOptions: Option[];
  otherOptions: Option[];
  taxOptions: Option[];
  salesSources: Array<Option & { guidance: string }>;
  initial: Record<string, string>;
};

const STEP_FIELDS: Record<number, string[]> = {
  1: ["inventoryAccountCode", "otherChargesAccountCode", "billsStartDate"],
  2: ["purchaseTaxType", "gstFreeTaxType", "defaultAmountsMode"],
  3: ["salesSource"],
};
const STEP_NAMES = ["Accounts", "Tax", "Sales"];

export default function SetupForm(props: Props) {
  const [state, action, pending] = useActionState<SetupState, FormData>(saveXeroSetup, {});
  const [step, setStep] = useState(1);
  const [values, setValues] = useState<Record<string, string>>(props.initial);
  const set = (k: string) => (e: ChangeEvent<HTMLSelectElement | HTMLInputElement>) => setValues((v) => ({ ...v, [k]: e.target.value }));

  // A saved choice that is no longer in the live Xero list counts as unchosen.
  const allowed: Record<string, string[]> = {
    inventoryAccountCode: props.inventoryOptions.map((o) => o.value),
    otherChargesAccountCode: props.otherOptions.map((o) => o.value),
    purchaseTaxType: props.taxOptions.map((o) => o.value),
    gstFreeTaxType: props.taxOptions.map((o) => o.value),
    defaultAmountsMode: ["exclusive", "inclusive"],
    salesSource: props.salesSources.map((s) => s.value),
  };
  const fieldOk = (k: string) => (allowed[k] ? allowed[k].includes(values[k] ?? "") : !!values[k]);
  const stepDone = STEP_FIELDS[step].every(fieldOk);
  const guidance = props.salesSources.find((s) => s.value === values.salesSource)?.guidance;
  const errors = state.errors ?? {};
  const errorFor = (name: string) => errors[name as keyof typeof errors];

  const select = (name: string, label: string, options: Option[], help: string) => (
    <>
      <label className={styles.label} htmlFor={name}>{label}</label>
      <select id={name} name={name} className={styles.select} value={fieldOk(name) ? values[name] : ""} onChange={set(name)}>
        <option value="">Choose…</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <p className={styles.help}>{help}</p>
      {options.length === 0 ? <p className={styles.error}>Xero has no matching options. Add one in Xero, then reload this page.</p> : null}
      {errorFor(name) ? <p className={styles.error}>{errorFor(name)}</p> : null}
    </>
  );

  return (
    <form action={action} className={styles.formCard}>
      <div className={styles.steps}>
        {STEP_NAMES.map((n, i) => (
          <span key={n} className={i + 1 === step ? styles.stepActive : undefined}>{i + 1}. {n}</span>
        ))}
      </div>
      <p className={styles.help}>Connected to <strong>{props.orgName}</strong>. Bills post in {props.baseCurrency}.</p>
      {state.errors ? <p className={styles.error}>Some choices need fixing: {Object.values(state.errors).join(" ")}</p> : null}

      <fieldset className={styles.fieldset} hidden={step !== 1}>
        {select("inventoryAccountCode", "Inventory asset account", props.inventoryOptions, "A current-asset account. Stock lines on bills are coded here.")}
        {select("otherChargesAccountCode", "Freight and other charges", props.otherOptions, "Used for freight, surcharges and other non-stock lines.")}
        <label className={styles.label} htmlFor="billsStartDate">Send bills dated from</label>
        <input id="billsStartDate" name="billsStartDate" type="date" className={styles.input} value={values.billsStartDate ?? ""} onChange={set("billsStartDate")} />
        <p className={styles.help}>Invoices dated before this are recorded in Manuva but never sent to Xero.</p>
        {errorFor("billsStartDate") ? <p className={styles.error}>{errorFor("billsStartDate")}</p> : null}
      </fieldset>

      <fieldset className={styles.fieldset} hidden={step !== 2}>
        {select("purchaseTaxType", "Default purchase tax rate", props.taxOptions, "From your Xero organisation. Manuva never creates tax rates.")}
        {select("gstFreeTaxType", "GST-free purchase tax rate", props.taxOptions, "Used for GST-free lines.")}
        <span className={styles.label}>Supplier invoices are usually entered</span>
        <label className={styles.radioRow}>
          <input type="radio" name="defaultAmountsMode" value="exclusive" checked={values.defaultAmountsMode === "exclusive"} onChange={set("defaultAmountsMode")} />
          <span>Excluding GST</span>
        </label>
        <label className={styles.radioRow}>
          <input type="radio" name="defaultAmountsMode" value="inclusive" checked={values.defaultAmountsMode === "inclusive"} onChange={set("defaultAmountsMode")} />
          <span>Including GST</span>
        </label>
        {errorFor("defaultAmountsMode") ? <p className={styles.error}>{errorFor("defaultAmountsMode")}</p> : null}
      </fieldset>

      <fieldset className={styles.fieldset} hidden={step !== 3}>
        <span className={styles.label}>What sends your sales to Xero?</span>
        {props.salesSources.map((s) => (
          <label key={s.value} className={styles.radioRow}>
            <input type="radio" name="salesSource" value={s.value} checked={values.salesSource === s.value} onChange={set("salesSource")} />
            <span>{s.label}</span>
          </label>
        ))}
        {guidance ? <p className={styles.help}>{guidance}</p> : null}
        {errorFor("salesSource") ? <p className={styles.error}>{errorFor("salesSource")}</p> : null}
      </fieldset>

      {state.message ? <p className={styles.error}>{state.message}</p> : null}
      <div className={styles.actions}>
        {step > 1 ? <button type="button" className={styles.secondaryBtn} onClick={() => setStep(step - 1)}>Back</button> : null}
        {step < 3 ? (
          <button type="button" className={styles.primaryBtn} disabled={!stepDone} onClick={() => setStep(step + 1)}>Next</button>
        ) : (
          <button type="submit" className={styles.primaryBtn} disabled={!stepDone || pending}>{pending ? "Saving…" : "Finish setup"}</button>
        )}
      </div>
    </form>
  );
}
