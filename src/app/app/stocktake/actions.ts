"use server";

import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";
import {
  canEditStocktakeLines,
  canTransitionStocktakeStatus,
  type StocktakeSessionStatus,
} from "@/lib/stocktake/lifecycle";
import { applyInventoryMovement } from "@/lib/inventory/movements";

type StocktakeState = {
  error?: string;
  success?: string;
};

type StocktakeSessionRecord = {
  id: string;
  status: StocktakeSessionStatus;
  location_id: string;
};

type StocktakeLineRecord = {
  id: string;
  component_id: string;
  expected_on_hand: number;
  counted: number;
};

type BalanceRecord = {
  component_id: string;
  on_hand: number;
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
  if (!sessionId) return;

  const context = await getTenantId();
  if (!context) return;
  const { supabase, tenantId } = context;

  const { data: sessionData } = await supabase
    .from("stocktake_session")
    .select("id,status,location_id")
    .eq("id", sessionId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  const session = sessionData as StocktakeSessionRecord | null;
  if (!session?.id) return;
  if (session.status !== "approved") return;

  const { data: lineData } = await supabase
    .from("stocktake_line")
    .select("id,component_id,expected_on_hand,counted")
    .eq("session_id", session.id)
    .eq("tenant_id", tenantId);

  const lines = (lineData ?? []) as StocktakeLineRecord[];
  if (lines.length === 0) return;

  const uniqueComponentIds = Array.from(new Set(lines.map((line) => line.component_id)));
  const { data: balanceData } = await supabase
    .from("inventory_balance")
    .select("component_id,on_hand")
    .eq("tenant_id", tenantId)
    .eq("location_id", session.location_id)
    .in("component_id", uniqueComponentIds);

  const balanceMap = new Map(
    ((balanceData ?? []) as BalanceRecord[]).map((balance) => [
      balance.component_id,
      Number(balance.on_hand ?? 0),
    ])
  );

  let adjustmentCount = 0;
  let expectedTotal = 0;
  let countedTotal = 0;
  let varianceFromExpected = 0;
  let appliedDeltaTotal = 0;

  for (const line of lines) {
    const expected = Number(line.expected_on_hand ?? 0);
    const counted = Number(line.counted ?? 0);
    const currentOnHand = balanceMap.get(line.component_id) ?? 0;
    const deltaOnHand = counted - currentOnHand;

    expectedTotal += expected;
    countedTotal += counted;
    varianceFromExpected += counted - expected;
    appliedDeltaTotal += deltaOnHand;

    if (deltaOnHand === 0) continue;

    try {
      await applyInventoryMovement(supabase, {
        componentId: line.component_id,
        locationId: session.location_id,
        deltaOnHand,
        deltaInProd: 0,
        reason: "stocktake_adjustment",
        referenceType: "stocktake_session",
        referenceId: session.id,
      });
    } catch {
      return;
    }
    adjustmentCount += 1;
  }

  await supabase
    .from("stocktake_session")
    .update({ status: "completed" })
    .eq("id", session.id)
    .eq("tenant_id", tenantId);

  await supabase.from("activity_log").insert({
    tenant_id: tenantId,
    event: "stocktake_applied",
    metadata: {
      session_id: session.id,
      line_count: lines.length,
      adjustments: adjustmentCount,
      expected_total: expectedTotal,
      counted_total: countedTotal,
      variance_from_expected: varianceFromExpected,
      applied_delta_total: appliedDeltaTotal,
      status_from: "approved",
      status_to: "completed",
    },
  });

  revalidatePath("/app/stocktake");
  revalidatePath("/app/inventory");
  revalidatePath("/app/activity-log");
}
