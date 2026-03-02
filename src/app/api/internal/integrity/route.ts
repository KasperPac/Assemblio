import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loadInventoryIntegrityAudit, type AuditClient } from "@/lib/inventory/audit";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.tenant_id) {
    return NextResponse.json({ error: "Missing tenant context" }, { status: 403 });
  }

  const audit = await loadInventoryIntegrityAudit(
    supabase as unknown as AuditClient,
    profile.tenant_id
  );
  return NextResponse.json(
    {
      tenantId: profile.tenant_id,
      generatedAt: new Date().toISOString(),
      summary: {
        invariantIssues: audit.invariantIssues.length,
        reconciliationDrifts: audit.reconciliationIssues.length,
        duplicateAllocationKeys: audit.duplicateAllocationKeys.length,
        poOverReceiptRows: audit.poOverReceipt.length,
      },
      details: audit,
    },
    { status: 200 }
  );
}
