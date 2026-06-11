import { NextResponse } from "next/server";
import { requirePlatformOperator } from "../_lib/guard";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const { error } = await requirePlatformOperator();
  if (error) return error;

  const supabase = await createSupabaseServerClient();

  // pg_stat_statements is available via SQL. Use the rpc mechanism or raw query.
  // Supabase exposes it if the extension is enabled.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error: dbError } = await supabase.rpc("get_slow_queries" as any);

  if (dbError) {
    // Fallback: the RPC might not exist yet. Return empty.
    return NextResponse.json({
      slowQueries: [],
      note: `get_slow_queries unavailable: ${dbError.message}`,
    });
  }

  return NextResponse.json({
    slowQueries: ((data ?? []) as Array<{
      query: string;
      calls: number;
      mean_time: number;
      total_time: number;
    }>).map((row) => ({
      query: row.query,
      calls: Number(row.calls ?? 0),
      meanTime: Number(row.mean_time ?? 0),
      totalTime: Number(row.total_time ?? 0),
    })),
  });
}
