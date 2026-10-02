// src/app/app/settings/integrations/xero/setup/page.tsx
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import { isAdminRole } from "@/lib/tenant/authz";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { supabaseConnectionRepo } from "@/lib/accounting/connection";
import { isXeroPilotTenant } from "@/lib/accounting/xero/config";
import { xeroAccessFor } from "@/lib/accounting/xero/access";
import { XeroAuthError } from "@/lib/accounting/xero/tokens";
import { scrubSecrets } from "@/lib/accounting/xero/scrub";
import {
  accountOptions, fetchAccounts, fetchOrganisation, fetchTaxRates,
  INVENTORY_ACCOUNT_TYPES, OTHER_CHARGE_ACCOUNT_TYPES, purchaseTaxOptions,
} from "@/lib/accounting/xero/org";
import { SALES_SOURCES, SALES_SOURCE_GUIDANCE, SALES_SOURCE_LABELS } from "@/lib/accounting/xero/setup";
import PageHeader from "../../../../_ui/page-header";
import EmptyState from "../../../../_ui/empty-state";
import SetupForm from "./setup-form";
import styles from "../xero.module.css";

export default async function XeroSetupPage() {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/login");
  if (!isAdminRole(ctx.role) || !ctx.tenantId) redirect("/app/settings/profile");
  if (!isXeroPilotTenant(ctx.tenantId)) redirect("/app/settings/integrations");
  const db = createSupabaseAdminClient();
  const conn = await supabaseConnectionRepo(db).findByTenant(ctx.tenantId);
  if (!conn || conn.status !== "connected") redirect("/app/settings/integrations");

  let data: null | {
    inventory: { value: string; label: string }[];
    other: { value: string; label: string }[];
    tax: { value: string; label: string }[];
    orgName: string;
    baseCurrency: string;
  } = null;
  let needsReconnect = false;
  try {
    const access = await xeroAccessFor(db, conn);
    const [a, t, o] = await Promise.all([fetchAccounts(access), fetchTaxRates(access), fetchOrganisation(access)]);
    if (a.ok && t.ok && o.ok) {
      const accounts = a.data.Accounts ?? [];
      const org = o.data.Organisations?.[0];
      if (org) {
        data = {
          inventory: accountOptions(accounts, INVENTORY_ACCOUNT_TYPES).map((x) => ({ value: x.code, label: `${x.code} · ${x.name}` })),
          other: accountOptions(accounts, OTHER_CHARGE_ACCOUNT_TYPES).map((x) => ({ value: x.code, label: `${x.code} · ${x.name}` })),
          tax: purchaseTaxOptions(t.data.TaxRates ?? []).map((x) => ({ value: x.taxType, label: `${x.name} (${x.rate}%)` })),
          orgName: org.Name,
          baseCurrency: org.BaseCurrency,
        };
      } else {
        console.error("[xero] setup load: organisation missing from response");
      }
    } else {
      const fail = (r: { ok: boolean; status?: number; networkError?: string; body?: unknown }) =>
        r.ok ? "ok" : { status: r.status, networkError: r.networkError, body: r.body };
      console.error("[xero] setup load failed", scrubSecrets({ accounts: fail(a), taxRates: fail(t), organisation: fail(o) }));
      needsReconnect = [a, t, o].some((r) => !r.ok && r.status === 401);
    }
  } catch (err) {
    console.error("[xero] setup load failed", scrubSecrets(err instanceof Error ? err.message : String(err)));
    needsReconnect = err instanceof XeroAuthError;
  }

  return (
    <section className={styles.page}>
      <PageHeader
        eyebrow="Admin"
        breadcrumbs={[{ label: "Integrations", href: "/app/settings/integrations" }, { label: "Xero setup" }]}
        title="Xero setup"
        description="Tell Manuva where bills go in Xero. Nothing is sent until this is finished."
      />
      {data ? (
        <SetupForm
          orgName={data.orgName}
          baseCurrency={data.baseCurrency}
          inventoryOptions={data.inventory}
          otherOptions={data.other}
          taxOptions={data.tax}
          salesSources={SALES_SOURCES.map((s) => ({ value: s, label: SALES_SOURCE_LABELS[s], guidance: SALES_SOURCE_GUIDANCE[s] }))}
          initial={{
            inventoryAccountCode: conn.inventory_account_code ?? "",
            otherChargesAccountCode: conn.other_charges_account_code ?? "",
            purchaseTaxType: conn.purchase_tax_type ?? "",
            gstFreeTaxType: conn.gst_free_tax_type ?? "",
            defaultAmountsMode: conn.default_amounts_mode,
            billsStartDate: conn.bills_start_date ?? new Date().toISOString().slice(0, 10),
            salesSource: conn.sales_source ?? "",
          }}
        />
      ) : needsReconnect ? (
        <EmptyState title="Xero needs to be reconnected" message="Xero no longer accepts this connection. Reconnect it from the Integrations page, then finish setup." />
      ) : (
        <EmptyState title="Couldn't read your Xero organisation" message="Check the connection on the Integrations page, then try again." />
      )}
    </section>
  );
}
