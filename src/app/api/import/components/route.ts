import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";
import { parseCSV } from "@/lib/csv/parse";
import { validateComponentRows, type ComponentLookups } from "@/lib/csv/validate-components";

const MAX_CSV_BYTES = 5 * 1024 * 1024; // 5 MB
const REQUIRED_HEADERS = ["name"];

export async function POST(req: NextRequest) {
  const context = await getServerTenantContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { supabase, tenantId } = context;

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const dryRun = formData.get("dry_run") === "true";

  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  if (file.size > MAX_CSV_BYTES)
    return NextResponse.json({ error: "File too large (max 5 MB)" }, { status: 413 });

  const text = await file.text();
  const rows = parseCSV(text);

  // File-level checks
  if (rows.length === 0)
    return NextResponse.json({ error: "CSV has no data rows" }, { status: 400 });
  for (const col of REQUIRED_HEADERS) {
    if (!(col in rows[0]))
      return NextResponse.json({ error: `Missing required column: ${col}` }, { status: 400 });
  }

  // Fetch DB lookups — select id + name so we have both for commit resolution
  const [
    { data: supplierRecords },
    { data: locationRecords },
    { data: groupRecords },
    { data: existingComponents },
  ] = await Promise.all([
    supabase.from("suppliers").select("id, name").eq("tenant_id", tenantId),
    supabase.from("location").select("id, name").eq("tenant_id", tenantId),
    supabase.from("component_group").select("id, name").eq("tenant_id", tenantId),
    supabase.from("component").select("sku").eq("tenant_id", tenantId).not("sku", "is", null),
  ]);

  const supplierIdMap = new Map(
    (supplierRecords ?? []).map((s) => [s.name.toLowerCase(), s.id as string])
  );
  const locationIdMap = new Map(
    (locationRecords ?? []).map((l) => [l.name.toLowerCase(), l.id as string])
  );
  const groupIdMap = new Map(
    (groupRecords ?? []).map((g) => [g.name.toLowerCase(), g.id as string])
  );

  const lookups: ComponentLookups = {
    supplierNames: new Set(supplierIdMap.keys()),
    locationNames: new Set(locationIdMap.keys()),
    groupNames: new Set(groupIdMap.keys()),
    existingSkus: new Set(
      (existingComponents ?? []).map((c) => c.sku as string).filter(Boolean)
    ),
  };

  const validatedRows = validateComponentRows(rows, lookups);

  // Dry run — return preview data
  if (dryRun) {
    return NextResponse.json({ rows: validatedRows });
  }

  // Commit — re-validate, then insert
  const errors = validatedRows.filter((r) => r.error);
  if (errors.length > 0)
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });

  const insertRows = validatedRows.map((r) => {
    const raw = r.raw;
    const supplierName = raw["supplier_name"]?.trim() || null;
    const locationName = raw["location_name"]?.trim() || null;
    const groupName = raw["group_name"]?.trim() || null;

    return {
      tenant_id: tenantId,
      name: raw["name"].trim(),
      sku: raw["sku"]?.trim() || null,
      unit: raw["unit"]?.trim() || null,
      cost_per_unit: raw["cost_per_unit"]?.trim() ? Number(raw["cost_per_unit"]) : 0,
      reorder_point: raw["reorder_point"]?.trim() ? Number(raw["reorder_point"]) : 0,
      low_stock_level: raw["low_stock_level"]?.trim() ? Number(raw["low_stock_level"]) : 0,
      supplier_id: supplierName ? (supplierIdMap.get(supplierName.toLowerCase()) ?? null) : null,
      location_id: locationName ? (locationIdMap.get(locationName.toLowerCase()) ?? null) : null,
      group_id: groupName ? (groupIdMap.get(groupName.toLowerCase()) ?? null) : null,
    };
  });

  const { error } = await supabase.from("component").insert(insertRows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("activity_log").insert({
    tenant_id: tenantId,
    event: "components_csv_imported",
    metadata: { count: insertRows.length },
  });

  revalidatePath("/app/components");
  revalidatePath("/app/inventory");
  revalidatePath("/app/activity-log");

  return NextResponse.json({ imported: insertRows.length });
}
