"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { verifyPendingInstall } from "@/lib/shopify/pending-install";
import { registerRequiredWebhooks } from "@/lib/shopify/client";

export type ActionState = { error?: string };

async function getPendingInstall() {
  const cookieStore = await cookies();
  const raw = cookieStore.get("shopify_pending_install")?.value ?? "";
  return verifyPendingInstall(raw);
}

async function clearPendingCookie() {
  const cookieStore = await cookies();
  cookieStore.set("shopify_pending_install", "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

async function upsertStoreAndToken(
  tenantId: string,
  shop: string,
  accessToken: string,
  scopes: string
): Promise<string | null> {
  const admin = createSupabaseAdminClient();

  const { data: conflict } = await admin
    .from("shopify_store")
    .select("id")
    .eq("store_domain", shop)
    .neq("tenant_id", tenantId)
    .limit(1);
  if ((conflict ?? []).length > 0)
    return "This Shopify store is already linked to a different Manuva account.";

  const { data: store, error: storeError } = await admin
    .from("shopify_store")
    .upsert(
      { tenant_id: tenantId, store_domain: shop, status: "active" },
      { onConflict: "tenant_id,store_domain" }
    )
    .select("id")
    .single();
  if (storeError || !store) return "Failed to save Shopify store.";

  const { error: tokenError } = await admin.from("shopify_install_tokens").upsert(
    {
      tenant_id: tenantId,
      shopify_store_id: store.id,
      access_token: accessToken,
      scopes,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "shopify_store_id" }
  );
  if (tokenError) return "Failed to save access token.";

  return null;
}

export async function signInAndLink(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const email = formData.get("email")?.toString() ?? "";
  const password = formData.get("password")?.toString() ?? "";
  if (!email || !password) return { error: "Email and password are required." };

  const pending = await getPendingInstall();
  if (!pending) return { error: "Install session expired. Start again from Shopify." };

  const supabase = await createSupabaseServerClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) return { error: signInError.message };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in failed." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.tenant_id) return { error: "No workspace found for this account." };

  const linkError = await upsertStoreAndToken(
    profile.tenant_id,
    pending.shop,
    pending.accessToken,
    pending.scopes
  );
  if (linkError) return { error: linkError };

  await registerRequiredWebhooks(pending.shop, pending.accessToken).catch(() => {});
  await clearPendingCookie();

  redirect(`https://${pending.shop}/admin`);
}

export async function signUpAndLink(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const email = formData.get("email")?.toString() ?? "";
  const password = formData.get("password")?.toString() ?? "";
  const company = formData.get("company")?.toString() ?? "";
  if (!email || !password || !company) {
    return { error: "Company name, email, and password are required." };
  }

  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return { error: "Invalid email address." };

  const pending = await getPendingInstall();
  if (!pending) return { error: "Install session expired. Start again from Shopify." };

  const admin = createSupabaseAdminClient();

  const { data: existingDomain } = await admin
    .from("tenant_domain")
    .select("tenant_id")
    .eq("domain", domain)
    .maybeSingle();
  if (existingDomain) {
    return {
      error:
        "An account already exists for this email domain. Use Sign in instead.",
    };
  }

  // Track created resources for rollback on partial failure.
  let createdTenantId: string | null = null;
  let createdAuthUserId: string | null = null;

  async function rollback() {
    if (createdAuthUserId) {
      try { await admin.auth.admin.deleteUser(createdAuthUserId); } catch { /* ignore */ }
    }
    if (createdTenantId) {
      try { await admin.from("tenant_domain").delete().eq("tenant_id", createdTenantId); } catch { /* ignore */ }
      try { await admin.from("tenant").delete().eq("id", createdTenantId); } catch { /* ignore */ }
    }
  }

  const { data: tenant, error: tenantError } = await admin
    .from("tenant")
    .insert({ name: company })
    .select("id")
    .single();
  if (tenantError || !tenant) return { error: "Failed to create workspace." };
  createdTenantId = tenant.id;

  const { error: domainError } = await admin
    .from("tenant_domain")
    .insert({ tenant_id: tenant.id, domain });
  if (domainError) {
    await rollback();
    return { error: "Failed to register email domain." };
  }

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authError || !authData.user) {
    await rollback();
    return { error: authError?.message ?? "Failed to create user." };
  }
  createdAuthUserId = authData.user.id;

  const { error: profileError } = await admin.from("profiles").insert({
    id: authData.user.id,
    tenant_id: tenant.id,
    role: "admin",
    status: "active",
  });
  if (profileError) {
    await rollback();
    return { error: "Failed to create user profile." };
  }

  const { error: accessError } = await admin
    .from("profile_tenant_access")
    .insert({
      profile_id: authData.user.id,
      tenant_id: tenant.id,
      role: "admin",
    });
  if (accessError) {
    await rollback();
    return { error: "Failed to set up workspace access." };
  }

  const supabase = await createSupabaseServerClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (signInError) {
    return {
      error: "Account created but sign-in failed. Sign in manually to continue.",
    };
  }

  const linkError = await upsertStoreAndToken(
    tenant.id,
    pending.shop,
    pending.accessToken,
    pending.scopes
  );
  if (linkError) return { error: linkError };

  await registerRequiredWebhooks(pending.shop, pending.accessToken).catch(() => {});
  await clearPendingCookie();

  redirect(`https://${pending.shop}/admin`);
}
