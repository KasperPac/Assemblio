"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function switchActiveTenant(formData: FormData) {
  const tenantId = formData.get("tenant_id")?.toString() ?? "";
  if (!tenantId) return;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("set_active_tenant", {
    p_tenant_id: tenantId,
  });

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath("/app");
  redirect("/app");
}
