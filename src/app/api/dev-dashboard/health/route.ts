import { NextResponse } from "next/server";
import { requirePlatformOperator } from "../_lib/guard";
import { getSupabaseProjectRef } from "@/lib/dev-dashboard/config";

export async function GET() {
  const { error } = await requirePlatformOperator();
  if (error) return error;

  const ref = getSupabaseProjectRef();
  const pat = process.env.SUPABASE_MANAGEMENT_PAT;
  if (!ref || !pat) {
    return NextResponse.json({ error: "Supabase project ref or management PAT not configured" }, { status: 503 });
  }

  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/health`, {
    headers: { Authorization: `Bearer ${pat}` },
    next: { revalidate: 60 },
  });

  if (!res.ok) {
    return NextResponse.json({ error: `Health API returned ${res.status}` }, { status: 502 });
  }

  const data = await res.json();
  return NextResponse.json(data);
}
