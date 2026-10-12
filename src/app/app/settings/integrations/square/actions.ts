"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/tenant/authz";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSquareConfig, isSquarePilotTenant } from "@/lib/square/config";
import { getSquareAccess } from "@/lib/square/tokens";
import { revokeSquareToken } from "@/lib/square/auth";
import { syncSquareTenant } from "@/lib/square/sync";
import { assertNoError } from "@/lib/supabase/assert-no-error";
import { listSquareLocations, type SquareConnection } from "./data";

export type SquareActionState = { message?: string; ok?: boolean };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const field = (fd: FormData, name: string) => String(fd.get(name) ?? "").trim();
type MutationLease = { token: string; release: () => Promise<void> };
class SquareBusyError extends Error {}
const busyMessage = "Square sync is running. Wait for it to finish, then try again.";

async function acquireMutationLease(db: ReturnType<typeof createSupabaseAdminClient>, tenantId: string, channelId: string): Promise<MutationLease> {
  const { data, error } = await db.rpc("claim_square_sync", { p_tenant_id: tenantId, p_sales_channel_id: channelId, p_lease_seconds: 180 });
  assertNoError(error, "claim Square setup lease");
  if (typeof data !== "string") throw new SquareBusyError(busyMessage);
  return { token: data, release: async () => {
    const { error: releaseError } = await db.rpc("release_square_sync", { p_tenant_id: tenantId, p_sales_channel_id: channelId, p_lease_token: data });
    if (releaseError) throw new Error("Couldn't release Square setup lock. Retry after three minutes.");
  } };
}

async function context(allowReconnect = false) {
  const ctx = await requireAdmin();
  if (!ctx.tenantId) throw new Error("Choose a workspace first.");
  if (!isSquarePilotTenant(ctx.tenantId)) throw new Error("Square isn't available for this workspace yet.");
  const db = createSupabaseAdminClient();
  const cfg = getSquareConfig();
  const { data, error } = await db.from("square_connection")
    .select("id,tenant_id,sales_channel_id,merchant_id,environment,status")
    .eq("tenant_id", ctx.tenantId).eq("environment", cfg.ok ? cfg.environment : "production").maybeSingle();
  assertNoError(error, "read Square connection");
  if (!data || (data.status !== "active" && !(allowReconnect && data.status === "needs_reconnect"))) throw new Error("Square isn't connected. Reconnect it from Integrations.");
  return { ctx, db, conn: data as SquareConnection, tenantId: ctx.tenantId };
}

async function pauseStockWrites(db: ReturnType<typeof createSupabaseAdminClient>, tenantId: string, channelId: string) {
  const { data, error } = await db.from("sales_channel").update({ stock_write_enabled: false })
    .eq("tenant_id", tenantId).eq("id", channelId).select("id");
  assertNoError(error, "pause Square stock updates");
  if (!data?.length) throw new Error("Square channel wasn't found.");
}

async function audit(db: ReturnType<typeof createSupabaseAdminClient>, tenantId: string, userId: string, event: string, metadata: Record<string, unknown>) {
  const { error } = await db.from("activity_log").insert({ tenant_id: tenantId, actor_id: userId, actor_type: "user", event, metadata });
  // A telemetry failure must not report a completed business mutation as failed.
  if (error) console.error("[square] audit write failed", { code: error.code });
}

function refresh() {
  revalidatePath("/app/settings/integrations");
  revalidatePath("/app/settings/integrations/square");
  revalidatePath("/app/products");
}

export async function syncSquareAction(): Promise<SquareActionState> {
  try {
    const { db, conn } = await context();
    await syncSquareTenant(db, conn);
    refresh();
    return { ok: true, message: "Square synced. Resolve product mappings before confirming your opening stock count." };
  } catch { return { ok: false, message: "Square sync failed. Try again, or reconnect Square from Integrations." }; }
}

export async function saveSquareLocation(_prev: SquareActionState, fd: FormData): Promise<SquareActionState> {
  const locationId = field(fd, "locationId"), squareLocationId = field(fd, "squareLocationId");
  if (!uuid.test(locationId) || !squareLocationId) return { ok: false, message: "Choose both locations." };
  let lease: MutationLease | null = null;
  try {
    const { db, ctx, conn, tenantId } = await context();
    lease = await acquireMutationLease(db, tenantId, conn.sales_channel_id);
    const { data: location, error } = await db.from("location").select("id").eq("tenant_id", tenantId).eq("id", locationId).maybeSingle();
    assertNoError(error, "read Manuva location");
    if (!location) return { ok: false, message: "Choose a location in this workspace." };
    if (!(await listSquareLocations(db, conn)).some((l) => l.id === squareLocationId)) return { ok: false, message: "Choose an active location from the connected Square account." };
    await pauseStockWrites(db, tenantId, conn.sales_channel_id);
    const { data, error: saveError } = await db.from("square_location_link").upsert({ tenant_id: tenantId, sales_channel_id: conn.sales_channel_id, square_location_id: squareLocationId, location_id: locationId }, { onConflict: "sales_channel_id,square_location_id" }).select("square_location_id");
    assertNoError(saveError, "save Square location");
    if (!data?.length) throw new Error("Location mapping wasn't saved.");
    await audit(db, tenantId, ctx.userId, "square.location_linked", { square_location_id: squareLocationId, location_id: locationId });
    refresh();
    return { ok: true, message: "Location mapped. Square stock updates are off; confirm stock counts before enabling them." };
  } catch (error) { return { ok: false, message: error instanceof SquareBusyError ? busyMessage : "Couldn't save that location. Refresh and try again." }; }
  finally { await lease?.release(); }
}

export async function saveSquareItem(_prev: SquareActionState, fd: FormData): Promise<SquareActionState> {
  const linkId = field(fd, "linkId"), operation = field(fd, "operation"), variantId = field(fd, "variantId");
  if (!uuid.test(linkId) || !["link", "create", "ignore", "unlink"].includes(operation)) return { ok: false, message: "Choose a valid product action." };
  if (operation === "link" && !uuid.test(variantId)) return { ok: false, message: "Choose a retail variant." };
  const reason = field(fd, "reason");
  if (operation === "ignore" && (!reason || reason.length > 240)) return { ok: false, message: "Enter an ignore reason of 1–240 characters." };
  let lease: MutationLease | null = null;
  try {
    const { db, ctx, conn, tenantId } = await context();
    lease = await acquireMutationLease(db, tenantId, conn.sales_channel_id);
    const { data: link, error } = await db.from("channel_item_link").select("id,name,status,tracked_location_ids")
      .eq("tenant_id", tenantId).eq("sales_channel_id", conn.sales_channel_id).eq("id", linkId).maybeSingle();
    assertNoError(error, "read Square product mapping");
    if (!link) return { ok: false, message: "That Square product wasn't found in this workspace." };
    if (["link", "create"].includes(operation) && !link.tracked_location_ids?.length) {
      return { ok: false, message: "Services and items without Square inventory tracking cannot be linked to retail stock." };
    }
    if (operation === "link") {
      const { data: variant, error: variantError } = await db.from("product_variant").select("id,product:product!inner(kind)")
        .eq("tenant_id", tenantId).eq("id", variantId).eq("product.kind", "retail").maybeSingle();
      assertNoError(variantError, "read retail variant");
      if (!variant) return { ok: false, message: "Choose a retail variant in this workspace." };
      const { data: bom, error: bomError } = await db.from("product_bom").select("id,lines:product_bom_component(component_id,quantity,yield_pct)").eq("tenant_id", tenantId).eq("variant_id", variantId).eq("is_active", true).maybeSingle();
      assertNoError(bomError, "read retail BOM");
      if (!bom) return { ok: false, message: "That retail variant needs an active BOM before it can track stock." };
      if (!Array.isArray(bom.lines) || bom.lines.length !== 1 || Number(bom.lines[0].quantity) !== 1 || Number(bom.lines[0].yield_pct) !== 1) {
        return { ok: false, message: "Choose a retail variant with a 1:1 active BOM: one component, quantity 1, and 100% yield." };
      }
    }
    await pauseStockWrites(db, tenantId, conn.sales_channel_id);
    if (operation === "create") {
      const { data, error: createError } = await db.rpc("square_create_retail_link", { p_tenant_id: tenantId, p_link_id: linkId, p_lease_token: lease.token });
      assertNoError(createError, "create retail item from Square");
      if (!data) throw new Error("Retail item wasn't created.");
    } else {
      // Conversion ratios come from catalogue classification. Ordinary stockable
      // variations keep NULL; manually mapping a product must not invent an alias.
      const values = operation === "link" ? { variant_id: variantId, status: "linked", match_method: "manual", ignored_reason: null }
        : { variant_id: null, status: operation === "ignore" ? "ignored" : "unmatched", match_method: "manual", ignored_reason: operation === "ignore" ? reason : null };
      const { data, error: saveError } = await db.from("channel_item_link").update(values).eq("tenant_id", tenantId)
        .eq("sales_channel_id", conn.sales_channel_id).eq("id", linkId).select("id");
      assertNoError(saveError, "save Square product mapping");
      if (!data?.length) throw new Error("Product mapping wasn't saved.");
    }
    await audit(db, tenantId, ctx.userId, "square.item_mapping_changed", { link_id: linkId, operation });
    refresh();
    return { ok: true, message: "Product mapping saved. Sync Square to retry waiting orders. Stock updates to Square remain off until confirmed." };
  } catch (error) { return { ok: false, message: error instanceof SquareBusyError ? busyMessage : "Couldn't save that product mapping. Check that a default Manuva location is set, then try again." }; }
  finally { await lease?.release(); }
}

export async function setSquareStockWrites(_prev: SquareActionState, fd: FormData): Promise<SquareActionState> {
  const enabled = field(fd, "enabled") === "true";
  const confirmed = field(fd, "baselineConfirmed") === "on";
  if (enabled && !confirmed) return { ok: false, message: "Confirm the opening stock count before enabling Square stock updates." };
  let lease: MutationLease | null = null;
  try {
    const { db, ctx, conn, tenantId } = await context();
    lease = await acquireMutationLease(db, tenantId, conn.sales_channel_id);
    const { error } = await db.rpc("square_set_stock_writes", {
      p_tenant_id: tenantId, p_channel_id: conn.sales_channel_id, p_enabled: enabled, p_baseline_confirmed: confirmed, p_lease_token: lease.token,
    });
    assertNoError(error, "change Square stock updates");
    await audit(db, tenantId, ctx.userId, "square.stock_writes_changed", { enabled });
    refresh();
    return { ok: true, message: enabled ? "Square stock updates enabled. Manuva is the stock source of truth." : "Square stock updates disabled." };
  } catch (error) { return { ok: false, message: error instanceof SquareBusyError ? busyMessage : "Couldn't change Square stock updates. Map locations and resolve every product first, then try again." }; }
  finally { await lease?.release(); }
}

export async function disconnectSquareAction(): Promise<SquareActionState> {
  let lease: MutationLease | null = null;
  try {
    const { db, ctx, conn, tenantId } = await context(true);
    lease = await acquireMutationLease(db, tenantId, conn.sales_channel_id);
    await pauseStockWrites(db, tenantId, conn.sales_channel_id);
    const cfg = getSquareConfig();
    let revoked = false;
    if (cfg.ok) {
      try { revoked = await revokeSquareToken(cfg, (await getSquareAccess(db, conn)).accessToken); } catch { /* Local cleanup still removes credentials. */ }
    }
    const { error } = await db.rpc("square_disconnect", { p_tenant_id: tenantId, p_connection_id: conn.id, p_lease_token: lease.token });
    assertNoError(error, "disconnect Square");
    await audit(db, tenantId, ctx.userId, "square.disconnected", { revoked_at_square: revoked });
    refresh();
    return { ok: true, message: revoked ? "Square disconnected. Manuva stock records are retained." : "Square disconnected locally. The account owner must also remove Manuva access in Square." };
  } catch (error) { return { ok: false, message: error instanceof SquareBusyError ? busyMessage : "Couldn't disconnect Square. Stock updates may be paused; refresh and try again." }; }
  finally { await lease?.release(); }
}
