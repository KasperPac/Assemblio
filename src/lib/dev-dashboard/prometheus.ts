
export type MetricEntry = { name: string; labels: string; value: number };

export class PrometheusResult {
  private entries: MetricEntry[];

  constructor(entries: MetricEntry[]) {
    this.entries = entries;
  }

  /** Get a specific metric. For labeled metrics, pass the full key e.g. 'metric{label="val"}' */
  get(key: string): number {
    const braceIdx = key.indexOf("{");
    if (braceIdx === -1) {
      // No labels — find exact name with empty labels
      const entry = this.entries.find((e) => e.name === key && e.labels === "");
      return entry?.value ?? 0;
    }
    const name = key.slice(0, braceIdx);
    const labelFilter = key.slice(braceIdx + 1, key.lastIndexOf("}"));
    // Support partial label matching: all key=value pairs in query must appear in stored labels
    const filterPairs = labelFilter.split(",").map((s) => s.trim()).filter(Boolean);
    const entry = this.entries.find(
      (e) =>
        e.name === name &&
        filterPairs.every((pair) => e.labels.includes(pair))
    );
    return entry?.value ?? 0;
  }

  /** Sum all values for a metric name across all label combinations */
  sum(name: string): number {
    return this.entries
      .filter((e) => e.name === name)
      .reduce((acc, e) => acc + e.value, 0);
  }
}

export function parsePrometheus(text: string): PrometheusResult {
  const entries: MetricEntry[] = [];
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Format: metric_name{label="val",...} value  OR  metric_name value
    const braceIdx = trimmed.indexOf("{");
    let name: string;
    let labels: string;
    let rest: string;

    if (braceIdx !== -1) {
      name = trimmed.slice(0, braceIdx);
      const closeBrace = trimmed.indexOf("}");
      labels = trimmed.slice(braceIdx, closeBrace + 1);
      rest = trimmed.slice(closeBrace + 1).trim();
    } else {
      const spaceIdx = trimmed.indexOf(" ");
      if (spaceIdx === -1) continue;
      name = trimmed.slice(0, spaceIdx);
      labels = "";
      rest = trimmed.slice(spaceIdx + 1).trim();
    }

    // rest may have a timestamp after the value — take only the first token
    const valueStr = rest.split(/\s/)[0];
    const value = Number(valueStr);
    if (Number.isNaN(value)) continue;

    entries.push({ name, labels, value });
  }
  return new PrometheusResult(entries);
}
