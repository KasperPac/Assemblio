/**
 * Pure logic for publishing template changes to linked BOMs.
 * The merge rule: template wins for its own lines (regenerated fresh from the
 * current template), manually added lines (null provenance) are kept.
 */

export type WithProvenance<T> = T & { source_template_line_id: string | null };
export type TemplateSourceLine<T> = T & { id: string };

export function buildPublishedLines<T extends object>(
  oldLines: WithProvenance<T>[],
  templateLines: TemplateSourceLine<T>[]
): WithProvenance<T>[] {
  const regenerated = templateLines.map((line) => {
    const { id, ...fields } = line;
    return { ...(fields as T), source_template_line_id: id };
  });
  const manual = oldLines.filter((l) => l.source_template_line_id === null);
  return [...regenerated, ...manual];
}

export function inheritStatus(oldStatus: string): {
  newStatus: "active" | "draft";
  newIsActive: boolean;
  archiveOld: boolean;
} {
  if (oldStatus === "active") {
    return { newStatus: "active", newIsActive: true, archiveOld: true };
  }
  return { newStatus: "draft", newIsActive: false, archiveOld: false };
}
