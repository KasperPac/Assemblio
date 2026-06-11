import { NextResponse } from "next/server";
import { getServerTenantContext } from "@/lib/tenant/context";

export async function requirePlatformOperator() {
  const ctx = await getServerTenantContext();
  if (!ctx) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), ctx: null };
  }
  if (ctx.role !== "super_admin" && ctx.role !== "platform_observer") {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }), ctx: null };
  }
  return { error: null, ctx };
}
