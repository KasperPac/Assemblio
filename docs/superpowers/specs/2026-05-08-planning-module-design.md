# Planning Module — Design Spec

**Date:** 2026-05-08
**Status:** Approved

---

## Overview

A full production planning module for Manuva, designed as a paid add-on. The module gives manufacturers real-time visibility into where every job is across their departments, a shop floor app for operators, auto/manual scheduling, dependency-aware routing, and B2C customer notifications triggered at configured production milestones.

The core differentiator: B2C consumer-style notifications from the shop floor ("Your gate is now being welded") — a gap no SME manufacturing tool currently fills well.

---

## Market Context

**Competitors surveyed:** Katana MRP, MRPeasy, Cin7 Core, Fishbowl, Prodsmart, Tulip.

Key gaps identified:
- No SME tool has a visual per-department queue board showing where every active job is right now
- Customer-facing production notifications are absent (only MRPeasy has B2B portal; nothing for B2C)
- Most tools use infinite-capacity scheduling — they don't respect actual department workload
- Routing dependencies (step B can't start until step A is done) require expensive add-ons in competing tools

---

## Module Gating

The planning module is a paid add-on, gated per tenant.

**Database:** `tenant` table gets `has_planning_module boolean default false`.

**Enforcement — two layers:**
1. `getServerTenantContext()` returns `has_planning_module` — the sidebar nav conditionally renders the Planning link
2. `/app/planning` layout server-checks the flag and redirects to `/app/planning/upgrade` if false — upgrade page explains the feature with a "Contact us to enable" CTA (Stripe checkout wired later)

No planning data or logic bleeds into core routes. All planning tables, server actions, and UI are contained within `/app/planning`.

---

## Module Structure

Route: `/app/planning`

Three views accessed via tabs:

| Tab | Purpose | Primary user |
|---|---|---|
| **Floor Board** (default) | Live department queue board — daily operations | Production manager |
| **Schedule** | Gantt chart — forward planning and capacity | Production manager / planner |
| **Shop Floor App** | Mobile-optimised operator interface | Department operators |

The shop floor app is a separate route (`/app/planning/shopfloor`) — full-screen, no sidebar, optimised for tablets mounted in departments.

The existing `/app/capacity` page is superseded by the Schedule tab and can be deprecated once planning is live.

---

## Data Model

### Existing tables (reused unchanged)

- `product_bom_labor` — routing template: one row per department operation per product BOM. Fields: `department_id`, `operation_name`, `sequence`, `setup_hours`, `run_hours_per_unit`.
- `department` — departments/work centres.
- `department_capacity_week` — weekly available hours per department (used in Schedule tab for capacity colouring).

### Modified tables

**`product_bom_labor`** — add `blocked_by int[]`. Array of `sequence` values that must reach `complete` status before this step can be unlocked. Empty array = no dependencies, can start immediately when the job is started.

### New tables

**`job_routing_step`**
Live tracking record for each part × routing stage. Generated from `product_bom_labor` when a job is started.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `tenant_id` | uuid | RLS |
| `order_line_id` | uuid | FK → order_line |
| `department_id` | uuid | FK → department |
| `sequence` | int | Copied from product_bom_labor |
| `blocked_by` | int[] | Copied from product_bom_labor at job start |
| `status` | text | `queued` / `active` / `complete` / `skipped` |
| `scheduled_start` | timestamptz | Set by auto/manual scheduler |
| `scheduled_end` | timestamptz | |
| `actual_start` | timestamptz | Set when operator taps Start |
| `actual_end` | timestamptz | Set when operator taps Complete |
| `started_by` | uuid | FK → staff_member (or auth.users) |
| `completed_by` | uuid | FK → staff_member (or auth.users) |
| `created_at` | timestamptz | |

**`product_notification_trigger`**
One-time per-product notification configuration.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `tenant_id` | uuid | RLS |
| `product_id` | uuid | FK → product |
| `routing_sequence` | int | Which step triggers this notification |
| `message_template` | text | Supports `{{product_name}}`, `{{order_number}}`, `{{department_name}}`, `{{customer_first_name}}` |
| `channel` | text | `email` (SMS added later) |

**`notification_log`**
Record of every sent notification.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `tenant_id` | uuid | RLS |
| `order_id` | uuid | |
| `order_line_id` | uuid | |
| `trigger_id` | uuid | FK → product_notification_trigger |
| `channel` | text | |
| `recipient` | text | Email address used |
| `sent_at` | timestamptz | |
| `delivery_status` | text | `sent` / `delivered` / `failed` |

**`tenant`** — add `has_planning_module boolean default false`.

---

## Job Lifecycle

### 1. Order arrives
Order lines sit in **Unstarted** state. Visible in the planning overview but not yet in any department queue.

### 2. Manager starts a job
Manager clicks **Start Job** from the floor board toolbar or the order detail page. A modal appears with two options:

- **Auto-schedule** — system calculates `scheduled_start` / `scheduled_end` for each routing step using a greedy earliest-available algorithm:
  - Each step's earliest start = max(now, completion of all blocked_by steps)
  - Scheduled end = scheduled start + (run_hours_per_unit × quantity) + setup_hours from product_bom_labor
  - Steps are inserted into the department's existing queue in chronological order by scheduled_start
  - Department available hours from `department_capacity_week` inform capacity colouring but do not block scheduling (no hard cap on concurrent jobs)
- **Manual** — manager picks dates for each routing step individually

### 3. Routing steps generated
`job_routing_step` rows are created for all parts (order lines) × all routing stages from `product_bom_labor`. Steps with no `blocked_by` dependencies enter their department queue as `queued`. Dependency-blocked steps are created with `queued` status but rendered as locked until unblocked.

### 4. Operator works the queue
Operator opens the shop floor app, selects their department. They see active and queued jobs in priority order.

- Tap **Start** → status → `active`, `actual_start` recorded
- Tap **Complete** → status → `complete`, `actual_end` recorded

### 5. Unlock cascade
On each step completion, the system checks all remaining `queued` steps for that order line. Any step whose entire `blocked_by` array is now `complete` is unlocked — it becomes available for the operator in its target department.

### 6. Customer notification
If a `product_notification_trigger` exists for this product × sequence, a notification is queued immediately on step completion. Delivered via Resend (email). Logged to `notification_log`.

### 7. Order line completion
When all `job_routing_step` rows for an order line reach `complete` or `skipped`, the order line is marked complete.

### 8. Manager override
A manager can at any time:
- Manually mark a step active or complete
- Reorder queue priority within a department (drag on floor board)
- Reassign scheduled dates
- Skip a step

---

## Floor Board (Primary View)

Layout: horizontal-scrolling column per department.

**Each column:**
- Department name + active job count
- Active jobs at top (highlighted)
- Queued jobs below in priority order
- Dependency-blocked jobs shown with a lock icon and tooltip ("Waiting: Welding")

**Each job card shows:**
- Order number + customer name
- Product name + part/line identifier
- Scheduled time
- Status badge

**Clicking a card** opens a job detail drawer:
- Full routing progress across all departments (timeline view)
- All parts for the order
- Actual vs scheduled timestamps
- Notification history (what was sent to the customer and when)

**Toolbar:**
- Date range filter
- Search by order number or customer name
- **Start Job** button — triggers the start modal

**Manager interactions:**
- Drag to reorder queue priority within a department
- Right-click / action menu: mark active, mark complete, reassign date, skip

---

## Shop Floor App (`/app/planning/shopfloor`)

Full-screen, no sidebar. Designed for tablets mounted in departments.

- Operator selects department on first use (persisted in localStorage)
- Shows only that department's queue
- Active jobs at top, queued below
- Dependency-blocked jobs visible but disabled with reason
- **Start** and **Complete** buttons — large tap targets
- Job card shows work instructions from BOM operation name
- **Manager PIN button** — unlocks full action menu (mark complete, skip, reassign) without leaving the app

Authentication: same Supabase session. Kiosk mode (shared device, PIN per operator) is a future enhancement.

---

## Schedule Tab (Gantt)

Used for forward planning, not day-to-day floor management.

- Horizontal time axis with day / week / month zoom
- Department rows
- Job blocks plotted by `scheduled_start` / `scheduled_end`
- Dependency arrows between linked steps (dashed lines)
- Capacity pressure colouring: green (comfortable) / amber (busy) / red (overloaded) — based on `department_capacity_week`
- Drag blocks to reschedule — updates `scheduled_start` / `scheduled_end`, auto-adjusts dependent steps
- **Auto-schedule all** button — runs scheduling algorithm across all unstarted jobs

---

## Customer Notifications

### Configuration (one-time per product)
New **Notifications tab** in the product settings page. Shows the product's routing steps. For each step: toggle notification on/off, edit message template.

**Template variables:** `{{product_name}}`, `{{order_number}}`, `{{department_name}}`, `{{customer_first_name}}`

Example: *"Hi {{customer_first_name}}, your {{product_name}} is now in our finishing department."*

### Trigger
Fires when an operator marks a routing step complete (or a manager overrides to complete). System queries `product_notification_trigger` for product × sequence. If match found, notification is dispatched.

### Delivery
- **Channel:** Email via Resend
- **Recipient:** Customer email from the order record (synced from Shopify)
- **SMS:** Future enhancement — delivery adapter is swappable without changing trigger logic

### Notification log
Every notification recorded in `notification_log` with delivery status. Visible in the job detail drawer on the floor board.

---

## Product Routing Setup

The existing product BOM labor setup gets two enhancements:

1. **Dependency configuration** — each routing step can declare which other steps it depends on. Rendered as a simple node diagram (not raw sequence numbers) in the product setup UI.
2. **Notification triggers** — new Notifications tab per product (described above).

---

## What This Does Not Include (Initial Build)

- SMS notifications (email only initially)
- Kiosk mode / per-operator PIN login for shop floor
- Material consumption tracking per routing step
- Machine / equipment assignment within departments
- Stripe billing integration (module flag flipped manually by super admin initially)
- Public customer-facing tracking page (notifications are push-only initially)

---

## Migration Path

1. Add `has_planning_module` to `tenant` table
2. Add `blocked_by int[]` to `product_bom_labor`
3. Create `job_routing_step`, `product_notification_trigger`, `notification_log` tables with RLS
4. Build `/app/planning` module (floor board → schedule → shop floor app)
5. Add Notifications tab to product settings
6. Wire Resend for email delivery
7. Deprecate `/app/capacity` once schedule tab is live and validated
