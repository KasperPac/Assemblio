/** One reference check: how many rows in some table point at the record being deleted. */
export type BlockerCheck = {
  /** Human-facing category label, e.g. "on-hand stock". */
  label: string;
  /** Number of referencing rows. > 0 means this category blocks the delete. */
  count: number;
};

export type BlockerResult = {
  blocked: boolean;
  reason: string | null;
};

/** Join labels naturally: ["a"] -> "a", ["a","b"] -> "a and b", ["a","b","c"] -> "a, b and c". */
function joinLabels(labels: string[]): string {
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/**
 * Turn named reference counts into a block decision + message.
 * Pure: no I/O. The caller runs the queries and passes the counts in.
 */
export function evaluateBlockers(checks: BlockerCheck[]): BlockerResult {
  const hit = checks.filter((c) => c.count > 0).map((c) => c.label);
  if (hit.length === 0) return { blocked: false, reason: null };
  return {
    blocked: true,
    reason: `Can't delete \u2014 still referenced by ${joinLabels(hit)}. Move or clear it first.`,
  };
}
