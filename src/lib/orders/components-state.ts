// src/lib/orders/components-state.ts
export type ComponentsState =
  | { kind: "empty" }
  | { kind: "in-stock" }
  | {
      kind: "partial";
      readyLines: number;
      totalLines: number;
      earliestEta: Date | null;
    }
  | { kind: "awaiting"; earliestEta: Date }
  | { kind: "no-eta" }
  | { kind: "bom-needed" };

export type ComponentsLineInput = {
  bom: { id: string } | null;
  componentCount: number;
  shortComponents: Array<{ componentId: string; earliestEta: Date | null }>;
};

function earliest(dates: Array<Date | null>): Date | null {
  const nonNull = dates.filter((d): d is Date => d !== null);
  if (nonNull.length === 0) return null;
  return nonNull.reduce((a, b) => (a.getTime() < b.getTime() ? a : b));
}

export function deriveComponentsState(
  lines: ComponentsLineInput[]
): ComponentsState {
  if (lines.length === 0) return { kind: "empty" };

  const anyMissingBom = lines.some(
    (l) => l.bom === null || l.componentCount === 0
  );
  if (anyMissingBom) return { kind: "bom-needed" };

  const readyLines = lines.filter((l) => l.shortComponents.length === 0).length;
  const totalLines = lines.length;

  if (readyLines === totalLines) return { kind: "in-stock" };

  const shortEtas: Array<Date | null> = lines.flatMap((l) =>
    l.shortComponents.map((c) => c.earliestEta)
  );
  const earliestEta = earliest(shortEtas);

  if (readyLines > 0) {
    return { kind: "partial", readyLines, totalLines, earliestEta };
  }

  if (earliestEta) {
    return { kind: "awaiting", earliestEta };
  }
  return { kind: "no-eta" };
}
