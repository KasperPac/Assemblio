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
