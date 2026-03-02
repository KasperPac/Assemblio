"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type AuthState = {
  error?: string;
  message?: string;
};

function getRedirectPath(formData: FormData) {
  const redirectTo = formData.get("redirect")?.toString();
  if (!redirectTo) return "/app";
  if (!redirectTo.startsWith("/")) return "/app";
  return redirectTo;
}

export async function signIn(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = formData.get("email")?.toString();
  const password = formData.get("password")?.toString();

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  redirect(getRedirectPath(formData));
}

export async function signUp(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = formData.get("email")?.toString();
  const password = formData.get("password")?.toString();

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) {
    return { error: "Email domain is required." };
  }

  const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
  const admin = createSupabaseAdminClient();

  const { data: tenantDomain, error: tenantDomainError } = await admin
    .from("tenant_domain")
    .select("tenant_id")
    .eq("domain", domain)
    .single();

  if (tenantDomainError || !tenantDomain) {
    return {
      error:
        "No tenant found for this email domain. Contact your administrator.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  if (!data.user) {
    return {
      message:
        "Check your email to confirm your account, then sign in to continue.",
    };
  }

  const { error: profileError } = await admin
    .from("profiles")
    .insert({ id: data.user.id, tenant_id: tenantDomain.tenant_id, role: "member" });

  if (profileError) {
    return { error: profileError.message };
  }

  const { error: accessError } = await admin
    .from("profile_tenant_access")
    .insert({
      profile_id: data.user.id,
      tenant_id: tenantDomain.tenant_id,
      role: "member",
    });

  if (accessError) {
    return { error: accessError.message };
  }

  redirect(getRedirectPath(formData));
}
