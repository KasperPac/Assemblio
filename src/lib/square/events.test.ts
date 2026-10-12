import { describe, expect, it } from "vitest";
import { squareEventEnvelope } from "./events";
describe("Square durable event envelope", () => {
  it("retains routing identity without buyer data or raw credentials", () => {
    expect(squareEventEnvelope({ event_id: "event", merchant_id: "merchant", type: "order.updated", data: { customer: { email: "buyer@example.invalid" } }, authorization: "private-value" })).toEqual({ event_id: "event", merchant_id: "merchant", type: "order.updated" });
  });
  it("rejects missing event identity", () => expect(() => squareEventEnvelope({ type: "order.updated" })).toThrow());
});
