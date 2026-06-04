-- Track which Shopify app a store installed: the public "Manuva" app or the
-- unlisted "Manuva Fab" app. The embedded surface serves both at the same URL,
-- so it must emit the matching App Bridge api-key (and verify/exchange with the
-- matching credentials) for the app the merchant actually installed.
alter table public.shopify_store
  add column if not exists app_id text not null default 'public';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'shopify_store_app_id_chk'
  ) then
    alter table public.shopify_store
      add constraint shopify_store_app_id_chk
      check (app_id in ('public', 'unlisted'));
  end if;
end $$;
