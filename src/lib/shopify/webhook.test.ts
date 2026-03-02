import { describe, expect, it } from "vitest";
import {
  hasWebhookIdentityHeaders,
  isDuplicateWebhookEvent,
  parseWebhookPayload,
  isSyncTopic,
  shouldRunStoreSync,
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
