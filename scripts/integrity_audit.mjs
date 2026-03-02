#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";

function parseArgs(argv) {
  const args = { tenant: "Pac-Technologies", failOnIssues: true };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--tenant" && argv[i + 1]) {
      args.tenant = argv[i + 1];
      i += 1;
      continue;
    }
    if (token === "--no-fail") {
      args.failOnIssues = false;
    }
  }
  return args;
}

function key(componentId, locationId) {
  return `${componentId}:${locationId}`;
}

function printSection(title, value) {
  console.log(`\n${title}`);
  console.log("-".repeat(title.length));
  console.log(value);
}

function buildInvariantIssues(balanceRows) {
  const issues = [];
  for (const row of balanceRows) {
    const onHand = Number(row.on_hand ?? 0);
    const inProd = Number(row.in_prod ?? 0);
    const reserved = Number(row.reserved ?? 0);
    const component = row.component?.name ?? "Unknown component";
    const location = row.location?.name ?? "Unknown location";
    if (onHand < 0) issues.push(`negative_on_hand | ${component} @ ${location} | ${onHand}`);
    if (inProd < 0) issues.push(`negative_in_prod | ${component} @ ${location} | ${inProd}`);
    if (reserved < 0) issues.push(`negative_reserved | ${component} @ ${location} | ${reserved}`);
    if (onHand - reserved < 0) {
      issues.push(
        `over_reserved | ${component} @ ${location} | available ${onHand - reserved}`
      );
    }
  }
  return issues;
}

function buildReconciliationDrifts(balanceRows, movementRows) {
  const totals = new Map();
  for (const movement of movementRows) {
    const k = key(movement.component_id, movement.location_id);
    const current = totals.get(k) ?? { onHand: 0, inProd: 0 };
    current.onHand += Number(movement.delta_on_hand ?? 0);
    current.inProd += Number(movement.delta_in_prod ?? 0);
    totals.set(k, current);
  }

  const drifts = [];
  for (const balance of balanceRows) {
    const k = key(balance.component_id, balance.location_id);
    const movement = totals.get(k) ?? { onHand: 0, inProd: 0 };
    const onHand = Number(balance.on_hand ?? 0);
    const inProd = Number(balance.in_prod ?? 0);
    const onHandDelta = onHand - movement.onHand;
    const inProdDelta = inProd - movement.inProd;
    if (Math.abs(onHandDelta) <= 0.0001 && Math.abs(inProdDelta) <= 0.0001) continue;

    const component = balance.component?.name ?? "Unknown component";
    const location = balance.location?.name ?? "Unknown location";
    drifts.push(
      `${component} @ ${location} | on_hand ${onHand} vs ${movement.onHand} (delta ${onHandDelta}); in_prod ${inProd} vs ${movement.inProd} (delta ${inProdDelta})`
    );
  }

  return drifts;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.tenant === "Fabulous") {
    console.error("Tenant 'Fabulous' is blocked by project policy.");
    process.exit(2);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !serviceKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment."
    );
    process.exit(2);
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: tenant, error: tenantError } = await supabase
    .from("tenant")
    .select("id,name")
    .eq("name", args.tenant)
    .maybeSingle();

  if (tenantError || !tenant?.id) {
    console.error(`Tenant not found: ${args.tenant}`);
    process.exit(2);
  }

  const [{ data: balances }, { data: movements }, { data: allocationRows }, { data: poLines }] =
    await Promise.all([
      supabase
        .from("inventory_balance")
        .select(
          "component_id,location_id,on_hand,in_prod,reserved,component:component_id(name),location:location_id(name)"
        )
        .eq("tenant_id", tenant.id),
      supabase
        .from("inventory_movement")
        .select("component_id,location_id,delta_on_hand,delta_in_prod")
        .eq("tenant_id", tenant.id),
      supabase
        .from("order_component_allocation")
        .select("id,order_line_id,component_id")
        .eq("tenant_id", tenant.id),
      supabase
        .from("purchase_order_line")
        .select("id,quantity,quantity_received")
        .eq("tenant_id", tenant.id),
    ]);

  const invariantIssues = buildInvariantIssues(balances ?? []);
  const reconciliationDrifts = buildReconciliationDrifts(balances ?? [], movements ?? []);

  const allocationKeyCounts = new Map();
  for (const row of allocationRows ?? []) {
    const k = `${row.order_line_id}:${row.component_id}`;
    allocationKeyCounts.set(k, (allocationKeyCounts.get(k) ?? 0) + 1);
  }
  const duplicateAllocations = Array.from(allocationKeyCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([k, count]) => `${k} (${count})`);

  const poOverReceipt = (poLines ?? [])
    .filter((line) => Number(line.quantity_received ?? 0) > Number(line.quantity ?? 0))
    .map(
      (line) =>
        `${line.id} | received ${line.quantity_received} > ordered ${line.quantity}`
    );

  printSection("Tenant", `${tenant.name} (${tenant.id})`);
  printSection(
    "Summary",
    JSON.stringify(
      {
        invariantIssues: invariantIssues.length,
        reconciliationDrifts: reconciliationDrifts.length,
        duplicateAllocations: duplicateAllocations.length,
        poOverReceipt: poOverReceipt.length,
      },
      null,
      2
    )
  );

  if (invariantIssues.length) printSection("Invariant Issues", invariantIssues.join("\n"));
  if (reconciliationDrifts.length) {
    printSection("Reconciliation Drifts", reconciliationDrifts.join("\n"));
  }
  if (duplicateAllocations.length) {
    printSection("Duplicate Allocations", duplicateAllocations.join("\n"));
  }
  if (poOverReceipt.length) printSection("PO Over-Receipt", poOverReceipt.join("\n"));

  const issueCount =
    invariantIssues.length +
    reconciliationDrifts.length +
    duplicateAllocations.length +
    poOverReceipt.length;

  if (issueCount === 0) {
    console.log("\nIntegrity audit passed with zero issues.");
    process.exit(0);
  }

  console.log(`\nIntegrity audit found ${issueCount} issue(s).`);
  process.exit(args.failOnIssues ? 1 : 0);
}

main().catch((error) => {
  console.error("Integrity audit failed:", error?.message ?? error);
  process.exit(2);
});
