import { describe, it, expect } from "vitest";
import { hasUnpublishedChanges, computeAffectedBoms } from "./affected";
import type { LinkedBomRow } from "./affected";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTemplate(overrides: {
  is_linked?: boolean;
  lines_updated_at?: string | null;
  last_published_at?: string | null;
}) {
  return {
    is_linked: overrides.is_linked ?? true,
    lines_updated_at: overrides.lines_updated_at ?? null,
    last_published_at: overrides.last_published_at ?? null,
  };
}

function makeRow(overrides: Partial<LinkedBomRow> & { id: string; variant_id: string }): LinkedBomRow {
  return {
    version: 1,
    status: "active",
    component_template_id: null,
    labor_template_id: null,
    variant: { id: overrides.variant_id, title: "Variant A", sku: "SKU-A" },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// hasUnpublishedChanges
// ---------------------------------------------------------------------------

describe("hasUnpublishedChanges", () => {
  it("returns false when not linked", () => {
    expect(
      hasUnpublishedChanges(
        makeTemplate({ is_linked: false, lines_updated_at: "2026-01-02T00:00:00Z" })
      )
    ).toBe(false);
  });

  it("returns false when linked but lines_updated_at is null", () => {
    expect(
      hasUnpublishedChanges(
        makeTemplate({ is_linked: true, lines_updated_at: null })
      )
    ).toBe(false);
  });

  it("returns true when linked, lines_updated_at set, last_published_at null", () => {
    expect(
      hasUnpublishedChanges(
        makeTemplate({ is_linked: true, lines_updated_at: "2026-01-02T00:00:00Z", last_published_at: null })
      )
    ).toBe(true);
  });

  it("returns true when lines_updated_at is after last_published_at", () => {
    expect(
      hasUnpublishedChanges(
        makeTemplate({
          is_linked: true,
          lines_updated_at: "2026-06-02T00:00:00Z",
          last_published_at: "2026-06-01T00:00:00Z",
        })
      )
    ).toBe(true);
  });

  it("returns false when lines_updated_at equals last_published_at", () => {
    const ts = "2026-06-01T12:00:00Z";
    expect(
      hasUnpublishedChanges(
        makeTemplate({ is_linked: true, lines_updated_at: ts, last_published_at: ts })
      )
    ).toBe(false);
  });

  it("returns false when lines_updated_at is before last_published_at", () => {
    expect(
      hasUnpublishedChanges(
        makeTemplate({
          is_linked: true,
          lines_updated_at: "2026-06-01T00:00:00Z",
          last_published_at: "2026-06-02T00:00:00Z",
        })
      )
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeAffectedBoms
// ---------------------------------------------------------------------------

describe("computeAffectedBoms", () => {
  it("returns empty array when no rows match the template id", () => {
    const row = makeRow({
      id: "bom-1",
      variant_id: "v-1",
      component_template_id: "tpl-other",
    });
    expect(computeAffectedBoms([row], "component_template_id", "tpl-target")).toEqual([]);
  });

  it("filters by templateField — labor_template_id does not match component_template_id", () => {
    const row = makeRow({
      id: "bom-1",
      variant_id: "v-1",
      labor_template_id: "tpl-1",
      component_template_id: null,
    });
    expect(computeAffectedBoms([row], "component_template_id", "tpl-1")).toEqual([]);
    expect(computeAffectedBoms([row], "labor_template_id", "tpl-1")).toHaveLength(1);
  });

  it("skips rows where variant is null", () => {
    const row = makeRow({
      id: "bom-1",
      variant_id: "v-1",
      component_template_id: "tpl-1",
      variant: null,
    });
    expect(computeAffectedBoms([row], "component_template_id", "tpl-1")).toEqual([]);
  });

  it("skips rows where variant array is empty", () => {
    const row = makeRow({
      id: "bom-2",
      variant_id: "v-2",
      component_template_id: "tpl-1",
      variant: [],
    });
    expect(computeAffectedBoms([row], "component_template_id", "tpl-1")).toEqual([]);
  });

  it("keeps only the highest version per variant_id", () => {
    const older = makeRow({
      id: "bom-old",
      variant_id: "v-1",
      version: 1,
      component_template_id: "tpl-1",
      variant: { id: "v-1", title: "Widget", sku: "W-1" },
    });
    const newer = makeRow({
      id: "bom-new",
      variant_id: "v-1",
      version: 2,
      component_template_id: "tpl-1",
      variant: { id: "v-1", title: "Widget", sku: "W-1" },
    });
    const result = computeAffectedBoms([older, newer], "component_template_id", "tpl-1");
    expect(result).toHaveLength(1);
    expect(result[0].bomId).toBe("bom-new");
    expect(result[0].version).toBe(2);
  });

  it("excludes the row when the highest version has status 'archived'", () => {
    const row = makeRow({
      id: "bom-1",
      variant_id: "v-1",
      version: 3,
      status: "archived",
      component_template_id: "tpl-1",
    });
    expect(computeAffectedBoms([row], "component_template_id", "tpl-1")).toEqual([]);
  });

  it("does not exclude a row just because an older archived version exists", () => {
    const archived = makeRow({
      id: "bom-archived",
      variant_id: "v-1",
      version: 1,
      status: "archived",
      component_template_id: "tpl-1",
      variant: { id: "v-1", title: "Widget", sku: null },
    });
    const active = makeRow({
      id: "bom-active",
      variant_id: "v-1",
      version: 2,
      status: "active",
      component_template_id: "tpl-1",
      variant: { id: "v-1", title: "Widget", sku: null },
    });
    const result = computeAffectedBoms([archived, active], "component_template_id", "tpl-1");
    expect(result).toHaveLength(1);
    expect(result[0].bomId).toBe("bom-active");
  });

  it("uses 'Untitled variant' when variant title is null", () => {
    const row = makeRow({
      id: "bom-1",
      variant_id: "v-1",
      component_template_id: "tpl-1",
      variant: { id: "v-1", title: null, sku: "SKU-1" },
    });
    const result = computeAffectedBoms([row], "component_template_id", "tpl-1");
    expect(result[0].variantTitle).toBe("Untitled variant");
    expect(result[0].variantSku).toBe("SKU-1");
  });

  it("unwraps variant from a single-element array", () => {
    const row = makeRow({
      id: "bom-1",
      variant_id: "v-1",
      component_template_id: "tpl-1",
      variant: [{ id: "v-1", title: "Array Variant", sku: "AV-1" }],
    });
    const result = computeAffectedBoms([row], "component_template_id", "tpl-1");
    expect(result[0].variantTitle).toBe("Array Variant");
  });

  it("sorts results by variantTitle ascending", () => {
    const rows: LinkedBomRow[] = [
      makeRow({
        id: "bom-c",
        variant_id: "v-c",
        component_template_id: "tpl-1",
        variant: { id: "v-c", title: "Zeta", sku: null },
      }),
      makeRow({
        id: "bom-a",
        variant_id: "v-a",
        component_template_id: "tpl-1",
        variant: { id: "v-a", title: "Alpha", sku: null },
      }),
      makeRow({
        id: "bom-b",
        variant_id: "v-b",
        component_template_id: "tpl-1",
        variant: { id: "v-b", title: "Mango", sku: null },
      }),
    ];
    const result = computeAffectedBoms(rows, "component_template_id", "tpl-1");
    expect(result.map((r) => r.variantTitle)).toEqual(["Alpha", "Mango", "Zeta"]);
  });

  it("maps all output fields correctly", () => {
    const row = makeRow({
      id: "bom-1",
      variant_id: "v-1",
      version: 5,
      status: "draft",
      component_template_id: "tpl-1",
      variant: { id: "v-1", title: "Widget Pro", sku: "WP-1" },
    });
    const result = computeAffectedBoms([row], "component_template_id", "tpl-1");
    expect(result[0]).toEqual({
      bomId: "bom-1",
      variantTitle: "Widget Pro",
      variantSku: "WP-1",
      version: 5,
      status: "draft",
    });
  });
});
