import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type Stripe from "stripe";

const STARTER_M = "price_starter_monthly_test";
const GROWTH_M = "price_growth_monthly_test";
const GROWTH_A = "price_growth_annual_test";
const PRO_A = "price_pro_annual_test";

// ---------- Fake Supabase admin ----------

interface RecordedCall {
  table: string;
  op: "insert" | "update";
  row: Record<string, unknown>;
  filters: Array<{ col: string; val: unknown }>;
  isFilters: Array<{ col: string; val: unknown }>;
}

function makeAdmin(insertResults: Record<string, { error: unknown } | undefined> = {}) {
  const calls: RecordedCall[] = [];

  function builder(table: string) {
    const filters: RecordedCall["filters"] = [];
    const isFilters: RecordedCall["isFilters"] = [];
    let row: Record<string, unknown> = {};
    let op: "insert" | "update" = "insert";

    const chain: {
      insert: (r: Record<string, unknown>) => unknown;
      update: (r: Record<string, unknown>) => unknown;
      eq: (col: string, val: unknown) => unknown;
      is: (col: string, val: unknown) => unknown;
      then: <T>(
        onF: (value: { error: unknown }) => T,
        onR?: (reason: unknown) => T
      ) => Promise<T>;
    } = {
      insert(r) {
        op = "insert";
        row = r;
        const result = insertResults[table] ?? { error: null };
        calls.push({ table, op, row, filters: [...filters], isFilters: [...isFilters] });
        return Promise.resolve(result);
      },
      update(r) {
        op = "update";
        row = r;
        return chain;
      },
      eq(col, val) {
        filters.push({ col, val });
        return chain;
      },
      is(col, val) {
        isFilters.push({ col, val });
        return chain;
      },
      then(onF, onR) {
        // For update chains: terminal await
        calls.push({ table, op, row, filters: [...filters], isFilters: [...isFilters] });
        return Promise.resolve({ error: null }).then(onF, onR);
      },
    };
    return chain;
  }

  return {
    from: vi.fn(builder),
    _calls: calls,
  } as unknown as {
    from: (table: string) => ReturnType<typeof builder>;
    _calls: RecordedCall[];
  };
}

// ---------- Fixtures ----------

function makeSubscription(
  overrides: Partial<Stripe.Subscription> & { priceId?: string } = {}
): Stripe.Subscription {
  const priceId = overrides.priceId ?? GROWTH_A;
  // The minimal shape our code reads. We cast to Stripe.Subscription.
  const sub = {
    id: overrides.id ?? "sub_test_123",
    current_period_end: 1_700_000_000,
    items: {
      data: [
        {
          price: { id: priceId },
          current_period_end: 1_700_000_000,
        },
      ],
    },
  };
  return sub as unknown as Stripe.Subscription;
}

function makeEvent<T extends Stripe.Event["type"]>(
  type: T,
  object: unknown,
  id = `evt_${type}_${Math.random().toString(36).slice(2)}`
): Stripe.Event {
  return {
    id,
    type,
    data: { object },
  } as unknown as Stripe.Event;
}

// ---------- Tests ----------

async function loadModule() {
  vi.resetModules();
  return await import("./webhook-events");
}

describe("processStripeEvent", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_PRICE_STARTER_MONTHLY", STARTER_M);
    vi.stubEnv("STRIPE_PRICE_STARTER_ANNUAL", "price_starter_annual");
    vi.stubEnv("STRIPE_PRICE_GROWTH_MONTHLY", GROWTH_M);
    vi.stubEnv("STRIPE_PRICE_GROWTH_ANNUAL", GROWTH_A);
    vi.stubEnv("STRIPE_PRICE_PRO_MONTHLY", "price_pro_monthly");
    vi.stubEnv("STRIPE_PRICE_PRO_ANNUAL", PRO_A);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("idempotency: duplicate event_id returns deduped without dispatching", async () => {
    const { processStripeEvent } = await loadModule();
    const admin = makeAdmin({
      stripe_event_log: { error: { code: "23505" } },
    });
    const event = makeEvent("invoice.payment_failed", { id: "in_1", subscription: "sub_1" });

    const result = await processStripeEvent(admin as never, event);

    expect(result.deduped).toBe(true);
    // Only the event-log insert was attempted; no update on tenant_subscription
    expect(admin._calls).toHaveLength(1);
    expect(admin._calls[0]).toMatchObject({ table: "stripe_event_log", op: "insert" });
  });

  it("idempotency: rethrows non-unique-violation insert errors", async () => {
    const { processStripeEvent } = await loadModule();
    const admin = makeAdmin({
      stripe_event_log: { error: { code: "08000", message: "boom" } },
    });
    const event = makeEvent("invoice.payment_failed", { id: "in_1", subscription: "sub_1" });

    await expect(processStripeEvent(admin as never, event)).rejects.toBeTruthy();
  });

  it("checkout.session.completed sets status=active, syncs tier/billing/period", async () => {
    const { processStripeEvent } = await loadModule();
    const admin = makeAdmin();

    const stripeSub = makeSubscription({ id: "sub_growth", priceId: GROWTH_A });
    const session = {
      id: "cs_test_1",
      subscription: stripeSub.id,
      metadata: { tenant_id: "tenant_1" },
    };
    const event = makeEvent("checkout.session.completed", session);

    await processStripeEvent(admin as never, event, {
      getSubscription: async (id) => {
        expect(id).toBe(stripeSub.id);
        return stripeSub;
      },
    });

    const tsUpdate = admin._calls.find(
      (c) => c.table === "tenant_subscription" && c.op === "update"
    );
    expect(tsUpdate).toBeDefined();
    expect(tsUpdate?.row).toMatchObject({
      status: "active",
      stripe_subscription_id: "sub_growth",
      selected_tier: "growth",
      billing_interval: "annual",
    });
    expect(tsUpdate?.row.current_period_end).toBeTypeOf("string");
    expect(tsUpdate?.filters).toEqual([{ col: "tenant_id", val: "tenant_1" }]);

    const activity = admin._calls.find((c) => c.table === "activity_log");
    expect(activity?.row).toMatchObject({
      tenant_id: "tenant_1",
      event: "subscription.activated",
      metadata: { tier: "growth", billing: "annual" },
    });
  });

  it("checkout.session.completed skips when tenant_id metadata missing", async () => {
    const { processStripeEvent } = await loadModule();
    const admin = makeAdmin();
    const event = makeEvent("checkout.session.completed", {
      id: "cs_x",
      subscription: "sub_x",
      metadata: {},
    });

    await processStripeEvent(admin as never, event, {
      getSubscription: async () => makeSubscription(),
    });

    // Only event_log insert ran.
    expect(admin._calls).toHaveLength(1);
    expect(admin._calls[0].table).toBe("stripe_event_log");
  });

  it("invoice.payment_failed flips to past_due by stripe_subscription_id", async () => {
    const { processStripeEvent } = await loadModule();
    const admin = makeAdmin();

    const event = makeEvent("invoice.payment_failed", {
      id: "in_failed",
      subscription: "sub_growth",
    });

    await processStripeEvent(admin as never, event);

    const update = admin._calls.find(
      (c) => c.table === "tenant_subscription" && c.op === "update"
    );
    expect(update?.row).toEqual({ status: "past_due" });
    expect(update?.filters).toEqual([
      { col: "stripe_subscription_id", val: "sub_growth" },
    ]);
  });

  it("invoice.payment_succeeded flips past_due → active (filtered by status)", async () => {
    const { processStripeEvent } = await loadModule();
    const admin = makeAdmin();

    const event = makeEvent("invoice.payment_succeeded", {
      id: "in_paid",
      subscription: "sub_growth",
    });

    await processStripeEvent(admin as never, event);

    const update = admin._calls.find(
      (c) => c.table === "tenant_subscription" && c.op === "update"
    );
    expect(update?.row).toEqual({ status: "active" });
    expect(update?.filters).toEqual([
      { col: "stripe_subscription_id", val: "sub_growth" },
      { col: "status", val: "past_due" },
    ]);
  });

  it("customer.subscription.updated re-syncs tier/billing", async () => {
    const { processStripeEvent } = await loadModule();
    const admin = makeAdmin();

    const stripeSub = makeSubscription({ id: "sub_upgrade", priceId: PRO_A });
    const event = makeEvent("customer.subscription.updated", stripeSub);

    await processStripeEvent(admin as never, event);

    const update = admin._calls.find(
      (c) => c.table === "tenant_subscription" && c.op === "update"
    );
    expect(update?.row).toMatchObject({
      selected_tier: "pro",
      billing_interval: "annual",
    });
    expect(update?.filters).toEqual([
      { col: "stripe_subscription_id", val: "sub_upgrade" },
    ]);
  });

  it("customer.subscription.deleted sets status=canceled", async () => {
    const { processStripeEvent } = await loadModule();
    const admin = makeAdmin();

    const stripeSub = makeSubscription({ id: "sub_gone" });
    const event = makeEvent("customer.subscription.deleted", stripeSub);

    await processStripeEvent(admin as never, event);

    const update = admin._calls.find(
      (c) => c.table === "tenant_subscription" && c.op === "update"
    );
    expect(update?.row).toEqual({ status: "canceled" });
    expect(update?.filters).toEqual([
      { col: "stripe_subscription_id", val: "sub_gone" },
    ]);
  });

  it("ignores unknown event types after logging idempotency row", async () => {
    const { processStripeEvent } = await loadModule();
    const admin = makeAdmin();

    const event = makeEvent("customer.created" as Stripe.Event["type"], {
      id: "cus_1",
    });

    const result = await processStripeEvent(admin as never, event);
    expect(result.deduped).toBe(false);
    // Only the event-log insert; no dispatch
    expect(admin._calls).toHaveLength(1);
    expect(admin._calls[0].table).toBe("stripe_event_log");
  });

  it("all tenant_subscription updates apply .is('manual_override_at', null)", async () => {
    const { processStripeEvent } = await loadModule();

    const eventTypes: Array<{ event: Stripe.Event; label: string }> = [
      {
        label: "customer.subscription.deleted",
        event: makeEvent(
          "customer.subscription.deleted",
          makeSubscription({ id: "sub_del" })
        ),
      },
      {
        label: "customer.subscription.updated",
        event: makeEvent(
          "customer.subscription.updated",
          makeSubscription({ id: "sub_upd", priceId: PRO_A })
        ),
      },
      {
        label: "invoice.payment_failed",
        event: makeEvent("invoice.payment_failed", {
          id: "in_fail",
          subscription: "sub_fail",
        }),
      },
      {
        label: "invoice.payment_succeeded",
        event: makeEvent("invoice.payment_succeeded", {
          id: "in_ok",
          subscription: "sub_ok",
        }),
      },
    ];

    for (const { label, event } of eventTypes) {
      const admin = makeAdmin();
      await processStripeEvent(admin as never, event);

      const tsUpdate = admin._calls.find(
        (c) => c.table === "tenant_subscription" && c.op === "update"
      );
      expect(tsUpdate, `${label}: expected a tenant_subscription update`).toBeDefined();
      expect(
        tsUpdate?.isFilters,
        `${label}: expected .is("manual_override_at", null)`
      ).toContainEqual({ col: "manual_override_at", val: null });
    }

    // Also cover checkout.session.completed
    const checkoutAdmin = makeAdmin();
    const stripeSub = makeSubscription({ id: "sub_co", priceId: GROWTH_M });
    const checkoutEvent = makeEvent("checkout.session.completed", {
      id: "cs_override_test",
      subscription: stripeSub.id,
      metadata: { tenant_id: "tenant_override" },
    });
    await processStripeEvent(checkoutAdmin as never, checkoutEvent, {
      getSubscription: async () => stripeSub,
    });
    const coUpdate = checkoutAdmin._calls.find(
      (c) => c.table === "tenant_subscription" && c.op === "update"
    );
    expect(coUpdate, "checkout.session.completed: expected a tenant_subscription update").toBeDefined();
    expect(
      coUpdate?.isFilters,
      "checkout.session.completed: expected .is('manual_override_at', null)"
    ).toContainEqual({ col: "manual_override_at", val: null });
  });
});
