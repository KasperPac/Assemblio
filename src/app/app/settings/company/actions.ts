"use server";

import { getServerTenantContext } from "@/lib/tenant/context";
import { revalidatePath } from "next/cache";

type State = { error?: string; success?: string } | null;

function requireAdmin(role: string): State | null {
  if (role !== "admin" && role !== "super_admin") {
    return { error: "Admin access required" };
  }
  return null;
}

export async function updateCompany(
  _prev: State,
  formData: FormData
): Promise<State> {
  const ctx = await getServerTenantContext();
  if (!ctx) return { error: "Not authenticated" };
  const err = requireAdmin(ctx.role);
  if (err) return err;

  const name = (formData.get("name") as string)?.trim();
  const timezone = (formData.get("timezone") as string)?.trim();
  const currency = (formData.get("currency") as string)?.trim();

  if (!name) return { error: "Company name is required" };
  if (!timezone) return { error: "Timezone is required" };
  if (!currency) return { error: "Currency is required" };

  const { error } = await ctx.supabase
    .from("tenant")
    .update({ name, timezone, currency })
    .eq("id", ctx.tenantId);

  if (error) return { error: error.message };

  revalidatePath("/app/settings/company");
  return { success: "Company settings updated" };
}

export async function uploadLogo(
  _prev: State,
  formData: FormData
): Promise<State> {
  const ctx = await getServerTenantContext();
  if (!ctx) return { error: "Not authenticated" };
  const err = requireAdmin(ctx.role);
  if (err) return err;

  const file = formData.get("logo") as File;
  if (!file || file.size === 0) return { error: "No file selected" };
  if (file.size > 2 * 1024 * 1024) return { error: "Logo must be under 2 MB" };

  const allowed = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
  if (!allowed.includes(file.type)) {
    return { error: "Use PNG, JPEG, WebP, or SVG" };
  }

  const ext = file.name.split(".").pop() ?? "png";
  const path = `${ctx.tenantId}/logo.${ext}`;
  const bytes = await file.arrayBuffer();

  const { error: uploadError } = await ctx.supabase.storage
    .from("tenant-logos")
    .upload(path, bytes, { contentType: file.type, upsert: true });

  if (uploadError) return { error: uploadError.message };

  const {
    data: { publicUrl },
  } = ctx.supabase.storage.from("tenant-logos").getPublicUrl(path);

  await ctx.supabase
    .from("tenant")
    .update({ logo_url: publicUrl })
    .eq("id", ctx.tenantId);

  revalidatePath("/app/settings/company");
  return { success: "Logo updated" };
}
