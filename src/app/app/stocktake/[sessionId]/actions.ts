"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";
import {
  canEditStocktakeLines,
  canSubmitForReview,
  canApprove,
  canSendBackForRecount,
  type StocktakeSessionStatus,
} from "@/lib/stocktake/lifecycle";

type SessionRecord = {
  id: string;
  status: string;
  session_type: string;
  location_id: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchSession(supabase: any, tenantId: string, sessionId: string) {
  const { data } = await supabase
    .from("stocktake_session")
    .select("id,status,session_type,location_id")
    .eq("tenant_id", tenantId)
    .eq("id", sessionId)
    .maybeSingle();
  return data as SessionRecord | null;
}

export async function saveLineCountClient({
  lineId,
  sessionId,
  counted,
}: {
  lineId: string;
  sessionId: string;
  counted: number | null;
}): Promise<{ ok: boolean }> {
  if (!lineId || !sessionId) return { ok: false };

  const context = await getServerTenantContext();
  if (!context) return { ok: false };
  const { supabase, tenantId } = context;

  const { data: { user } } = await supabase.auth.getUser();

  const session = await fetchSession(supabase, tenantId, sessionId);
  if (!session || !canEditStocktakeLines(session.status as StocktakeSessionStatus)) return { ok: false };

  const { error } = await supabase
    .from("stocktake_line")
    .update({
      counted,
      counted_by: user?.id ?? null,
      counted_at: new Date().toISOString(),
    })
    .eq("id", lineId)
    .eq("session_id", sessionId)
    .eq("tenant_id", tenantId);

  if (error) return { ok: false };

  return { ok: true };
}


export async function submitForReview(formData: FormData) {
  const sessionId = formData.get("session_id")?.toString() ?? "";
  if (!sessionId) return;

  const context = await getServerTenantContext();
  if (!context) return;
  const { supabase, tenantId } = context;

  const session = await fetchSession(supabase, tenantId, sessionId);
  if (!session || !canSubmitForReview(session.status as StocktakeSessionStatus)) return;

  const { count: uncountedCount } = await supabase
    .from("stocktake_line")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("session_id", sessionId)
    .is("counted", null);

  if ((uncountedCount ?? 0) > 0) {
    redirect(`/app/stocktake/${sessionId}?error=uncounted_lines`);
  }

  await supabase
    .from("stocktake_session")
    .update({ status: "reconciliation" })
    .eq("id", sessionId)
    .eq("tenant_id", tenantId);

  revalidatePath(`/app/stocktake/${sessionId}`);
  revalidatePath("/app/stocktake");
  redirect(`/app/stocktake/${sessionId}`);
}

export async function saveVarianceReason(formData: FormData) {
  const lineId = formData.get("line_id")?.toString() ?? "";
  const sessionId = formData.get("session_id")?.toString() ?? "";
  const reasonId = formData.get("variance_reason_id")?.toString() || null;
  const notes = formData.get("notes")?.toString().trim() || null;

  if (!lineId || !sessionId) return;

  const context = await getServerTenantContext();
  if (!context) return;
  const { supabase, tenantId } = context;

  // Guard: only allow updates when session is in reconciliation
  const session = await fetchSession(supabase, tenantId, sessionId);
  if (!session || session.status !== "reconciliation") return;

  await supabase
    .from("stocktake_line")
    .update({ variance_reason_id: reasonId, notes })
    .eq("id", lineId)
    .eq("session_id", sessionId)
    .eq("tenant_id", tenantId);

  revalidatePath(`/app/stocktake/${sessionId}`);
}

export async function approveAndApply(formData: FormData) {
  const sessionId = formData.get("session_id")?.toString() ?? "";
  if (!sessionId) redirect("/app/stocktake?apply_error=missing_session");

  const context = await getServerTenantContext();
  if (!context) redirect("/app/stocktake?apply_error=missing_tenant");
  const { supabase, tenantId } = context;

  const session = await fetchSession(supabase, tenantId, sessionId);
  if (!session || !canApprove(session.status as StocktakeSessionStatus)) {
    redirect(`/app/stocktake/${sessionId}?error=cannot_approve`);
  }

  // Check all variance lines have a reason set
  const { data: varianceLines } = await supabase
    .from("stocktake_line")
    .select("id,expected_on_hand,counted,variance_reason_id")
    .eq("tenant_id", tenantId)
    .eq("session_id", sessionId);

  const missingReason = (varianceLines ?? []).some((l: { counted: number; expected_on_hand: number; variance_reason_id: string | null }) => {
    const variance = Number(l.counted ?? 0) - Number(l.expected_on_hand ?? 0);
    return variance !== 0 && !l.variance_reason_id;
  });

  if (missingReason) {
    redirect(`/app/stocktake/${sessionId}?error=missing_reasons`);
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/app/stocktake/${sessionId}?apply_error=not_authenticated`);

  await supabase
    .from("stocktake_session")
    .update({ status: "approved", approved_by: user?.id ?? null, approved_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("tenant_id", tenantId);

  const { data: rpcData, error: rpcError } = await supabase.rpc("apply_stocktake_session", {
    p_session_id: sessionId,
  });

  if (rpcError) {
    // Roll back the status so the session isn't permanently stuck in approved
    await supabase
      .from("stocktake_session")
      .update({ status: "reconciliation", approved_by: null, approved_at: null })
      .eq("id", sessionId)
      .eq("tenant_id", tenantId);
    redirect(`/app/stocktake/${sessionId}?apply_error=${encodeURIComponent(rpcError.message)}`);
  }

  const summary = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as { applied_lines: number; adjustment_count: number } | null;

  try {
    await supabase.from("activity_log").insert({
      tenant_id: tenantId,
      event: "stocktake_applied",
      metadata: { session_id: sessionId, line_count: summary?.applied_lines ?? 0, adjustments: summary?.adjustment_count ?? 0 },
    });
  } catch (err) {
    console.error("[approveAndApply] activity_log insert failed:", err);
  }

  revalidatePath("/app/stocktake");
  revalidatePath("/app/inventory");
  redirect(`/app/stocktake?apply_ok=${summary?.adjustment_count ?? 0}/${summary?.applied_lines ?? 0}`);
}

export async function sendBackForRecount(formData: FormData) {
  const sessionId = formData.get("session_id")?.toString() ?? "";
  if (!sessionId) return;

  const context = await getServerTenantContext();
  if (!context) return;
  const { supabase, tenantId } = context;

  const session = await fetchSession(supabase, tenantId, sessionId);
  if (!session || !canSendBackForRecount(session.status as StocktakeSessionStatus)) return;

  await supabase
    .from("stocktake_session")
    .update({ status: "counting" })
    .eq("id", sessionId)
    .eq("tenant_id", tenantId);

  revalidatePath(`/app/stocktake/${sessionId}`);
  revalidatePath("/app/stocktake");
  redirect(`/app/stocktake/${sessionId}`);
}

export async function applyOpeningStock(formData: FormData) {
  const sessionId = formData.get("session_id")?.toString() ?? "";
  if (!sessionId) redirect("/app/stocktake?apply_error=missing_session");

  const context = await getServerTenantContext();
  if (!context) redirect("/app/stocktake?apply_error=missing_tenant");
  const { supabase, tenantId } = context;

  const session = await fetchSession(supabase, tenantId, sessionId);
  if (!session || session.session_type !== "initial") {
    redirect(`/app/stocktake/${sessionId}?error=not_initial_session`);
  }
  if (session.status !== "counting" && session.status !== "open") {
    redirect(`/app/stocktake/${sessionId}?error=wrong_status`);
  }

  const { count: uncountedCount } = await supabase
    .from("stocktake_line")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("session_id", sessionId)
    .is("counted", null);

  if ((uncountedCount ?? 0) > 0) {
    redirect(`/app/stocktake/${sessionId}?error=uncounted_lines`);
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/app/stocktake/${sessionId}?apply_error=not_authenticated`);

  await supabase
    .from("stocktake_session")
    .update({ status: "approved", approved_by: user?.id ?? null, approved_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("tenant_id", tenantId);

  const { data: rpcData, error: rpcError } = await supabase.rpc("apply_stocktake_session", {
    p_session_id: sessionId,
  });

  if (rpcError) {
    redirect(`/app/stocktake/${sessionId}?apply_error=${encodeURIComponent(rpcError.message)}`);
  }

  const summary = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as { applied_lines: number } | null;

  revalidatePath("/app/stocktake");
  revalidatePath("/app/inventory");
  redirect(`/app/stocktake?apply_ok=${summary?.applied_lines ?? 0}/initial`);
}
