"use server";

import { getServerTenantContext } from "@/lib/tenant/context";
import { revalidatePath } from "next/cache";
import { logActivity } from "@/lib/activity/log";

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

  await logActivity({ event: "profile.updated" });
  revalidatePath("/app/settings/profile");
  return { success: "Profile updated" };
}

export async function uploadAvatar(
  _prev: State,
  formData: FormData
): Promise<State> {
  const ctx = await getServerTenantContext();
  if (!ctx) return { error: "Not authenticated" };

  const {
    data: { user },
  } = await ctx.supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const file = formData.get("avatar") as File;
  if (!file || file.size === 0) return { error: "No file selected" };
  if (file.size > 2 * 1024 * 1024) return { error: "Avatar must be under 2 MB" };

  const allowed = ["image/png", "image/jpeg", "image/webp"];
  if (!allowed.includes(file.type)) {
    return { error: "Use PNG, JPEG, or WebP" };
  }

  const extMap: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
  };
  const ext = extMap[file.type] ?? "png";
  const path = `${user.id}/avatar.${ext}`;
  const bytes = await file.arrayBuffer();

  const { error: uploadError } = await ctx.supabase.storage
    .from("user-avatars")
    .upload(path, bytes, { contentType: file.type, upsert: true });

  if (uploadError) return { error: uploadError.message };

  const {
    data: { publicUrl },
  } = ctx.supabase.storage.from("user-avatars").getPublicUrl(path);

  // Cache-bust so the new image shows up immediately.
  const versioned = `${publicUrl}?v=${Date.now()}`;

  const { error: dbError } = await ctx.supabase
    .from("profiles")
    .update({ avatar_url: versioned })
    .eq("id", user.id);

  if (dbError) return { error: dbError.message };

  await logActivity({ event: "profile.avatar_updated" });
  revalidatePath("/app/settings/profile");
  revalidatePath("/app", "layout");
  return { success: "Avatar updated" };
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
