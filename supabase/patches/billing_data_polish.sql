-- Polish to the billing/trial data model from code review.
--   1. Drop redundant idx_tenant_invitation_token (the UNIQUE constraint already
--      creates an index on `token`).
--   2. Add tenant_invitation.revoked_at + extend the pending-unique index so an
--      admin can re-invite an email after revoking the previous invite.
--   3. Add stripe_event_log.payload (jsonb) so events can be inspected/replayed.
--   4. Add tenant_subscription.cancel_at_period_end so we can mirror Stripe's
--      cancellation state and power "your plan ends on ..." UI.

drop index if exists public.idx_tenant_invitation_token;

alter table public.tenant_invitation
  add column if not exists revoked_at timestamptz;

drop index if exists public.tenant_invitation_pending_unique;
create unique index tenant_invitation_pending_unique
  on public.tenant_invitation (tenant_id, lower(email))
  where accepted_at is null and revoked_at is null;

alter table public.stripe_event_log
  add column if not exists payload jsonb;

alter table public.tenant_subscription
  add column if not exists cancel_at_period_end boolean not null default false;
