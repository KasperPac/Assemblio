"use server";

import { createSupabaseAdminClient } from "../../lib/supabase/admin";
import { sendEmail } from "../../lib/email/send";
import { BetaApplicationNotice } from "../../lib/email/templates/beta-application-notice";

export type ApplyState = { error?: string; message?: string };

const VALID_TEAM_SIZES = ["just-me", "2-10", "11-50", "51-200", "200+"] as const;
type TeamSize = (typeof VALID_TEAM_SIZES)[number];

function parseTeamSize(raw: string | null | undefined): TeamSize | null {
  if (!raw) return null;
  return (VALID_TEAM_SIZES as readonly string[]).includes(raw)
    ? (raw as TeamSize)
    : null;
}

export async function submitBetaApplication(
  _prev: ApplyState,
  formData: FormData
): Promise<ApplyState> {
  const fullName = formData.get("full_name")?.toString().trim() ?? "";
  const email = formData.get("email")?.toString().trim().toLowerCase() ?? "";
  const companyName = formData.get("company_name")?.toString().trim() ?? "";
  const teamSize = parseTeamSize(formData.get("team_size")?.toString());
  const useCase = formData.get("use_case")?.toString().trim() ?? "";
  const sourcePlan = formData.get("source_plan")?.toString().trim() || null;
  const sourceBilling =
    formData.get("source_billing")?.toString().trim() || null;

  if (!fullName) return { error: "Your name is required." };
  if (!email) return { error: "Work email is required." };
  if (!companyName) return { error: "Company name is required." };

  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("beta_applications")
    .insert({
      email,
      full_name: fullName,
      company_name: companyName,
      team_size: teamSize,
      use_case: useCase || null,
      source_plan: sourcePlan,
      source_billing: sourceBilling,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return {
        message:
          "You already have an application on file — we'll be in touch soon.",
      };
    }
    return { error: "Couldn't submit your application. Please try again." };
  }

  const notify = process.env.BETA_NOTIFY_EMAIL;
  if (notify) {
    await sendEmail({
      to: notify,
      subject: `New beta application: ${companyName}`,
      react: BetaApplicationNotice({
        fullName,
        email,
        companyName,
        teamSize,
        useCase: useCase || null,
        applicationId: data.id as string,
      }),
    });
  }

  return {
    message:
      "Thanks for applying. We'll review your application and email you when you're in.",
  };
}
