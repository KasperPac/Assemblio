import { describe, expect, it, vi } from "vitest";
import {
  classifyDaysLeft,
  runReminderSweep,
  type ReminderDeps,
  type ReminderKind,
} from "./reminders";

describe("classifyDaysLeft", () => {
  it("returns t_minus_3 only on exactly 3 days", () => {
    expect(classifyDaysLeft(3)).toBe("t_minus_3");
    expect(classifyDaysLeft(4)).toBeNull();
    expect(classifyDaysLeft(2)).toBeNull();
  });

  it("returns t_minus_1 only on exactly 1 day", () => {
    expect(classifyDaysLeft(1)).toBe("t_minus_1");
    expect(classifyDaysLeft(2)).toBeNull();
    expect(classifyDaysLeft(0)).toBe("expired"); // 0 falls into expired
  });

  it("returns expired on 0 and -1", () => {
    expect(classifyDaysLeft(0)).toBe("expired");
    expect(classifyDaysLeft(-1)).toBe("expired");
  });

  it("returns null beyond -1 (already handled in earlier sweep)", () => {
    expect(classifyDaysLeft(-2)).toBeNull();
    expect(classifyDaysLeft(-10)).toBeNull();
  });
});

// ----------------- runReminderSweep -----------------

interface QueryBuilderCall {
  table: string;
  op: "select" | "insert";
  body?: unknown;
  filters: Array<{ col: string; val: unknown }>;
  limit?: number;
}

interface BuilderState {
  table: string;
  op: "select" | "insert";
  body?: unknown;
  selectResult?: { data: unknown; error: unknown };
  insertResult?: { error: unknown };
  filters: Array<{ col: string; val: unknown }>;
  limit?: number;
  isMaybeSingle?: boolean;
}

function makeAdmin(setup: {
  trialingSubs: unknown[];
  insertErrorsByCall?: Array<{ error: unknown } | undefined>;
  ownerProfileByTenant?: Record<string, { id: string } | null>;
  emailByOwner?: Record<string, string | null>;
}) {
  const calls: QueryBuilderCall[] = [];
  let insertCallIndex = 0;

  function builder(table: string) {
    const state: BuilderState = { table, op: "select", filters: [] };

    const proxy: {
      select: (cols: string) => unknown;
      insert: (body: unknown) => unknown;
      eq: (col: string, val: unknown) => unknown;
      limit: (n: number) => unknown;
      maybeSingle: () => unknown;
      then: <T>(
        onF: (value: { data: unknown; error: unknown }) => T,
        onR?: (reason: unknown) => T
      ) => Promise<T>;
    } = {
      select() {
        state.op = "select";
        return proxy;
      },
      insert(body: unknown) {
        state.op = "insert";
        state.body = body;
        const insertResult =
          setup.insertErrorsByCall?.[insertCallIndex] ?? { error: null };
        insertCallIndex++;
        calls.push({
          table,
          op: "insert",
          body,
          filters: [...state.filters],
        });
        return Promise.resolve(insertResult);
      },
      eq(col: string, val: unknown) {
        state.filters.push({ col, val });
        return proxy;
      },
      limit(n: number) {
        state.limit = n;
        return proxy;
      },
      maybeSingle() {
        state.isMaybeSingle = true;
        let data: unknown = null;
        if (table === "profiles") {
          const tenantFilter = state.filters.find((f) => f.col === "tenant_id");
          const tenantId = tenantFilter?.val as string | undefined;
          data = tenantId
            ? setup.ownerProfileByTenant?.[tenantId] ?? null
            : null;
        }
        calls.push({
          table,
          op: "select",
          filters: [...state.filters],
          limit: state.limit,
        });
        return Promise.resolve({ data, error: null });
      },
      then(onF, onR) {
        // Terminal await on a select (no maybeSingle).
        let data: unknown = null;
        if (table === "tenant_subscription" && state.op === "select") {
          data = setup.trialingSubs;
        }
        calls.push({
          table,
          op: state.op,
          filters: [...state.filters],
          limit: state.limit,
        });
        return Promise.resolve({ data, error: null }).then(onF, onR);
      },
    };
    return proxy;
  }

  const admin = {
    from: vi.fn(builder),
    auth: {
      admin: {
        getUserById: vi.fn((id: string) => {
          const email = setup.emailByOwner?.[id] ?? null;
          return Promise.resolve({ data: { user: email ? { id, email } : null } });
        }),
      },
    },
  };

  return { admin, calls };
}

function makeTemplates(): Record<ReminderKind, ReminderDeps["templates"][ReminderKind]> {
  const build: ReminderDeps["templates"][ReminderKind] = ({ tenantName, to }) =>
    ({
      to,
      subject: `subject for ${tenantName}`,
      react: { type: "div" } as never,
    }) as never;
  return {
    t_minus_3: build,
    t_minus_1: build,
    expired: build,
  };
}

describe("runReminderSweep", () => {
  it("sends t_minus_3 email for a trial ending in 3 days", async () => {
    const now = new Date("2026-05-12T12:00:00Z");
    const trialEndsAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000 + 60_000).toISOString();

    const { admin, calls } = makeAdmin({
      trialingSubs: [
        {
          tenant_id: "tenant_a",
          trial_ends_at: trialEndsAt,
          tenant: { name: "Acme Mfg" },
        },
      ],
      ownerProfileByTenant: { tenant_a: { id: "user_a" } },
      emailByOwner: { user_a: "admin@acme.test" },
    });

    const send = vi.fn().mockResolvedValue({ ok: true, id: "msg_1" });

    const result = await runReminderSweep({
      admin: admin as never,
      send,
      now,
      templates: makeTemplates(),
    });

    expect(result.sent).toBe(1);
    expect(result.skipped).toBe(0);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "admin@acme.test",
        subject: "subject for Acme Mfg",
      })
    );

    const logInsert = calls.find(
      (c) => c.table === "trial_email_log" && c.op === "insert"
    );
    expect(logInsert?.body).toEqual({ tenant_id: "tenant_a", kind: "t_minus_3" });
  });

  it("skips when unique violation on trial_email_log (already sent)", async () => {
    const now = new Date("2026-05-12T12:00:00Z");
    const trialEndsAt = new Date(now.getTime() + 60_000).toISOString(); // ~0 days

    const { admin } = makeAdmin({
      trialingSubs: [
        {
          tenant_id: "tenant_b",
          trial_ends_at: trialEndsAt,
          tenant: { name: "Beta Co" },
        },
      ],
      insertErrorsByCall: [{ error: { code: "23505" } }],
      ownerProfileByTenant: { tenant_b: { id: "user_b" } },
      emailByOwner: { user_b: "admin@beta.test" },
    });

    const send = vi.fn();
    const result = await runReminderSweep({
      admin: admin as never,
      send,
      now,
      templates: makeTemplates(),
    });

    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(send).not.toHaveBeenCalled();
  });

  it("skips tenants where daysUntilEnd doesn't classify (e.g. 5 days out)", async () => {
    const now = new Date("2026-05-12T12:00:00Z");
    const trialEndsAt = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000).toISOString();

    const { admin } = makeAdmin({
      trialingSubs: [
        {
          tenant_id: "tenant_c",
          trial_ends_at: trialEndsAt,
          tenant: { name: "Gamma" },
        },
      ],
    });

    const send = vi.fn();
    const result = await runReminderSweep({
      admin: admin as never,
      send,
      now,
      templates: makeTemplates(),
    });

    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(send).not.toHaveBeenCalled();
  });

  it("skips when owner profile has no email", async () => {
    const now = new Date("2026-05-12T12:00:00Z");
    const trialEndsAt = new Date(now.getTime() + 24 * 60 * 60 * 1000 + 60_000).toISOString();

    const { admin } = makeAdmin({
      trialingSubs: [
        {
          tenant_id: "tenant_d",
          trial_ends_at: trialEndsAt,
          tenant: { name: "Delta" },
        },
      ],
      ownerProfileByTenant: { tenant_d: { id: "user_d" } },
      emailByOwner: { user_d: null },
    });

    const send = vi.fn();
    const result = await runReminderSweep({
      admin: admin as never,
      send,
      now,
      templates: makeTemplates(),
    });

    expect(result.skipped).toBe(1);
    expect(result.sent).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });
});
