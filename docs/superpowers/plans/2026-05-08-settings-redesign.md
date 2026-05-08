# Settings Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single monolithic settings page with a sidebar-nav settings area split into Personal (Profile, Appearance) and Workspace (Company, Team, Integrations, Locations, Invoices) sections.

**Architecture:** A Next.js nested layout at `settings/layout.tsx` provides a persistent sidebar. Each section is its own sub-route. The root `/app/settings` redirects to the appropriate landing section based on role. Workspace sections are admin-only, enforced in the sidebar (hidden for non-admins) and at each page level (redirect if unauthorised).

**Tech Stack:** Next.js 15 App Router, Supabase (Postgres + Auth + RLS + Storage), CSS Modules, TypeScript, Manuva Design System tokens (`--brand-1`, `--ink-strong`, `--ink-muted`, `--ink-faint`, `--bg-card`, `--stroke`, `--stroke-card`, `--radius-sm`, `--space-*`, `--fs-*`, `--fw-*`, `--dur-fast`, `--ease-out`).

**Spec:** `docs/superpowers/specs/2026-05-08-settings-redesign-design.md`

---

## File Map

**New files:**
- `supabase/patches/settings_redesign_schema.sql`
- `src/app/app/settings/layout.tsx`
- `src/app/app/settings/settings-sidebar.tsx`
- `src/app/app/settings/settings-layout.module.css`
- `src/app/app/settings/profile/page.tsx`
- `src/app/app/settings/profile/profile-form.tsx`
- `src/app/app/settings/profile/actions.ts`
- `src/app/app/settings/profile/profile.module.css`
- `src/app/app/settings/appearance/page.tsx`
- `src/app/app/settings/appearance/theme-picker.tsx` *(copy from theme/)*
- `src/app/app/settings/appearance/appearance.module.css`
- `src/app/app/settings/company/page.tsx`
- `src/app/app/settings/company/company-form.tsx`
- `src/app/app/settings/company/actions.ts`
- `src/app/app/settings/company/company.module.css`
- `src/lib/supabase/admin.ts`
- `src/app/app/settings/team/page.tsx`
- `src/app/app/settings/team/invite-form.tsx`
- `src/app/app/settings/team/team-row-actions.tsx`
- `src/app/app/settings/team/actions.ts`
- `src/app/app/settings/team/team.module.css`
- `src/app/app/settings/integrations/page.tsx`
- `src/app/app/settings/integrations/shopify-manage.tsx`
- `src/app/app/settings/integrations/integrations.module.css`
- `src/app/app/settings/locations/page.tsx`
- `src/app/app/settings/locations/actions.ts`
- `src/app/app/settings/locations/locations.module.css`
- `src/app/app/settings/invoices/page.tsx`
- `src/app/app/settings/invoices/invoices.module.css`

**Modified files:**
- `src/app/app/settings/page.tsx` — replace with redirect
- `src/app/app/settings/theme/page.tsx` — replace with redirect to /appearance
- `src/lib/tenant/context.ts` — add status check
- `src/app/app/topbar.tsx` — update theme link
- `src/app/app/route-meta.ts` — add new settings routes

**Moved (copy then delete original):**
- `settings/shopify-connect.tsx` → `settings/integrations/shopify-connect.tsx`
- `settings/sync-submit-form.tsx` → `settings/integrations/sync-submit-form.tsx`
- `settings/sync-meta-chips.tsx` → `settings/integrations/sync-meta-chips.tsx`

**Deleted after move:**
- `src/app/app/settings/shopify-connect.tsx`
- `src/app/app/settings/sync-submit-form.tsx`
- `src/app/app/settings/sync-meta-chips.tsx`
- `src/app/app/settings/settings.module.css`
- `src/app/app/settings/theme/theme-picker.tsx` *(moved to appearance/)*
- `src/app/app/settings/theme/theme.module.css`

---

### Task 1: Database patch — settings schema

**Goal:** Add new columns to `tenant` and `profiles`, create `tenant_invoices` table, add auth trigger for invited users.

**Files:**
- Create: `supabase/patches/settings_redesign_schema.sql`

**Acceptance Criteria:**
- [ ] `tenant` table has `logo_url`, `timezone`, `currency` columns
- [ ] `profiles` table has `full_name` and `status` columns
- [ ] `tenant_invoices` table exists with RLS restricting reads to tenant admins
- [ ] Auth trigger creates profile + access row for invited users on first sign-in

**Verify:** Apply patch via Supabase MCP (`execute_sql`) or dashboard SQL editor. Confirm columns exist with `select column_name from information_schema.columns where table_name = 'tenant'`.

**Steps:**

- [ ] **Create the patch file**

```sql
-- supabase/patches/settings_redesign_schema.sql

-- Tenant: add logo, timezone, currency
alter table public.tenant
  add column if not exists logo_url  text,
  add column if not exists timezone  text not null default 'Pacific/Auckland',
  add column if not exists currency  text not null default 'NZD';

-- Profiles: add full_name and status
alter table public.profiles
  add column if not exists full_name text,
  add column if not exists status    text not null default 'active';

-- Tenant invoices
create table if not exists public.tenant_invoices (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenant(id) on delete cascade,
  period       text not null,          -- e.g. "2026-05"
  amount_cents integer not null,
  currency     text not null default 'AUD',
  storage_path text not null,          -- path inside tenant-invoices bucket
  created_at   timestamptz not null default now()
);

alter table public.tenant_invoices enable row level security;

drop policy if exists tenant_admins_read_invoices on public.tenant_invoices;
create policy tenant_admins_read_invoices on public.tenant_invoices
  for select using (
    tenant_id = public.current_tenant_id()
    and (
      public.current_profile_role() in ('admin', 'super_admin')
      or public.is_super_admin()
    )
  );

-- Trigger: auto-create profile + access row for invited users
create or replace function public.handle_invited_user()
returns trigger language plpgsql security definer as $$
begin
  if new.raw_user_meta_data->>'invited_tenant_id' is not null then
    insert into public.profiles (id, tenant_id, role, full_name, status)
    values (
      new.id,
      (new.raw_user_meta_data->>'invited_tenant_id')::uuid,
      coalesce(new.raw_user_meta_data->>'invited_role', 'member'),
      coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
      'active'
    )
    on conflict (id) do nothing;

    insert into public.profile_tenant_access (profile_id, tenant_id, role)
    values (
      new.id,
      (new.raw_user_meta_data->>'invited_tenant_id')::uuid,
      coalesce(new.raw_user_meta_data->>'invited_role', 'member')
    )
    on conflict (profile_id, tenant_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_invited_user();
```

- [ ] **Apply via Supabase MCP**

Use the `mcp__plugin_supabase_supabase__execute_sql` tool (or Supabase dashboard SQL editor) to run the patch. Confirm no errors.

- [ ] **Create storage buckets via Supabase dashboard**

Create two buckets:
- `tenant-logos` — public bucket (logo URLs are embedded in UI)
- `tenant-invoices` — private bucket (access via signed URLs only)

- [ ] **Commit**

```bash
git add supabase/patches/settings_redesign_schema.sql
git commit -m "feat(settings): db patch — tenant columns, invoices table, invite trigger"
```

---

### Task 2: Settings layout with sidebar navigation

**Goal:** Add the two-column settings layout with a persistent sidebar nav. Replace the old settings root page with a role-based redirect.

**Files:**
- Create: `src/app/app/settings/layout.tsx`
- Create: `src/app/app/settings/settings-sidebar.tsx`
- Create: `src/app/app/settings/settings-layout.module.css`
- Modify: `src/app/app/settings/page.tsx`
- Modify: `src/app/app/route-meta.ts`

**Acceptance Criteria:**
- [ ] `/app/settings` redirects admins to `/app/settings/company`, others to `/app/settings/profile`
- [ ] Sidebar shows Personal group (Profile, Appearance) for all users
- [ ] Sidebar shows Workspace group (Company, Team, Integrations, Locations, Invoices) for admins only
- [ ] Active link is visually distinguished
- [ ] TypeScript compiles without errors

**Verify:** `npx tsc --noEmit` → zero errors. Navigate to `/app/settings` as admin and non-admin and confirm redirects. Confirm sidebar renders correctly.

**Steps:**

- [ ] **Replace `src/app/app/settings/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";

export default async function SettingsPage() {
  const ctx = await getServerTenantContext();
  const isAdmin = ctx?.role === "admin" || ctx?.role === "super_admin";
  redirect(isAdmin ? "/app/settings/company" : "/app/settings/profile");
}
```

- [ ] **Create `src/app/app/settings/layout.tsx`**

```tsx
import { getServerTenantContext } from "@/lib/tenant/context";
import SettingsSidebar from "./settings-sidebar";
import styles from "./settings-layout.module.css";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getServerTenantContext();
  const isAdmin = ctx?.role === "admin" || ctx?.role === "super_admin";

  return (
    <div className={styles.layout}>
      <SettingsSidebar isAdmin={isAdmin} />
      <div className={styles.content}>{children}</div>
    </div>
  );
}
```

- [ ] **Create `src/app/app/settings/settings-sidebar.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./settings-layout.module.css";

const personalLinks = [
  { href: "/app/settings/profile", label: "Profile" },
  { href: "/app/settings/appearance", label: "Appearance" },
];

const workspaceLinks = [
  { href: "/app/settings/company", label: "Company" },
  { href: "/app/settings/team", label: "Team" },
  { href: "/app/settings/integrations", label: "Integrations" },
  { href: "/app/settings/locations", label: "Locations" },
  { href: "/app/settings/invoices", label: "Invoices" },
];

export default function SettingsSidebar({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();

  return (
    <nav className={styles.sidebar}>
      <p className={styles.sidebarGroup}>Personal</p>
      <ul className={styles.navList}>
        {personalLinks.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className={`${styles.navLink} ${
                pathname.startsWith(link.href) ? styles.navLinkActive : ""
              }`}
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>

      {isAdmin && (
        <>
          <p className={styles.sidebarGroup}>Workspace</p>
          <ul className={styles.navList}>
            {workspaceLinks.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className={`${styles.navLink} ${
                    pathname.startsWith(link.href) ? styles.navLinkActive : ""
                  }`}
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </nav>
  );
}
```

- [ ] **Create `src/app/app/settings/settings-layout.module.css`**

```css
.layout {
  display: grid;
  grid-template-columns: 220px 1fr;
  min-height: 100%;
  align-items: start;
}

.sidebar {
  border-right: 1px solid var(--stroke);
  background: var(--bg-sidebar);
  padding: var(--space-8) 0;
  min-height: 100%;
}

.content {
  padding: var(--space-10) var(--space-12);
  max-width: 760px;
}

.sidebarGroup {
  margin: 0;
  padding: var(--space-4) var(--space-6) var(--space-2);
  font-size: var(--fs-label);
  font-weight: var(--fw-semibold);
  letter-spacing: var(--ls-caps);
  text-transform: uppercase;
  color: var(--ink-faint);
}

.navList {
  list-style: none;
  margin: 0 0 var(--space-3);
  padding: 0;
}

.navLink {
  display: block;
  padding: var(--space-2) var(--space-6);
  font-size: var(--fs-body);
  color: var(--ink-muted);
  text-decoration: none;
  border-left: 2px solid transparent;
  transition: color var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out);
}

.navLink:hover {
  color: var(--ink-strong);
  border-left-color: var(--stroke-strong);
}

.navLinkActive {
  color: var(--brand-1);
  font-weight: var(--fw-medium);
  border-left-color: var(--brand-1);
}
```

- [ ] **Update `src/app/app/route-meta.ts` — add new settings routes**

Find the existing settings-related entries and add the following BEFORE the generic `/app/settings` entry (more specific prefixes must come first):

```typescript
  {
    prefix: "/app/settings/profile",
    title: "Profile",
    subtitle: "Your display name and account security.",
    crumbs: ["Settings", "Profile"],
  },
  {
    prefix: "/app/settings/appearance",
    title: "Appearance",
    subtitle: "Visual theme for your workspace.",
    crumbs: ["Settings", "Appearance"],
  },
  {
    prefix: "/app/settings/company",
    title: "Company",
    subtitle: "Workspace name, logo, timezone, and currency.",
    crumbs: ["Settings", "Company"],
  },
  {
    prefix: "/app/settings/team",
    title: "Team",
    subtitle: "Members, roles, and invitations.",
    crumbs: ["Settings", "Team"],
  },
  {
    prefix: "/app/settings/integrations",
    title: "Integrations",
    subtitle: "Shopify and other connected services.",
    crumbs: ["Settings", "Integrations"],
  },
  {
    prefix: "/app/settings/locations",
    title: "Locations",
    subtitle: "Default warehouse location for the workspace.",
    crumbs: ["Settings", "Locations"],
  },
  {
    prefix: "/app/settings/invoices",
    title: "Invoices",
    subtitle: "Monthly subscription invoices.",
    crumbs: ["Settings", "Invoices"],
  },
```

Also update the existing `/app/settings/theme` entry to `/app/settings/appearance`.

- [ ] **Run TypeScript check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Commit**

```bash
git add src/app/app/settings/layout.tsx src/app/app/settings/settings-sidebar.tsx \
  src/app/app/settings/settings-layout.module.css src/app/app/settings/page.tsx \
  src/app/app/route-meta.ts
git commit -m "feat(settings): two-column layout with sidebar nav and role-based redirect"
```

---

### Task 3: Profile section

**Goal:** Build the Profile settings section — editable display name, read-only email and role, password reset button.

**Files:**
- Create: `src/app/app/settings/profile/page.tsx`
- Create: `src/app/app/settings/profile/profile-form.tsx`
- Create: `src/app/app/settings/profile/actions.ts`
- Create: `src/app/app/settings/profile/profile.module.css`

**Acceptance Criteria:**
- [ ] Displays current user's display name (editable), email (read-only), role (read-only)
- [ ] Saving name updates `profiles.full_name`
- [ ] "Send password reset email" triggers Supabase Auth reset flow and shows success message
- [ ] Non-admin users can access this page

**Verify:** `npx tsc --noEmit` → zero errors. Navigate to `/app/settings/profile`, edit name, save, reload — name persists.

**Steps:**

- [ ] **Create `src/app/app/settings/profile/actions.ts`**

```typescript
"use server";

import { getServerTenantContext } from "@/lib/tenant/context";
import { revalidatePath } from "next/cache";

type State = { error?: string; success?: string } | null;

export async function updateProfile(
  _prev: State,
  formData: FormData
): Promise<State> {
  const ctx = await getServerTenantContext();
  if (!ctx) return { error: "Not authenticated" };

  const { data: { user } } = await ctx.supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const fullName = (formData.get("full_name") as string)?.trim();
  if (!fullName) return { error: "Name is required" };

  const { error } = await ctx.supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/app/settings/profile");
  return { success: "Profile updated" };
}

export async function sendPasswordReset(
  _prev: State,
  _formData: FormData
): Promise<State> {
  const ctx = await getServerTenantContext();
  if (!ctx) return { error: "Not authenticated" };

  const { data: { user } } = await ctx.supabase.auth.getUser();
  if (!user?.email) return { error: "No email found" };

  const { error } = await ctx.supabase.auth.resetPasswordForEmail(user.email);
  if (error) return { error: error.message };

  return { success: "Password reset email sent — check your inbox" };
}
```

- [ ] **Create `src/app/app/settings/profile/profile-form.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { updateProfile, sendPasswordReset } from "./actions";
import styles from "./profile.module.css";

type State = { error?: string; success?: string } | null;

type Props = {
  fullName: string | null;
  email: string;
  role: string;
};

export default function ProfileForm({ fullName, email, role }: Props) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    updateProfile,
    null
  );
  const [resetState, resetAction, resetPending] = useActionState<State, FormData>(
    sendPasswordReset,
    null
  );

  return (
    <div className={styles.sections}>
      <section className={styles.section}>
        <h2 className={styles.heading}>Personal information</h2>
        <form action={formAction} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="full_name">
              Display name
            </label>
            <input
              id="full_name"
              name="full_name"
              type="text"
              className={styles.input}
              defaultValue={fullName ?? ""}
              placeholder="Your name"
              required
            />
          </div>
          <div className={styles.field}>
            <span className={styles.label}>Email</span>
            <span className={styles.readOnly}>{email}</span>
          </div>
          <div className={styles.field}>
            <span className={styles.label}>Role</span>
            <span className={styles.readOnly}>{role}</span>
          </div>
          <div className={styles.actions}>
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={pending}
            >
              {pending ? "Saving…" : "Save changes"}
            </button>
            {state?.success && (
              <span className={styles.feedback}>{state.success}</span>
            )}
            {state?.error && (
              <span className={styles.errorMsg}>{state.error}</span>
            )}
          </div>
        </form>
      </section>

      <hr className={styles.divider} />

      <section className={styles.section}>
        <h2 className={styles.heading}>Password</h2>
        <p className={styles.description}>
          We&apos;ll send a reset link to your email address.
        </p>
        <form action={resetAction}>
          <div className={styles.actions}>
            <button
              type="submit"
              className={styles.secondaryButton}
              disabled={resetPending}
            >
              {resetPending ? "Sending…" : "Send password reset email"}
            </button>
            {resetState?.success && (
              <span className={styles.feedback}>{resetState.success}</span>
            )}
            {resetState?.error && (
              <span className={styles.errorMsg}>{resetState.error}</span>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
```

- [ ] **Create `src/app/app/settings/profile/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import PageHeader from "../../_ui/page-header";
import ProfileForm from "./profile-form";

export default async function ProfilePage() {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/app/auth/login");

  const {
    data: { user },
  } = await ctx.supabase.auth.getUser();
  if (!user) redirect("/app/auth/login");

  const { data: profile } = await ctx.supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  return (
    <>
      <PageHeader
        eyebrow="Personal"
        title="Profile"
        description="Your display name and account security."
      />
      <ProfileForm
        fullName={profile?.full_name ?? null}
        email={user.email ?? ""}
        role={ctx.role}
      />
    </>
  );
}
```

- [ ] **Create `src/app/app/settings/profile/profile.module.css`**

```css
.sections {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
  margin-top: var(--space-6);
}

.section {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.heading {
  margin: 0;
  font-size: var(--fs-h3);
  font-weight: var(--fw-semibold);
  color: var(--ink-strong);
}

.description {
  margin: 0;
  font-size: var(--fs-body);
  color: var(--ink-muted);
}

.divider {
  border: none;
  border-top: 1px solid var(--stroke);
  margin: 0;
}

.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.label {
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  color: var(--ink-muted);
}

.readOnly {
  font-size: var(--fs-body);
  color: var(--ink-strong);
  padding: var(--space-1) 0;
}

.input {
  font-family: var(--font-body);
  font-size: var(--fs-body);
  color: var(--ink-strong);
  background: var(--bg-input);
  border: 1px solid var(--stroke-card);
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-3);
  width: 100%;
  max-width: 360px;
}

.input:focus {
  outline: none;
  border-color: var(--brand-1);
  box-shadow: var(--shadow-focus);
}

.actions {
  display: flex;
  gap: var(--space-3);
  align-items: center;
}

.primaryButton {
  font-family: var(--font-body);
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  background: var(--brand-1);
  color: var(--ink-on-brand);
  border: none;
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-4);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out);
}

.primaryButton:hover:not(:disabled) {
  background: var(--brand-2);
}

.primaryButton:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.secondaryButton {
  font-family: var(--font-body);
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  background: transparent;
  color: var(--ink-muted);
  border: 1px solid var(--stroke-card);
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-4);
  cursor: pointer;
  transition: border-color var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out);
}

.secondaryButton:hover:not(:disabled) {
  border-color: var(--stroke-strong);
  color: var(--ink-strong);
}

.secondaryButton:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.feedback {
  font-size: var(--fs-sm);
  color: var(--ok);
}

.errorMsg {
  font-size: var(--fs-sm);
  color: var(--danger);
}
```

- [ ] **Run TypeScript check and commit**

```bash
npx tsc --noEmit
git add src/app/app/settings/profile/
git commit -m "feat(settings): profile section — display name and password reset"
```

---

### Task 4: Appearance section and theme redirect

**Goal:** Create the Appearance section (relocating the theme picker), redirect the old `/settings/theme` route, and update the topbar link.

**Files:**
- Create: `src/app/app/settings/appearance/page.tsx`
- Create: `src/app/app/settings/appearance/theme-picker.tsx` *(copy from theme/)*
- Create: `src/app/app/settings/appearance/appearance.module.css`
- Modify: `src/app/app/settings/theme/page.tsx` — replace with redirect
- Modify: `src/app/app/topbar.tsx` — update href line 48
- Delete: `src/app/app/settings/theme/theme-picker.tsx`
- Delete: `src/app/app/settings/theme/theme.module.css`

**Acceptance Criteria:**
- [ ] `/app/settings/appearance` shows the theme picker
- [ ] `/app/settings/theme` redirects to `/app/settings/appearance`
- [ ] Topbar "Theme" link points to `/app/settings/appearance`
- [ ] Theme switching still works (localStorage-based)

**Verify:** `npx tsc --noEmit` → zero errors. Navigate to `/app/settings/theme` — should redirect. Switch theme in appearance section — should take effect immediately.

**Steps:**

- [ ] **Copy theme-picker to appearance directory**

Copy the full contents of `src/app/app/settings/theme/theme-picker.tsx` into `src/app/app/settings/appearance/theme-picker.tsx`. Update the CSS import at the top:

```tsx
// Change this import at the top of the file:
import styles from "./appearance.module.css";
// (was: import styles from "./theme.module.css")
```

No other changes needed — the component logic is identical.

- [ ] **Create `src/app/app/settings/appearance/page.tsx`**

```tsx
import PageHeader from "../../_ui/page-header";
import ThemePicker from "./theme-picker";

export default function AppearancePage() {
  return (
    <>
      <PageHeader
        eyebrow="Personal"
        title="Appearance"
        description="Choose a visual theme for your workspace."
      />
      <ThemePicker />
    </>
  );
}
```

- [ ] **Create `src/app/app/settings/appearance/appearance.module.css`**

Copy the contents of `src/app/app/settings/theme/theme.module.css` verbatim. No changes needed — all class names remain the same.

- [ ] **Replace `src/app/app/settings/theme/page.tsx` with a redirect**

```tsx
import { redirect } from "next/navigation";

export default function ThemeSettingsRedirect() {
  redirect("/app/settings/appearance");
}
```

- [ ] **Update `src/app/app/topbar.tsx` line 48**

```tsx
// Before:
<Link className={styles.topbarLink} href="/app/settings/theme">
  Theme
</Link>

// After:
<Link className={styles.topbarLink} href="/app/settings/appearance">
  Theme
</Link>
```

- [ ] **Delete old theme files**

```bash
rm src/app/app/settings/theme/theme-picker.tsx
rm src/app/app/settings/theme/theme.module.css
```

- [ ] **Run TypeScript check and commit**

```bash
npx tsc --noEmit
git add src/app/app/settings/appearance/ src/app/app/settings/theme/page.tsx \
  src/app/app/topbar.tsx
git commit -m "feat(settings): appearance section, redirect /theme → /appearance, update topbar"
```

---

### Task 5: Company section

**Goal:** Build the Company settings section — editable company name, timezone, currency, and logo upload.

**Files:**
- Create: `src/app/app/settings/company/page.tsx`
- Create: `src/app/app/settings/company/company-form.tsx`
- Create: `src/app/app/settings/company/actions.ts`
- Create: `src/app/app/settings/company/company.module.css`

**Acceptance Criteria:**
- [ ] Non-admins are redirected to `/app/settings/profile`
- [ ] Current company name, timezone, and currency are pre-filled
- [ ] Saving updates `tenant.name`, `tenant.timezone`, `tenant.currency`
- [ ] Logo upload writes to `tenant-logos` bucket and saves public URL in `tenant.logo_url`
- [ ] Logo preview shows current logo if set

**Verify:** `npx tsc --noEmit` → zero errors. Update company name and save — reload confirms persistence. Upload a logo — preview updates.

**Steps:**

- [ ] **Create `src/app/app/settings/company/actions.ts`**

```typescript
"use server";

import { getServerTenantContext } from "@/lib/tenant/context";
import { revalidatePath } from "next/cache";

type State = { error?: string; success?: string } | null;

function requireAdmin(role: string): State | null {
  if (role !== "admin" && role !== "super_admin") {
    return { error: "Admin access required" };
  }
  return null;
}

export async function updateCompany(
  _prev: State,
  formData: FormData
): Promise<State> {
  const ctx = await getServerTenantContext();
  if (!ctx) return { error: "Not authenticated" };
  const err = requireAdmin(ctx.role);
  if (err) return err;

  const name = (formData.get("name") as string)?.trim();
  const timezone = (formData.get("timezone") as string)?.trim();
  const currency = (formData.get("currency") as string)?.trim();

  if (!name) return { error: "Company name is required" };
  if (!timezone) return { error: "Timezone is required" };
  if (!currency) return { error: "Currency is required" };

  const { error } = await ctx.supabase
    .from("tenant")
    .update({ name, timezone, currency })
    .eq("id", ctx.tenantId);

  if (error) return { error: error.message };

  revalidatePath("/app/settings/company");
  return { success: "Company settings updated" };
}

export async function uploadLogo(
  _prev: State,
  formData: FormData
): Promise<State> {
  const ctx = await getServerTenantContext();
  if (!ctx) return { error: "Not authenticated" };
  const err = requireAdmin(ctx.role);
  if (err) return err;

  const file = formData.get("logo") as File;
  if (!file || file.size === 0) return { error: "No file selected" };
  if (file.size > 2 * 1024 * 1024) return { error: "Logo must be under 2 MB" };

  const allowed = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
  if (!allowed.includes(file.type)) {
    return { error: "Use PNG, JPEG, WebP, or SVG" };
  }

  const ext = file.name.split(".").pop() ?? "png";
  const path = `${ctx.tenantId}/logo.${ext}`;
  const bytes = await file.arrayBuffer();

  const { error: uploadError } = await ctx.supabase.storage
    .from("tenant-logos")
    .upload(path, bytes, { contentType: file.type, upsert: true });

  if (uploadError) return { error: uploadError.message };

  const {
    data: { publicUrl },
  } = ctx.supabase.storage.from("tenant-logos").getPublicUrl(path);

  await ctx.supabase
    .from("tenant")
    .update({ logo_url: publicUrl })
    .eq("id", ctx.tenantId);

  revalidatePath("/app/settings/company");
  return { success: "Logo updated" };
}
```

- [ ] **Create `src/app/app/settings/company/company-form.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { updateCompany, uploadLogo } from "./actions";
import styles from "./company.module.css";

type State = { error?: string; success?: string } | null;

const TIMEZONES = [
  "Pacific/Auckland",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Brisbane",
  "Australia/Perth",
  "Asia/Singapore",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "UTC",
];

const CURRENCIES = [
  { code: "NZD", label: "NZD — New Zealand Dollar" },
  { code: "AUD", label: "AUD — Australian Dollar" },
  { code: "USD", label: "USD — US Dollar" },
  { code: "GBP", label: "GBP — British Pound" },
  { code: "EUR", label: "EUR — Euro" },
  { code: "SGD", label: "SGD — Singapore Dollar" },
];

type Props = {
  name: string;
  timezone: string;
  currency: string;
  logoUrl: string | null;
  createdAt: string;
};

export default function CompanyForm({
  name,
  timezone,
  currency,
  logoUrl,
  createdAt,
}: Props) {
  const [state, formAction, pending] = useActionState<State, FormData>(
    updateCompany,
    null
  );
  const [logoState, logoAction, logoPending] = useActionState<State, FormData>(
    uploadLogo,
    null
  );

  return (
    <div className={styles.sections}>
      <section className={styles.section}>
        <h2 className={styles.heading}>Company details</h2>
        <form action={formAction} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="name">
              Company name
            </label>
            <input
              id="name"
              name="name"
              type="text"
              className={styles.input}
              defaultValue={name}
              required
            />
          </div>
          <div className={styles.fieldRow}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="timezone">
                Timezone
              </label>
              <select
                id="timezone"
                name="timezone"
                className={styles.select}
                defaultValue={timezone}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="currency">
                Currency
              </label>
              <select
                id="currency"
                name="currency"
                className={styles.select}
                defaultValue={currency}
              >
                {CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className={styles.actions}>
            <button
              type="submit"
              className={styles.primaryButton}
              disabled={pending}
            >
              {pending ? "Saving…" : "Save changes"}
            </button>
            {state?.success && (
              <span className={styles.feedback}>{state.success}</span>
            )}
            {state?.error && (
              <span className={styles.errorMsg}>{state.error}</span>
            )}
          </div>
        </form>
      </section>

      <hr className={styles.divider} />

      <section className={styles.section}>
        <h2 className={styles.heading}>Logo</h2>
        <p className={styles.description}>
          PNG, JPEG, WebP, or SVG. Max 2 MB. Used in exported reports.
        </p>
        {logoUrl && (
          <img
            src={logoUrl}
            alt="Company logo"
            className={styles.logoPreview}
          />
        )}
        <form action={logoAction} className={styles.form}>
          <input
            name="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className={styles.fileInput}
            required
          />
          <div className={styles.actions}>
            <button
              type="submit"
              className={styles.secondaryButton}
              disabled={logoPending}
            >
              {logoPending ? "Uploading…" : "Upload logo"}
            </button>
            {logoState?.success && (
              <span className={styles.feedback}>{logoState.success}</span>
            )}
            {logoState?.error && (
              <span className={styles.errorMsg}>{logoState.error}</span>
            )}
          </div>
        </form>
      </section>

      <hr className={styles.divider} />

      <section className={styles.section}>
        <h2 className={styles.heading}>Workspace info</h2>
        <div className={styles.infoGrid}>
          <div className={styles.infoField}>
            <span className={styles.label}>Plan</span>
            <span className={styles.readOnly}>Manuva Pro</span>
          </div>
          <div className={styles.infoField}>
            <span className={styles.label}>Member since</span>
            <span className={styles.readOnly}>
              {new Date(createdAt).toLocaleDateString("en-AU", {
                month: "long",
                year: "numeric",
              })}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
```

- [ ] **Create `src/app/app/settings/company/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import PageHeader from "../../_ui/page-header";
import CompanyForm from "./company-form";

export default async function CompanyPage() {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/app/auth/login");
  if (ctx.role !== "admin" && ctx.role !== "super_admin") {
    redirect("/app/settings/profile");
  }

  const { data: tenant } = await ctx.supabase
    .from("tenant")
    .select("name, timezone, currency, logo_url, created_at")
    .eq("id", ctx.tenantId)
    .single();

  if (!tenant) redirect("/app/settings/profile");

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Company"
        description="Workspace name, logo, timezone, and currency."
      />
      <CompanyForm
        name={tenant.name}
        timezone={tenant.timezone ?? "Pacific/Auckland"}
        currency={tenant.currency ?? "NZD"}
        logoUrl={tenant.logo_url ?? null}
        createdAt={tenant.created_at}
      />
    </>
  );
}
```

- [ ] **Create `src/app/app/settings/company/company.module.css`**

```css
.sections {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
  margin-top: var(--space-6);
}

.section {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.heading {
  margin: 0;
  font-size: var(--fs-h3);
  font-weight: var(--fw-semibold);
  color: var(--ink-strong);
}

.description {
  margin: 0;
  font-size: var(--fs-body);
  color: var(--ink-muted);
}

.divider {
  border: none;
  border-top: 1px solid var(--stroke);
  margin: 0;
}

.form {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  flex: 1;
}

.fieldRow {
  display: flex;
  gap: var(--space-4);
}

.label {
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  color: var(--ink-muted);
}

.readOnly {
  font-size: var(--fs-body);
  color: var(--ink-strong);
}

.input {
  font-family: var(--font-body);
  font-size: var(--fs-body);
  color: var(--ink-strong);
  background: var(--bg-input);
  border: 1px solid var(--stroke-card);
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-3);
  max-width: 360px;
  width: 100%;
}

.input:focus {
  outline: none;
  border-color: var(--brand-1);
  box-shadow: var(--shadow-focus);
}

.select {
  font-family: var(--font-body);
  font-size: var(--fs-body);
  color: var(--ink-strong);
  background: var(--bg-input);
  border: 1px solid var(--stroke-card);
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-3);
  width: 100%;
}

.select:focus {
  outline: none;
  border-color: var(--brand-1);
  box-shadow: var(--shadow-focus);
}

.fileInput {
  font-family: var(--font-body);
  font-size: var(--fs-sm);
  color: var(--ink-muted);
}

.logoPreview {
  max-height: 48px;
  max-width: 200px;
  object-fit: contain;
  border-radius: var(--radius-xs);
}

.infoGrid {
  display: flex;
  gap: var(--space-8);
}

.infoField {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.actions {
  display: flex;
  gap: var(--space-3);
  align-items: center;
}

.primaryButton {
  font-family: var(--font-body);
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  background: var(--brand-1);
  color: var(--ink-on-brand);
  border: none;
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-4);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out);
}

.primaryButton:hover:not(:disabled) { background: var(--brand-2); }
.primaryButton:disabled { opacity: 0.6; cursor: not-allowed; }

.secondaryButton {
  font-family: var(--font-body);
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  background: transparent;
  color: var(--ink-muted);
  border: 1px solid var(--stroke-card);
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-4);
  cursor: pointer;
  transition: border-color var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out);
}

.secondaryButton:hover:not(:disabled) {
  border-color: var(--stroke-strong);
  color: var(--ink-strong);
}

.secondaryButton:disabled { opacity: 0.6; cursor: not-allowed; }

.feedback { font-size: var(--fs-sm); color: var(--ok); }
.errorMsg { font-size: var(--fs-sm); color: var(--danger); }
```

- [ ] **Run TypeScript check and commit**

```bash
npx tsc --noEmit
git add src/app/app/settings/company/
git commit -m "feat(settings): company section — name, timezone, currency, logo upload"
```

---

### Task 6: Team section and deactivation enforcement

**Goal:** Build the Team section — member table with role and status, invite-by-email, change role, deactivate. Enforce `profiles.status` check in `getServerTenantContext()`.

**Files:**
- Create: `src/lib/supabase/admin.ts`
- Modify: `src/lib/tenant/context.ts`
- Create: `src/app/app/settings/team/page.tsx`
- Create: `src/app/app/settings/team/invite-form.tsx`
- Create: `src/app/app/settings/team/team-row-actions.tsx`
- Create: `src/app/app/settings/team/actions.ts`
- Create: `src/app/app/settings/team/team.module.css`

**Acceptance Criteria:**
- [ ] A deactivated user (`profiles.status = 'deactivated'`) is returned `null` from `getServerTenantContext()` and cannot access the app
- [ ] Team page lists all members with name, email, role, status
- [ ] Invite sends a Supabase Auth invite email with `invited_tenant_id` metadata
- [ ] Role dropdown changes `profiles.role`
- [ ] Deactivate sets `profiles.status = 'deactivated'`; current user cannot deactivate themselves

**Verify:** `npx tsc --noEmit` → zero errors. Invite a test email — Supabase dashboard shows the user in auth.users. Change a member's role — reload confirms change.

**Steps:**

- [ ] **Create `src/lib/supabase/admin.ts`**

```typescript
import { createClient } from "@supabase/supabase-js";

export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
```

Ensure `SUPABASE_SERVICE_ROLE_KEY` is in `.env.local` (already used by the project for other server-side operations; if missing, add it from the Supabase dashboard → Project Settings → API → service_role key).

- [ ] **Update `src/lib/tenant/context.ts` — add status check**

Change the profiles select and add the status guard:

```typescript
// Change:
const { data: profile } = await supabase
  .from("profiles")
  .select("tenant_id,role")
  .eq("id", user.id)
  .single();

if (!profile?.tenant_id) {
  return null;
}

// To:
const { data: profile } = await supabase
  .from("profiles")
  .select("tenant_id,role,status")
  .eq("id", user.id)
  .single();

if (!profile?.tenant_id) {
  return null;
}

if (profile.status === "deactivated") {
  return null;
}
```

- [ ] **Create `src/app/app/settings/team/actions.ts`**

```typescript
"use server";

import { getServerTenantContext } from "@/lib/tenant/context";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

type State = { error?: string; success?: string } | null;

function requireAdmin(role: string): State | null {
  if (role !== "admin" && role !== "super_admin") {
    return { error: "Admin access required" };
  }
  return null;
}

export async function inviteMember(
  _prev: State,
  formData: FormData
): Promise<State> {
  const ctx = await getServerTenantContext();
  if (!ctx) return { error: "Not authenticated" };
  const err = requireAdmin(ctx.role);
  if (err) return err;

  const email = (formData.get("email") as string)?.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { error: "Valid email address required" };
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { invited_tenant_id: ctx.tenantId, invited_role: "member" },
  });

  if (error) return { error: error.message };

  revalidatePath("/app/settings/team");
  return { success: `Invitation sent to ${email}` };
}

export async function updateMemberRole(
  _prev: State,
  formData: FormData
): Promise<State> {
  const ctx = await getServerTenantContext();
  if (!ctx) return { error: "Not authenticated" };
  const err = requireAdmin(ctx.role);
  if (err) return err;

  const profileId = formData.get("profile_id") as string;
  const role = formData.get("role") as string;

  if (!["member", "admin"].includes(role)) {
    return { error: "Invalid role" };
  }

  const { error } = await ctx.supabase
    .from("profiles")
    .update({ role })
    .eq("id", profileId)
    .eq("tenant_id", ctx.tenantId);

  if (error) return { error: error.message };

  revalidatePath("/app/settings/team");
  return { success: "Role updated" };
}

export async function deactivateMember(
  _prev: State,
  formData: FormData
): Promise<State> {
  const ctx = await getServerTenantContext();
  if (!ctx) return { error: "Not authenticated" };
  const err = requireAdmin(ctx.role);
  if (err) return err;

  const profileId = formData.get("profile_id") as string;

  const {
    data: { user },
  } = await ctx.supabase.auth.getUser();
  if (user?.id === profileId) {
    return { error: "You cannot deactivate yourself" };
  }

  const { error } = await ctx.supabase
    .from("profiles")
    .update({ status: "deactivated" })
    .eq("id", profileId)
    .eq("tenant_id", ctx.tenantId);

  if (error) return { error: error.message };

  revalidatePath("/app/settings/team");
  return { success: "Member deactivated" };
}
```

- [ ] **Create `src/app/app/settings/team/invite-form.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { inviteMember } from "./actions";
import styles from "./team.module.css";

type State = { error?: string; success?: string } | null;

export default function InviteForm() {
  const [state, formAction, pending] = useActionState<State, FormData>(
    inviteMember,
    null
  );

  return (
    <form action={formAction} className={styles.inviteForm}>
      <input
        name="email"
        type="email"
        placeholder="colleague@company.com"
        className={styles.inviteInput}
        required
      />
      <button
        type="submit"
        className={styles.primaryButton}
        disabled={pending}
      >
        {pending ? "Sending…" : "Invite member"}
      </button>
      {state?.success && (
        <span className={styles.feedback}>{state.success}</span>
      )}
      {state?.error && <span className={styles.errorMsg}>{state.error}</span>}
    </form>
  );
}
```

- [ ] **Create `src/app/app/settings/team/team-row-actions.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { updateMemberRole, deactivateMember } from "./actions";
import styles from "./team.module.css";

type State = { error?: string; success?: string } | null;

type Props = {
  profileId: string;
  currentRole: string;
  status: string;
  isSelf: boolean;
};

export default function TeamRowActions({
  profileId,
  currentRole,
  status,
  isSelf,
}: Props) {
  const [roleState, roleAction, rolePending] = useActionState<State, FormData>(
    updateMemberRole,
    null
  );
  const [deactivateState, deactivateAction, deactivatePending] =
    useActionState<State, FormData>(deactivateMember, null);

  if (status === "deactivated") {
    return <span className={styles.deactivatedBadge}>Deactivated</span>;
  }

  return (
    <div className={styles.rowActions}>
      <form action={roleAction} className={styles.roleForm}>
        <input type="hidden" name="profile_id" value={profileId} />
        <select
          name="role"
          defaultValue={currentRole}
          className={styles.roleSelect}
          onChange={(e) => {
            const form = e.currentTarget.form;
            if (form) form.requestSubmit();
          }}
          disabled={rolePending}
        >
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
      </form>

      {!isSelf && (
        <form action={deactivateAction}>
          <input type="hidden" name="profile_id" value={profileId} />
          <button
            type="submit"
            className={styles.dangerButton}
            disabled={deactivatePending}
            onClick={(e) => {
              if (!confirm("Deactivate this member? They will lose access immediately.")) {
                e.preventDefault();
              }
            }}
          >
            Deactivate
          </button>
        </form>
      )}

      {roleState?.error && (
        <span className={styles.errorMsg}>{roleState.error}</span>
      )}
      {deactivateState?.error && (
        <span className={styles.errorMsg}>{deactivateState.error}</span>
      )}
    </div>
  );
}
```

- [ ] **Create `src/app/app/settings/team/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import PageHeader from "../../_ui/page-header";
import InviteForm from "./invite-form";
import TeamRowActions from "./team-row-actions";
import styles from "./team.module.css";

export default async function TeamPage() {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/app/auth/login");
  if (ctx.role !== "admin" && ctx.role !== "super_admin") {
    redirect("/app/settings/profile");
  }

  const {
    data: { user },
  } = await ctx.supabase.auth.getUser();

  const { data: members } = await ctx.supabase
    .from("profiles")
    .select("id, full_name, role, status")
    .eq("tenant_id", ctx.tenantId)
    .order("role", { ascending: false });

  // Fetch emails from profile_tenant_access joined with auth — use admin client
  // Note: auth.users is only accessible via admin client or via user metadata
  // For now, show email as "—" unless stored in profiles in the future.
  // A follow-up task can enrich this by storing email in profiles on invite.

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Team"
        description="Members, roles, and invitations."
      />
      <div className={styles.page}>
        <div className={styles.inviteRow}>
          <h2 className={styles.heading}>Invite a member</h2>
          <InviteForm />
        </div>

        <table className={styles.table}>
          <thead>
            <tr className={styles.thead}>
              <th className={styles.th}>Name</th>
              <th className={styles.th}>Role</th>
              <th className={styles.th}>Status</th>
              <th className={styles.th}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(members ?? []).map((member) => (
              <tr key={member.id} className={styles.tr}>
                <td className={styles.td}>
                  {member.full_name ?? (
                    <span className={styles.muted}>No name set</span>
                  )}
                  {member.id === user?.id && (
                    <span className={styles.youBadge}> (you)</span>
                  )}
                </td>
                <td className={styles.td}>{member.role}</td>
                <td className={styles.td}>
                  <span
                    className={
                      member.status === "active"
                        ? styles.activeBadge
                        : styles.deactivatedBadge
                    }
                  >
                    {member.status}
                  </span>
                </td>
                <td className={styles.td}>
                  <TeamRowActions
                    profileId={member.id}
                    currentRole={member.role}
                    status={member.status}
                    isSelf={member.id === user?.id}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
```

- [ ] **Create `src/app/app/settings/team/team.module.css`**

```css
.page {
  display: flex;
  flex-direction: column;
  gap: var(--space-8);
  margin-top: var(--space-6);
}

.heading {
  margin: 0;
  font-size: var(--fs-h3);
  font-weight: var(--fw-semibold);
  color: var(--ink-strong);
}

.inviteRow {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.inviteForm {
  display: flex;
  gap: var(--space-3);
  align-items: center;
  flex-wrap: wrap;
}

.inviteInput {
  font-family: var(--font-body);
  font-size: var(--fs-body);
  color: var(--ink-strong);
  background: var(--bg-input);
  border: 1px solid var(--stroke-card);
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-3);
  width: 280px;
}

.inviteInput:focus {
  outline: none;
  border-color: var(--brand-1);
  box-shadow: var(--shadow-focus);
}

.table {
  width: 100%;
  border-collapse: collapse;
}

.thead tr {
  border-bottom: 1px solid var(--stroke);
}

.th {
  padding: var(--space-2) var(--space-3);
  text-align: left;
  font-size: var(--fs-label);
  font-weight: var(--fw-semibold);
  color: var(--ink-faint);
  text-transform: uppercase;
  letter-spacing: var(--ls-caps);
}

.tr {
  border-bottom: 1px solid var(--stroke);
}

.tr:last-child {
  border-bottom: none;
}

.td {
  padding: var(--space-3);
  font-size: var(--fs-body);
  color: var(--ink-strong);
  vertical-align: middle;
}

.muted {
  color: var(--ink-faint);
  font-style: italic;
}

.youBadge {
  font-size: var(--fs-sm);
  color: var(--ink-faint);
}

.activeBadge {
  font-size: var(--fs-badge);
  font-weight: var(--fw-medium);
  color: var(--ok);
  background: var(--ok-dim);
  border-radius: var(--radius-pill);
  padding: 2px var(--space-2);
}

.deactivatedBadge {
  font-size: var(--fs-badge);
  font-weight: var(--fw-medium);
  color: var(--ink-faint);
  background: var(--bg-card-2);
  border-radius: var(--radius-pill);
  padding: 2px var(--space-2);
}

.rowActions {
  display: flex;
  gap: var(--space-2);
  align-items: center;
}

.roleForm {
  display: flex;
}

.roleSelect {
  font-family: var(--font-body);
  font-size: var(--fs-sm);
  color: var(--ink-strong);
  background: var(--bg-input);
  border: 1px solid var(--stroke-card);
  border-radius: var(--radius-xs);
  padding: var(--space-1) var(--space-2);
  cursor: pointer;
}

.primaryButton {
  font-family: var(--font-body);
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  background: var(--brand-1);
  color: var(--ink-on-brand);
  border: none;
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-4);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out);
}

.primaryButton:hover:not(:disabled) { background: var(--brand-2); }
.primaryButton:disabled { opacity: 0.6; cursor: not-allowed; }

.dangerButton {
  font-family: var(--font-body);
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  background: transparent;
  color: var(--danger);
  border: 1px solid var(--danger-dim);
  border-radius: var(--radius-xs);
  padding: var(--space-1) var(--space-2);
  cursor: pointer;
  transition: background var(--dur-fast) var(--ease-out);
}

.dangerButton:hover:not(:disabled) { background: var(--danger-dim); }
.dangerButton:disabled { opacity: 0.6; cursor: not-allowed; }

.feedback { font-size: var(--fs-sm); color: var(--ok); }
.errorMsg { font-size: var(--fs-sm); color: var(--danger); }
```

- [ ] **Run TypeScript check and commit**

```bash
npx tsc --noEmit
git add src/lib/supabase/admin.ts src/lib/tenant/context.ts \
  src/app/app/settings/team/
git commit -m "feat(settings): team section — invite, role change, deactivate, status enforcement"
```

---

### Task 7: Integrations section

**Goal:** Create the Integrations section with a card grid. Move the Shopify components here from the root settings directory. Delete the old root-level Shopify files.

**Files:**
- Create: `src/app/app/settings/integrations/page.tsx`
- Create: `src/app/app/settings/integrations/shopify-manage.tsx`
- Create: `src/app/app/settings/integrations/integrations.module.css`
- Move (copy + delete): `settings/shopify-connect.tsx` → `settings/integrations/shopify-connect.tsx`
- Move (copy + delete): `settings/sync-submit-form.tsx` → `settings/integrations/sync-submit-form.tsx`
- Move (copy + delete): `settings/sync-meta-chips.tsx` → `settings/integrations/sync-meta-chips.tsx`
- Delete: original root-level `shopify-connect.tsx`, `sync-submit-form.tsx`, `sync-meta-chips.tsx`

**Acceptance Criteria:**
- [ ] `/app/settings/integrations` shows a card grid with a Shopify tile
- [ ] Shopify tile shows connection status (connected / not connected)
- [ ] Clicking "Manage" expands the Shopify panel with store list, sync, and disconnect
- [ ] Root-level shopify files are removed and no imports reference the old paths

**Verify:** `npx tsc --noEmit` → zero errors. Navigate to `/app/settings/integrations` — Shopify tile shows with correct status. Sync button works.

**Steps:**

- [ ] **Copy Shopify components to integrations directory**

Copy these three files without changes (only the file location changes):
- `src/app/app/settings/shopify-connect.tsx` → `src/app/app/settings/integrations/shopify-connect.tsx`
- `src/app/app/settings/sync-submit-form.tsx` → `src/app/app/settings/integrations/sync-submit-form.tsx`
- `src/app/app/settings/sync-meta-chips.tsx` → `src/app/app/settings/integrations/sync-meta-chips.tsx`

No import paths inside these files need updating — they reference API routes (`/api/shopify/...`), not other local files.

- [ ] **Create `src/app/app/settings/integrations/shopify-manage.tsx`**

This wraps the existing Shopify components into an expandable manage panel:

```tsx
"use client";

import { useState } from "react";
import ShopifyConnect from "./shopify-connect";
import SyncSubmitForm from "./sync-submit-form";
import SyncMetaChips from "./sync-meta-chips";
import styles from "./integrations.module.css";

type Store = {
  id: string;
  store_domain: string;
  status: string;
  created_at: string | null;
  last_synced_at: string | null;
  last_sync_status: string | null;
  last_sync_meta: Record<string, unknown> | null;
};

type Props = {
  stores: Store[];
  shopifyStatus?: string;
  syncError?: string;
};

export default function ShopifyManage({
  stores,
  shopifyStatus,
  syncError,
}: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className={styles.managePanel}>
      <button
        type="button"
        className={styles.manageToggle}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? "Close" : "Manage"}
      </button>

      {open && (
        <div className={styles.manageContent}>
          <ShopifyConnect status={shopifyStatus} detail={syncError} />

          {stores.length > 0 && (
            <div className={styles.storeList}>
              <p className={styles.storeListHeading}>Connected stores</p>
              {stores.map((store) => (
                <div key={store.id} className={styles.storeRow}>
                  <div className={styles.storeMeta}>
                    <strong>{store.store_domain}</strong>
                    <span className={styles.storeDetail}>
                      Last sync:{" "}
                      {store.last_synced_at
                        ? new Date(store.last_synced_at).toLocaleString("en-AU")
                        : "Never"}
                    </span>
                    <span className={styles.storeDetail}>
                      Status: {store.last_sync_status ?? "unknown"}
                    </span>
                    <SyncMetaChips meta={store.last_sync_meta} />
                  </div>
                  <div className={styles.storeActions}>
                    <SyncSubmitForm
                      storeId={store.id}
                      buttonLabel="Sync"
                    />
                    <form method="post" action="/api/shopify/disconnect">
                      <input type="hidden" name="store_id" value={store.id} />
                      <button type="submit" className={styles.disconnectButton}>
                        Disconnect
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Create `src/app/app/settings/integrations/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import PageHeader from "../../_ui/page-header";
import StatusBadge from "../../_ui/status-badge";
import ShopifyManage from "./shopify-manage";
import styles from "./integrations.module.css";

type Props = {
  searchParams?: Promise<{
    shopify?: string;
    sync_error?: string;
  }>;
};

export default async function IntegrationsPage({ searchParams }: Props) {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/app/auth/login");
  if (ctx.role !== "admin" && ctx.role !== "super_admin") {
    redirect("/app/settings/profile");
  }

  const params = (await searchParams) ?? {};

  const { data: stores } = await ctx.supabase
    .from("shopify_store")
    .select(
      "id,store_domain,status,created_at,last_synced_at,last_sync_status,last_sync_meta"
    )
    .order("created_at", { ascending: false })
    .limit(10);

  const connected = (stores ?? []).some((s) => s.status === "active");

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Integrations"
        description="Connect external services to sync catalog, orders, and inventory."
      />
      <div className={styles.grid}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <div className={styles.cardTitleRow}>
              <span className={styles.cardName}>Shopify</span>
              <StatusBadge variant={connected ? "success" : "warning"}>
                {connected ? "Connected" : "Not connected"}
              </StatusBadge>
            </div>
            <p className={styles.cardDesc}>
              Sync products, variants, and orders from your Shopify store.
            </p>
          </div>
          <ShopifyManage
            stores={stores ?? []}
            shopifyStatus={params.shopify}
            syncError={params.sync_error}
          />
        </div>
      </div>
    </>
  );
}
```

- [ ] **Create `src/app/app/settings/integrations/integrations.module.css`**

```css
.grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  margin-top: var(--space-6);
}

.card {
  background: var(--bg-card);
  border: 1px solid var(--stroke-card);
  border-radius: var(--radius-md);
  padding: var(--space-6);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.cardHeader {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.cardTitleRow {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.cardName {
  font-size: var(--fs-h3);
  font-weight: var(--fw-semibold);
  color: var(--ink-strong);
}

.cardDesc {
  margin: 0;
  font-size: var(--fs-body);
  color: var(--ink-muted);
}

.managePanel {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.manageToggle {
  font-family: var(--font-body);
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  background: transparent;
  color: var(--brand-1);
  border: 1px solid var(--brand-dim);
  border-radius: var(--radius-sm);
  padding: var(--space-2) var(--space-4);
  cursor: pointer;
  align-self: flex-start;
  transition: background var(--dur-fast) var(--ease-out);
}

.manageToggle:hover {
  background: var(--brand-dim);
}

.manageContent {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
  padding-top: var(--space-4);
  border-top: 1px solid var(--stroke);
}

.storeList {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.storeListHeading {
  margin: 0;
  font-size: var(--fs-sm);
  font-weight: var(--fw-semibold);
  color: var(--ink-muted);
  text-transform: uppercase;
  letter-spacing: var(--ls-caps);
}

.storeRow {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-4);
  padding: var(--space-4);
  background: var(--bg-card-2);
  border-radius: var(--radius-sm);
  border: 1px solid var(--stroke);
}

.storeMeta {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

.storeDetail {
  font-size: var(--fs-sm);
  color: var(--ink-muted);
}

.storeActions {
  display: flex;
  gap: var(--space-2);
  flex-shrink: 0;
}

.disconnectButton {
  font-family: var(--font-body);
  font-size: var(--fs-sm);
  color: var(--danger);
  background: transparent;
  border: 1px solid var(--danger-dim);
  border-radius: var(--radius-xs);
  padding: var(--space-1) var(--space-2);
  cursor: pointer;
}

.disconnectButton:hover {
  background: var(--danger-dim);
}
```

- [ ] **Delete old root-level Shopify files**

```bash
rm src/app/app/settings/shopify-connect.tsx
rm src/app/app/settings/sync-submit-form.tsx
rm src/app/app/settings/sync-meta-chips.tsx
```

- [ ] **Run TypeScript check and commit**

```bash
npx tsc --noEmit
git add src/app/app/settings/integrations/ \
  src/app/app/settings/shopify-connect.tsx \
  src/app/app/settings/sync-submit-form.tsx \
  src/app/app/settings/sync-meta-chips.tsx
git commit -m "feat(settings): integrations section — Shopify card with manage panel"
```

---

### Task 8: Locations section

**Goal:** Create the Locations section — list all warehouse locations and allow setting one as the default.

**Files:**
- Create: `src/app/app/settings/locations/page.tsx`
- Create: `src/app/app/settings/locations/actions.ts`
- Create: `src/app/app/settings/locations/locations.module.css`

**Acceptance Criteria:**
- [ ] Lists all locations with name and current default status
- [ ] Clicking "Set as default" on a non-default location updates `location.is_default`
- [ ] Only one location can be default at a time
- [ ] Non-admins are redirected to `/app/settings/profile`

**Verify:** `npx tsc --noEmit` → zero errors. Navigate to `/app/settings/locations`, change the default location, reload — change persists.

**Steps:**

- [ ] **Create `src/app/app/settings/locations/actions.ts`**

```typescript
"use server";

import { getServerTenantContext } from "@/lib/tenant/context";
import { revalidatePath } from "next/cache";

type State = { error?: string; success?: string } | null;

export async function setDefaultLocation(
  _prev: State,
  formData: FormData
): Promise<State> {
  const ctx = await getServerTenantContext();
  if (!ctx) return { error: "Not authenticated" };
  if (ctx.role !== "admin" && ctx.role !== "super_admin") {
    return { error: "Admin access required" };
  }

  const locationId = formData.get("location_id") as string;
  if (!locationId) return { error: "Location ID required" };

  // Unset all defaults for this tenant, then set the new one.
  // RLS ensures only this tenant's locations are touched.
  const { error: clearError } = await ctx.supabase
    .from("location")
    .update({ is_default: false })
    .neq("id", locationId);

  if (clearError) return { error: clearError.message };

  const { error: setError } = await ctx.supabase
    .from("location")
    .update({ is_default: true })
    .eq("id", locationId);

  if (setError) return { error: setError.message };

  revalidatePath("/app/settings/locations");
  return { success: "Default location updated" };
}
```

- [ ] **Create `src/app/app/settings/locations/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import PageHeader from "../../_ui/page-header";
import { setDefaultLocation } from "./actions";
import styles from "./locations.module.css";

export default async function LocationsPage() {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/app/auth/login");
  if (ctx.role !== "admin" && ctx.role !== "super_admin") {
    redirect("/app/settings/profile");
  }

  const { data: locations } = await ctx.supabase
    .from("location")
    .select("id, name, is_default")
    .order("name", { ascending: true });

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Locations"
        description="Set the default warehouse location used across the workspace."
      />
      <div className={styles.list}>
        {(locations ?? []).map((loc) => (
          <div
            key={loc.id}
            className={`${styles.row} ${loc.is_default ? styles.rowDefault : ""}`}
          >
            <div className={styles.rowInfo}>
              <span className={styles.name}>{loc.name}</span>
              {loc.is_default && (
                <span className={styles.defaultBadge}>Default</span>
              )}
            </div>
            {!loc.is_default && (
              <form action={setDefaultLocation}>
                <input type="hidden" name="location_id" value={loc.id} />
                <button type="submit" className={styles.setDefaultButton}>
                  Set as default
                </button>
              </form>
            )}
          </div>
        ))}
        {(locations ?? []).length === 0 && (
          <p className={styles.empty}>
            No locations found. Create locations in the Locations module first.
          </p>
        )}
      </div>
    </>
  );
}
```

- [ ] **Create `src/app/app/settings/locations/locations.module.css`**

```css
.list {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-top: var(--space-6);
}

.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-4);
  background: var(--bg-card);
  border: 1px solid var(--stroke-card);
  border-radius: var(--radius-sm);
}

.rowDefault {
  border-color: var(--brand-dim);
  background: var(--brand-dim);
}

.rowInfo {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.name {
  font-size: var(--fs-body);
  font-weight: var(--fw-medium);
  color: var(--ink-strong);
}

.defaultBadge {
  font-size: var(--fs-badge);
  font-weight: var(--fw-medium);
  color: var(--brand-1);
  background: var(--bg-card);
  border: 1px solid var(--brand-dim);
  border-radius: var(--radius-pill);
  padding: 2px var(--space-2);
}

.setDefaultButton {
  font-family: var(--font-body);
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  background: transparent;
  color: var(--ink-muted);
  border: 1px solid var(--stroke-card);
  border-radius: var(--radius-xs);
  padding: var(--space-1) var(--space-3);
  cursor: pointer;
  transition: border-color var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out);
}

.setDefaultButton:hover {
  border-color: var(--brand-1);
  color: var(--brand-1);
}

.empty {
  font-size: var(--fs-body);
  color: var(--ink-muted);
  margin: 0;
}
```

- [ ] **Run TypeScript check and commit**

```bash
npx tsc --noEmit
git add src/app/app/settings/locations/
git commit -m "feat(settings): locations section — list with default location picker"
```

---

### Task 9: Invoices section

**Goal:** Build the Invoices section — table of subscription invoices with PDF download links from Supabase Storage.

**Files:**
- Create: `src/app/app/settings/invoices/page.tsx`
- Create: `src/app/app/settings/invoices/invoices.module.css`

**Acceptance Criteria:**
- [ ] Non-admins are redirected to `/app/settings/profile`
- [ ] Shows a table of invoices from `tenant_invoices` with period, amount, status, download link
- [ ] Download links are signed URLs (1 hour expiry) from the `tenant-invoices` bucket
- [ ] Empty state shown when no invoices exist

**Verify:** `npx tsc --noEmit` → zero errors. Navigate to `/app/settings/invoices` — empty state renders. Insert a test row in `tenant_invoices` via Supabase dashboard and confirm it appears with a download link.

**Steps:**

- [ ] **Create `src/app/app/settings/invoices/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getServerTenantContext } from "@/lib/tenant/context";
import PageHeader from "../../_ui/page-header";
import styles from "./invoices.module.css";

export default async function InvoicesPage() {
  const ctx = await getServerTenantContext();
  if (!ctx) redirect("/app/auth/login");
  if (ctx.role !== "admin" && ctx.role !== "super_admin") {
    redirect("/app/settings/profile");
  }

  const { data: invoices } = await ctx.supabase
    .from("tenant_invoices")
    .select("id, period, amount_cents, currency, storage_path, created_at")
    .order("created_at", { ascending: false });

  const invoicesWithUrls = await Promise.all(
    (invoices ?? []).map(async (inv) => {
      const { data } = await ctx.supabase.storage
        .from("tenant-invoices")
        .createSignedUrl(inv.storage_path, 3600);
      return { ...inv, downloadUrl: data?.signedUrl ?? null };
    })
  );

  return (
    <>
      <PageHeader
        eyebrow="Workspace"
        title="Invoices"
        description="Monthly subscription invoices for your workspace."
      />

      {invoicesWithUrls.length === 0 ? (
        <p className={styles.empty}>
          Invoices will appear here once your first billing period ends.
        </p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr className={styles.thead}>
              <th className={styles.th}>Period</th>
              <th className={styles.th}>Amount</th>
              <th className={styles.th}>Status</th>
              <th className={styles.th}>Download</th>
            </tr>
          </thead>
          <tbody>
            {invoicesWithUrls.map((inv) => (
              <tr key={inv.id} className={styles.tr}>
                <td className={styles.td}>{inv.period}</td>
                <td className={styles.td}>
                  {(inv.amount_cents / 100).toLocaleString("en-AU", {
                    style: "currency",
                    currency: inv.currency,
                  })}
                </td>
                <td className={styles.td}>
                  <span className={styles.paidBadge}>Paid</span>
                </td>
                <td className={styles.td}>
                  {inv.downloadUrl ? (
                    <a
                      href={inv.downloadUrl}
                      download
                      className={styles.downloadLink}
                    >
                      Download PDF
                    </a>
                  ) : (
                    <span className={styles.unavailable}>Unavailable</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
```

- [ ] **Create `src/app/app/settings/invoices/invoices.module.css`**

```css
.empty {
  margin-top: var(--space-6);
  font-size: var(--fs-body);
  color: var(--ink-muted);
}

.table {
  width: 100%;
  border-collapse: collapse;
  margin-top: var(--space-6);
}

.thead tr {
  border-bottom: 1px solid var(--stroke);
}

.th {
  padding: var(--space-2) var(--space-3);
  text-align: left;
  font-size: var(--fs-label);
  font-weight: var(--fw-semibold);
  color: var(--ink-faint);
  text-transform: uppercase;
  letter-spacing: var(--ls-caps);
}

.tr {
  border-bottom: 1px solid var(--stroke);
}

.tr:last-child {
  border-bottom: none;
}

.td {
  padding: var(--space-3);
  font-size: var(--fs-body);
  color: var(--ink-strong);
  vertical-align: middle;
}

.paidBadge {
  font-size: var(--fs-badge);
  font-weight: var(--fw-medium);
  color: var(--ok);
  background: var(--ok-dim);
  border-radius: var(--radius-pill);
  padding: 2px var(--space-2);
}

.downloadLink {
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  color: var(--brand-1);
  text-decoration: none;
}

.downloadLink:hover {
  text-decoration: underline;
}

.unavailable {
  font-size: var(--fs-sm);
  color: var(--ink-faint);
}
```

- [ ] **Run TypeScript check and commit**

```bash
npx tsc --noEmit
git add src/app/app/settings/invoices/
git commit -m "feat(settings): invoices section — signed download links from Storage"
```

---

### Task 10: Cleanup

**Goal:** Remove the old settings page content and all files that were relocated or replaced. Delete `settings.module.css`.

**Files:**
- Delete: `src/app/app/settings/settings.module.css`

**Acceptance Criteria:**
- [ ] `settings.module.css` is deleted (no longer imported anywhere)
- [ ] No TypeScript errors
- [ ] `git status` shows no orphaned settings files

**Verify:** `npx tsc --noEmit` → zero errors. `grep -r "settings.module.css" src/` → no matches.

**Steps:**

- [ ] **Confirm `settings.module.css` has no remaining imports**

```bash
grep -r "settings.module.css" src/
```

Expected: no output. If any file still imports it, update that file to use the appropriate section CSS module instead.

- [ ] **Delete the file**

```bash
rm src/app/app/settings/settings.module.css
```

- [ ] **Run TypeScript check**

```bash
npx tsc --noEmit
```

- [ ] **Final verification — navigate all settings routes in dev server**

Start `npm run dev` and confirm each route renders correctly:
- `/app/settings` → redirects based on role
- `/app/settings/profile` → profile form
- `/app/settings/appearance` → theme picker
- `/app/settings/company` → company form (admin only)
- `/app/settings/team` → member table with invite (admin only)
- `/app/settings/integrations` → Shopify card (admin only)
- `/app/settings/locations` → location list (admin only)
- `/app/settings/invoices` → empty state or invoice table (admin only)
- `/app/settings/theme` → redirects to `/app/settings/appearance`

- [ ] **Commit**

```bash
git add -A
git commit -m "chore(settings): remove old settings page, styles, and relocated shopify files"
```
