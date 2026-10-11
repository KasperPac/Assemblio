# Agent history

Distilled on 2026-10-12 from the local Claude archive, in chronological batches.
Dates below are UTC transcript dates. This is historical evidence, not authorization to run
old migrations, publish, change inventory policy, or use historical test tenants.
Current instructions require Pac-Technologies for fixtures and testing.

## Evidence and coverage

The archive contains 128 relevant JSONL files: 10 main sessions and 118 delegated-agent sessions,
166,254,144 bytes, dated 2026-09-22 through 2026-10-02. Every selected JSONL was parsed line by line;
no malformed lines were found. The source index is in `codex-migration.md`.
The search checked all local project folders for a matching `cwd`, including path capitalization,
renames and worktrees. Five transcripts under the separate ManuvaMarketingBold project were excluded.
The promotional-video session is included because it started in Assemblio, but its outputs belong
to MarketingAndPromotion. Earlier May-July work is represented by repo docs, not surviving primary transcripts.

Only direct human requests/confirmations establish decisions. Generated continuation summaries,
tool results, teammate messages, and subagent requests are not human decisions. Agent reports below
are explicitly historical reports; their test counts/deployment claims were not re-run during migration.
No credentials, signed URLs, passwords, or raw conversation dumps are reproduced.

## Project timeline

| Date | Phase and reported change | Transcript |
| --- | --- | --- |
| 2026-05 to 2026-07 | Existing specs/plans describe module redesigns, invitations/trials, reporting, Shopify listing, scanning, templates and activity logging. These are document evidence only; the original sessions are absent. | `docs/superpowers/`, `docs/ADR/`, `docs/_audit/` |
| 2026-09-22 to 09-24 | Launch sprint: Shopify-first scope, one-month free access, browser PDF export, pricing/marketing promise cleanup, Shopify install/reviewer QA and submission; follow-up security/ledger/logging work. Agent reported 11 shipped items and four gated sprint follow-ups. | `a1d253ad-6663-4cbe-ac25-1de700def8a5.jsonl` |
| 2026-09-23 | User confirmed Shopify submission. Product positioning remained a standalone manufacturing SaaS that integrates with Shopify. | `a1d253ad-6663-4cbe-ac25-1de700def8a5.jsonl` |
| 2026-09-24 to 09-27 | Salon-led Square design, retail stock foundation, Shopify barcode ingestion, idempotent fulfilled-sale consumption; components filter rail and flat list. Agent reported PRs #26-28 merged. | `676b1d37-8d51-433d-9f32-536de77c50fe.jsonl`, `7f2572d0-1493-4103-a94d-25318f6bcf1a.jsonl` |
| 2026-09-27 | Supplier facet overflow fixed; suspected tenant leak investigated and reported as seeded Pac-Technologies suppliers rather than cross-tenant exposure. PR #29 awaited review at session end. | `1e4f8a2b-d6ec-4aa8-a5a1-0f35f2385159.jsonl` |
| 2026-09-29 | Promotional stop-motion video developed in the separate MarketingAndPromotion workspace; extended to one minute, with voiceover, physical-motion corrections and cost research. | `24482132-92be-4c9b-9862-085c623a82d7.jsonl` |
| 2026-09-30 | Worktree/branch cleanup, stale git lock removal and untracking old worktree/Playwright artifacts. Agent reported PR #30 merged and preserved tool/skill edits. | `0343c22b-4144-4c6c-a005-1fa9fe82732f.jsonl` |
| 2026-09-30 to 10-01 | Four-agent accounting audit and Xero supplier-bill MVP design; old May integration judged incomplete. Human approved scope, data model and implementation plan. | `1810ece4-6140-46a5-b412-7da6a655f704.jsonl` |
| 2026-10-01 to 10-02 | Xero rebuild, cleanup PR #31 and MVP PR #32; human approved production migration/testing. Agent reported invoice walkthrough and AUD-default PR #33. Public module manuals designed and begun. | `ed0eea85-4e8f-42d1-a80c-dbbde8ee9112.jsonl` |
| 2026-10-02 | Bold app header/domain-band design reviewed section by section; no implementation completion recorded in that session. | `ec384c48-6aa8-4644-bab1-05362170f3a5.jsonl` |
| 2026-10-02 | User requested all remaining manuals; writers/reviewers worked on local help branches. Main session ended before its visual check finished. | `ab59e6f4-d658-459d-8d62-fd0b2e034faa.jsonl` |

## Decisions & rationale

| Confirmed choice | Rationale / rejected alternative | Human source |
| --- | --- | --- |
| Shopify-only initial launch; public Amazon integration deferred if it takes weeks. | Revenue and launch speed took priority over waiting for Amazon approval. | `a1d253ad-6663-4cbe-ac25-1de700def8a5.jsonl`, 2026-09-22 07:15 |
| Keep PDF export, trim unsupported pricing promises. Polish browser printing instead of adding server PDF renderers. | The user chose option A after the agent explained existing print support versus ten new export routes and another renderer. | `a1d253ad-6663-4cbe-ac25-1de700def8a5.jsonl`, 2026-09-22 07:16-07:17 |
| One month free, superseding the initial three-month proposal; billing methods deferred for launch. | The human explicitly corrected trial length while approving the launch plan. | `a1d253ad-6663-4cbe-ac25-1de700def8a5.jsonl`, 2026-09-22 07:11 and 07:20 |
| Manuva is an app with a Shopify integration, not primarily a Shopify app. | The human corrected product positioning during listing discussion. | `a1d253ad-6663-4cbe-ac25-1de700def8a5.jsonl`, 2026-09-23 02:07 |
| Square POS became the next priority for a salon selling both online and in-store. | Real pilot demand created the cross-channel stock requirement. | `676b1d37-8d51-433d-9f32-536de77c50fe.jsonl`, 2026-09-24 22:44 |
| Approve retail/channel data model and mapping queue; stock consumption must be atomic/idempotent. Matching prioritizes SKU, then barcode, then manual resolution. | Approved in context of avoiding duplicate consumption and ambiguous/service catalog mappings. | `676b1d37-8d51-433d-9f32-536de77c50fe.jsonl`, 2026-09-25 02:16; `7f2572d0-1493-4103-a94d-25318f6bcf1a.jsonl`, 2026-09-25 02:39 |
| Approve additive, staged Square rollout and spec; Shopify stock write-back remains a separate gated follow-up. | The approved rollout kept the Shopify path under review stable. This does **not** override today's locked no-Shopify-writes policy. | `7f2572d0-1493-4103-a94d-25318f6bcf1a.jsonl`, 2026-09-25 02:41-02:42 |
| Add a left filter rail to Components, with a documented design-system exception, URL filters and mobile collapse. | Human chose option A over a top filter bar; flight-search facets were the requested interaction. | `7f2572d0-1493-4103-a94d-25318f6bcf1a.jsonl`, 2026-09-26 00:39-01:00 |
| Flatten Components into one table; retain a sortable Group column and group filters. | Human requested removal of group headers, then approved the proposed flat-list design. | `7f2572d0-1493-4103-a94d-25318f6bcf1a.jsonl`, 2026-09-27 07:31 and 22:56 |
| Xero MVP posts supplier invoices; corrections use void-and-re-enter, and bills arrive awaiting approval. | Human approved bill-first scope rather than sales invoices, COGS journals, credit notes or multi-currency in MVP. | `1810ece4-6140-46a5-b412-7da6a655f704.jsonl`, 2026-10-01 01:06 |
| Xero uses tenant-isolated invoice/outbox tables, protected credentials, signed state and a thin fetch client. | Human approved the data/security/client sections; rejected reusing the unreliable May core and broad SDK coupling. Token errors must be scrubbed. | `1810ece4-6140-46a5-b412-7da6a655f704.jsonl`, 2026-10-01 01:08-01:12 |
| Approve retry/error classification, allow-listed pilot, and rollout spec; use Supabase scheduling under the then-current Hobby deployment plan. | Human confirmed Hobby and approved the spec. This is historical plan selection, not a current platform constraint or a claim about today's plan. | `1810ece4-6140-46a5-b412-7da6a655f704.jsonl`, 2026-10-01 01:26-01:43 |
| Execute Xero with task implementers and independent reviews after a context reset. | Human preferred subagents and explicitly invoked that execution workflow. | `ed0eea85-4e8f-42d1-a80c-dbbde8ee9112.jsonl`, 2026-10-01 02:22; `ed0eea85-4e8f-42d1-a80c-dbbde8ee9112.jsonl`, 2026-10-01 02:23 |
| Change default currency to AUD. | Human corrected the New Zealand default during supplier-invoice testing. No Australian timezone choice was recorded. | `ed0eea85-4e8f-42d1-a80c-dbbde8ee9112.jsonl`, 2026-10-02 02:14 |
| Publish public manuals in the app repo at `/help`, with app styling and links from the marketing site. | Human selected public access and option A, avoiding cross-repo content drift and duplicate renderers. | `ed0eea85-4e8f-42d1-a80c-dbbde8ee9112.jsonl`, 2026-10-02 03:59-04:02 |
| Use one task-based manual per module, exact UI labels/errors, diagrams, roles, search, redirect compatibility and later screenshot capture. | Human approved each design section and spec. Independent review of manuals against code was part of the accepted build workflow. | `ed0eea85-4e8f-42d1-a80c-dbbde8ee9112.jsonl`, 2026-10-02 04:05-05:29 |
| Write all remaining manuals. | Explicit continuation request, beyond the completed platform and first manuals. | `ab59e6f4-d658-459d-8d62-fd0b2e034faa.jsonl`, 2026-10-02 11:50 |
| Add only bold band tokens initially; band the Floor Board; use real 90-day supplier delivery data for Reports. | Human chose narrow option A rather than repainting the whole app or inventing monthly production statistics. | `ec384c48-6aa8-4644-bab1-05362170f3a5.jsonl`, 2026-10-02 05:32, 05:36, 05:43 |
| Use explicit PageHeader band metadata and scoped token overrides with dialog reset; longest-prefix nav selection; banners above the topbar. | Human approved A and subsequent sections, avoiding an async pathname-dependent header and blanket button edits. Final per-page summary remained unconfirmed. | `ec384c48-6aa8-4644-bab1-05362170f3a5.jsonl`, 2026-10-02 06:13-06:43 |
| Promotional video: extend to one minute, smoother animation, believable physical movement and an all-lime refreshed office. | Human corrected excessive shaking, disappearing objects and implausible motion; chose the lime option. These are marketing-work choices, not product UI policy. | `24482132-92be-4c9b-9862-085c623a82d7.jsonl`, 2026-09-29 00:44-01:01 and 02:07-02:29 |


## Gotchas

- Supabase JS RPCs resolve `{data, error}`; they do not automatically throw. An ignored error made
  a headline feature report success. Always inspect RPC errors and test failure paths.
  Source: `a1d253ad-6663-4cbe-ac25-1de700def8a5.jsonl`, 2026-09-24.
- The September 4 handoff's reserved-drift explanation was reported wrong. Duplicate ledger rows
  were a reporting problem; blindly applying compensating stock changes could create negative stock.
  Re-investigate from balances, allocations and ledger evidence before repairs. Same source/date.
- Sale consumption and reservation release must not use a read/delete/write race. A replay returning zero
  consumption still needs to release any surviving reservations. Historical fixes used an atomic DB operation
  and a concurrent race test. Sources: `agent-aimpl-task2-20d72ef46ba71e6c.jsonl`,
  `agent-areview-task5-05e80d122855b6d3.jsonl`, 2026-09-25.
- Scratch Postgres needs Supabase role/auth/storage stubs and dependency ordering. Invalid non-hex UUID fixtures,
  and a test helper accepting missing rows, caused misleading checks. Keep scratch-only `yield_pct` prerequisites
  out of production migrations. Sources: `agent-aimpl-task1-6e74428a40042968.jsonl`,
  `agent-aimpl-task3-8caa0e88dbebfaa0.jsonl`, 2026-09-25.
- Shopify CLI commands require the repo working directory; running deploy from the Windows home directory
  hit the `Application Data` junction. Interactive account selection also fails in piped/noninteractive shells.
  The install route needs Shopify's signed install entrypoint; a bare URL is not a valid test.
  Source: `a1d253ad-6663-4cbe-ac25-1de700def8a5.jsonl`, 2026-09-22.
- Reviewer/demo BOMs must belong to the connected store's variants. The user identified 48 BOMs from an old store
  as unsuitable for the new demonstration. Same filename, 2026-09-22 23:27.
- Long facet labels require shrink/ellipsis behavior so counts stay inside the pane. Unfamiliar Pac-Technologies
  supplier fixtures were mistaken for a tenant leak; investigate before concluding exposure.
  Source: `1e4f8a2b-d6ec-4aa8-a5a1-0f35f2385159.jsonl`, 2026-09-27.
- Local ports can belong to other projects. Port 3000 was a pac-hub API; Manuva testing moved to 3100, then a visual
  production-build check proposed 3200. Do not stop unrelated servers. Source:
  `ed0eea85-4e8f-42d1-a80c-dbbde8ee9112.jsonl`, 2026-10-02;
  `ab59e6f4-d658-459d-8d62-fd0b2e034faa.jsonl`, 2026-10-02.
- An old `.git/index.lock` and tracked worktree/log artifacts blocked cleanup. Tool/skill configuration edits were
  explicitly left alone and still existed at migration start. Source:
  `0343c22b-4144-4c6c-a005-1fa9fe82732f.jsonl`, 2026-09-30.
- CRLF conversions caused large unrelated diffs; review line-ending changes separately. Sources:
  `7f2572d0-1493-4103-a94d-25318f6bcf1a.jsonl`, 2026-09-27;
  `agent-a379478fdc79fbd39.jsonl`, 2026-10-01.
- Pin AES-GCM authentication tags to 16 bytes; reject malformed IV/tag envelopes. Scrub Basic authorization
  and camelCase token keys too. Do not report an unreadable successful HTTP response as a successful bill creation.
  Sources: `agent-ac18137f2120cf1be.jsonl`, `agent-a90b4821df0a0ad73.jsonl`, 2026-10-01.
- Invoice rounding requires half-away-from-zero semantics, finite/date validation and tiny-number tests:
  exponent-string rounding introduced NaN, and negative zero needed normalization. Sources:
  `agent-a2fc6cbc80b4d5214.jsonl`, `agent-a929b0c26180ac362.jsonl`, 2026-10-01.

## Conventions

- Keep product positioning and marketing claims tied to shipped functionality; user corrected Shopify-first
  branding and unsupported features. The trial correction to one month supersedes three months and stale 14-day copy.
  Sources: `a1d253ad-6663-4cbe-ac25-1de700def8a5.jsonl`, 2026-09-22/23;
  `24482132-92be-4c9b-9862-085c623a82d7.jsonl`, 2026-09-29.
- Use the Manuva design system; for new interactions, document an explicit exception rather than quietly violating
  existing patterns. Use real metrics and accessible token combinations. Sources:
  `7f2572d0-1493-4103-a94d-25318f6bcf1a.jsonl`, 2026-09-26;
  `ec384c48-6aa8-4644-bab1-05362170f3a5.jsonl`, 2026-10-02.
- User repeatedly requested clear steps for Partner/reviewer setup and concrete descriptions of what would be visible
  in the live app. Distinguish local commit, pushed branch, merged main and deployed UI.
  Sources: `a1d253ad-6663-4cbe-ac25-1de700def8a5.jsonl`, 2026-09-22/23;
  `7f2572d0-1493-4103-a94d-25318f6bcf1a.jsonl`, 2026-09-26/27.
- User repeatedly requested push/merge directly after reviewed changes; those historical requests do not authorize
  publishing this migration, which explicitly prohibits pushing. Same September 25-27 source.
- Preserve a cold-start handoff before a context reset. Large Xero/help tasks used independently reviewed subagents
  when explicitly selected by the user. Sources: `a1d253ad-6663-4cbe-ac25-1de700def8a5.jsonl`, 2026-09-24;
  `1810ece4-6140-46a5-b412-7da6a655f704.jsonl`, 2026-10-01;
  `ed0eea85-4e8f-42d1-a80c-dbbde8ee9112.jsonl`, 2026-10-02.
- Maintain feature QA checklists and help manuals with behavior changes; use exact status/error text and role gates.
  Source: `ed0eea85-4e8f-42d1-a80c-dbbde8ee9112.jsonl`, 2026-10-02; retained `CLAUDE.md`.

## Open threads

Historical status only; check current branches, database and Monday before resuming:

- Launch follow-ups: Shopify inventory-write policy clarification (MANUVA-19), Sentry/DSN, clean-store GDPR
  positive-path QA, and operator-login/PIN checks. Amazon deferred. Duplicate ledger cleanup and avatar bucket
  privatization awaited a decision. Source: `a1d253ad-6663-4cbe-ac25-1de700def8a5.jsonl`, 2026-09-24.
- Square connector and stock-write loop were later phases; manufacturing BOM/retail sibling compatibility was
  MANUVA-29. The retail foundation alone must not be described as a complete Square integration.
  Source: `7f2572d0-1493-4103-a94d-25318f6bcf1a.jsonl`, 2026-09-25/26.
- Accounting rollout: Xero app registration, token/encryption variables, cron/Vault setup, Demo Company end-to-end
  verification and allow-listed pilot. Shopify token encryption was MANUVA-37. Old Auth/advisor findings
  included anonymous `handle_invited_user` exposure and disabled leaked-password protection.
  Source: `ed0eea85-4e8f-42d1-a80c-dbbde8ee9112.jsonl`, 2026-10-02.
- Xero deferred edge cases included contact-link failure stranding jobs, removed pilot tenants still seeing controls,
  reopened draft price recalculation, and void reconciliation after disconnect/reconnect. Source: same filename,
  2026-10-02 00:04. Research/spec files described there are not all present on this checkout; inspect PR #32 history.
- Timezone remained `Pacific/Auckland` in some workspaces; Sydney/Melbourne/Brisbane choice was unanswered.
  ACME walkthrough left voided test invoices and Zinc Plating cost 3.35 rather than 3.20. These are historical
  test-data facts, not permission to test outside Pac-Technologies. Same filename, 2026-10-02.
- Help: finish/review all module manuals, redirect old articles and app links (MANUVA-69), marketing Help link
  (MANUVA-70), approved demo seed and screenshots (MANUVA-71/72), and the final visual check. Migration started on
  local `feat/manuva-59-help-manuals-1`; it does not merge or ship that app work. Source:
  `ab59e6f4-d658-459d-8d62-fd0b2e034faa.jsonl`, 2026-10-02.
- Bold bands: final per-page design table needed confirmation; full graphite/navy/cobalt repaint was deferred.
  Source: `ec384c48-6aa8-4644-bab1-05362170f3a5.jsonl`, 2026-10-02.
- Video: Flow output was 720p; 1080p/upscaler choice and missing clips remained open in the external workspace.
  Source: `24482132-92be-4c9b-9862-085c623a82d7.jsonl`, 2026-09-29.

## Domain context

- Manufacturing operations are component-stock/BOM based; Shopify is a sales/catalog channel.
  The user explicitly positioned Manuva as standalone SaaS, with future channel/accounting integrations.
  Source: `a1d253ad-6663-4cbe-ac25-1de700def8a5.jsonl`, 2026-09-23 02:07.
- The Square pilot is a salon selling products online and in-store. Services/non-stock catalog entries must not
  consume component stock; ambiguous matches need an operator mapping queue. Sources:
  `676b1d37-8d51-433d-9f32-536de77c50fe.jsonl`, 2026-09-24;
  `7f2572d0-1493-4103-a94d-25318f6bcf1a.jsonl`, 2026-09-25.
- Supplier invoices reconcile receipts, PO/receipt price differences, tax and freight before posting to accounting.
  Xero owns accounting bill/payment state; Manuva remains inventory source of truth. Sources:
  `1810ece4-6140-46a5-b412-7da6a655f704.jsonl`, 2026-10-01; current `AGENTS.md`.
- Australian operations need AUD defaults; timezone still needed confirmation. Shopify review uses a separate
  reviewer workspace/store; the public-manual proposal used a fictitious Birchwood Goods Co. demo company.
  Source: `ed0eea85-4e8f-42d1-a80c-dbbde8ee9112.jsonl`, 2026-10-02.
- No live customers were reported at the October 2 test authorization; that is dated context and must not be
  assumed true in a future session. Same filename, 2026-10-02 00:20.

## Later delegated-review findings (second history batch)

The remaining delegated transcripts add evidence without changing human-confirmed decisions:

- Migration SQL must be UTF-8; a Windows-1252 dash in a header could break production apply.
  Sources: `agent-ae5504971393354c5.jsonl`, `agent-a4daec788ea15946c.jsonl`, 2026-10-01.
- Alert throttle updates need a conditional claim. Concurrent outbox/maintenance jobs caused duplicate
  emails until the claim and conditional restore were fixed and schedules staggered.
  Sources: `agent-a8f2810c8f9c3f0f4.jsonl`, `agent-ae255f8da97b34540.jsonl`, 2026-10-01.
- Help heading anchors must strip both straight and curly apostrophes consistently. Shell encoding
  corrupted the curly-apostrophe case; a Unicode escape restored it.
  Sources: `agent-a155be257cb34982e.jsonl`, `agent-a8f6b0587fa98b7f2.jsonl`, 2026-10-02.
- Manual reviewers found that copying/editing a BOM did not preserve labour/notification behavior
  as the draft claimed; fixes described the actual implementation. Movement-reference links used
  keys inconsistent with stored reference types, and were recorded as broken/plain text.
  Sources: `agent-aimpl-task-6-18dc2bc1d35be5e7.jsonl`,
  `agent-aimpl-task-7-1bd477d3691b846b.jsonl`, 2026-10-02.
- Products/BOM, Components/templates and Inventory/warehouse manuals had subsequent fix/re-review
  records. Stocktake still needed another wording pass at the archive's end because not every
  component is necessarily included in a session. These supplement the main session's incomplete
  status; none proves the help branches were merged or deployed.
  Sources: `agent-arereview-task-6-b2db46ba47dae381.jsonl`,
  `agent-arereview-task-7-db4370e280647d03.jsonl`,
  `agent-arereview-task-8-04a24cd45a98902f.jsonl`,
  `agent-arereview-task-9-1cce52e1d764bfb9.jsonl`, 2026-10-02.

Some subagents end on an intermediate text message while their full findings were sent through
teammate-message/tool channels. The main transcript and recorded review excerpts were reconciled;
an empty final text is not treated as success. Raw transcripts remain the primary evidence.
