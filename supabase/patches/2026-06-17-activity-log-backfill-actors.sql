-- Backfill actor metadata on historical activity_log rows created before the
-- audit-trail feature. The audit-columns migration defaulted actor_type to 'user'
-- on every pre-existing row (with a null actor_label), which made legacy Shopify
-- syncs and un-labelled rows all render as "Unknown user".
--
-- Idempotent: each statement only touches rows still missing a label.

-- 1. Legacy Shopify system events -> typed shopify actor.
UPDATE public.activity_log
SET actor_type = 'shopify', actor_label = 'Shopify'
WHERE actor_id IS NULL AND actor_label IS NULL
  AND (event LIKE 'SHOPIFY%' OR event LIKE 'shopify.%');

-- 2. Legacy Stripe billing events -> typed stripe actor.
UPDATE public.activity_log
SET actor_type = 'stripe', actor_label = 'Stripe billing'
WHERE actor_id IS NULL AND actor_label IS NULL
  AND event IN ('subscription.activated', 'subscription.updated');

-- 3. Rows that recorded an actor_id -> snapshot the real display name (fallback email).
UPDATE public.activity_log al
SET actor_label = COALESCE(p.full_name, u.email)
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE al.actor_id = u.id AND al.actor_label IS NULL;

-- Rows with no actor_id and no matching system event remain unlabelled and render
-- as "Unknown user" — they are genuinely unattributable (no actor was ever recorded).
