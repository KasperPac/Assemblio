import { NextResponse } from "next/server";
import { requirePlatformOperator } from "../_lib/guard";

export async function GET() {
  const { error } = await requirePlatformOperator();
  if (error) return error;

  const ref = process.env.SUPABASE_PROJECT_REF;
  const pat = process.env.SUPABASE_MANAGEMENT_PAT;
  if (!ref || !pat) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const headers = { Authorization: `Bearer ${pat}` };
  const [perfRes, secRes] = await Promise.all([
    fetch(`https://api.supabase.com/v1/projects/${ref}/advisors/performance`, { headers, next: { revalidate: 300 } }),
    fetch(`https://api.supabase.com/v1/projects/${ref}/advisors/security`, { headers, next: { revalidate: 300 } }),
  ]);

  const performance = perfRes.ok ? await perfRes.json() : { lints: [] };
  const security = secRes.ok ? await secRes.json() : { lints: [] };

  return NextResponse.json({
    performanceLints: performance.lints ?? [],
    securityLints: security.lints ?? [],
  });
}
