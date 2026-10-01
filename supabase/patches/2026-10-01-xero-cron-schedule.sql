-- ---------------------------------------------------------------------
-- MANUVA-34 - schedule the accounting outbox (every 5 min) and maintenance
-- (daily 17:07 UTC, staggered off the 5-minute outbox run so the two never fire together, about 03:00-04:00 AEST/AEDT). Vercel Hobby can't run crons
-- this often, so Postgres calls the app.
--
-- The Vault secret 'accounting_cron_secret' MUST equal the CRON_SECRET
-- environment variable set in Vercel, or every call gets a 401.
--
-- If a Vault secret is missing, the job's request fails; check
-- net._http_response for the status.
--
-- PREREQUISITE (run by a human in the SQL editor; values come from
-- 1Password and are NEVER written to a file):
--   select vault.create_secret('<CRON_SECRET value>', 'accounting_cron_secret');
--   select vault.create_secret('https://app.manuva.app', 'app_base_url');
--
-- Idempotent: cron.schedule replaces a job with the same name.
-- ---------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.schedule('accounting-outbox', '*/5 * * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url') || '/api/cron/accounting-outbox',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'accounting_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$job$);

select cron.schedule('accounting-maintenance', '7 17 * * *', $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url') || '/api/cron/accounting-maintenance',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'accounting_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$job$);
