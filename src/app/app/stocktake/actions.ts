"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";
import {
  canEditStocktakeLines,
  canTransitionStocktakeStatus,
  type StocktakeSessionStatus,
} from "@/lib/stocktake/lifecycle";

type StocktakeState = {
  error?: string;
  success?: string;
};

type StocktakeSessionRecord = {
  id: string;
  status: StocktakeSessionStatus;
  location_id: string;
};

type ApplyStocktakeSummary = {
  applied_lines: number;
  adjustment_count: number;
  expected_total: number;
  counted_total: number;
  variance_from_expected: number;
  applied_delta_total: number;
};

function parseNumber(value: FormDataEntryValue | null) {
  if (!value) return null;
  const parsed = Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

async function getTenantId() {
  return getServerTenantContext();
}

export async function createStocktakeSession(
  _prevState: StocktakeState,
  formData: FormData
): Promise<StocktakeState> {
  const locationId = formData.get("location_id")?.toString() ?? "";
  if (!locationId) {
    return { error: "Location is required." };
  }

  const context = await getTenantId();
  if (!context) return { error: "Missing tenant context." };
  const { supabase, tenantId } = context;

  const { error } = await supabase.from("stocktake_session").insert({
    tenant_id: tenantId,
    location_id: locationId,
    status: "open",
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/app/stocktake");
  return { success: "Stocktake session created." };
}

export async function updateStocktakeStatus(formData: FormData) {
  const sessionId = formData.get("session_id")?.toString() ?? "";
  const status = (formData.get("status")?.toString() ?? "") as StocktakeSessionStatus;
  if (!sessionId || !status) return;

  const context = await getTenantId();
  if (!context) return;
  const { supabase, tenantId } = context;

  const { data: sessionData } = await supabase
    .from("stocktake_session")
    .select("id,status")
    .eq("tenant_id", tenantId)
    .eq("id", sessionId)
    .maybeSingle();

  const session = sessionData as { id: string; status: StocktakeSessionStatus } | null;
  if (!session?.id) return;

  const currentStatus = session.status;
  if (currentStatus === status) return;
  if (!canTransitionStocktakeStatus(currentStatus, status)) return;

  await supabase
    .from("stocktake_session")
    .update({ status })
    .eq("tenant_id", tenantId)
    .eq("id", sessionId);

  await supabase.from("activity_log").insert({
    tenant_id: tenantId,
    event: "stocktake_status_changed",
    metadata: {
      session_id: sessionId,
      from_status: currentStatus,
      to_status: status,
    },
  });

  revalidatePath("/app/stocktake");
  revalidatePath("/app/trash");
  revalidatePath("/app/activity-log");
}

export async function createStocktakeLine(
  _prevState: StocktakeState,
  formData: FormData
): Promise<StocktakeState> {
  const sessionId = formData.get("session_id")?.toString() ?? "";
  const componentId = formData.get("component_id")?.toString() ?? "";
  const counted = parseNumber(formData.get("counted"));
  if (!sessionId || !componentId || counted === null) {
    return { error: "Session, component, and counted quantity are required." };
  }

  const context = await getTenantId();
  if (!context) return { error: "Missing tenant context." };
  const { supabase, tenantId } = context;

  const { data: sessionData } = await supabase
    .from("stocktake_session")
    .select("id,status,location_id")
    .eq("tenant_id", tenantId)
    .eq("id", sessionId)
    .maybeSingle();

  const session = sessionData as StocktakeSessionRecord | null;
  if (!session?.id) return { error: "Stocktake session not found." };
  if (!canEditStocktakeLines(session.status)) {
    return { error: "Only open sessions can accept new lines." };
  }

  const { data: existingBalance } = await supabase
    .from("inventory_balance")
    .select("on_hand")
    .eq("tenant_id", tenantId)
    .eq("location_id", session.location_id)
    .eq("component_id", componentId)
    .maybeSingle();

  const expectedOnHand = Number(existingBalance?.on_hand ?? 0);
  const { error } = await supabase.from("stocktake_line").insert({
    tenant_id: tenantId,
    session_id: sessionId,
    component_id: componentId,
    expected_on_hand: expectedOnHand,
    counted,
  });
  if (error) return { error: error.message };

  revalidatePath("/app/stocktake");
  return { success: "Stocktake line added." };
}

export async function updateStocktakeLineCounted(formData: FormData) {
  const lineId = formData.get("line_id")?.toString() ?? "";
  const counted = parseNumber(formData.get("counted"));
  if (!lineId || counted === null) return;

  const context = await getTenantId();
  if (!context) return;
  const { supabase, tenantId } = context;

  const { data: lineData } = await supabase
    .from("stocktake_line")
    .select("id,session:session_id(id,status)")
    .eq("tenant_id", tenantId)
    .eq("id", lineId)
    .maybeSingle();

  const sessionRaw = Array.isArray(lineData?.session)
    ? lineData.session[0] ?? null
    : lineData?.session ?? null;
  const session = sessionRaw as { id: string; status: StocktakeSessionStatus } | null;
  if (!lineData?.id || !session?.id) return;
  if (!canEditStocktakeLines(session.status)) return;

  await supabase
    .from("stocktake_line")
    .update({ counted })
    .eq("tenant_id", tenantId)
    .eq("id", lineId);
  revalidatePath("/app/stocktake");
}

export async function applyStocktakeSession(formData: FormData) {
  const sessionId = formData.get("session_id")?.toString() ?? "";
  if (!sessionId) {
    redirect("/app/stocktake?apply_error=missing_session");
  }

  const context = await getTenantId();
  if (!context) {
    redirect("/app/stocktake?apply_error=missing_tenant");
  }
  const { supabase, tenantId } = context;

  const { data: sessionData } = await supabase
    .from("stocktake_session")
    .select("id,status,location_id")
    .eq("id", sessionId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const session = sessionData as StocktakeSessionRecord | null;
  if (!session?.id) {
    redirect("/app/stocktake?apply_error=session_not_found");
  }
  if (session.status !== "approved") {
    redirect(
      `/app/stocktake?apply_error=${encodeURIComponent(
        `must_be_approved_was_${session.status}`
      )}`
    );
  }

  // Atomic in Postgres: see supabase/patches/apply_stocktake_session_rpc.sql.
  // Any per-line failure rolls back every movement, balance change, and the
  // status flip in the same call. No more partial-apply silent return.
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "apply_stocktake_session",
    { p_session_id: session.id }
  );

  if (rpcError) {
    redirect(
      `/app/stocktake?apply_error=${encodeURIComponent(rpcError.message)}`
    );
  }

  const summaryRow = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as
    | ApplyStocktakeSummary
    | null;
  const summary = summaryRow ?? {
    applied_lines: 0,
    adjustment_count: 0,
    expected_total: 0,
    counted_total: 0,
    variance_from_expected: 0,
    applied_delta_total: 0,
  };

  await supabase.from("activity_log").insert({
    tenant_id: tenantId,
    event: "stocktake_applied",
    metadata: {
      session_id: session.id,
      line_count: summary.applied_lines,
      adjustments: summary.adjustment_count,
      expected_total: summary.expected_total,
      counted_total: summary.counted_total,
      variance_from_expected: summary.variance_from_expected,
      applied_delta_total: summary.applied_delta_total,
      status_from: "approved",
      status_to: "completed",
    },
  });

  revalidatePath("/app/stocktake");
  revalidatePath("/app/inventory");
  revalidatePath("/app/activity-log");

  redirect(
    `/app/stocktake?apply_ok=${summary.adjustment_count}/${summary.applied_lines}`
  );
}
