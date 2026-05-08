"use server";

import { getServerTenantContext } from "@/lib/tenant/context";
import { revalidatePath } from "next/cache";

type State = { error?: string; success?: string } | null;

export async function updateProfile(
  _prev: State,
  formData: FormData
): Promise<State> {
  const ctx = await getServerTenantContext();
  if (!ctx) return { error: "Not authenticated" };

  const {
    data: { user },
  } = await ctx.supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const fullName = (formData.get("full_name") as string)?.trim();
  if (!fullName) return { error: "Name is required" };

  const { error } = await ctx.supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", user.id)
    .eq("tenant_id", ctx.tenantId);

  if (error) return { error: error.message };

  revalidatePath("/app/settings/profile");
  return { success: "Profile updated" };
}

export async function sendPasswordReset(
  _prev: State,
  _formData: FormData
): Promise<State> {
  const ctx = await getServerTenantContext();
  if (!ctx) return { error: "Not authenticated" };

  const {
    data: { user },
  } = await ctx.supabase.auth.getUser();
  if (!user?.email) return { error: "No email found" };

  const { error } = await ctx.supabase.auth.resetPasswordForEmail(user.email);
  if (error) return { error: error.message };

  return { success: "Password reset email sent — check your inbox" };
}
