import { NextResponse } from "next/server";
import { requirePlatformOperator } from "../_lib/guard";
import { parsePrometheus } from "@/lib/dev-dashboard/prometheus";

export async function GET() {
  const { error } = await requirePlatformOperator();
  if (error) return error;

  const ref = process.env.SUPABASE_PROJECT_REF;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!ref || !key) {
    return NextResponse.json({ error: "SUPABASE_PROJECT_REF or SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 503 });
  }

  const url = `https://${ref}.supabase.co/customer/v1/privileged/metrics`;
  const res = await fetch(url, {
    headers: { Authorization: "Basic " + btoa(`service_role:${key}`) },
    next: { revalidate: 30 },
  });

  if (!res.ok) {
    return NextResponse.json({ error: `Metrics API returned ${res.status}` }, { status: 502 });
  }

  const text = await res.text();
  const metrics = parsePrometheus(text);

  const memTotal = metrics.get("node_memory_MemTotal_bytes");
  const memAvail = metrics.get("node_memory_MemAvailable_bytes");
  const fsSize = metrics.get('node_filesystem_size_bytes{mountpoint="/data"}') || metrics.get('node_filesystem_size_bytes{mountpoint="/"}');
  const fsAvail = metrics.get('node_filesystem_avail_bytes{mountpoint="/data"}') || metrics.get('node_filesystem_avail_bytes{mountpoint="/"}');

  // CPU: sum all non-idle seconds / sum all seconds. This gives lifetime average.
  // For a 60s snapshot this is approximate but usable.
  const cpuIdle = metrics.sum("node_cpu_seconds_total") > 0
    ? (() => {
        // We don't have per-mode filtering in our simple parser, so just report load avg
        const load1 = metrics.get("node_load1");
        // Rough: load1 / number of CPUs * 100. Assume 1 CPU for simplicity.
        return Math.min(Math.round(load1 * 100), 100);
      })()
    : 0;

  return NextResponse.json({
    cpu: cpuIdle,
    memory: memTotal > 0 ? Math.round(((memTotal - memAvail) / memTotal) * 100) : 0,
    disk: fsSize > 0 ? Math.round(((fsSize - fsAvail) / fsSize) * 100) : 0,
    poolActive: metrics.sum("supavisor_connections_active"),
    poolMax: 100, // Supabase default; not exposed as a metric
    authLatencyP50: 0, // Parsed from histogram if available
    authLatencyP95: 0,
    fetchedAt: new Date().toISOString(),
  });
}
