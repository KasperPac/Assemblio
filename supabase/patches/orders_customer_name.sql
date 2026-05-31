-- A2 fix: store customer first name for use in notification templates.
-- Nullable; populated on next sync. Scrubbed by customers/redact GDPR handler.
ALTER TABLE public.orders ADD COLUMN customer_first_name text;
