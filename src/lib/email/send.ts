import { Resend } from "resend";
import type { ReactElement } from "react";

let cached: Resend | null = null;

function client(): Resend {
  if (cached) return cached;
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY not set");
  cached = new Resend(key);
  return cached;
}

export interface SendArgs {
  to: string;
  subject: string;
  react: ReactElement;
}

export type SendResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function sendEmail(args: SendArgs): Promise<SendResult> {
  const from = process.env.RESEND_FROM;
  if (!from) return { ok: false, error: "RESEND_FROM not set" };

  let resend: Resend;
  try {
    resend = client();
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }

  try {
    const res = await resend.emails.send({
      from,
      to: args.to,
      subject: args.subject,
      react: args.react,
    });
    if (res.error) return { ok: false, error: res.error.message };
    return { ok: true, id: res.data?.id ?? "" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// Test-only hook to reset the memoised client between tests.
export function __resetEmailClient() {
  cached = null;
}
