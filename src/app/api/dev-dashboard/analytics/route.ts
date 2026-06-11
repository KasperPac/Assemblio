import { NextResponse } from "next/server";
import { requirePlatformOperator } from "../_lib/guard";
import { getSupabaseProjectRef } from "@/lib/dev-dashboard/config";

export async function GET() {
  const { error } = await requirePlatformOperator();
  if (error) return error;

  const ref = getSupabaseProjectRef();
  const pat = process.env.SUPABASE_MANAGEMENT_PAT;
  if (!ref || !pat) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const now = new Date();
  const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);

  const query = `
    SELECT
      count(*) as total_requests,
      countIf(status_code >= 500) as error_count
    FROM edge_logs
    WHERE timestamp >= '${fiveMinAgo.toISOString()}'
  `;

  const url = new URL(`https://api.supabase.com/v1/projects/${ref}/analytics/endpoints/logs.all`);
  url.searchParams.set("sql", query);
  url.searchParams.set("iso_timestamp_start", fiveMinAgo.toISOString());
  url.searchParams.set("iso_timestamp_end", now.toISOString());

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${pat}` },
    next: { revalidate: 30 },
  });

  if (!res.ok) {
    return NextResponse.json({ totalRequests: 0, errorCount: 0, reqsPerMin: 0, errorRate: 0 });
  }

  const data = await res.json();
  const row = data?.result?.[0] ?? { total_requests: 0, error_count: 0 };
  const total = Number(row.total_requests ?? 0);
  const errors = Number(row.error_count ?? 0);

  return NextResponse.json({
    totalRequests: total,
    errorCount: errors,
    reqsPerMin: Math.round(total / 5),
    errorRate: total > 0 ? Number(((errors / total) * 100).toFixed(2)) : 0,
  });
}
