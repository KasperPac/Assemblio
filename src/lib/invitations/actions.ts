"use server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getServerTenantContext } from "@/lib/tenant/context";
import {
  assertWithinLimit,
  LimitExceededError,
} from "@/lib/subscription/limits";
import { generateToken } from "./tokens";
import { sendEmail } from "@/lib/email/send";
import { InvitationEmail } from "@/lib/email/templates/invitation";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const PG_UNIQUE_VIOLATION = "23505";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

function isAdmin(role: string): boolean {
  return role === "admin" || role === "super_admin";
}

async function dispatchInviteEmail(args: {
  to: string;
  tenantId: string;
  inviterEmail: string;
  token: string;
}) {
  const admin = createSupabaseAdminClient();
  const { data: tenantRow } = await admin
    .from("tenant")
    .select("name")
    .eq("id", args.tenantId)
    .maybeSingle();

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const acceptUrl = `${baseUrl}/accept-invite/${args.token}`;
  const tenantName = tenantRow?.name ?? "your team";

  return sendEmail({
    to: args.to,
    subject: `You're invited to join ${tenantName} on Manuva`,
    react: InvitationEmail({
      tenantName,
      inviterName: args.inviterEmail,
      acceptUrl,
    }),
  });
}

export async function inviteTeammate(input: {
  email: string;
  role: "admin" | "member";
}): Promise<ActionResult> {
  const ctx = await getServerTenantContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
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
      // Pending invite already exists — refresh the token + expiry.
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

  const { data: userResult } = await admin.auth.admin.getUserById(ctx.userId);
  const inviterEmail = userResult?.user?.email ?? "your teammate";

  const sendResult = await dispatchInviteEmail({
    to: email,
    tenantId: ctx.tenantId,
    inviterEmail,
    token: finalToken,
  });
  if (!sendResult.ok) {
    console.error(
      "[invitations] sendEmail failed for new invite",
      sendResult.error
    );
    // Invite row exists — the admin can resend from the UI.
    return { ok: false, error: `Couldn't send invite email: ${sendResult.error}` };
  }

  return { ok: true };
}

export async function revokeInvitation(
  invitationId: string
): Promise<ActionResult> {
  const ctx = await getServerTenantContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
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
  if (!isAdmin(ctx.role)) return { ok: false, error: "forbidden" };

  const admin = createSupabaseAdminClient();
  const { data: inv } = await admin
    .from("tenant_invitation")
    .select("email, token, accepted_at")
    .eq("id", invitationId)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  if (!inv) return { ok: false, error: "Invitation not found." };
  if (inv.accepted_at) return { ok: false, error: "Already accepted." };

  const newExpiry = new Date(Date.now() + SEVEN_DAYS_MS).toISOString();
  await admin
    .from("tenant_invitation")
    .update({ expires_at: newExpiry })
    .eq("id", invitationId);

  const { data: userResult } = await admin.auth.admin.getUserById(ctx.userId);
  const inviterEmail = userResult?.user?.email ?? "your teammate";

  const sendResult = await dispatchInviteEmail({
    to: inv.email,
    tenantId: ctx.tenantId,
    inviterEmail,
    token: inv.token,
  });
  if (!sendResult.ok) {
    return { ok: false, error: `Couldn't resend invite: ${sendResult.error}` };
  }

  return { ok: true };
}
