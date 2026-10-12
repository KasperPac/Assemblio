import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import { isAdminRole } from "@/lib/tenant/authz";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSquareConfig, isSquarePilotTenant } from "@/lib/square/config";
import { assertNoError } from "@/lib/supabase/assert-no-error";
import PageHeader from "../../../_ui/page-header";
import EmptyState from "../../../_ui/empty-state";
import StatusBadge from "../../../_ui/status-badge";
import { ItemMappingForm, LocationMappingForm, SquareConnectionActions, StockWritesForm, type MappingItem, type VariantOption } from "./forms";
import { listSquareLocations, type LocationOption, type SquareConnection } from "./data";
import styles from "./square.module.css";

export default async function SquareManagePage({ searchParams }: { searchParams?: Promise<{ page?: string; status?: string; variant?: string }> }) {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/app/auth/login");
  if (!ctx.tenantId || !isAdminRole(ctx.role)) redirect("/app/settings/profile");
  if (!isSquarePilotTenant(ctx.tenantId)) redirect("/app/settings/integrations");
  const params = await searchParams ?? {};
  const pageValue = Number(params.page ?? 1);
  const page = Number.isSafeInteger(pageValue) && pageValue > 0 && pageValue < 100000 ? pageValue : 1;
  const status = ["unmatched", "ambiguous", "linked", "ignored"].includes(params.status ?? "") ? params.status! : "all";
  const db = createSupabaseAdminClient();
  const cfg = getSquareConfig();
  const { data: connection, error: connError } = await db.from("square_connection")
    .select("id,tenant_id,sales_channel_id,merchant_id,environment,status").eq("tenant_id", ctx.tenantId)
    .eq("environment", cfg.ok ? cfg.environment : "production").maybeSingle();
  assertNoError(connError, "read Square connection");
  if (!connection || connection.status === "disconnected") redirect("/app/settings/integrations");
  const conn = connection as SquareConnection;
  const linksQuery = db.from("channel_item_link").select("id,name,sku,barcode,status,variant_id,ignored_reason,tracked_location_ids,stock_conversion_ratio,origin", { count: "exact" })
    .eq("tenant_id", ctx.tenantId).eq("sales_channel_id", conn.sales_channel_id).order("name").order("id").range((page - 1) * 50, page * 50 - 1);
  if (status !== "all") linksQuery.eq("status", status);
  let variantQuery = db.from("product_variant").select("id,title,sku,product:product!inner(title,kind)")
    .eq("tenant_id", ctx.tenantId).eq("product.kind", "retail").order("sku").limit(500);
  const variantSearch = (params.variant ?? "").trim().slice(0, 100);
  if (variantSearch) variantQuery = variantQuery.ilike("sku", `%${variantSearch.replace(/[%_]/g, "")}%`);
  const [channel, locations, locationLinks, links, variants, waitingLines, pendingEvents, failedEvents, recentFailures] = await Promise.all([
    db.from("sales_channel").select("stock_write_enabled,baseline_confirmed_at").eq("tenant_id", ctx.tenantId).eq("id", conn.sales_channel_id).single(),
    db.from("location").select("id,name").eq("tenant_id", ctx.tenantId).order("name"),
    db.from("square_location_link").select("square_location_id,location_id").eq("tenant_id", ctx.tenantId).eq("sales_channel_id", conn.sales_channel_id),
    linksQuery, variantQuery,
    db.from("square_order_line").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId).eq("sales_channel_id", conn.sales_channel_id).eq("status", "pending_mapping"),
    db.from("square_webhook_event").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId).eq("sales_channel_id", conn.sales_channel_id).in("status", ["pending", "processing"]),
    db.from("square_webhook_event").select("id", { count: "exact", head: true }).eq("tenant_id", ctx.tenantId).eq("sales_channel_id", conn.sales_channel_id).eq("status", "failed"),
    db.from("square_webhook_event").select("id,event_type,attempts,updated_at").eq("tenant_id", ctx.tenantId).eq("sales_channel_id", conn.sales_channel_id).eq("status", "failed").order("updated_at", { ascending: false }).limit(5),
  ]);
  for (const result of [channel, locations, locationLinks, links, variants, waitingLines, pendingEvents, failedEvents, recentFailures]) assertNoError(result.error, "read Square setup");
  let squareLocations: LocationOption[] = [], locationError: string | null = null;
  try { squareLocations = await listSquareLocations(db, conn); } catch { locationError = "Couldn't load Square locations. Try again, or reconnect Square from Integrations."; }
  const variantOptions: VariantOption[] = (variants.data ?? []).map((v) => {
    const product = (Array.isArray(v.product) ? v.product[0] : v.product) as { title: string } | undefined;
    return { id: v.id, label: [product?.title, v.title, v.sku].filter(Boolean).join(" · ") };
  });
  const href = (nextPage: number) => `/app/settings/integrations/square?${new URLSearchParams({ page: String(nextPage), status, ...(variantSearch ? { variant: variantSearch } : {}) })}`;
  return <section className={styles.page}>
    <PageHeader eyebrow="Admin" title="Square integration" breadcrumbs={[{ label: "Integrations", href: "/app/settings/integrations" }, { label: "Square" }]} description="Map retail products and locations, count opening stock, then enable stock updates." />
    <div className={styles.formCard}>
      <p className={styles.help}>Merchant {conn.merchant_id} · {conn.environment === "sandbox" ? "Sandbox — test transactions only" : "Production"}</p>
      {conn.status === "needs_reconnect" ? <div className={styles.actions}><p className={styles.error}>Square needs to be reconnected before syncing or changing mappings.</p><a href="/api/square/install" className={styles.primaryBtn}>Reconnect Square</a></div> : null}
      <SquareConnectionActions />
      <p className={styles.help}>Services are ignored. Orders with unmapped stock lines wait until every line is resolved. Manuva does not send Square sales to Xero.</p>
      <p className={styles.help}>{waitingLines.count ?? 0} stock lines awaiting mapping · {pendingEvents.count ?? 0} events pending · {failedEvents.count ?? 0} events failed</p>
      {(recentFailures.data ?? []).map((event) => <p className={styles.error} key={event.id}>{event.event_type} · {event.attempts} attempts · {new Date(event.updated_at).toLocaleString("en-AU")} — Sync Square to retry; reconnect if failures continue.</p>)}
    </div>
    <div className={styles.formCard}>{locationError ? <p className={styles.error}>{locationError}</p> : <LocationMappingForm squareLocations={squareLocations} locations={locations.data ?? []} current={locationLinks.data ?? []} />}</div>
    <div className={styles.formCard}>
      <h2 className={styles.heading}>Product mappings</h2>
      <p className={styles.help}>Link existing retail variants or create stock-tracked items. Non-stock items can be ignored with a reason. New retail items start with zero stock.</p>
      <p className={styles.help}>Sale-line entries cover custom items and missing catalogue variations. Resolve these manually; they consume mapped Manuva stock without receiving Square stock updates.</p>
      <form method="get" className={styles.actions}>
        <label className={styles.label}>Mapping status<select name="status" defaultValue={status} className={styles.select}><option value="all">All</option><option value="unmatched">Unmatched</option><option value="ambiguous">Ambiguous</option><option value="linked">Linked</option><option value="ignored">Ignored</option></select></label>
        <label className={styles.label}>Find retail variants by SKU<input name="variant" defaultValue={variantSearch} className={styles.input} maxLength={100} /></label>
        <button className={styles.secondaryBtn}>Filter mappings</button>
      </form>
      {variantOptions.length === 500 ? <p className={styles.help}>Showing the first 500 retail variants in mapping choices. Search by SKU to narrow the choices.</p> : null}
    </div>
    {!links.data?.length ? <EmptyState title="No product mappings" message="Sync Square to import the catalogue, or choose a different mapping status." /> : <div className={styles.tableCard}><table className={styles.table}>
      <thead><tr><th>Square product</th><th>Source</th><th>SKU / barcode</th><th>Status</th><th>Mapping</th></tr></thead>
      <tbody>{(links.data as MappingItem[]).map((item) => <tr key={item.id}><td>{item.name}{item.ignored_reason ? <p className={styles.help}>{item.ignored_reason}</p> : null}</td><td>{item.origin === "order" ? "Sale line" : "Catalogue"}</td><td>{item.sku ?? "—"}<br />{item.barcode ?? "—"}</td><td><StatusBadge variant={item.status === "linked" ? "success" : item.status === "ambiguous" ? "warning" : undefined}>{item.status}</StatusBadge></td><td><ItemMappingForm item={item} variants={variantOptions} /></td></tr>)}</tbody>
    </table></div>}
    <div className={styles.actions}>{page > 1 ? <Link href={href(page - 1)} className={styles.secondaryBtn}>Previous</Link> : null}<span className={styles.help}>{links.count ?? 0} products · page {page}</span>{page * 50 < (links.count ?? 0) ? <Link href={href(page + 1)} className={styles.secondaryBtn}>Next</Link> : null}</div>
    <StockWritesForm enabled={Boolean(channel.data?.stock_write_enabled)} baselineConfirmedAt={channel.data?.baseline_confirmed_at ?? null} />
    <Link href="/app/settings/integrations" className={styles.backLink}>Back to integrations</Link>
  </section>;
}
