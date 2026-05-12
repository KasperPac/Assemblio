# Invitation Email Redesign — Design Spec

**Date:** 2026-05-12
**Status:** Approved, ready for implementation plan
**Scope:** Redesign the team invitation email (`src/lib/email/templates/invitation.tsx`) and extract a reusable branded shell that the three trial-related email templates can adopt in a later pass.

## Problem

The current invitation email is functional but unbranded:

- Generic system-font stack, no Manuva typography
- Hard-coded indigo `#6366F1` button only — no logo, header, or footer
- Inviter shown as raw email address (no `profiles.full_name` lookup)
- No role mention (admin vs member)
- Renders as plain `<div>`s — degrades in Outlook desktop (Word rendering engine)

Three sibling templates (`trial-reminder-1.tsx`, `trial-reminder-3.tsx`, `trial-expired.tsx`) share the same plain styling. Any branded shell built here should be reusable for those conversions later.

## Goals

1. Invitation email matches the Manuva brand (Daylight theme palette, Inter font, color SVG logo).
2. Inviter is shown by full name (fallback to email) and the invitee's role is surfaced in body + subject.
3. A shared, brand-aligned email shell exists and is used by `invitation.tsx`. Trial emails are untouched in this pass but can adopt the shell later with minimal change.
4. Rendering is reliable across Gmail (web + mobile), Apple Mail, and Outlook desktop.

## Non-goals

- Converting the three trial emails to the new shell. Out of scope for this pass — only the foundation is laid.
- Adding email-rendering snapshot tests. The repo has no email-rendering tests today; introducing them is its own decision.
- Localization. Copy stays English-only.
- Dark-mode-specific email styles. We rely on the Daylight palette; clients that auto-invert will do so on their own.

## Approach

### Visual structure (approach A — light card)

```
┌────────────────────────────────────────┐
│  [Manuva color logo, ~120px wide]      │  top-left header, padded
│                                        │
│  You're invited to join <Tenant>       │  H1, 22px, semibold, ink-strong
│                                        │
│  <Inviter> invited you to join         │  body, 15px, ink-strong
│  <Tenant> on Manuva as a <role>.       │
│                                        │
│  Manuva is the operations workspace    │  body
│  for manufacturers — inventory,        │
│  BOMs, production, and purchasing      │
│  in one place.                         │
│                                        │
│  [ Accept invitation → ]               │  brand-1 button
│                                        │
│  This invite expires in 7 days. If     │  small, ink-muted
│  the button doesn't work, paste this   │
│  link in your browser:                 │
│  https://...                           │
└────────────────────────────────────────┘
  Manuva · manuva.app                       footer (outside card)
  If you weren't expecting this, you can
  safely ignore this email.
```

- Card: 560px max-width, centered, white background, 1px stroke `rgba(0,0,0,0.08)`, 32px inner padding, 12px corner radius.
- Page background: `#F8F7F5` (Daylight `--bg-page`).
- Button: brand `#6366F1`, white text, 600 weight, 10px × 18px padding, 8px radius.

### Copy

| Slot       | Text                                                                |
|------------|---------------------------------------------------------------------|
| Subject    | `<Inviter> invited you to <Tenant> on Manuva`                       |
| H1         | `You're invited to join <Tenant>`                                   |
| Body 1     | `<Inviter> invited you to join <Tenant> on Manuva as a <role>.`     |
| Body 2     | `Manuva is the operations workspace for manufacturers — inventory, BOMs, production, and purchasing in one place.` |
| CTA        | `Accept invitation →`                                               |
| Fine print | `This invite expires in 7 days. If the button doesn't work, paste this link in your browser:` + plain link |
| Footer L1  | `Manuva · manuva.app`                                               |
| Footer L2  | `If you weren't expecting this, you can safely ignore this email.`  |

Inviter name resolution: lookup `profiles.full_name` for `ctx.userId` in `dispatchInviteEmail`; fall back to the user's email if null. Role is passed through from the `inviteTeammate` action (`"admin"` or `"member"`).

### Architecture

**New files:**

- `src/lib/email/components/tokens.ts` — plain constants matching the Daylight palette in `colors_and_type.css` (no CSS vars in email):
  ```ts
  export const COLOR = {
    bgPage: "#F8F7F5",
    bgCard: "#FFFFFF",
    inkStrong: "#1A1814",
    inkMuted: "#6B6560",
    inkFaint: "#9B9590",
    brand: "#6366F1",
    inkOnBrand: "#FFFFFF",
    stroke: "rgba(0, 0, 0, 0.08)",
  };
  export const FONT = {
    body: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  };
  ```

- `src/lib/email/components/email-shell.tsx` — `<EmailShell>{children}</EmailShell>` renders:
  - `<Html>` + `<Head>` (with `@react-email/components`)
  - `<Body>` with page background + base font
  - Centered `<Container>` (max 560px)
  - White card `<Section>` containing the logo header (`<Img>` with the Manuva color logo) and the `{children}` slot
  - Footer `<Section>` below the card with the muted "Manuva · manuva.app" + safe-to-ignore line

- `src/lib/email/components/brand-button.tsx` — `<BrandButton href={...}>label</BrandButton>` using `<Button>` from `@react-email/components` with brand styling.

**Modified files:**

- `src/lib/email/templates/invitation.tsx` — props become `{ inviterName, tenantName, role, acceptUrl }`. Body wraps content in `<EmailShell>` with `<Heading>`, `<Text>`, `<BrandButton>`, and the fine print/expiry block.

- `src/lib/invitations/actions.ts` — `dispatchInviteEmail` looks up inviter `profiles.full_name`; pass `role` through to the template. Update `InvitationEmail()` call sites accordingly. The `inviteTeammate` and `resendInvitation` flows both call `dispatchInviteEmail`, so both pick up the change.

**New dependency:**

- `@react-email/components` — Resend's first-party React Email kit. Provides `<Html>`, `<Head>`, `<Body>`, `<Container>`, `<Section>`, `<Img>`, `<Button>`, `<Heading>`, `<Text>`, `<Hr>` which compile to bulletproof email tables. Solves Outlook desktop rendering. Already pairs cleanly with the existing `Resend.emails.send({ react })` flow.

### Logo asset

Outlook desktop on Windows (Word rendering engine, 2007–2019) does not render SVG. Every other major client (Gmail web/mobile, Apple Mail, Outlook for Mac, Outlook 365 web/mobile) does.

Decision: ship a **PNG export of the color logo** alongside the existing SVG. Add `public/manuva-logo-color.png` at 2× the display size (~240px wide) so it stays sharp on retina. Use that PNG in the email.

Resolve as an absolute URL at send time:
```
${process.env.NEXT_PUBLIC_SITE_URL ?? "https://manuva.app"}/manuva-logo-color.png
```
Set explicit `width={120}` and matching `height` (based on the actual aspect ratio of the exported PNG — currently `Manuva_svg.svg` is the source of truth) so Outlook doesn't blow it up.

Implementation note: the PNG export needs to be created during implementation. If a designer/build step isn't readily available, the fallback is to use SVG and accept that Outlook Windows users see broken-image or alt text — call this out at implementation time and ask before deciding.

### Data flow

```
inviteTeammate({email, role})
  └─ dispatchInviteEmail({to, tenantId, inviterUserId, role, token})
       ├─ admin.from("tenant").select("name")
       ├─ admin.from("profiles").select("full_name").eq("id", inviterUserId)
       ├─ admin.auth.admin.getUserById(inviterUserId) → email fallback
       └─ sendEmail({
            to,
            subject: `${inviterName} invited you to ${tenantName} on Manuva`,
            react: <InvitationEmail
              inviterName={...}
              tenantName={...}
              role={role}
              acceptUrl={...}
            />,
          })
```

`resendInvitation` already calls `dispatchInviteEmail` — it needs to pass the invitation's stored `role` through. Fetch it alongside `email, token, accepted_at`.

### Verification

A dev-only preview route under `src/app/(dev)/email-preview/invitation/page.tsx` renders `<InvitationEmail>` with sample props. Gated to non-production via `if (process.env.NODE_ENV === "production") notFound();`. Lets us iterate visually without sending real emails.

After visual approval, a single real send to a personal address confirms the cross-client rendering.

## Open implementation notes

- The fine-print accept-link block should stay readable when the URL is long — set `word-break: break-all` on that text element (existing template already does this).
- The `<Hr>` between body and fine print is optional; if it adds noise, drop it. Decide during build.
- React Email's `<Img>` requires absolute URLs to render reliably across clients.

## File touch list

**Added:**
- `src/lib/email/components/tokens.ts`
- `src/lib/email/components/email-shell.tsx`
- `src/lib/email/components/brand-button.tsx`
- `src/app/(dev)/email-preview/invitation/page.tsx`

**Modified:**
- `src/lib/email/templates/invitation.tsx`
- `src/lib/invitations/actions.ts`
- `package.json` / `package-lock.json` (add `@react-email/components`)

**Unchanged (deliberately):**
- `src/lib/email/templates/trial-reminder-1.tsx`
- `src/lib/email/templates/trial-reminder-3.tsx`
- `src/lib/email/templates/trial-expired.tsx`
- `src/lib/email/send.ts`
