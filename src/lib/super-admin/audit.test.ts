import { describe, expect, it, vi } from "vitest";
import { logSuperAdminAction } from "./audit";

function makeSupabase(insertResult: { error: unknown } = { error: null }) {
  const insert = vi.fn().mockResolvedValue(insertResult);
  return {
    from: vi.fn().mockReturnValue({ insert }),
    _insert: insert,
  } as any;
}

describe("logSuperAdminAction", () => {
  it("inserts an audit row with required fields", async () => {
    const sb = makeSupabase();
    await logSuperAdminAction(sb, {
      actorId: "actor-1",
      action: "suspend_tenant",
      targetTenantId: "t-1",
      metadata: { reason: "non-payment" },
    });
    expect(sb.from).toHaveBeenCalledWith("super_admin_audit_log");
    expect(sb._insert).toHaveBeenCalledWith({
      actor_id: "actor-1",
      action: "suspend_tenant",
      target_tenant_id: "t-1",
      target_user_id: null,
      metadata: { reason: "non-payment" },
    });
  });

  it("defaults optional fields", async () => {
    const sb = makeSupabase();
    await logSuperAdminAction(sb, {
      actorId: "actor-1",
      action: "view_as",
      targetTenantId: "t-1",
    });
    expect(sb._insert).toHaveBeenCalledWith({
      actor_id: "actor-1",
      action: "view_as",
      target_tenant_id: "t-1",
      target_user_id: null,
      metadata: {},
    });
  });

  it("logs and swallows insert errors", async () => {
    const sb = makeSupabase({ error: { message: "rls denied" } });
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      logSuperAdminAction(sb, { actorId: "actor-1", action: "view_as" })
    ).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
