"use server";

import React from "react";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getServerTenantContext } from "@/lib/tenant/context";
import {
  assertWithinLimit,
  LimitExceededError,
} from "@/lib/subscription/limits";
import { generateToken } from "./tokens";
import { sendEmail } from "@/lib/email/send";
import {
  InvitationEmail,
  type InvitationEmailProps,
} from "@/lib/email/templates/invitation";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const PG_UNIQUE_VIOLATION = "23505";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

function isAdmin(role: string): boolean {
  return role === "admin" || role === "super_admin";
}

async function resolveInviterName(args: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  inviterUserId: string;
}): Promise<string> {
  const { data: profileRow } = await args.admin
    .from("profiles")
    .select("full_name")
    .eq("id", args.inviterUserId)
    .maybeSingle();

  if (profileRow?.full_name) return profileRow.full_name;

  const { data: userResult } = await args.admin.auth.admin.getUserById(
    args.inviterUserId
  );
  return userResult?.user?.email ?? "your teammate";
}

async function dispatchInviteEmail(args: {
  to: string;
  tenantId: string;
  inviterUserId: string;
  role: "admin" | "member";
  token: string;
}) {
  const admin = createSupabaseAdminClient();

  const { data: tenantRow } = await admin
    .from("tenant")
    .select("name")
    .eq("id", args.tenantId)
    .maybeSingle();

  const tenantName = tenantRow?.name ?? "your team";
  const inviterName = await resolveInviterName({
    admin,
    inviterUserId: args.inviterUserId,
  });

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const acceptUrl = `${baseUrl}/accept-invite/${args.token}`;

  const emailProps: InvitationEmailProps = {
    inviterName,
    tenantName,
    role: args.role,
    acceptUrl,
    logoBaseUrl: baseUrl,
  };

  return sendEmail({
    to: args.to,
    subject: `${inviterName} invited you to ${tenantName} on Manuva`,
    react: React.createElement(InvitationEmail, emailProps),
    fromName: `${inviterName} @ Manuva`,
  });
}

export async function inviteTeammate(input: {
  email: string;
  role: "admin" | "member";
}): Promise<ActionResult> {
  const ctx = await getServerTenantContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  if (!ctx.tenantId) return { ok: false, error: "unauthorized" }; // non-null: layout.tsx redirects tenant-less operators to /app/super-admin
  if (!isAdmin(ctx.role)) return { ok: false, error: "forbidden" };

  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  if (input.role !== "admin" && input.role !== "member") {
    return { ok: false, error: "Invalid role." };
  }

  const admin = createSupabaseAdminClient();

  try {
    await assertWithinLimit(admin, ctx.tenantId, "users");
  } catch (err) {
    if (err instanceof LimitExceededError) {
      return { ok: false, error: err.message };
    }
    throw err;
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + SEVEN_DAYS_MS).toISOString();

  let finalToken = token;

  const { error: insertError } = await admin
    .from("tenant_invitation")
    .insert({
      tenant_id: ctx.tenantId,
      email,
      role: input.role,
      token,
      invited_by: ctx.userId,
      expires_at: expiresAt,
    });

  if (insertError) {
    const code = (insertError as { code?: string }).code;
    if (code === PG_UNIQUE_VIOLATION) {
      const { data: refreshed, error: updateError } = await admin
        .from("tenant_invitation")
        .update({
          token,
          expires_at: expiresAt,
          role: input.role,
        })
        .eq("tenant_id", ctx.tenantId)
        .ilike("email", email)
        .is("accepted_at", null)
        .select("token")
        .maybeSingle();
      if (updateError || !refreshed) {
        return {
          ok: false,
          error: updateError?.message ?? "Failed to refresh invitation.",
        };
      }
      finalToken = refreshed.token;
    } else {
      return { ok: false, error: insertError.message };
    }
  }

  const sendResult = await dispatchInviteEmail({
    to: email,
    tenantId: ctx.tenantId,
    inviterUserId: ctx.userId,
    role: input.role,
    token: finalToken,
  });
  if (!sendResult.ok) {
    console.error(
      "[invitations] sendEmail failed for new invite",
      sendResult.error
    );
    return { ok: false, error: `Couldn't send invite email: ${sendResult.error}` };
  }

  return { ok: true };
}

export async function revokeInvitation(
  invitationId: string
): Promise<ActionResult> {
  const ctx = await getServerTenantContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  if (!ctx.tenantId) return { ok: false, error: "unauthorized" }; // non-null: layout.tsx redirects tenant-less operators to /app/super-admin
  if (!isAdmin(ctx.role)) return { ok: false, error: "forbidden" };

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("tenant_invitation")
    .delete()
    .eq("id", invitationId)
    .eq("tenant_id", ctx.tenantId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function resendInvitation(
  invitationId: string
): Promise<ActionResult> {
  const ctx = await getServerTenantContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  if (!ctx.tenantId) return { ok: false, error: "unauthorized" }; // non-null: layout.tsx redirects tenant-less operators to /app/super-admin
  if (!isAdmin(ctx.role)) return { ok: false, error: "forbidden" };

  const admin = createSupabaseAdminClient();
  const { data: inv } = await admin
    .from("tenant_invitation")
    .select("email, token, accepted_at, role")
    .eq("id", invitationId)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  if (!inv) return { ok: false, error: "Invitation not found." };
  if (inv.accepted_at) return { ok: false, error: "Already accepted." };

  const role = inv.role === "admin" ? "admin" : "member";

  const newExpiry = new Date(Date.now() + SEVEN_DAYS_MS).toISOString();
  await admin
    .from("tenant_invitation")
    .update({ expires_at: newExpiry })
    .eq("id", invitationId);

  const sendResult = await dispatchInviteEmail({
    to: inv.email,
    tenantId: ctx.tenantId,
    inviterUserId: ctx.userId,
    role,
    token: inv.token,
  });
  if (!sendResult.ok) {
    return { ok: false, error: `Couldn't resend invite: ${sendResult.error}` };
  }

  return { ok: true };
}
