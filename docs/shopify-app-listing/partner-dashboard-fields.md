# Partner Dashboard — App testing information

Paste-ready values for the listing form. Field limits are Shopify's.

## Test account

| Field | Value |
| --- | --- |
| Username | `reviewer@manuva.app` |
| Password | _(set via `scripts/set_user_password.mjs`; store in 1Password, never commit)_ |
| Demo store | `manuvatraining.myshopify.com` |

## Account description (255 char limit)

```
Demo store is already linked to this account. Test via Apps > Manuva in its admin: Sync now, then Open Manuva and sign in with these credentials. Manuva is standalone SaaS, so a store with no Manuva account shows "not connected" - that is expected.
```

248 characters.

## Testing instructions (2800 char limit)

See `partner-dashboard-testing-instructions.txt` — 2779 characters.

Two corrections were made to the version first drafted for this field, both
of which would have walked a reviewer into a dead end:

1. It told the reviewer to sign up at `manuva.app/signup`. That URL 404s —
   signup lives on `app.manuva.app` and is invite-only during beta, so a
   reviewer could not have created an account. Replaced with a note to use the
   supplied credentials.
2. Its INSTALL FLOW said that installing from the App Store and approving OAuth
   lands you in a working embedded surface. It does not: a Shopify-managed
   install creates no `shopify_store` row, so the surface returns
   `not-installed` and renders "This Shopify store isn't connected to a Manuva
   account yet". Stores are linked from inside Manuva. Rewritten as HOW LINKING
   WORKS, stating the message is expected before the reviewer can trip on it.

Also added: `--api-version 2026-01` to the GDPR trigger command (it fails
without one), the 401-on-bad-HMAC behaviour, and the no-protected-customer-data
statement that justifies the two-scope request.
