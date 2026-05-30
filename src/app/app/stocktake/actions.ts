"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getServerTenantContext } from "@/lib/tenant/context";
import { canTransitionStocktakeStatus, type StocktakeSessionStatus } from "@/lib/stocktake/lifecycle";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function seedVarianceReasonsIfNeeded(supabase: any, tenantId: string) {
  const { count } = await supabase
    .from("stocktake_variance_reason")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);

  if ((count ?? 0) > 0) return;

  const defaults = [
    { name: "Damage",            sort_order: 1 },
    { name: "Theft",             sort_order: 2 },
    { name: "Data Entry Error",  sort_order: 3 },
    { name: "Found Stock",       sort_order: 4 },
    { name: "Supplier Shortage", sort_order: 5 },
    { name: "Other",             sort_order: 6 },
  ];
  await supabase.from("stocktake_variance_reason").insert(
    defaults.map((d) => ({ ...d, tenant_id: tenantId }))
  );
}

// NOTE: Race condition — concurrent creates may collide on the same reference number.
// Mitigation: sessionError throw in createStocktakeSession surfaces DB unique violations.
// Full fix requires a UNIQUE(tenant_id, reference_number) constraint in the schema.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function generateReferenceNumber(supabase: any, tenantId: string): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `ST-${year}-`;
  const { count } = await supabase
    .from("stocktake_session")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .like("reference_number", `${prefix}%`);
  const next = (count ?? 0) + 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

export async function createStocktakeSession(formData: FormData): Promise<void> {
  const locationId = formData.get("location_id")?.toString() ?? "";
  const notes = formData.get("notes")?.toString().trim() || null;
  const blindCount = formData.get("blind_count") === "on";
  const sessionType = (formData.get("session_type")?.toString() ?? "full") as "full" | "initial";

  if (!locationId) throw new Error("Location is required.");

  const context = await getServerTenantContext();
  if (!context || !context.tenantId) throw new Error("Missing tenant context.");
  const { supabase, tenantId } = context;
  if (!tenantId) throw new Error("Missing tenant context."); // non-null: layout.tsx redirects tenant-less operators to /app/super-admin

  await seedVarianceReasonsIfNeeded(supabase, tenantId);

  const referenceNumber = await generateReferenceNumber(supabase, tenantId);

  const { data: session, error: sessionError } = await supabase
    .from("stocktake_session")
    .insert({
      tenant_id: tenantId,
      location_id: locationId,
      status: "counting",
      session_type: sessionType,
      notes,
      blind_count: blindCount,
      reference_number: referenceNumber,
    })
    .select("id,location_id")
    .single();

  if (sessionError) throw new Error(sessionError.message);

  // Pre-load all components as lines
  const { data: components } = await supabase
    .from("component")
    .select("id")
    .eq("tenant_id", tenantId);

  if (components && components.length > 0) {
    const { data: balances } = await supabase
      .from("inventory_balance")
      .select("component_id,on_hand")
      .eq("tenant_id", tenantId)
      .eq("location_id", locationId);

    const balanceMap = new Map(
      (balances ?? []).map((b: { component_id: string; on_hand: number }) => [
        b.component_id,
        Number(b.on_hand ?? 0),
      ])
    );

    const lines = (components as { id: string }[]).map((c) => ({
      tenant_id: tenantId,
      session_id: session.id,
      component_id: c.id,
      expected_on_hand: balanceMap.get(c.id) ?? 0,
      counted: null,
    }));

    for (let i = 0; i < lines.length; i += 200) {
      await supabase.from("stocktake_line").insert(lines.slice(i, i + 200));
    }
  }

  revalidatePath("/app/stocktake");
  redirect(`/app/stocktake/${session.id}`);
}

export async function updateStocktakeStatus(formData: FormData) {
  const sessionId = formData.get("session_id")?.toString() ?? "";
  const status = (formData.get("status")?.toString() ?? "") as StocktakeSessionStatus;
  if (!sessionId || !status) return;

  const context = await getServerTenantContext();
  if (!context) return;
  const { supabase, tenantId } = context;

  const { data: sessionData } = await supabase
    .from("stocktake_session")
    .select("id,status")
    .eq("tenant_id", tenantId)
    .eq("id", sessionId)
    .maybeSingle();

  const current = sessionData as { id: string; status: StocktakeSessionStatus } | null;
  if (!current?.id || !canTransitionStocktakeStatus(current.status, status)) return;

  await supabase
    .from("stocktake_session")
    .update({ status })
    .eq("tenant_id", tenantId)
    .eq("id", sessionId);

  revalidatePath("/app/stocktake");
  revalidatePath(`/app/stocktake/${sessionId}`);
}
