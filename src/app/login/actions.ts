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
