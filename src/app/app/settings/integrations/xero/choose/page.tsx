// src/app/app/settings/integrations/xero/choose/page.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import { isAdminRole } from "@/lib/tenant/authz";
import { loadTokenKey } from "@/lib/security/token-crypto";
import { openPending, PENDING_COOKIE } from "@/lib/accounting/connection";
import PageHeader from "../../../../_ui/page-header";
import { chooseXeroOrganisation } from "../actions";
import styles from "../xero.module.css";

export default async function ChooseXeroOrganisationPage() {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/login");
  if (!isAdminRole(ctx.role)) redirect("/app/settings/profile");
  const pending = openPending((await cookies()).get(PENDING_COOKIE)?.value ?? "", loadTokenKey());
  if (!pending || pending.tenantId !== ctx.tenantId) redirect("/app/settings/integrations?xero=error&reason=expired");

  return (
    <section className={styles.page}>
      <PageHeader
        eyebrow="Admin"
        breadcrumbs={[{ label: "Integrations", href: "/app/settings/integrations" }, { label: "Choose Xero organisation" }]}
        title="Choose Xero organisation"
        description="You approved more than one organisation. Pick the one this workspace posts bills to."
      />
      <form action={chooseXeroOrganisation} className={styles.formCard}>
        <fieldset className={styles.fieldset}>
          <legend className={styles.label}>Organisation</legend>
          {pending.orgs.map((o, i) => (
            <label key={o.connectionId} className={styles.radioRow}>
              <input type="radio" name="connectionId" value={o.connectionId} defaultChecked={i === 0} required />
              <span>{o.name}</span>
            </label>
          ))}
        </fieldset>
        <div className={styles.actions}>
          <button type="submit" className={styles.primaryBtn}>Connect this organisation</button>
        </div>
      </form>
    </section>
  );
}
