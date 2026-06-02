/**
 * Levenshtein edit distance between two strings.
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Find the best matching candidate for `query` using case-insensitive Levenshtein distance.
 * Returns the closest candidate (original casing preserved) when distance ≤ 2 AND
 * distance / max(len(query), len(candidate)) ≤ 0.30. Returns null otherwise.
 */
export function bestMatch(query: string, candidates: string[]): string | null {
  const q = query.toLowerCase();
  let best: { candidate: string; dist: number } | null = null;

  for (const candidate of candidates) {
    const c = candidate.toLowerCase();
    const dist = levenshtein(q, c);
    const maxLen = Math.max(q.length, c.length);
    if (maxLen > 0 && dist <= 2 && dist / maxLen <= 0.3) {
      if (best === null || dist < best.dist) {
        best = { candidate, dist };
      }
    }
  }

  return best ? best.candidate : null;
}
