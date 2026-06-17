-- Activity log: promote audit fields to first-class columns for a customer-facing
-- audit trail (actor type/label snapshot, entity reference, human summary) + indexes
-- for server-side paged filtering. Additive only; existing rows keep working.

ALTER TABLE public.activity_log
  ADD COLUMN IF NOT EXISTS actor_type  text NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS actor_label text,
  ADD COLUMN IF NOT EXISTS entity_type text,
  ADD COLUMN IF NOT EXISTS entity_id   uuid,
  ADD COLUMN IF NOT EXISTS summary     text;

CREATE INDEX IF NOT EXISTS activity_log_tenant_created_idx
  ON public.activity_log (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_log_tenant_event_idx
  ON public.activity_log (tenant_id, event);
CREATE INDEX IF NOT EXISTS activity_log_tenant_actor_idx
  ON public.activity_log (tenant_id, actor_id);
CREATE INDEX IF NOT EXISTS activity_log_tenant_entity_idx
  ON public.activity_log (tenant_id, entity_type, entity_id);
