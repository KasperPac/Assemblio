import { describe, expect, it } from "vitest";
import {
  hasWebhookIdentityHeaders,
  isDuplicateWebhookEvent,
  parseWebhookPayload,
  isSyncTopic,
  shouldRunStoreSync,
  shouldDebounceSync,
  shouldLogSyncActivity,
  QUIET_SYNC_DEBOUNCE_MS,
} from "./webhook";

describe("shopify webhook helpers", () => {
  it("marks missing upsert row as duplicate", () => {
    expect(isDuplicateWebhookEvent(null)).toBe(true);
    expect(isDuplicateWebhookEvent({ id: "evt_1" })).toBe(false);
  });

  it("accepts only sync topics", () => {
    expect(isSyncTopic("orders/create")).toBe(true);
    expect(isSyncTopic("orders/updated")).toBe(true);
    expect(isSyncTopic("orders/cancelled")).toBe(true);
    expect(isSyncTopic("orders/fulfilled")).toBe(true);
    expect(isSyncTopic("products/create")).toBe(true);
    expect(isSyncTopic("products/update")).toBe(true);
    expect(isSyncTopic("app/uninstalled")).toBe(false);
  });

  it("requires topic, shop, and webhook id headers", () => {
    expect(hasWebhookIdentityHeaders("orders/create", "x.myshopify.com", "abc")).toBe(true);
    expect(hasWebhookIdentityHeaders("", "x.myshopify.com", "abc")).toBe(false);
    expect(hasWebhookIdentityHeaders("orders/create", "", "abc")).toBe(false);
    expect(hasWebhookIdentityHeaders("orders/create", "x.myshopify.com", "")).toBe(false);
  });

  it("parses payload safely", () => {
    expect(parseWebhookPayload("")).toEqual({});
    expect(parseWebhookPayload('{"id":1}')).toEqual({ id: 1 });
    expect(parseWebhookPayload("{bad-json")).toBeNull();
  });

  it("runs sync only when topic, store, tenant, and token are available", () => {
    expect(
      shouldRunStoreSync({
        topic: "orders/create",
        storeId: "store_1",
        tenantId: "tenant_1",
        accessToken: "token_1",
      })
    ).toBe(true);

    expect(
      shouldRunStoreSync({
        topic: "orders/create",
        storeId: "store_1",
        tenantId: "tenant_1",
        accessToken: "",
      })
    ).toBe(false);

    expect(
      shouldRunStoreSync({
        topic: "app/uninstalled",
        storeId: "store_1",
        tenantId: "tenant_1",
        accessToken: "token_1",
      })
    ).toBe(false);
  });
});

describe("sync-noise controls", () => {
  const T0 = new Date("2026-09-02T10:00:00.000Z");
  const at = (msAfter: number) => new Date(T0.getTime() + msAfter);

  it("logs an activity row for lifecycle topics", () => {
    for (const topic of [
      "orders/create",
      "orders/cancelled",
      "orders/fulfilled",
      "products/create",
    ]) {
      expect(shouldLogSyncActivity(topic), topic).toBe(true);
    }
  });

  it("stays quiet for the chatty topics that caused the log noise", () => {
    expect(shouldLogSyncActivity("orders/updated")).toBe(false);
    expect(shouldLogSyncActivity("products/update")).toBe(false);
  });

  it("never debounces a lifecycle topic, however recent the last sync", () => {
    expect(
      shouldDebounceSync({
        topic: "orders/create",
        lastSyncedAt: T0.toISOString(),
        now: at(1),
      })
    ).toBe(false);
  });

  it("collapses a burst of orders/updated into one sync", () => {
    // Shopify fires orders/updated repeatedly through an order's lifecycle.
    expect(
      shouldDebounceSync({ topic: "orders/updated", lastSyncedAt: T0, now: at(1_000) })
    ).toBe(true);
    expect(
      shouldDebounceSync({
        topic: "orders/updated",
        lastSyncedAt: T0,
        now: at(QUIET_SYNC_DEBOUNCE_MS - 1),
      })
    ).toBe(true);
  });

  it("syncs again once the window has passed", () => {
    expect(
      shouldDebounceSync({
        topic: "orders/updated",
        lastSyncedAt: T0,
        now: at(QUIET_SYNC_DEBOUNCE_MS),
      })
    ).toBe(false);
  });

  it("syncs when the store has never synced", () => {
    expect(shouldDebounceSync({ topic: "orders/updated", lastSyncedAt: null })).toBe(false);
    expect(shouldDebounceSync({ topic: "orders/updated", lastSyncedAt: undefined })).toBe(false);
  });

  it("does not wedge syncing off on a bad or future timestamp", () => {
    expect(
      shouldDebounceSync({ topic: "orders/updated", lastSyncedAt: "not a date", now: T0 })
    ).toBe(false);
    expect(
      shouldDebounceSync({ topic: "orders/updated", lastSyncedAt: at(60_000), now: T0 })
    ).toBe(false);
  });
});
