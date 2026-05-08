# Settings Redesign — Design Spec

**Date:** 2026-05-08
**Status:** Approved

## Overview

A complete redesign of the settings area. The current page is a single dense page mixing tenant overview, Shopify connection, inventory integrity audit, and theme — with no clear structure and several missing sections. This redesign splits settings into Personal and Workspace categories, introduces a sidebar-nav layout, adds missing sections (Company, Team, Invoices), and removes things that don't belong (inventory integrity → future admin panel).

---

## Navigation & Layout

Settings lives at `/app/settings` with a two-column layout:

- **Left sidebar (~220px, fixed):** section links grouped into Personal and Workspace
- **Right content area (scrollable):** renders the active section

Default landing:
- Admins → `/app/settings/company`
- Non-admins → `/app/settings/profile`

The `Workspace` group in the sidebar is hidden entirely from non-admins. A non-admin navigating directly to a workspace URL is redirected to `/app/settings/profile`.

### Routes

| Route | Section | Access |
|---|---|---|
| `/app/settings/profile` | Profile | All users |
| `/app/settings/appearance` | Appearance | All users |
| `/app/settings/company` | Company | Admin only |
| `/app/settings/team` | Team | Admin only |
| `/app/settings/integrations` | Integrations | Admin only |
| `/app/settings/locations` | Locations | Admin only |
| `/app/settings/invoices` | Invoices | Admin only |

The old `/app/settings/theme` route redirects to `/app/settings/appearance`. The topbar "Theme settings" link updates to `/app/settings/appearance`.

### Sidebar structure (text mockup)

```
Settings

Personal
  Profile
  Appearance

Workspace
  Company
  Team
  Integrations
  Locations
  Invoices
```

---

## Personal Settings

### Profile

Fields:
- **Display name** (editable text input) — stored on `profiles.full_name`
- **Email** (read-only) — from Supabase Auth user
- **Role** (read-only) — from `profiles.role`
- **Tenant** (read-only) — workspace name

Password reset: a "Change password" button that triggers Supabase Auth's email-based password reset flow. No inline password form.

No avatar upload in this iteration.

### Appearance

The existing theme picker component, relocated from `/app/settings/theme`. Four themes displayed as visual swatches: Midnight, Daylight, Ocean, Ember. Selection stored in `localStorage` (key: `assemblio-theme`) — personal/device preference, not tenant-level.

---

## Workspace Settings (Admin Only)

### Company

Editable tenant-level fields:
- **Company name** — `tenant.name`
- **Logo** — file upload stored in Supabase Storage (`tenant-logos` bucket), URL stored in `tenant.logo_url`
- **Timezone** — dropdown (IANA timezone list), stored in `tenant.timezone`
- **Default currency** — dropdown (ISO 4217 codes, common subset), stored in `tenant.currency`

Read-only display:
- **Member since** — `tenant.created_at`
- **Plan** — hardcoded as "Manuva Pro" for now (no billing API)

**DB changes required:** Add `logo_url text`, `timezone text`, `currency text` columns to the `tenant` table.

### Team

A table of all users in the tenant with columns: Name, Email, Role, Status (active / invited / deactivated).

Actions per row (admin only):
- **Change role** — dropdown inline or modal (member / admin)
- **Deactivate** — soft-deactivates the user (sets `profiles.status = 'deactivated'`). `getServerTenantContext()` must check this field and throw/redirect if status is not `active`, effectively blocking access on next request.

Top of page:
- **Invite member** button — opens a modal with an email field. Sends a Supabase Auth invite email. On first login the user is assigned to the tenant via `profile_tenant_access`. Role defaults to `member`.

No seat limits enforced in the UI for now.

**DB changes required:** Add `status text DEFAULT 'active'` to `profiles` table if not already present. Check and enforce `status` during auth.

### Integrations

A card grid of integration tiles. Each tile shows:
- Integration name and logo
- Connection status badge (Connected / Not connected)
- Connect or Manage button

**Shopify tile (first and only active integration):**
- "Manage" button expands to a drawer or dedicated sub-section
- Shows: connected stores list, last sync time/status, per-store Sync and Disconnect actions
- Connect new store form (current `shopify-connect.tsx` component, relocated here)
- Sync metadata chips retained from current UI

Future integrations (Xero, MYOB, etc.) are added as tiles when ready. No "Coming soon" placeholders — tiles simply appear when implemented.

Removes the Shopify connection form and store list from the old main settings page.

### Locations

The existing default location selector, moved here. Lists all warehouse/bin locations with the ability to mark one as the default operational location. No new functionality — purely a relocation.

### Invoices

A table of monthly subscription invoices:

| Column | Detail |
|---|---|
| Date | Month/year of the invoice period |
| Amount | e.g. $299.00 AUD |
| Status | Paid (only paid invoices shown) |
| Download | Link to PDF in Supabase Storage |

Invoices are uploaded manually to Supabase Storage (`tenant-invoices` bucket) by PAC Technologies staff. A `tenant_invoices` table stores metadata (tenant_id, period, amount_cents, currency, storage_path, created_at). RLS restricts read access to the matching tenant's admins.

Empty state: "Invoices will appear here once your first billing period ends."

**DB changes required:** Create `tenant_invoices` table and `tenant-invoices` storage bucket with appropriate RLS.

---

## What Gets Removed from Settings

| Removed | Where it goes |
|---|---|
| Inventory integrity audit panel | Future admin panel (not built in this iteration) |
| Overview cards (Tenant, Role, Default Location, Integrity) | Absorbed into their respective sections (Company, Profile, Locations) |
| Inline Shopify form on main settings page | Moves to Integrations section |
| Theme link in page header actions | Removed (theme now in sidebar nav) |
| Manual sync "latest connected store" button | Moves into Integrations → Shopify manage view |

---

## Data & API Surface

### DB migrations

1. `tenant` table: add `logo_url text`, `timezone text DEFAULT 'Pacific/Auckland'`, `currency text DEFAULT 'NZD'`
2. `profiles` table: add `status text NOT NULL DEFAULT 'active'` (if not present)
3. New table: `tenant_invoices (id uuid PK, tenant_id uuid FK, period text, amount_cents int, currency text, storage_path text, created_at timestamptz)`
4. Storage buckets: `tenant-logos` (public reads, admin writes), `tenant-invoices` (private, admin reads only)

### Server actions

Each settings section has a co-located `actions.ts`:
- `updateProfile(displayName)` — updates `profiles.full_name`
- `updateCompany(name, timezone, currency, logoUrl)` — updates `tenant`
- `uploadLogo(file)` — uploads to storage, returns URL
- `inviteMember(email)` — calls `supabase.auth.admin.inviteUserByEmail()`
- `updateMemberRole(profileId, role)` — updates `profiles.role`
- `deactivateMember(profileId)` — sets `profiles.status = 'deactivated'`

Shopify connect/sync/disconnect actions already exist and are relocated unchanged.

---

## What Does Not Change

- Theme logic (localStorage, CSS vars, theme context)
- Shopify OAuth flow and sync logic — all existing API routes and components are reused
- Locations data model and default-location logic
- Role-based access model (`admin` / `super_admin` for workspace sections)
