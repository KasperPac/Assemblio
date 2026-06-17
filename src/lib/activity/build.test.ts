import { describe, expect, it } from "vitest";
import { buildActivityRow } from "./build";

describe("buildActivityRow", () => {
  it("populates entity_type and summary from the catalog", () => {
    const row = buildActivityRow({
      event: "component.created",
      tenantId: "t1",
      actorId: "u1",
      actorType: "user",
      actorLabel: "Kasper",
      entityId: "c1",
      metadata: { name: "Resistor" },
    });
    expect(row).toMatchObject({
      tenant_id: "t1",
      actor_id: "u1",
      actor_type: "user",
      actor_label: "Kasper",
      event: "component.created",
      entity_type: "component",
      entity_id: "c1",
      summary: "Created component Resistor",
      metadata: { name: "Resistor" },
    });
  });

  it("defaults entity_id to null and metadata to {}", () => {
    const row = buildActivityRow({
      event: "trash.emptied",
      tenantId: "t1",
      actorId: "u1",
      actorType: "user",
      actorLabel: null,
    });
    expect(row.entity_id).toBeNull();
    expect(row.entity_type).toBeNull();
    expect(row.metadata).toEqual({});
    expect(row.summary).toBe("Emptied trash");
  });

  it("supports null actor for system events", () => {
    const row = buildActivityRow({
      event: "shopify.sync_completed",
      tenantId: "t1",
      actorId: null,
      actorType: "shopify",
      actorLabel: "Shopify sync",
      metadata: { products: 12 },
    });
    expect(row.actor_id).toBeNull();
    expect(row.actor_type).toBe("shopify");
    expect(row.summary).toContain("12 products");
  });
});
