import type { SupabaseClient } from "@supabase/supabase-js";
import { assertNoError } from "@/lib/supabase/assert-no-error";
import { squareFetch, type SquareAccess } from "./client";
import { getSquareAccess } from "./tokens";
import type { SquareConnectionRow } from "./connection";
import { matchSquareVariation, stockConversionRatio, trackedSquareLocations, type CatalogObject, type Mapping, type RetailCandidate } from "./match";
import { ingestSquareOrder, type SquareOrder } from "./orders";
import { pushSquareStock } from "./stock";

export type SquareSyncConnection = Pick<SquareConnectionRow, "id" | "tenant_id" | "sales_channel_id" | "merchant_id" | "environment" | "status">;
export type ItemLink = Mapping & { id: string; external_variation_id: string; tracked_location_ids: string[]; stock_conversion_ratio: number | null; ignored_reason: string | null; origin: "catalog" | "order" };
export type SquareSyncAccess = SquareAccess & { deadline?: number; leaseToken?: string };
export function assertSquareSyncBudget(access: SquareSyncAccess) {
  if (access.deadline && Date.now() >= access.deadline) throw new Error("Square sync time budget exceeded; retry safely");
}

export async function requestSquare<T>(access: SquareSyncAccess, path: string, body?: unknown): Promise<T> {
  assertSquareSyncBudget(access);
  const result = await squareFetch<T>(access, path, body === undefined ? {} : { method: "POST", body });
  if (!result.ok) throw new Error(`Square request failed (${result.errorClass}:${result.code})`);
  return result.data;
}

/** Never report an incomplete page walk as a complete reconciliation. */
export async function squarePages<T>(page: (cursor?: string) => Promise<{ cursor?: string; rows: T[] }>, maxPages = 100): Promise<T[]> {
  const rows: T[] = [], seen = new Set<string>();
  let cursor: string | undefined;
  for (let index = 0; index < maxPages; index++) {
    const result = await page(cursor);
    rows.push(...result.rows);
    if (!result.cursor) return rows;
    if (seen.has(result.cursor)) throw new Error("Square pagination cursor repeated");
    seen.add(result.cursor); cursor = result.cursor;
  }
  throw new Error("Square reconciliation exceeded its page budget; no stock updates were applied");
}

async function retailCandidates(db: SupabaseClient, tenantId: string): Promise<RetailCandidate[]> {
  const products = new Set<string>();
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from("product").select("id").eq("tenant_id", tenantId).eq("kind", "retail").order("id").range(offset, offset + 499);
    assertNoError(error, "Read retail products");
    for (const product of data ?? []) products.add(product.id);
    if ((data?.length ?? 0) < 500) break;
  }
  const candidates: RetailCandidate[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from("product_variant").select("id,product_id,sku,barcode").eq("tenant_id", tenantId).order("id").range(offset, offset + 499);
    assertNoError(error, "Read retail variants");
    for (const variant of data ?? []) if (products.has(variant.product_id)) candidates.push(variant);
    if ((data?.length ?? 0) < 500) break;
  }
  return candidates;
}

export async function loadSquareLinks(db: SupabaseClient, conn: SquareSyncConnection): Promise<ItemLink[]> {
  const links: ItemLink[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from("channel_item_link").select("id,external_variation_id,variant_id,status,match_method,tracked_location_ids,stock_conversion_ratio,ignored_reason,origin")
      .eq("tenant_id", conn.tenant_id).eq("sales_channel_id", conn.sales_channel_id).order("id").range(offset, offset + 499);
    assertNoError(error, "Read Square mappings"); links.push(...(data ?? []) as ItemLink[]);
    if ((data?.length ?? 0) < 500) return links;
  }
}

async function importCatalog(db: SupabaseClient, conn: SquareSyncConnection, access: SquareSyncAccess, activeLocations: string[]) {
  const objects = await squarePages<CatalogObject>(async (cursor) => {
    const params = new URLSearchParams({ types: "ITEM,ITEM_VARIATION", ...(cursor ? { cursor } : {}) });
    const page = await requestSquare<{ objects?: CatalogObject[]; cursor?: string }>(access, `/v2/catalog/list?${params}`);
    return { rows: page.objects ?? [], cursor: page.cursor };
  });
  const catalog = new Map(objects.map((object) => [object.id, object]));
  for (const object of objects) for (const variation of object.item_data?.variations ?? []) catalog.set(variation.id, variation);
  const existing = new Map((await loadSquareLinks(db, conn)).map((link) => [link.external_variation_id, link]));
  const claimedVariants = new Map<string, string>();
  for (const link of existing.values()) if (link.status === "linked" && link.variant_id && link.stock_conversion_ratio === null) claimedVariants.set(link.variant_id, link.external_variation_id);
  const candidates = await retailCandidates(db, conn.tenant_id);
  const rows: Array<Record<string, unknown>> = [];
  for (const variation of catalog.values()) {
    assertSquareSyncBudget(access);
    if (variation.type !== "ITEM_VARIATION") continue;
    const details = variation.item_variation_data;
    const item = details?.item_id ? catalog.get(details.item_id) : undefined;
    const stockable = details?.stockable_conversion ? catalog.get(details.stockable_conversion.stockable_item_variation_id) : variation;
    const ratio = stockConversionRatio(variation);
    // Conversion aliases consume their stockable sibling and are never stock-write targets.
    const locations = trackedSquareLocations(item, stockable ?? variation, activeLocations);
    const old = existing.get(variation.id);
    const ignore = item?.item_data?.product_type === "APPOINTMENTS_SERVICE" ? "Salon service" : item?.item_data?.is_archived ? "Archived item" : !locations.length ? "Inventory tracking is off" : null;
    let mapping: Mapping = ignore ? { variant_id: null, status: "ignored", match_method: null } : matchSquareVariation({ sku: stockable?.item_variation_data?.sku, barcode: stockable?.item_variation_data?.upc }, candidates, old);
    if (mapping.status === "linked" && mapping.variant_id && ratio === null) {
      const claimed = claimedVariants.get(mapping.variant_id);
      if (claimed && claimed !== variation.id) mapping = { variant_id: null, status: "ambiguous", match_method: null };
      else claimedVariants.set(mapping.variant_id, variation.id);
    }
    const row = { tenant_id: conn.tenant_id, sales_channel_id: conn.sales_channel_id, external_variation_id: variation.id,
      name: [item?.item_data?.name, details?.name].filter(Boolean).join(" · ") || "Square item", sku: details?.sku ?? null, barcode: details?.upc ?? null,
      ...mapping, ignored_reason: ignore ?? (mapping.status === "ignored" ? old?.ignored_reason ?? "Ignored by administrator" : null),
      stock_conversion_ratio: ratio, tracked_location_ids: locations, origin: "catalog", updated_at: new Date().toISOString() };
    rows.push(row);
  }
  for (let offset = 0; offset < rows.length; offset += 100) {
    assertSquareSyncBudget(access);
    const { error } = await db.from("channel_item_link").upsert(rows.slice(offset, offset + 100), { onConflict: "sales_channel_id,external_variation_id" });
    assertNoError(error, "Import Square catalog mapping");
  }
  // ListCatalog omits deleted objects. Make disappearing objects visibly ignored after a complete walk.
  for (const old of existing.values()) if (old.origin === "catalog" && !catalog.has(old.external_variation_id)) {
    const { error } = await db.from("channel_item_link").update({ status: "ignored", ignored_reason: "Removed from Square catalog", tracked_location_ids: [], updated_at: new Date().toISOString() })
      .eq("tenant_id", conn.tenant_id).eq("sales_channel_id", conn.sales_channel_id).eq("id", old.id);
    assertNoError(error, "Archive removed Square mapping");
  }
}

export function squareOrderSearchStart(baseline: string | null, lastSynced: string | null, now: number): string {
  if (!baseline) return new Date(now).toISOString();
  const baselineMs = Date.parse(baseline);
  if (!Number.isFinite(baselineMs)) throw new Error("Invalid Square opening baseline");
  const lastMs = lastSynced ? Date.parse(lastSynced) : NaN;
  return new Date(Number.isFinite(lastMs) ? Math.max(baselineMs, lastMs - 4 * 86_400_000) : baselineMs).toISOString();
}

async function importOrders(db: SupabaseClient, conn: SquareSyncConnection, access: SquareSyncAccess, locations: string[], startAt: string, currency: string) {
  let imported = 0;
  for (let offset = 0; offset < locations.length; offset += 10) {
    const batch = locations.slice(offset, offset + 10);
    const orders = await squarePages<SquareOrder>(async (cursor) => {
      const page = await requestSquare<{ orders?: SquareOrder[]; cursor?: string }>(access, "/v2/orders/search", { location_ids: batch, limit: 500,
        query: { filter: { state_filter: { states: ["COMPLETED"] }, date_time_filter: { updated_at: { start_at: startAt } } }, sort: { sort_field: "UPDATED_AT", sort_order: "ASC" } }, ...(cursor ? { cursor } : {}) });
      return { rows: page.orders ?? [], cursor: page.cursor };
    });
    for (let index = 0; index < orders.length; index += 100) {
      assertSquareSyncBudget(access);
      const batchOrders = orders.slice(index, index + 100);
      const { data: existing, error } = await db.from("orders").select("external_order_id").eq("tenant_id", conn.tenant_id).eq("sales_channel_id", conn.sales_channel_id)
        .in("external_order_id", batchOrders.map((order) => order.id)).not("square_consumed_at", "is", null);
      assertNoError(error, "Read previously consumed Square orders");
      const consumed = new Set((existing ?? []).map((order) => order.external_order_id));
      for (const order of batchOrders) {
        if (consumed.has(order.id)) continue;
        assertSquareSyncBudget(access); await ingestSquareOrder(db, conn as SquareConnectionRow, order, access.leaseToken, currency); imported++;
      }
    }
  }
  return imported;
}

async function reconcileCounts(db: SupabaseClient, conn: SquareSyncConnection, access: SquareSyncAccess, locations: string[]) {
  const links = (await loadSquareLinks(db, conn)).filter((link) => link.status === "linked" && link.stock_conversion_ratio === null);
  for (let offset = 0; offset < links.length; offset += 100) {
    const ids = links.slice(offset, offset + 100).map((link) => link.external_variation_id);
    const counts = await squarePages<{ catalog_object_id: string; location_id: string; state: string; quantity: string; calculated_at: string }>(async (cursor) => {
      const page = await requestSquare<{ counts?: Array<{ catalog_object_id: string; location_id: string; state: string; quantity: string; calculated_at: string }>; cursor?: string }>(access, "/v2/inventory/counts/batch-retrieve", { catalog_object_ids: ids, location_ids: locations, states: ["IN_STOCK"], ...(cursor ? { cursor } : {}) });
      return { rows: page.counts ?? [], cursor: page.cursor };
    });
    for (const count of counts) {
      assertSquareSyncBudget(access);
      const link = links.find((candidate) => candidate.external_variation_id === count.catalog_object_id);
      if (count.state !== "IN_STOCK" || !link?.tracked_location_ids.includes(count.location_id)) continue;
      const quantity = Number(count.quantity);
      if (!Number.isFinite(quantity) || quantity < 0 || !Number.isFinite(Date.parse(count.calculated_at))) throw new Error("Square inventory count needs manual review");
      const { data: echo, error: echoError } = await db.from("channel_stock_write").select("id").eq("tenant_id", conn.tenant_id).eq("sales_channel_id", conn.sales_channel_id)
        .eq("external_variation_id", count.catalog_object_id).eq("external_location_id", count.location_id).eq("status", "sent").eq("quantity", quantity).eq("square_calculated_at", count.calculated_at).limit(1);
      assertNoError(echoError, "Identify Square stock echo");
      const { error } = await db.rpc("square_apply_inventory_count", { p_tenant_id: conn.tenant_id, p_sales_channel_id: conn.sales_channel_id,
        p_external_variation_id: count.catalog_object_id, p_square_location_id: count.location_id, p_quantity: quantity, p_calculated_at: count.calculated_at, p_is_echo: !!echo?.length, p_lease_token: access.leaseToken ?? null });
      assertNoError(error, "Reconcile Square physical count");
    }
  }
}

async function runSquareSync(db: SupabaseClient, conn: SquareSyncConnection, leaseToken: string) {
  const access: SquareSyncAccess = { ...(await getSquareAccess(db, conn)), deadline: Date.now() + 35_000, leaseToken };
  const scanStartedAt = new Date().toISOString();
  const { data: tenant, error: tenantError } = await db.from("tenant").select("currency").eq("id", conn.tenant_id).single();
  assertNoError(tenantError, "Read Square workspace currency");
  // The retail pilot prices are two-decimal currencies. Refuse other minor-unit
  // conventions instead of interpreting provider amounts as incorrect prices.
  if (!tenant?.currency || new Intl.NumberFormat("en", { style: "currency", currency: tenant.currency }).resolvedOptions().maximumFractionDigits !== 2) throw new Error("Square retail pilot requires a two-decimal workspace currency");
  const { data: channel, error } = await db.from("sales_channel").select("baseline_confirmed_at,stock_write_enabled").eq("tenant_id", conn.tenant_id).eq("id", conn.sales_channel_id).single();
  assertNoError(error, "Read Square channel");
  const result = await requestSquare<{ locations?: Array<{ id: string; status?: string; currency?: string }> }>(access, "/v2/locations");
  const active = (result.locations ?? []).filter((location) => location.status === "ACTIVE").map((location) => location.id);
  await importCatalog(db, conn, access, active);
  const { data: mapped, error: mappingError } = await db.from("square_location_link").select("square_location_id").eq("tenant_id", conn.tenant_id).eq("sales_channel_id", conn.sales_channel_id);
  assertNoError(mappingError, "Read Square locations");
  const locations = (mapped ?? []).map((location) => location.square_location_id).filter((id) => active.includes(id));
  if (result.locations?.some((location) => locations.includes(location.id) && location.currency !== tenant.currency)) throw new Error("Square location currency does not match the workspace");
  const { data: connectionState, error: stateError } = await db.from("square_connection").select("last_order_sync_at").eq("tenant_id", conn.tenant_id).eq("id", conn.id).single();
  assertNoError(stateError, "Read Square order checkpoint");
  // Search changes, with overlap for delayed/offline POS uploads. Older queued sales
  // are replayed separately after an operator resolves their mappings.
  const startAt = squareOrderSearchStart(channel?.baseline_confirmed_at ?? null, connectionState?.last_order_sync_at ?? null, Date.now());
  const orders = await importOrders(db, conn, access, locations, startAt, tenant.currency);
  const { error: retryError } = await db.rpc("retry_square_pending_orders", { p_tenant_id: conn.tenant_id, p_sales_channel_id: conn.sales_channel_id, p_lease_token: leaseToken, p_limit: 100 });
  assertNoError(retryError, "Replay resolved Square sales");
  const { error: checkpointError } = await db.from("square_connection").update({ last_order_sync_at: scanStartedAt }).eq("tenant_id", conn.tenant_id).eq("id", conn.id);
  assertNoError(checkpointError, "Save Square order checkpoint");
  if (channel?.baseline_confirmed_at && locations.length) {
    await reconcileCounts(db, conn, access, locations);
    await pushSquareStock(db, conn, access);
  }
  const { error: touchedError } = await db.from("square_connection").update({ updated_at: new Date().toISOString() }).eq("tenant_id", conn.tenant_id).eq("id", conn.id);
  assertNoError(touchedError, "Record Square sync time");
  return { orders, locations: locations.length };
}

export async function syncSquareTenant(db: SupabaseClient, conn: SquareSyncConnection) {
  const { data: lease, error } = await db.rpc("claim_square_sync", { p_tenant_id: conn.tenant_id, p_sales_channel_id: conn.sales_channel_id, p_lease_seconds: 180 });
  assertNoError(error, "Claim Square reconciliation");
  if (typeof lease !== "string") throw new Error("Square reconciliation is busy; retry shortly");
  try { return await runSquareSync(db, conn, lease); }
  finally {
    const { error: releaseError } = await db.from("sales_channel").update({ sync_lease_token: null, sync_lease_until: null }).eq("tenant_id", conn.tenant_id).eq("id", conn.sales_channel_id).eq("sync_lease_token", lease);
    assertNoError(releaseError, "Release Square reconciliation");
  }
}
