"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { applyInventoryMovement } from "@/lib/inventory/movements";

type MovementState = {
  error?: string;
  success?: string;
};

function parseNumber(value: FormDataEntryValue | null) {
  if (value === null) return null;
  const parsed = Number(value.toString());
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

export async function createMovement(
  _prevState: MovementState,
  formData: FormData
): Promise<MovementState> {
  const componentId = formData.get("component_id")?.toString();
  const locationId = formData.get("location_id")?.toString();
  const reason = formData.get("reason")?.toString() ?? "adjustment";
  const referenceType = formData.get("reference_type")?.toString() ?? null;
  const referenceId = formData.get("reference_id")?.toString() ?? null;
  const deltaOnHand = parseNumber(formData.get("delta_on_hand"));
  const deltaInProd = parseNumber(formData.get("delta_in_prod"));

  if (!componentId || !locationId) {
    return { error: "Component and location are required." };
  }
  if (deltaOnHand === null || deltaInProd === null) {
    return { error: "Both deltas are required." };
  }

  const supabase = await createSupabaseServerClient();
  try {
    await applyInventoryMovement(supabase, {
      componentId,
      locationId,
      deltaOnHand,
      deltaInProd,
      reason,
      referenceType,
      referenceId: referenceId || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to log movement.";
    return { error: message };
  }

  revalidatePath("/app/inventory");
  return { success: "Movement logged." };
}
