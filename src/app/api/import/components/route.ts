import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";
import { parseCSV } from "@/lib/csv/parse";
import { validateComponentRows, type ComponentLookups } from "@/lib/csv/validate-components";
import { bestMatch } from "@/lib/csv/fuzzy";

const MAX_CSV_BYTES = 5 * 1024 * 1024; // 5 MB
const REQUIRED_HEADERS = ["name"];

type Resolution =
  | { type: "use_existing"; id: string }
  | { type: "create_new"; name: string };

type Resolutions = {
  suppliers: Record<string, Resolution>;
  groups: Record<string, Resolution>;
};

export async function POST(req: NextRequest) {
  const context = await getServerTenantContext();
  if (!context) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { supabase, tenantId, role } = context;
  if (!tenantId) return NextResponse.json({ error: "No active tenant" }, { status: 403 });
  if (role !== "admin" && role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const dryRun = formData.get("dry_run") === "true";

  if (!file) return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  if (file.size > MAX_CSV_BYTES)
    return NextResponse.json({ error: "File too large (max 5 MB)" }, { status: 413 });

  const text = await file.text();
  const rows = parseCSV(text);

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

  const supplierList = supplierRecords ?? [];
  const groupList = groupRecords ?? [];

  const supplierIdMap = new Map(
    supplierList.map((s) => [s.name.toLowerCase(), s.id as string])
  );
  const locationIdMap = new Map(
    (locationRecords ?? []).map((l) => [l.name.toLowerCase(), l.id as string])
  );
  const groupIdMap = new Map(
    groupList.map((g) => [g.name.toLowerCase(), g.id as string])
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

  // ── Dry run ──────────────────────────────────────────────────────────────
  if (dryRun) {
    // Collect unique soft-mismatch values by inspecting error.field
    const supplierUnknowns = new Map<string, number>(); // csvValue → rowCount
    const groupUnknowns = new Map<string, number>();

    for (const row of validatedRows) {
      if (row.error?.type === "soft" && row.error.field) {
        const csvValue = row.raw[row.error.field]?.trim();
        if (!csvValue) continue;
        if (row.error.field === "supplier_name") {
          supplierUnknowns.set(csvValue, (supplierUnknowns.get(csvValue) ?? 0) + 1);
        } else if (row.error.field === "group_name") {
          groupUnknowns.set(csvValue, (groupUnknowns.get(csvValue) ?? 0) + 1);
        }
      }
    }

    const allSupplierNames = supplierList.map((s) => s.name);
    const allGroupNames = groupList.map((g) => g.name);

    return NextResponse.json({
      rows: validatedRows,
      unknowns: {
        suppliers: Array.from(supplierUnknowns.entries()).map(([csvValue, rowCount]) => ({
          csvValue,
          suggestion: bestMatch(csvValue, allSupplierNames),
          rowCount,
        })),
        groups: Array.from(groupUnknowns.entries()).map(([csvValue, rowCount]) => ({
          csvValue,
          suggestion: bestMatch(csvValue, allGroupNames),
          rowCount,
        })),
      },
      allSuppliers: supplierList.map((s) => ({ id: s.id as string, name: s.name })),
      allGroups: groupList.map((g) => ({ id: g.id as string, name: g.name })),
    });
  }

  // ── Commit ───────────────────────────────────────────────────────────────

  // Hard errors block the import regardless of resolutions
  const hardErrors = validatedRows.filter((r) => r.error?.type === "hard");
  if (hardErrors.length > 0)
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });

  // Parse the resolutions map sent by the client
  let resolutions: Resolutions = { suppliers: {}, groups: {} };
  const resolutionsRaw = formData.get("resolutions") as string | null;
  if (resolutionsRaw) {
    try {
      resolutions = JSON.parse(resolutionsRaw) as Resolutions;
    } catch {
      return NextResponse.json({ error: "Invalid resolutions JSON" }, { status: 400 });
    }
  }

  // Every soft-mismatch row must have a corresponding resolution
  for (const row of validatedRows) {
    if (row.error?.type === "soft" && row.error.field) {
      const csvValue = row.raw[row.error.field]?.trim() ?? "";
      if (row.error.field === "supplier_name" && !resolutions.suppliers[csvValue]) {
        return NextResponse.json(
          { error: `No resolution provided for supplier: ${csvValue}` },
          { status: 400 }
        );
      }
      if (row.error.field === "group_name" && !resolutions.groups[csvValue]) {
        return NextResponse.json(
          { error: `No resolution provided for group: ${csvValue}` },
          { status: 400 }
        );
      }
    }
  }

  // Apply resolutions: create new suppliers and merge all IDs into supplierIdMap
  for (const [csvValue, res] of Object.entries(resolutions.suppliers)) {
    if (res.type === "create_new") {
      const { data, error } = await supabase
        .from("suppliers")
        .insert({ tenant_id: tenantId, name: res.name })
        .select("id")
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      supplierIdMap.set(csvValue.toLowerCase(), data.id as string);
    } else {
      supplierIdMap.set(csvValue.toLowerCase(), res.id);
    }
  }

  // Apply resolutions: create new component groups and merge all IDs into groupIdMap
  for (const [csvValue, res] of Object.entries(resolutions.groups)) {
    if (res.type === "create_new") {
      const { data, error } = await supabase
        .from("component_group")
        .insert({ tenant_id: tenantId, name: res.name })
        .select("id")
        .single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      groupIdMap.set(csvValue.toLowerCase(), data.id as string);
    } else {
      groupIdMap.set(csvValue.toLowerCase(), res.id);
    }
  }

  // Build insert rows — supplierIdMap and groupIdMap now contain resolved entries
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
