import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";
import { parseCSV } from "@/lib/csv/parse";
import { validateSupplierRows } from "@/lib/csv/validate-suppliers";

const MAX_CSV_BYTES = 5 * 1024 * 1024;
const REQUIRED_HEADERS = ["name"];

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

  // Fetch existing supplier names for duplicate detection
  const { data: existingSuppliers } = await supabase
    .from("suppliers")
    .select("name")
    .eq("tenant_id", tenantId);

  const existingNames = new Set(
    (existingSuppliers ?? []).map((s) => s.name.toLowerCase())
  );

  const validatedRows = validateSupplierRows(rows, existingNames);

  if (dryRun) {
    return NextResponse.json({ rows: validatedRows });
  }

  // Commit
  const errors = validatedRows.filter((r) => r.error);
  if (errors.length > 0)
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });

  const insertRows = validatedRows.map((r) => {
    const raw = r.raw;
    const leadTime = raw["default_lead_time_days"]?.trim();
    return {
      tenant_id: tenantId,
      name: raw["name"].trim(),
      website: raw["website"]?.trim() || null,
      default_lead_time_days: leadTime ? Number(leadTime) : null,
      contact_name: raw["contact_name"]?.trim() || null,
      contact_email: raw["contact_email"]?.trim() || null,
      contact_phone: raw["contact_phone"]?.trim() || null,
      address: raw["address"]?.trim() || null,
      payment_terms: raw["payment_terms"]?.trim() || null,
      default_currency: raw["default_currency"]?.trim() || null,
    };
  });

  const { error } = await supabase.from("suppliers").insert(insertRows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from("activity_log").insert({
    tenant_id: tenantId,
    event: "suppliers_csv_imported",
    metadata: { count: insertRows.length },
  });

  revalidatePath("/app/suppliers");
  revalidatePath("/app/purchasing");
  revalidatePath("/app/activity-log");

  return NextResponse.json({ imported: insertRows.length });
}
