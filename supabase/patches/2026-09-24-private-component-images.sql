-- ---------------------------------------------------------------------
-- MANUVA-23 — make the component-images bucket private.
--
-- The bucket was public = true. A public bucket serves objects from
-- /storage/v1/object/public/... WITHOUT evaluating RLS, so every uploaded
-- component image was readable by anyone holding the URL — no tenant check,
-- no expiry. The audit flagged this as M1 back in August; the enumeration
-- half was closed then (keys are <tenant_id>/<component_id>, so you cannot
-- guess them) but the bucket itself stayed public.
--
-- The component_images_{read,insert,update,delete} policies on
-- storage.objects are already correct and tenant-scoped — they match
-- storage.foldername(name)[1] against current_tenant_id(). Flipping the
-- bucket private is what makes them apply to reads.
--
-- Reads now go through GET /api/component-images/[componentId], which
-- resolves the caller's tenant, confirms the component belongs to it, and
-- redirects to a 60-second signed URL. component.image_url stores that route
-- path instead of a getPublicUrl() string.
--
-- Safe to run: the bucket holds 0 objects and 0 component rows carry an
-- image_url, so there is nothing to migrate. Doing it now, before any data
-- exists, is why this is a one-line change rather than a backfill.
--
-- Idempotent.
-- ---------------------------------------------------------------------

update storage.buckets
set public = false
where id = 'component-images';
