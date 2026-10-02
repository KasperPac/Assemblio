import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const sendEmail = vi.fn();
vi.mock("@/lib/email/send", () => ({ sendEmail: (a: unknown) => sendEmail(a) }));

import { emailAlertSender } from "./alerts";
import type { MaintenanceConnection } from "./maintenance";

const conn: MaintenanceConnection = {
  id: "c1", tenant_id: "t1", external_org_id: "o1", org_name: "Acme", status: "needs_reconnect",
  connected_by: "u1", last_refreshed_at: null, last_alert_at: null, updated_at: "2026-10-01T00:00:00Z",
};

type User = { data: { user: { email?: string } | null }; error: { message: string } | null };
function db(user: User, tenant: { data: unknown; error: { message: string } | null } = { data: { name: "Widgets" }, error: null }) {
  return {
    auth: { admin: { getUserById: async () => user } },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => tenant }) }) }),
  } as unknown as SupabaseClient;
}

beforeEach(() => {
  sendEmail.mockReset();
  sendEmail.mockResolvedValue({ ok: true, id: "e1" });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("emailAlertSender", () => {
  it("returns false and logs when the user lookup errors", async () => {
    const send = emailAlertSender(db({ data: { user: null }, error: { message: "lookup down" } }), "https://x");
    expect(await send(conn, "reconnect", 0)).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it("returns false and logs when the recipient has no email, without logging an address", async () => {
    const send = emailAlertSender(db({ data: { user: {} }, error: null }), "https://x");
    expect(await send(conn, "reconnect", 0)).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith("[xero] alert recipient has no email", "c1");
  });

  it("sends, and falls back to a generic workspace name when the tenant read errors", async () => {
    const send = emailAlertSender(
      db({ data: { user: { email: "a@example.com" } }, error: null }, { data: null, error: { message: "rls" } }),
      "https://x"
    );
    expect(await send(conn, "failed", 1)).toBe(true);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "a@example.com" }));
    expect(console.error).toHaveBeenCalled();
  });
});
