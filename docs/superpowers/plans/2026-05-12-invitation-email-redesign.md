# Invitation Email Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the team invitation email so it's brand-aligned (Manuva Daylight palette, Inter font, color logo, polished layout) and extract a reusable `<EmailShell>` so future trial emails can adopt the same look later.

**Architecture:** Adopt `@react-email/components` for bulletproof cross-client rendering (Outlook tables, etc). Introduce a thin `email/components/` module (tokens, shell, branded button). Rewrite `invitation.tsx` to use the shell. Update `dispatchInviteEmail` in `src/lib/invitations/actions.ts` to look up the inviter's full name and pass the invited role through.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Resend, `@react-email/components`, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-12-invitation-email-redesign-design.md`

**Logo asset decision (clarification of spec):** Use `public/Manuva_svg.svg` directly. The spec floats a PNG export to support Outlook desktop on Windows — defer that to a follow-up. The implementation in this plan ships SVG, which renders correctly in every major client *except* Outlook 2007–2019 desktop on Windows (those users will see broken-image / alt text in the logo slot — the rest of the email still works). If/when a PNG export is added later, only one line changes in `email-shell.tsx`.

---

## File Structure

**Create:**
- `src/lib/email/components/tokens.ts` — color and font constants (mirrors Daylight palette from `colors_and_type.css`).
- `src/lib/email/components/email-shell.tsx` — `<EmailShell>{children}</EmailShell>` providing `<Html>`/`<Head>`/`<Body>` + centered card + Manuva logo header + footer.
- `src/lib/email/components/email-shell.test.tsx` — renders the shell, asserts logo URL and footer content are present in the HTML output.
- `src/lib/email/components/brand-button.tsx` — `<BrandButton href label />` using `<Button>` from `@react-email/components`.
- `src/lib/email/components/brand-button.test.tsx` — renders the button, asserts the href + label.
- `src/lib/email/templates/invitation.test.tsx` — renders the template, asserts inviter name, tenant, role, and accept URL appear in HTML.
- `src/lib/invitations/actions.test.ts` — covers the `inviteTeammate` and `resendInvitation` email-dispatch paths with `sendEmail` mocked, asserting the props passed to `<InvitationEmail>`.
- `src/app/(dev)/email-preview/invitation/page.tsx` — dev-only route to view the rendered email in a browser.

**Modify:**
- `src/lib/email/templates/invitation.tsx` — new props (`inviterName`, `tenantName`, `role`, `acceptUrl`), use `<EmailShell>` + `<BrandButton>`.
- `src/lib/invitations/actions.ts` — `dispatchInviteEmail` now takes `inviterUserId` and `role`, looks up `profiles.full_name`, builds the new subject line, passes new props. `resendInvitation` fetches `role` from the invitation row and forwards it.
- `package.json` / `package-lock.json` — add `@react-email/components`.

**Untouched (deliberately):**
- `src/lib/email/templates/trial-reminder-1.tsx`, `trial-reminder-3.tsx`, `trial-expired.tsx` — they keep working unchanged.
- `src/lib/email/send.ts`.

---

## Conventions used by this plan

- Tests run with: `npm test -- <pattern>` (Vitest, `pool=threads, maxWorkers=1` per the existing config in `package.json`).
- For rendering React Email components to HTML in tests, use `renderToStaticMarkup` from `react-dom/server` (already installed). No extra render dep.
- `@react-email/components` exposes `<Html>`, `<Head>`, `<Body>`, `<Container>`, `<Section>`, `<Img>`, `<Button>`, `<Heading>`, `<Text>`, `<Hr>` — these compile to bulletproof email-safe HTML.
- Each task ends with a commit. Commit messages follow the existing repo style (`feat(email): …`, `fix(email): …`).

---

## Task 1: Install `@react-email/components`

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install the package**

Run:
```bash
npm install @react-email/components
```

- [ ] **Step 2: Verify it was added**

Open `package.json` and confirm `@react-email/components` appears under `dependencies` with a real version (e.g. `^0.0.x`). Then run:

```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | head -20
```

Expected: no NEW errors introduced. (The 4 pre-existing errors in `src/app/privacy/page.tsx` are unrelated; ignore.)

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "$(cat <<'EOF'
build(email): add @react-email/components

Foundation for the invitation email redesign and a shared branded shell
that other email templates can adopt later.
EOF
)"
```

---

## Task 2: Add the email token constants

**Files:**
- Create: `src/lib/email/components/tokens.ts`

No test for this task — it's a pure constants module, exercised by all downstream tests.

- [ ] **Step 1: Create the tokens file**

Write `src/lib/email/components/tokens.ts`:

```ts
// Email tokens — must mirror the Daylight palette in
// C:/dev/manuva-tokens/Manuva Design System/colors_and_type.css.
// Email clients don't support CSS custom properties, so these are inlined.

export const COLOR = {
  bgPage: "#F8F7F5",
  bgCard: "#FFFFFF",
  inkStrong: "#1A1814",
  inkMuted: "#6B6560",
  inkFaint: "#9B9590",
  brand: "#6366F1",
  inkOnBrand: "#FFFFFF",
  stroke: "rgba(0, 0, 0, 0.08)",
} as const;

export const FONT = {
  body: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
} as const;

export const SIZE = {
  cardMaxWidthPx: 560,
  cardPaddingPx: 32,
  cardRadiusPx: 12,
  logoWidthPx: 120,
} as const;
```

- [ ] **Step 2: Typecheck**

Run:
```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | head -20
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/email/components/tokens.ts
git commit -m "feat(email): add brand tokens module for email templates"
```

---

## Task 3: BrandButton component (TDD)

**Files:**
- Test: `src/lib/email/components/brand-button.test.tsx`
- Create: `src/lib/email/components/brand-button.tsx`

- [ ] **Step 1: Write the failing test**

Write `src/lib/email/components/brand-button.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BrandButton } from "./brand-button";

describe("BrandButton", () => {
  it("renders an anchor with the given href and label", () => {
    const html = renderToStaticMarkup(
      <BrandButton href="https://example.com/accept">
        Accept invitation
      </BrandButton>
    );
    expect(html).toContain('href="https://example.com/accept"');
    expect(html).toContain("Accept invitation");
  });

  it("applies the brand background color", () => {
    const html = renderToStaticMarkup(
      <BrandButton href="https://example.com">Go</BrandButton>
    );
    // Brand color from tokens
    expect(html.toLowerCase()).toContain("#6366f1");
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:
```bash
npm test -- src/lib/email/components/brand-button.test.tsx
```

Expected: FAIL with module-not-found / cannot resolve `./brand-button`.

- [ ] **Step 3: Implement the component**

Write `src/lib/email/components/brand-button.tsx`:

```tsx
import { Button } from "@react-email/components";
import { COLOR, FONT } from "./tokens";

export interface BrandButtonProps {
  href: string;
  children: React.ReactNode;
}

export function BrandButton({ href, children }: BrandButtonProps) {
  return (
    <Button
      href={href}
      style={{
        background: COLOR.brand,
        color: COLOR.inkOnBrand,
        borderRadius: 8,
        padding: "10px 18px",
        fontFamily: FONT.body,
        fontWeight: 600,
        fontSize: 15,
        textDecoration: "none",
        display: "inline-block",
      }}
    >
      {children}
    </Button>
  );
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run:
```bash
npm test -- src/lib/email/components/brand-button.test.tsx
```

Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/components/brand-button.tsx src/lib/email/components/brand-button.test.tsx
git commit -m "feat(email): add BrandButton component for transactional emails"
```

---

## Task 4: EmailShell component (TDD)

**Files:**
- Test: `src/lib/email/components/email-shell.test.tsx`
- Create: `src/lib/email/components/email-shell.tsx`

- [ ] **Step 1: Write the failing test**

Write `src/lib/email/components/email-shell.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { EmailShell } from "./email-shell";

describe("EmailShell", () => {
  it("renders provided children inside the card", () => {
    const html = renderToStaticMarkup(
      <EmailShell logoBaseUrl="https://manuva.app">
        <p>hello from inside the shell</p>
      </EmailShell>
    );
    expect(html).toContain("hello from inside the shell");
  });

  it("renders the Manuva logo image with an absolute URL", () => {
    const html = renderToStaticMarkup(
      <EmailShell logoBaseUrl="https://manuva.app">
        <p>x</p>
      </EmailShell>
    );
    expect(html).toContain('src="https://manuva.app/Manuva_svg.svg"');
    expect(html.toLowerCase()).toContain('alt="manuva"');
  });

  it("renders the footer copy", () => {
    const html = renderToStaticMarkup(
      <EmailShell logoBaseUrl="https://manuva.app">
        <p>x</p>
      </EmailShell>
    );
    expect(html).toContain("manuva.app");
    expect(html).toContain("safely ignore");
  });

  it("uses the page background color", () => {
    const html = renderToStaticMarkup(
      <EmailShell logoBaseUrl="https://manuva.app">
        <p>x</p>
      </EmailShell>
    );
    expect(html.toLowerCase()).toContain("#f8f7f5");
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:
```bash
npm test -- src/lib/email/components/email-shell.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the shell**

Write `src/lib/email/components/email-shell.tsx`:

```tsx
import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Img,
  Text,
} from "@react-email/components";
import { COLOR, FONT, SIZE } from "./tokens";

export interface EmailShellProps {
  logoBaseUrl: string;
  children: React.ReactNode;
}

export function EmailShell({ logoBaseUrl, children }: EmailShellProps) {
  return (
    <Html>
      <Head />
      <Body
        style={{
          background: COLOR.bgPage,
          fontFamily: FONT.body,
          color: COLOR.inkStrong,
          margin: 0,
          padding: "32px 16px",
        }}
      >
        <Container
          style={{
            maxWidth: SIZE.cardMaxWidthPx,
            margin: "0 auto",
          }}
        >
          <Section
            style={{
              background: COLOR.bgCard,
              border: `1px solid ${COLOR.stroke}`,
              borderRadius: SIZE.cardRadiusPx,
              padding: SIZE.cardPaddingPx,
            }}
          >
            <Img
              src={`${logoBaseUrl}/Manuva_svg.svg`}
              alt="Manuva"
              width={SIZE.logoWidthPx}
              style={{ display: "block", marginBottom: 24 }}
            />
            {children}
          </Section>
          <Section style={{ padding: "20px 4px 0" }}>
            <Text
              style={{
                fontSize: 12,
                color: COLOR.inkFaint,
                margin: "0 0 4px",
              }}
            >
              Manuva · manuva.app
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: COLOR.inkFaint,
                margin: 0,
              }}
            >
              If you weren&apos;t expecting this, you can safely ignore this
              email.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run:
```bash
npm test -- src/lib/email/components/email-shell.test.tsx
```

Expected: PASS (all four cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/email/components/email-shell.tsx src/lib/email/components/email-shell.test.tsx
git commit -m "feat(email): add EmailShell component with Manuva header and footer"
```

---

## Task 5: Rewrite the InvitationEmail template (TDD)

**Files:**
- Test: `src/lib/email/templates/invitation.test.tsx` (new)
- Modify: `src/lib/email/templates/invitation.tsx` (full rewrite)

- [ ] **Step 1: Write the failing test**

Write `src/lib/email/templates/invitation.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { InvitationEmail } from "./invitation";

describe("InvitationEmail", () => {
  it("renders the inviter name, tenant, role, and accept URL", () => {
    const html = renderToStaticMarkup(
      <InvitationEmail
        inviterName="Kasper Simonsen"
        tenantName="Acme Industries"
        role="member"
        acceptUrl="https://manuva.app/accept-invite/abc123"
        logoBaseUrl="https://manuva.app"
      />
    );
    expect(html).toContain("Kasper Simonsen");
    expect(html).toContain("Acme Industries");
    expect(html).toContain("member");
    expect(html).toContain("https://manuva.app/accept-invite/abc123");
  });

  it("renders the H1 with the tenant name", () => {
    const html = renderToStaticMarkup(
      <InvitationEmail
        inviterName="Jane"
        tenantName="Acme"
        role="admin"
        acceptUrl="https://manuva.app/accept-invite/x"
        logoBaseUrl="https://manuva.app"
      />
    );
    expect(html).toMatch(/You(?:'|&#x27;|&apos;)re invited to join Acme/);
  });

  it("renders the admin role when invited as admin", () => {
    const html = renderToStaticMarkup(
      <InvitationEmail
        inviterName="Jane"
        tenantName="Acme"
        role="admin"
        acceptUrl="https://manuva.app/accept-invite/x"
        logoBaseUrl="https://manuva.app"
      />
    );
    expect(html).toContain("as an admin");
  });

  it("renders the member role with the right article", () => {
    const html = renderToStaticMarkup(
      <InvitationEmail
        inviterName="Jane"
        tenantName="Acme"
        role="member"
        acceptUrl="https://manuva.app/accept-invite/x"
        logoBaseUrl="https://manuva.app"
      />
    );
    expect(html).toContain("as a member");
  });

  it("includes the 7-day expiry copy and plain link fallback", () => {
    const html = renderToStaticMarkup(
      <InvitationEmail
        inviterName="Jane"
        tenantName="Acme"
        role="member"
        acceptUrl="https://manuva.app/accept-invite/x"
        logoBaseUrl="https://manuva.app"
      />
    );
    expect(html).toContain("7 days");
    // plain link appears in the fallback block as well as the button
    expect(html.match(/https:\/\/manuva\.app\/accept-invite\/x/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:
```bash
npm test -- src/lib/email/templates/invitation.test.tsx
```

Expected: tests FAIL — current `InvitationEmail` signature has no `role` or `logoBaseUrl` prop, and copy doesn't mention role.

- [ ] **Step 3: Replace `invitation.tsx`**

Overwrite `src/lib/email/templates/invitation.tsx` with:

```tsx
import { Heading, Text } from "@react-email/components";
import { EmailShell } from "../components/email-shell";
import { BrandButton } from "../components/brand-button";
import { COLOR, FONT } from "../components/tokens";

export interface InvitationEmailProps {
  inviterName: string;
  tenantName: string;
  role: "admin" | "member";
  acceptUrl: string;
  logoBaseUrl: string;
}

function roleWithArticle(role: "admin" | "member"): string {
  return role === "admin" ? "an admin" : "a member";
}

export function InvitationEmail({
  inviterName,
  tenantName,
  role,
  acceptUrl,
  logoBaseUrl,
}: InvitationEmailProps) {
  return (
    <EmailShell logoBaseUrl={logoBaseUrl}>
      <Heading
        as="h1"
        style={{
          fontFamily: FONT.body,
          fontSize: 22,
          fontWeight: 700,
          color: COLOR.inkStrong,
          margin: "0 0 16px",
          lineHeight: 1.25,
        }}
      >
        You&apos;re invited to join {tenantName}
      </Heading>

      <Text
        style={{
          fontFamily: FONT.body,
          fontSize: 15,
          color: COLOR.inkStrong,
          margin: "0 0 14px",
          lineHeight: 1.55,
        }}
      >
        <strong>{inviterName}</strong> invited you to join{" "}
        <strong>{tenantName}</strong> on Manuva as {roleWithArticle(role)}.
      </Text>

      <Text
        style={{
          fontFamily: FONT.body,
          fontSize: 15,
          color: COLOR.inkStrong,
          margin: "0 0 24px",
          lineHeight: 1.55,
        }}
      >
        Manuva is the operations workspace for manufacturers — inventory,
        BOMs, production, and purchasing in one place.
      </Text>

      <div style={{ margin: "0 0 28px" }}>
        <BrandButton href={acceptUrl}>Accept invitation →</BrandButton>
      </div>

      <Text
        style={{
          fontFamily: FONT.body,
          fontSize: 12,
          color: COLOR.inkMuted,
          margin: "0 0 8px",
          lineHeight: 1.55,
        }}
      >
        This invite expires in 7 days. If the button doesn&apos;t work, paste
        this link into your browser:
      </Text>
      <Text
        style={{
          fontFamily: FONT.body,
          fontSize: 12,
          color: COLOR.inkMuted,
          margin: 0,
          lineHeight: 1.55,
          wordBreak: "break-all",
        }}
      >
        {acceptUrl}
      </Text>
    </EmailShell>
  );
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run:
```bash
npm test -- src/lib/email/templates/invitation.test.tsx
```

Expected: PASS (all five cases).

- [ ] **Step 5: Typecheck the wider project**

Run:
```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | head -40
```

Expected: there will be **new errors** in `src/lib/invitations/actions.ts` because callers still pass the old `InvitationEmail` props. That's expected — Task 6 fixes them. Don't try to fix them inline here. Move on.

- [ ] **Step 6: Commit**

```bash
git add src/lib/email/templates/invitation.tsx src/lib/email/templates/invitation.test.tsx
git commit -m "$(cat <<'EOF'
feat(email): redesign invitation template with brand shell

Rewrites InvitationEmail to use EmailShell + BrandButton. New props
add inviter name, role, and a logoBaseUrl for absolute logo URLs.
Copy now mentions the role and uses Manuva's Daylight palette.
EOF
)"
```

---

## Task 6: Update invitations action to plumb new props (TDD)

**Files:**
- Test: `src/lib/invitations/actions.test.ts` (new)
- Modify: `src/lib/invitations/actions.ts`

- [ ] **Step 1: Write the failing test**

Write `src/lib/invitations/actions.test.ts`:

```ts
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// Mock the Supabase clients and the email sender used by actions.ts.
const sendEmailMock = vi.fn();
const adminFromMock = vi.fn();
const authGetUserByIdMock = vi.fn();
const ctxMock = vi.fn();
const assertWithinLimitMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/email/send", () => ({
  sendEmail: sendEmailMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: adminFromMock,
    auth: { admin: { getUserById: authGetUserByIdMock } },
  }),
}));

vi.mock("@/lib/tenant/context", () => ({
  getServerTenantContext: () => ctxMock(),
}));

vi.mock("@/lib/subscription/limits", () => ({
  assertWithinLimit: (...args: unknown[]) => assertWithinLimitMock(...args),
  LimitExceededError: class LimitExceededError extends Error {},
}));

vi.mock("./tokens", () => ({
  generateToken: () => "test-token-123",
}));

import { inviteTeammate, resendInvitation } from "./actions";

beforeEach(() => {
  sendEmailMock.mockReset();
  adminFromMock.mockReset();
  authGetUserByIdMock.mockReset();
  ctxMock.mockReset();
  assertWithinLimitMock.mockClear();

  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://manuva.app");

  ctxMock.mockResolvedValue({
    tenantId: "tenant-1",
    role: "admin",
    userId: "inviter-1",
  });

  sendEmailMock.mockResolvedValue({ ok: true, id: "msg_x" });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function chain(result: unknown) {
  // Minimal Supabase query-builder stub: every chain call returns `this`
  // until awaited, then resolves to `result`.
  const builder: Record<string, unknown> = {};
  for (const k of [
    "select",
    "eq",
    "ilike",
    "is",
    "insert",
    "update",
    "delete",
    "maybeSingle",
  ]) {
    builder[k] = vi.fn().mockReturnValue(builder);
  }
  // make it thenable
  (builder as { then: unknown }).then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(result).then(resolve);
  return builder;
}

describe("inviteTeammate", () => {
  it("passes inviter full name and role to InvitationEmail", async () => {
    // 1. assertWithinLimit OK (default)
    // 2. insert into tenant_invitation succeeds
    // 3. tenant lookup returns name
    // 4. inviter profile lookup returns full_name
    // 5. auth.getUserById not needed because full_name is set
    adminFromMock.mockImplementation((table: string) => {
      if (table === "tenant_invitation") return chain({ error: null });
      if (table === "tenant")
        return chain({ data: { name: "Acme Industries" }, error: null });
      if (table === "profiles")
        return chain({ data: { full_name: "Jane Doe" }, error: null });
      throw new Error(`unexpected table ${table}`);
    });

    const res = await inviteTeammate({
      email: "newhire@example.com",
      role: "admin",
    });

    expect(res).toEqual({ ok: true });
    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const callArgs = sendEmailMock.mock.calls[0][0];
    expect(callArgs.to).toBe("newhire@example.com");
    expect(callArgs.subject).toBe(
      "Jane Doe invited you to Acme Industries on Manuva"
    );
    const props = callArgs.react.props;
    expect(props.inviterName).toBe("Jane Doe");
    expect(props.tenantName).toBe("Acme Industries");
    expect(props.role).toBe("admin");
    expect(props.acceptUrl).toBe(
      "https://manuva.app/accept-invite/test-token-123"
    );
    expect(props.logoBaseUrl).toBe("https://manuva.app");
  });

  it("falls back to inviter email when full_name is missing", async () => {
    adminFromMock.mockImplementation((table: string) => {
      if (table === "tenant_invitation") return chain({ error: null });
      if (table === "tenant")
        return chain({ data: { name: "Acme" }, error: null });
      if (table === "profiles")
        return chain({ data: { full_name: null }, error: null });
      throw new Error(`unexpected table ${table}`);
    });
    authGetUserByIdMock.mockResolvedValue({
      data: { user: { email: "jane@example.com" } },
    });

    await inviteTeammate({ email: "newhire@example.com", role: "member" });

    const callArgs = sendEmailMock.mock.calls[0][0];
    expect(callArgs.react.props.inviterName).toBe("jane@example.com");
    expect(callArgs.subject).toBe(
      "jane@example.com invited you to Acme on Manuva"
    );
  });
});

describe("resendInvitation", () => {
  it("re-sends with the stored role", async () => {
    adminFromMock.mockImplementation((table: string) => {
      if (table === "tenant_invitation") {
        // First call: SELECT existing invitation
        // Subsequent calls: UPDATE expires_at
        const b = chain({
          data: {
            email: "newhire@example.com",
            token: "stored-token",
            accepted_at: null,
            role: "admin",
          },
          error: null,
        });
        return b;
      }
      if (table === "tenant")
        return chain({ data: { name: "Acme" }, error: null });
      if (table === "profiles")
        return chain({ data: { full_name: "Jane Doe" }, error: null });
      throw new Error(`unexpected table ${table}`);
    });

    const res = await resendInvitation("invitation-id-1");

    expect(res).toEqual({ ok: true });
    const callArgs = sendEmailMock.mock.calls[0][0];
    expect(callArgs.react.props.role).toBe("admin");
    expect(callArgs.react.props.acceptUrl).toContain("stored-token");
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:
```bash
npm test -- src/lib/invitations/actions.test.ts
```

Expected: tests FAIL — the current action doesn't lookup `profiles.full_name`, doesn't pass `role` to `InvitationEmail`, and `resendInvitation` doesn't fetch the stored role.

- [ ] **Step 3: Update `src/lib/invitations/actions.ts`**

Replace the file contents with:

```ts
"use server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getServerTenantContext } from "@/lib/tenant/context";
import {
  assertWithinLimit,
  LimitExceededError,
} from "@/lib/subscription/limits";
import { generateToken } from "./tokens";
import { sendEmail } from "@/lib/email/send";
import { InvitationEmail } from "@/lib/email/templates/invitation";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const PG_UNIQUE_VIOLATION = "23505";

export type ActionResult =
  | { ok: true }
  | { ok: false; error: string };

function isAdmin(role: string): boolean {
  return role === "admin" || role === "super_admin";
}

async function resolveInviterName(args: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  inviterUserId: string;
}): Promise<string> {
  const { data: profileRow } = await args.admin
    .from("profiles")
    .select("full_name")
    .eq("id", args.inviterUserId)
    .maybeSingle();

  if (profileRow?.full_name) return profileRow.full_name;

  const { data: userResult } = await args.admin.auth.admin.getUserById(
    args.inviterUserId
  );
  return userResult?.user?.email ?? "your teammate";
}

async function dispatchInviteEmail(args: {
  to: string;
  tenantId: string;
  inviterUserId: string;
  role: "admin" | "member";
  token: string;
}) {
  const admin = createSupabaseAdminClient();

  const { data: tenantRow } = await admin
    .from("tenant")
    .select("name")
    .eq("id", args.tenantId)
    .maybeSingle();

  const tenantName = tenantRow?.name ?? "your team";
  const inviterName = await resolveInviterName({
    admin,
    inviterUserId: args.inviterUserId,
  });

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const acceptUrl = `${baseUrl}/accept-invite/${args.token}`;

  return sendEmail({
    to: args.to,
    subject: `${inviterName} invited you to ${tenantName} on Manuva`,
    react: InvitationEmail({
      inviterName,
      tenantName,
      role: args.role,
      acceptUrl,
      logoBaseUrl: baseUrl,
    }),
  });
}

export async function inviteTeammate(input: {
  email: string;
  role: "admin" | "member";
}): Promise<ActionResult> {
  const ctx = await getServerTenantContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  if (!isAdmin(ctx.role)) return { ok: false, error: "forbidden" };

  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "Please enter a valid email address." };
  }
  if (input.role !== "admin" && input.role !== "member") {
    return { ok: false, error: "Invalid role." };
  }

  const admin = createSupabaseAdminClient();

  try {
    await assertWithinLimit(admin, ctx.tenantId, "users");
  } catch (err) {
    if (err instanceof LimitExceededError) {
      return { ok: false, error: err.message };
    }
    throw err;
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + SEVEN_DAYS_MS).toISOString();

  let finalToken = token;

  const { error: insertError } = await admin
    .from("tenant_invitation")
    .insert({
      tenant_id: ctx.tenantId,
      email,
      role: input.role,
      token,
      invited_by: ctx.userId,
      expires_at: expiresAt,
    });

  if (insertError) {
    const code = (insertError as { code?: string }).code;
    if (code === PG_UNIQUE_VIOLATION) {
      const { data: refreshed, error: updateError } = await admin
        .from("tenant_invitation")
        .update({
          token,
          expires_at: expiresAt,
          role: input.role,
        })
        .eq("tenant_id", ctx.tenantId)
        .ilike("email", email)
        .is("accepted_at", null)
        .select("token")
        .maybeSingle();
      if (updateError || !refreshed) {
        return {
          ok: false,
          error: updateError?.message ?? "Failed to refresh invitation.",
        };
      }
      finalToken = refreshed.token;
    } else {
      return { ok: false, error: insertError.message };
    }
  }

  const sendResult = await dispatchInviteEmail({
    to: email,
    tenantId: ctx.tenantId,
    inviterUserId: ctx.userId,
    role: input.role,
    token: finalToken,
  });
  if (!sendResult.ok) {
    console.error(
      "[invitations] sendEmail failed for new invite",
      sendResult.error
    );
    return { ok: false, error: `Couldn't send invite email: ${sendResult.error}` };
  }

  return { ok: true };
}

export async function revokeInvitation(
  invitationId: string
): Promise<ActionResult> {
  const ctx = await getServerTenantContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  if (!isAdmin(ctx.role)) return { ok: false, error: "forbidden" };

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("tenant_invitation")
    .delete()
    .eq("id", invitationId)
    .eq("tenant_id", ctx.tenantId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function resendInvitation(
  invitationId: string
): Promise<ActionResult> {
  const ctx = await getServerTenantContext();
  if (!ctx) return { ok: false, error: "unauthorized" };
  if (!isAdmin(ctx.role)) return { ok: false, error: "forbidden" };

  const admin = createSupabaseAdminClient();
  const { data: inv } = await admin
    .from("tenant_invitation")
    .select("email, token, accepted_at, role")
    .eq("id", invitationId)
    .eq("tenant_id", ctx.tenantId)
    .maybeSingle();
  if (!inv) return { ok: false, error: "Invitation not found." };
  if (inv.accepted_at) return { ok: false, error: "Already accepted." };

  const role = inv.role === "admin" ? "admin" : "member";

  const newExpiry = new Date(Date.now() + SEVEN_DAYS_MS).toISOString();
  await admin
    .from("tenant_invitation")
    .update({ expires_at: newExpiry })
    .eq("id", invitationId);

  const sendResult = await dispatchInviteEmail({
    to: inv.email,
    tenantId: ctx.tenantId,
    inviterUserId: ctx.userId,
    role,
    token: inv.token,
  });
  if (!sendResult.ok) {
    return { ok: false, error: `Couldn't resend invite: ${sendResult.error}` };
  }

  return { ok: true };
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run:
```bash
npm test -- src/lib/invitations/actions.test.ts
```

Expected: PASS (all three cases).

- [ ] **Step 5: Run the full test suite to verify nothing else broke**

Run:
```bash
npm test
```

Expected: all suites pass.

- [ ] **Step 6: Typecheck**

Run:
```bash
npx tsc --noEmit -p tsconfig.json 2>&1 | head -40
```

Expected: only the 4 pre-existing errors in `src/app/privacy/page.tsx`. No new errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/invitations/actions.ts src/lib/invitations/actions.test.ts
git commit -m "$(cat <<'EOF'
feat(invitations): show inviter full name and role in invite email

dispatchInviteEmail now looks up the inviter's profiles.full_name (with
auth.users.email fallback) and passes the invited role through to the
template. resendInvitation reads the stored role from the invitation row.
The subject line and body both reflect the inviter and role.
EOF
)"
```

---

## Task 7: Dev-only preview route

**Files:**
- Create: `src/app/(dev)/email-preview/invitation/page.tsx`

No test — this is a dev-time visual tool. The route 404s in production.

- [ ] **Step 1: Create the preview page**

Write `src/app/(dev)/email-preview/invitation/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { InvitationEmail } from "@/lib/email/templates/invitation";

export default function InvitationPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  return (
    <InvitationEmail
      inviterName="Kasper Simonsen"
      tenantName="Acme Industries"
      role="member"
      acceptUrl={`${baseUrl}/accept-invite/preview-token`}
      logoBaseUrl={baseUrl}
    />
  );
}
```

- [ ] **Step 2: Smoke-test in the browser**

Run:
```bash
npm run dev
```

Open `http://localhost:3000/email-preview/invitation` in a browser. Confirm:
- Manuva logo renders at the top of the card (SVG loads from `/Manuva_svg.svg`)
- Heading reads `You're invited to join Acme Industries`
- Body mentions `Kasper Simonsen` and `as a member`
- Indigo button reads `Accept invitation →`
- Fine print + plain accept URL appear
- Footer reads `Manuva · manuva.app` + safe-ignore line

If anything looks off, fix it in the relevant file (template / shell / button) and re-check. Don't proceed until the page looks right.

Stop the dev server (`Ctrl+C`) before committing.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(dev)/email-preview/invitation/page.tsx"
git commit -m "feat(email): add dev-only invitation email preview route"
```

---

## Task 8: Final verification & push

- [ ] **Step 1: Run the full test suite**

Run:
```bash
npm test
```

Expected: all pass.

- [ ] **Step 2: Typecheck**

Run:
```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: only the 4 pre-existing errors in `src/app/privacy/page.tsx`. None elsewhere.

- [ ] **Step 3: Send a real test invitation (manual, in a dev/staging environment)**

Sign in as an admin, navigate to `/app/settings/team`, invite a real personal address you can check. Confirm the email arrives and renders correctly in your client (Gmail web is the most common audience).

If the rendering is wrong in any major client, file a follow-up task rather than blocking this PR — the structure is correct and tests prove it.

- [ ] **Step 4: Push**

Run:
```bash
git push origin main
```

---

## Spec coverage check (self-review)

| Spec requirement | Implemented by |
|---|---|
| Daylight palette, Inter font | Task 2 (tokens), Task 4 (shell), Task 5 (template) |
| Color logo at top of card | Task 4 (`EmailShell` renders `<Img src=".../Manuva_svg.svg">`) |
| Inviter full name + role mentioned | Task 5 (template) + Task 6 (lookup) |
| Subject line includes inviter | Task 6 (`dispatchInviteEmail`) |
| Role-aware article ("an admin" / "a member") | Task 5 (`roleWithArticle`) |
| Manuva value-prop sentence | Task 5 (template body) |
| 7-day expiry copy + plain link fallback | Task 5 (template) |
| Footer with brand + safe-ignore line | Task 4 (shell) |
| 560px card, white bg, indigo CTA | Task 4 + Task 3 styling |
| Bulletproof rendering | Task 1 (`@react-email/components`) |
| Inviter name fallback to email | Task 6 (`resolveInviterName`) |
| Reusable shell for later trial-email conversion | Task 4 (`<EmailShell>`) |
| Dev preview route | Task 7 |
| Trial templates unchanged | Verified by Task 8 step 1 (no test failures) |
| SVG vs PNG asset decision | Documented in plan header; SVG chosen, PNG deferred |
