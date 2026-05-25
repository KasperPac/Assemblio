import { createClient } from "@supabase/supabase-js";

const args = new Set(process.argv.slice(2));

function getArgValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

const tenantName = getArgValue("--tenant") ?? "Pac-Technologies";
const execute = args.has("--execute");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment."
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

function assertNoError(error, context) {
  if (!error) return;
  throw new Error(`${context}: ${error.message ?? "Unknown Supabase error"}`);
}

async function fetchRows(table, column, value) {
  const { data, error } = await supabase
    .from(table)
    .select("*")
    .eq(column, value);

  assertNoError(error, `Failed to fetch ${table}`);
  return data ?? [];
}

async function countRows(table, column, value) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq(column, value);

  assertNoError(error, `Failed to count ${table}`);
  return count ?? 0;
}

async function deleteByTenant(table, tenantId) {
  const { error } = await supabase.from(table).delete().eq("tenant_id", tenantId);
  assertNoError(error, `Failed to delete ${table}`);
}

async function deleteByIds(table, ids) {
  if (ids.length === 0) return;
  const { error } = await supabase.from(table).delete().in("id", ids);
  assertNoError(error, `Failed to delete ${table}`);
}

async function deleteWebhookEvents(shopDomains) {
  for (const shopDomain of shopDomains) {
    const { error } = await supabase
      .from("shopify_webhook_event")
      .delete()
      .eq("shop_domain", shopDomain);
    assertNoError(error, `Failed to delete shopify_webhook_event for ${shopDomain}`);
  }
}

async function main() {
  const { data: tenantRows, error: tenantError } = await supabase
    .from("tenant")
    .select("id,name")
    .eq("name", tenantName)
    .limit(2);

  assertNoError(tenantError, "Failed to fetch tenant");

  if (!tenantRows || tenantRows.length === 0) {
    throw new Error(`Tenant not found: ${tenantName}`);
  }

  if (tenantRows.length > 1) {
    throw new Error(`Multiple tenants found for name: ${tenantName}`);
  }

  const tenant = tenantRows[0];
  const tenantId = tenant.id;

  const storeRows = await fetchRows("shopify_store", "tenant_id", tenantId);
  const shopDomains = storeRows.map((row) => row.store_domain).filter(Boolean);
  const locationRows = await fetchRows("location", "tenant_id", tenantId);

  const deleteOrder = [
    "job_actual_time_entry",
    "job_cost_actual_rollup",
    "job_labor_plan",
    "job_cost_snapshot",
    "department_utilization_week",
    "department_capacity_week",
    "staff_availability_week",
    "cost_rate_schedule",
    "product_bom_labor",
    "order_component_allocation",
    "stocktake_line",
    "stocktake_session",
    "purchase_order_line",
    "purchase_order",
    "inventory_movement",
    "inventory_balance",
    "product_bom_component",
    "bom_template_line",
    "order_line",
    "orders",
    "product_bom",
    "bom_template",
    "product_variant",
    "product",
    "staff_member",
    "department",
    "component",
    "component_group",
    "suppliers",
    "activity_log",
    "event_log",
  ];

  const summary = [];
  for (const table of deleteOrder) {
    const count = await countRows(table, "tenant_id", tenantId);
    summary.push({ table, count });
  }

  const { count: webhookCount, error: webhookCountError } = await supabase
    .from("shopify_webhook_event")
    .select("*", { count: "exact", head: true })
    .in("shop_domain", shopDomains.length > 0 ? shopDomains : ["__no_store__"]);
  assertNoError(webhookCountError, "Failed to count shopify_webhook_event");

  console.log(
    JSON.stringify(
      {
        tenant: tenant.name,
        tenantId,
        preserved: {
          tenant: 1,
          tenant_domain: "all",
          profiles: "all",
          profile_tenant_access: "all",
          location: locationRows.length,
          shopify_store: storeRows.length,
          shopify_install_tokens: storeRows.length > 0 ? "all for preserved stores" : 0,
        },
        deleted: Object.fromEntries(summary.map(({ table, count }) => [table, count])),
        deletedWebhookEvents: webhookCount ?? 0,
        mode: execute ? "execute" : "dry-run",
      },
      null,
      2
    )
  );

  if (!execute) {
    console.log("Dry run only. Re-run with --execute to apply.");
    return;
  }

  for (const table of deleteOrder) {
    await deleteByTenant(table, tenantId);
  }

  await deleteWebhookEvents(shopDomains);

  const remainingChecks = await Promise.all([
    countRows("shopify_store", "tenant_id", tenantId),
    countRows("shopify_install_tokens", "tenant_id", tenantId),
    countRows("location", "tenant_id", tenantId),
    countRows("orders", "tenant_id", tenantId),
    countRows("component", "tenant_id", tenantId),
    countRows("product", "tenant_id", tenantId),
  ]);

  const [
    remainingStores,
    remainingInstallTokens,
    remainingLocations,
    remainingOrders,
    remainingComponents,
    remainingProducts,
  ] = remainingChecks;

  console.log(
    JSON.stringify(
      {
        status: "ok",
        tenant: tenant.name,
        preserved: {
          shopify_store: remainingStores,
          shopify_install_tokens: remainingInstallTokens,
          location: remainingLocations,
        },
        remainingDeletedTargets: {
          orders: remainingOrders,
          component: remainingComponents,
          product: remainingProducts,
        },
      },
      null,
      2
    )
  );
}

await main();
