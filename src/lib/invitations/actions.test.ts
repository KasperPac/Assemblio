import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// Mock the Supabase clients and the email sender used by actions.ts.
const {
  sendEmailMock,
  adminFromMock,
  authGetUserByIdMock,
  ctxMock,
  assertWithinLimitMock,
} = vi.hoisted(() => ({
  sendEmailMock: vi.fn(),
  adminFromMock: vi.fn(),
  authGetUserByIdMock: vi.fn(),
  ctxMock: vi.fn(),
  assertWithinLimitMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/email/send", () => ({
  sendEmail: sendEmailMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: adminFromMock,
    auth: { admin: { getUserById: authGetUserByIdMock } },
  }),
}));

vi.mock("@/lib/tenant/context", () => ({
  getServerTenantContext: () => ctxMock(),
}));

vi.mock("@/lib/subscription/limits", () => ({
  assertWithinLimit: (...args: unknown[]) => assertWithinLimitMock(...args),
  LimitExceededError: class LimitExceededError extends Error {},
}));

vi.mock("./tokens", () => ({
  generateToken: () => "test-token-123",
}));

import { inviteTeammate, resendInvitation } from "./actions";

beforeEach(() => {
  sendEmailMock.mockReset();
  adminFromMock.mockReset();
  authGetUserByIdMock.mockReset();
  ctxMock.mockReset();
  assertWithinLimitMock.mockClear();

  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://manuva.app");

  ctxMock.mockResolvedValue({
    tenantId: "tenant-1",
    role: "admin",
    userId: "inviter-1",
  });

  sendEmailMock.mockResolvedValue({ ok: true, id: "msg_x" });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function chain(result: unknown) {
  // Minimal Supabase query-builder stub: every chain call returns `this`
  // until awaited, then resolves to `result`.
  const builder: Record<string, unknown> = {};
  for (const k of [
    "select",
    "eq",
    "ilike",
    "is",
    "insert",
    "update",
    "delete",
    "maybeSingle",
  ]) {
    builder[k] = vi.fn().mockReturnValue(builder);
  }
  // make it thenable
  (builder as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(result).then(resolve);
  return builder;
}

describe("inviteTeammate", () => {
  it("passes inviter full name and role to InvitationEmail", async () => {
    adminFromMock.mockImplementation((table: string) => {
      if (table === "tenant_invitation") return chain({ error: null });
      if (table === "tenant")
        return chain({ data: { name: "Acme Industries" }, error: null });
      if (table === "profiles")
        return chain({ data: { full_name: "Jane Doe" }, error: null });
      throw new Error(`unexpected table ${table}`);
    });

    const res = await inviteTeammate({
      email: "newhire@example.com",
      role: "admin",
    });

    expect(res).toEqual({ ok: true });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const callArgs = sendEmailMock.mock.calls[0][0];
    expect(callArgs.to).toBe("newhire@example.com");
    expect(callArgs.subject).toBe(
      "Jane Doe invited you to Acme Industries on Manuva"
    );
    const props = callArgs.react.props;
    expect(props.inviterName).toBe("Jane Doe");
    expect(props.tenantName).toBe("Acme Industries");
    expect(props.role).toBe("admin");
    expect(props.acceptUrl).toBe(
      "https://manuva.app/accept-invite/test-token-123"
    );
    expect(props.logoBaseUrl).toBe("https://manuva.app");
  });

  it("falls back to inviter email when full_name is missing", async () => {
    adminFromMock.mockImplementation((table: string) => {
      if (table === "tenant_invitation") return chain({ error: null });
      if (table === "tenant")
        return chain({ data: { name: "Acme" }, error: null });
      if (table === "profiles")
        return chain({ data: { full_name: null }, error: null });
      throw new Error(`unexpected table ${table}`);
    });
    authGetUserByIdMock.mockResolvedValue({
      data: { user: { email: "jane@example.com" } },
    });

    await inviteTeammate({ email: "newhire@example.com", role: "member" });

    const callArgs = sendEmailMock.mock.calls[0][0];
    expect(callArgs.react.props.inviterName).toBe("jane@example.com");
    expect(callArgs.subject).toBe(
      "jane@example.com invited you to Acme on Manuva"
    );
  });
});

describe("resendInvitation", () => {
  it("re-sends with the stored role", async () => {
    adminFromMock.mockImplementation((table: string) => {
      if (table === "tenant_invitation") {
        const b = chain({
          data: {
            email: "newhire@example.com",
            token: "stored-token",
            accepted_at: null,
            role: "admin",
          },
          error: null,
        });
        return b;
      }
      if (table === "tenant")
        return chain({ data: { name: "Acme" }, error: null });
      if (table === "profiles")
        return chain({ data: { full_name: "Jane Doe" }, error: null });
      throw new Error(`unexpected table ${table}`);
    });

    const res = await resendInvitation("invitation-id-1");

    expect(res).toEqual({ ok: true });
    const callArgs = sendEmailMock.mock.calls[0][0];
    expect(callArgs.react.props.role).toBe("admin");
    expect(callArgs.react.props.acceptUrl).toContain("stored-token");
  });
});
