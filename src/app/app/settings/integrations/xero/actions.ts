// src/app/app/settings/integrations/xero/actions.ts
"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/tenant/authz";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { loadTokenKey } from "@/lib/security/token-crypto";
import { getXeroConfig, isXeroPilotTenant } from "@/lib/accounting/xero/config";
import { deleteConnection, revokeRefreshToken } from "@/lib/accounting/xero/identity";
import { readRefreshToken, xeroAccessFor } from "@/lib/accounting/xero/access";
import { disconnectXero, finishConnection, openPending, PENDING_COOKIE, supabaseConnectionRepo } from "@/lib/accounting/connection";
import { scrubSecrets } from "@/lib/accounting/xero/scrub";
import { logActivity } from "@/lib/activity/log";
import { assertNoError } from "@/lib/supabase/assert-no-error";
import { fetchAccounts, fetchTaxRates } from "@/lib/accounting/xero/org";
import { validateSetup, type SetupInput } from "@/lib/accounting/xero/setup";
import { XeroAuthError } from "@/lib/accounting/xero/tokens";

export async function chooseXeroOrganisation(formData: FormData): Promise<void> {
  const ctx = await requireAdmin();
  if (!isXeroPilotTenant(ctx.tenantId)) redirect("/app/settings/integrations?xero=error&reason=not-available");
  const jar = await cookies();
  let key;
  try {
    key = loadTokenKey();
  } catch (err) {
    console.error("[xero] token key unavailable", scrubSecrets(err instanceof Error ? err.message : String(err)));
    redirect("/app/settings/integrations?xero=error&reason=not-configured");
  }
  const pending = openPending(jar.get(PENDING_COOKIE)?.value ?? "", key);
  jar.set(PENDING_COOKIE, "", { path: "/app/settings/integrations/xero", maxAge: 0 });
  if (!pending || pending.tenantId !== ctx.tenantId || pending.userId !== ctx.userId) {
    redirect("/app/settings/integrations?xero=error&reason=expired");
  }
  const org = pending.orgs.find((o) => o.connectionId === String(formData.get("connectionId") ?? ""));
  if (!org) redirect("/app/settings/integrations?xero=error&reason=bad-organisation");

  let result;
  try {
    result = await finishConnection(supabaseConnectionRepo(createSupabaseAdminClient()), {
      tenantId: pending.tenantId, userId: pending.userId, org, tokens: pending.tokens, key,
    });
  } catch (err) {
    console.error("[xero] save connection failed", scrubSecrets(err instanceof Error ? err.message : String(err)));
    redirect("/app/settings/integrations?xero=error&reason=save-failed");
  }
  if (!result.ok) redirect(`/app/settings/integrations?xero=error&reason=${result.reason}`);
  await logActivity({ event: "accounting.connected", entityId: result.connectionId, metadata: { org_name: result.orgName, org_changed: result.orgChanged } });
  redirect("/app/settings/integrations/xero/setup");
}

export async function disconnectXeroAction(): Promise<void> {
  const ctx = await requireAdmin();
  if (!ctx.tenantId) redirect("/app/settings/integrations");
  const cfg = getXeroConfig();
  const db = createSupabaseAdminClient();
  const repo = supabaseConnectionRepo(db);
  const conn = await repo.findByTenant(ctx.tenantId);
  if (!conn) redirect("/app/settings/integrations");
  // A "disconnected" row is retried too: disconnectXero then only finishes the local cleanup.

  let result;
  try {
    result = await disconnectXero(repo, {
      connection: conn,
      getAccessToken: async () => (await xeroAccessFor(db, conn)).accessToken,
      readRefreshToken: () => readRefreshToken(db, conn.id),
      revoke: (rt) => (cfg.ok ? revokeRefreshToken(cfg, rt) : Promise.resolve(false)),
      deleteXeroConnection: (at, id) => deleteConnection(at, id),
    });
  } catch (err) {
    console.error("[xero] disconnect failed", scrubSecrets(err instanceof Error ? err.message : String(err)));
    redirect("/app/settings/integrations?xero=error&reason=disconnect-failed");
  }
  await logActivity({ event: "accounting.disconnected", entityId: conn.id, metadata: { revoked_at_xero: result.revokedAtXero } });
  revalidatePath("/app/settings/integrations");
  redirect(`/app/settings/integrations?xero=${result.revokedAtXero ? "disconnected" : "disconnected-local"}`);
}

export type SetupState = { errors?: Partial<Record<keyof SetupInput, string>>; message?: string };

const RECONNECT_MESSAGE = "Xero needs to be reconnected. Reconnect it from Integrations, then finish setup.";

const field = (fd: FormData, k: keyof SetupInput) => String(fd.get(k) ?? "").trim();

export async function saveXeroSetup(_prev: SetupState, formData: FormData): Promise<SetupState> {
  const ctx = await requireAdmin();
  if (!ctx.tenantId) return { message: "Choose a workspace first." };
  if (!isXeroPilotTenant(ctx.tenantId)) return { message: "Xero isn't available for this workspace yet." };
  const db = createSupabaseAdminClient();
  const conn = await supabaseConnectionRepo(db).findByTenant(ctx.tenantId);
  if (!conn || conn.status !== "connected") return { message: "Xero isn't connected. Connect it again from Integrations." };

  const input: SetupInput = {
    inventoryAccountCode: field(formData, "inventoryAccountCode"),
    otherChargesAccountCode: field(formData, "otherChargesAccountCode"),
    purchaseTaxType: field(formData, "purchaseTaxType"),
    gstFreeTaxType: field(formData, "gstFreeTaxType"),
    defaultAmountsMode: field(formData, "defaultAmountsMode"),
    billsStartDate: field(formData, "billsStartDate"),
    salesSource: field(formData, "salesSource"),
  };

  let accounts, rates;
  try {
    const access = await xeroAccessFor(db, conn);
    const [a, t] = await Promise.all([fetchAccounts(access), fetchTaxRates(access)]);
    if (!a.ok || !t.ok) {
      console.error("[xero] setup read failed", scrubSecrets({
        accounts: a.ok ? "ok" : { status: a.status, networkError: a.networkError, body: a.body },
        taxRates: t.ok ? "ok" : { status: t.status, networkError: t.networkError, body: t.body },
      }));
      const status = !a.ok ? a.status : !t.ok ? t.status : 0;
      return { message: status === 401 ? RECONNECT_MESSAGE : "Couldn't read accounts and tax rates from Xero. Try again." };
    }
    accounts = a.data.Accounts ?? [];
    rates = t.data.TaxRates ?? [];
  } catch (err) {
    console.error("[xero] setup read threw", scrubSecrets(err instanceof Error ? err.message : String(err)));
    if (err instanceof XeroAuthError) return { message: RECONNECT_MESSAGE };
    return { message: "Couldn't reach Xero. Try again, or reconnect Xero from Integrations." };
  }

  const v = validateSetup(input, accounts, rates);
  if (!v.ok) return { errors: v.errors };

  const now = new Date().toISOString();
  const { data: saved, error } = await db
    .from("accounting_connection")
    .update({
      inventory_account_code: v.value.inventoryAccountCode,
      other_charges_account_code: v.value.otherChargesAccountCode,
      purchase_tax_type: v.value.purchaseTaxType,
      gst_free_tax_type: v.value.gstFreeTaxType,
      default_amounts_mode: v.value.defaultAmountsMode,
      bills_start_date: v.value.billsStartDate,
      sales_source: v.value.salesSource,
      setup_completed_at: now,
      updated_at: now,
    })
    .eq("id", conn.id)
    .select("id");
  try {
    assertNoError(error, "save Xero setup");
    if (!saved || saved.length === 0) throw new Error("save Xero setup: connection row not found");
  } catch (err) {
    console.error("[xero] setup save failed", scrubSecrets(err instanceof Error ? err.message : String(err)));
    return { message: "Couldn't save your setup. Try again." };
  }
  await logActivity({ event: "accounting.setup_completed", entityId: conn.id, metadata: { sales_source: v.value.salesSource } });
  revalidatePath("/app/settings/integrations");
  redirect("/app/settings/integrations?xero=setup-complete");
}
