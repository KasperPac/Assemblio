import { describe, it, expect } from "vitest";
import { parsePrometheus } from "./prometheus";

const SAMPLE = `
# HELP node_cpu_seconds_total Seconds the CPUs spent in each mode.
# TYPE node_cpu_seconds_total counter
node_cpu_seconds_total{cpu="0",mode="idle"} 12345.67
node_cpu_seconds_total{cpu="0",mode="system"} 890.12
# HELP supavisor_connections_active Active connections
# TYPE supavisor_connections_active gauge
supavisor_connections_active{supabase_project_ref="abc",mode="transaction"} 42
supavisor_connections_active{supabase_project_ref="abc",mode="session"} 5
# HELP node_memory_MemTotal_bytes Total memory
# TYPE node_memory_MemTotal_bytes gauge
node_memory_MemTotal_bytes 1073741824
node_memory_MemAvailable_bytes 536870912
node_filesystem_size_bytes{mountpoint="/"} 10737418240
node_filesystem_avail_bytes{mountpoint="/"} 7516192768
`.trim();

describe("parsePrometheus", () => {
  it("extracts simple gauge values", () => {
    const result = parsePrometheus(SAMPLE);
    expect(result.get("node_memory_MemTotal_bytes")).toBe(1073741824);
    expect(result.get("node_memory_MemAvailable_bytes")).toBe(536870912);
  });

  it("extracts labeled metrics with label filter", () => {
    const result = parsePrometheus(SAMPLE);
    expect(result.get('supavisor_connections_active{mode="transaction"}')).toBe(42);
    expect(result.get('supavisor_connections_active{mode="session"}')).toBe(5);
  });

  it("sums values for a metric name across all labels", () => {
    const result = parsePrometheus(SAMPLE);
    expect(result.sum("supavisor_connections_active")).toBe(47);
  });

  it("returns 0 for missing metrics", () => {
    const result = parsePrometheus(SAMPLE);
    expect(result.get("nonexistent_metric")).toBe(0);
    expect(result.sum("nonexistent_metric")).toBe(0);
  });

  it("ignores comment and type lines", () => {
    const result = parsePrometheus("# HELP foo bar\n# TYPE foo gauge\nfoo 99");
    expect(result.get("foo")).toBe(99);
  });
});
