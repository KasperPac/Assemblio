import { NextRequest, NextResponse } from "next/server";
import { getServerTenantContext } from "@/lib/tenant/context";
import {
  COMPONENT_IMAGE_BUCKET,
  componentImagePath,
} from "@/lib/storage/component-image";

/**
 * Serves a component image from the private component-images bucket.
 *
 * The bucket used to be public, which meant every uploaded image was readable
 * by anyone holding the URL — no tenant check, no expiry. Reads now come
 * through here: the caller's tenant is resolved server-side, the component is
 * confirmed to belong to it, and the response redirects to a signed URL that
 * expires in a minute. Same pattern as settings/invoices.
 *
 * Returns 401 unauthenticated, 404 when the component is not this tenant's or
 * has no image (deliberately not 403 — a 403 would confirm the id exists).
 */
const SIGNED_URL_TTL_SECONDS = 60;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ componentId: string }> }
) {
  const { componentId } = await params;

  const ctx = await getServerTenantContext();
  if (!ctx?.tenantId) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  // Scoped to the tenant: a component id from another workspace reads as
  // "not found" rather than being served.
  const { data: component } = await ctx.supabase
    .from("component")
    .select("id,image_url")
    .eq("id", componentId)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();

  if (!component?.image_url) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { data: signed, error } = await ctx.supabase.storage
    .from(COMPONENT_IMAGE_BUCKET)
    .createSignedUrl(componentImagePath(ctx.tenantId, componentId), SIGNED_URL_TTL_SECONDS);

  if (error || !signed?.signedUrl) {
    return new NextResponse("Not found", { status: 404 });
  }

  return NextResponse.redirect(signed.signedUrl, {
    // Private: the signed URL is per-caller and short-lived, so a shared cache
    // must not hold on to it.
    headers: { "Cache-Control": "private, max-age=30" },
  });
}
