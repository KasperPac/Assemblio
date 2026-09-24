/**
 * Shared shape for component images, so the writer (components/actions.ts) and
 * the signing route (/api/component-images/[componentId]) cannot drift apart.
 *
 * The bucket is private. Reads go through the route, which checks the caller's
 * tenant and hands back a short-lived signed URL — the same approach
 * settings/invoices already uses. Storing a getPublicUrl() string instead
 * would make every uploaded image world-readable to anyone with the URL.
 */
export const COMPONENT_IMAGE_BUCKET = "component-images";

/**
 * Storage key. The tenant id MUST be the first path segment: the
 * component_images_* RLS policies match on storage.foldername(name)[1].
 */
export function componentImagePath(tenantId: string, componentId: string): string {
  return `${tenantId}/${componentId}`;
}

/** What gets stored in component.image_url and rendered by the UI. */
export function componentImageSrc(componentId: string, version: number = Date.now()): string {
  return `/api/component-images/${componentId}?v=${version}`;
}
