-- Activity log: attribute pre-audit "Unknown user" rows to their real actor.
--
-- Context: the audit-columns migration defaulted every pre-existing row to
-- actor_type = 'user' with a null actor_id/actor_label, so the People tab showed
-- them as "Unknown user". Inspection showed these are genuine human actions
-- (component CRUD, CSV import, stocktake, allocation runs) logged before the app
-- began capturing actor_id -- NOT automated/system noise.
--
-- For tenant 777e700f (Morgan Dowling's tenant) all such rows were that admin's
-- initial setup work, confirmed by the account owner. Attribute them to Morgan so
-- they render correctly in the People stream.
--
-- Scope: ONLY this tenant. Other tenants' un-attributed legacy rows are left
-- untouched (their actor is not known and cross-tenant attribution would corrupt
-- the audit trail).
--
-- Idempotent: re-running only touches rows still missing an actor_id.

UPDATE public.activity_log
SET actor_id    = 'f038e584-0636-49ae-bd45-e4b347df4fb4',
    actor_label = 'Morgan Dowling'
WHERE tenant_id = '777e700f-4e28-4dc1-b649-0ab63c335f42'
  AND actor_type = 'user'
  AND actor_id IS NULL;
