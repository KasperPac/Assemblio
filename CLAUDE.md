# Manuva App

Next.js 15 App Router, Supabase (Postgres + Auth + RLS), CSS Modules, TypeScript.

Manufacturing operations SaaS: inventory, BOMs, production orders, purchasing, supplier management, warehouse/bin locations.

## Domain

- Production domain: `manuva.app`
- Marketing site: `https://manuva.app`
- App: `https://manuva.app/app`

## Design system

@C:\dev\manuva-tokens\Manuva Design System\README.md
@C:\dev\manuva-tokens\Manuva Design System\colors_and_type.css
@docs/design-system.md

Always follow the Manuva design system when writing UI code. Use the token names from `colors_and_type.css` (`--brand-1`, `--bg-card`, `--ink-strong`, etc.). Do not invent new tokens or hardcode colors.

## Brand assets

Logos live in `public/`:

- `public/Manuva_svg.svg` — full SVG logo (vector)
- `public/manuva.svg` — colored mark + dark wordmark
- `public/manuva-logo.png` — white version (799×179, ratio 4.47:1) for dark backgrounds

Prefer SVG over PNG. For the white-on-dark variant, only the PNG exists today — use it with the correct aspect ratio (e.g. `width={170} height={38}` for ~38px tall).

## Stack notes

- Auth and tenant context: always use `getServerTenantContext()` from `@/lib/tenant/context`
- Role check: `role === "admin" || role === "super_admin"` for admin-only features
- Server actions live in `actions.ts` files co-located with the route
- Activity logging: insert to `activity_log` table with `event` (string) + `metadata` (jsonb)
