# Hallify — Design Decisions

> Living document. Update this file whenever a meaningful stack, architecture, or UI decision is made.

---

## What is Hallify

Hallify is a **multi-tenant SaaS** hall/venue management and reservation platform. Customers sign up, create **organizations**, and manage halls, reservations, RSVPs, and messaging within those organizations. Subscriptions are tied to organizations, not individual users. Targeted at Slovak-speaking users (primary locale: Slovak).

---

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | SvelteKit 2 + Svelte 5 | Uses new runes API: `$props()`, `$state()`, `$derived()`, `$effect()` |
| Language | TypeScript 5 | Strict mode via tsconfig |
| Database | PostgreSQL 16 (Docker) | Accessed via `postgres` npm package (tagged template literals) |
| Auth | Custom cookie sessions | `session_id` httpOnly cookie, 30-day TTL, stored in `sessions` table |
| Billing | Stripe | Server-side checkout + portal + webhooks; API version `2025-05-28.basil` |
| Email | Nodemailer | Per-org SMTP config in `org_settings`; platform-level fallback in `system_settings` |
| Adapter | `@sveltejs/adapter-auto` | No explicit node/static adapter chosen yet |
| CSS | Pure CSS + custom properties | No Tailwind, no component library |
| Icons | Inline SVG | No icon library dependency |
| Build | Vite 6 | |

---

## Multi-Tenancy Model

Every resource (halls, reservations, RSVP templates, tickets) is scoped to an **organization** via an `org_id` foreign key. There is no global data visible to regular users — everything is filtered by the currently active organization.

### Organizations
- Created by any authenticated user via `/org/new`
- Each org has a unique `slug`, optional logo, and one active subscription
- Users can belong to multiple orgs; they switch between them via the **OrgSwitcher** in the nav
- Active org is stored in `sessions.current_org_id` — no URL segment needed for scoping

### Org Roles
| Role | Permissions |
|---|---|
| `owner` | Full control: manage members, billing, all settings, delete org |
| `admin` | Manage halls, reservations, templates, messages; invite/remove members |
| `member` | Make reservations, use messaging system |

An org must always have at least one owner (enforced in member management actions).

### Platform Admin
- Separate from org roles — controlled by `users.is_platform_admin` boolean
- Access via `/platform/*` routes (pink-accented sidebar)
- Can view all orgs, suspend/unsuspend, view all users, grant/revoke platform admin
- Link shown in main nav as a pink star icon, only visible to platform admins

---

## Subscription Plans

Plans are defined in `src/lib/plans.ts` as compile-time constants (not DB rows).

| Plan | Price | Halls | Members | Reservations/mo |
|---|---|---|---|---|
| Free | €0 | 1 | 5 | 20 |
| Starter | €29/mo | 5 | 25 | 200 |
| Professional | €79/mo | 20 | 100 | Unlimited |
| Enterprise | Contact | Unlimited | Unlimited | Unlimited |

Stripe price IDs for Starter and Professional are configured via env vars (`STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PROFESSIONAL`). Enterprise plan uses a `mailto:` contact link — no Stripe checkout.

---

## File Structure

```
src/
  app.css             — global design tokens + utility classes
  app.d.ts            — App.Locals / App.PageData types (user, branding, currentOrg)
  app.html            — HTML shell
  hooks.server.ts     — session → user → org context → branding cascade

  lib/
    db/
      index.ts        — singleton postgres pool + ALL typed row interfaces
      schema.sql      — master schema (idempotent, safe to re-run)
      migration-002.sql
      migration-003.sql — multi-tenancy: orgs, members, invites, subscriptions, org_settings
      migrate.ts      — migration runner script
    auth.ts           — createSession / getSessionUser / deleteSession / switchOrg
    email.ts          — nodemailer + per-org SMTP + email templates
    stripe.ts         — Stripe client + createCheckoutSession / createPortalSession
    plans.ts          — PLANS constant, PlanId type, getPlan(), isWithinLimit()
    i18n.ts           — sk (default) + en translations as plain objects
    floorplan-types.ts — shared canvas types (MultiFloorState, TableObj, etc.)
    tickets.ts        — ticket/messaging helpers
    components/
      Nav.svelte      — top nav with OrgSwitcher, org role badge, platform link
      OrgSwitcher.svelte — org dropdown: list orgs, POST /org/switch, create org link
      AdminSidebar.svelte — org admin sidebar (Halls, Reservations, Members, Billing…)
      FloorplanViewer.svelte — read-only floorplan viewer
      MapEditor.svelte  — interactive floorplan / seating editor

  routes/
    +layout.server.ts — injects user, branding, currentOrg, orgs list to every page
    +layout.svelte    — root shell: renders landing page bare OR app-shell with Sidebar
    +page.svelte      — public marketing landing page (no auth required)
    rsvp/[code]/      — public RSVP landing page (no auth required)
    api/
      upload/         — file upload (saves to static/uploads/)
      system-metrics/ — node/DB info for admin settings overview
      stripe/webhook/ — Stripe webhook handler (subscription lifecycle)
    app/              — all authenticated/auth-related routes live under /app/*
      +page.*         — user dashboard (org-scoped halls)
      login/register/profile/forgot-password/reset-password/
      messages/       — user-facing ticket list + thread view (org-scoped)
      reservation/new/  — create reservation (halls filtered to current org)
      reservation/[id]/ — view/edit reservation; sub-routes: layout/, rsvp-editor/
      billing/        — current plan + plan comparison grid + Stripe checkout/portal
      org/
        new/          — create a new organization
        switch/       — POST endpoint: updates sessions.current_org_id
      invite/[token]/ — accept an email invite to join an org
      logout/         — POST action: clears session
      admin/          — org admin area (requires owner or admin role in current org)
        +layout.svelte  — AdminSidebar + content area
        +page.*         — org dashboard KPIs (halls, members, reservations)
        halls/          — CRUD + floorplan editor + table types + blocked dates
        reservations/   — list + detail with status management
        members/        — invite / remove / change role of org members
        messages/       — admin side of ticket threads
        rsvp-templates/ — reusable RSVP page configs
        calendar/       — calendar view of all reservations
        settings/       — branding (org_settings) + email (org_settings)
      platform/       — platform admin area (requires is_platform_admin = true)
        +layout.svelte  — pink-accented sidebar (Overview, Organizations, All Users)
        +page.*         — platform KPIs (orgs, users, paid subscriptions, total reservations)
        orgs/           — list all orgs, suspend/unsuspend
        users/          — list all users, grant/revoke platform admin

static/
  Hallify.svg         — default logo
  User.svg
  uploads/            — user-uploaded files (served statically)
```

---

## Database Design

- All PKs are `UUID` via `pgcrypto`'s `gen_random_uuid()`
- Schema is idempotent (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`)
- `system_settings` — platform-level JSONB KV store (platform branding only)
- `org_settings` — per-org JSONB KV store (branding, SMTP, email notifications, email templates)
- `floorplan_json` / `layout_json` stored as JSONB — versioned (v2 multi-floor format)

### Key tables

**Auth & Users**
- `users` — `is_platform_admin: boolean` (replaces old `role: 'admin'`)
- `sessions` — DB-backed sessions; `current_org_id` tracks active org
- `password_resets` — one-time tokens with 1h expiry

**Organizations & Billing**
- `organizations` — `id, name, slug, logo_url, is_suspended, created_at`
- `organization_members` — `org_id, user_id, role ('owner'|'admin'|'member')`
- `organization_invites` — `org_id, email, role, token, expires_at, accepted_at`
- `subscriptions` — `org_id, plan ('free'|'starter'|'professional'|'enterprise'), status, stripe_customer_id, stripe_subscription_id, current_period_end`
- `org_settings` — `org_id, key, value (JSONB)` — per-org configuration KV store
- `system_settings` — `key, value (JSONB)` — platform-level configuration

**Halls & Reservations (all org-scoped)**
- `halls` — `org_id` FK; venues with per-hall feature flags
- `table_types` — named table shapes per hall
- `floorplan_templates` — reusable layouts per hall
- `hall_blocks` — date-range or weekly recurring unavailability
- `reservations` — `org_id` FK; core booking record; statuses: `pending → waiting_payment → approved → planned → completed | cancelled`
- `rsvp_entries` — public RSVP form submissions linked to a reservation
- `rsvp_templates` — `org_id` FK; reusable RSVP page configs (JSONB)
- `tickets` + `messages` — `org_id` FK; support/admin messaging system
- `email_log` — audit log for all sent emails

### Default Organization
UUID `00000000-0000-0000-0000-000000000001`. All data from before multi-tenancy migration was assigned to this org. Pre-existing admin users were seeded as `is_platform_admin = true` and org `owner`.

---

## Auth & Session Flow

1. Login → `createSession()` → sets `current_org_id` to user's first org
2. `hooks.server.ts` on every request:
   - Resolves session → `locals.user`
   - If no `current_org_id`, auto-picks user's first org and persists it
   - `loadOrgContext(orgId, userId)` → JOIN query → `locals.currentOrg: OrgContext`
   - `loadOrgBranding(orgId)` → `org_settings` key `'branding'` → falls back to platform branding → falls back to hardcoded defaults
3. Org switch: POST `/org/switch` → `switchOrg(sessionId, orgId)` → updates `sessions.current_org_id`

### OrgContext type
```typescript
interface OrgContext {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  role: 'owner' | 'admin' | 'member';
  subscription: {
    plan: PlanId;
    status: 'active' | 'trialing' | 'past_due' | 'cancelled' | 'unpaid';
    stripeCustomerId: string | null;
    currentPeriodEnd: Date | null;
  };
}
```

### Route Guards
- `/app/manage/*` — `currentOrg.role === 'owner' || 'admin'` (renamed from `/app/admin/*` — June 2026)
- `/app/platform/*` — `locals.user.is_platform_admin === true`
- `/app/billing` — any authenticated user with a current org
- `/app/org/new` — any authenticated user
- `/` — public, no auth required

---

## Stripe Integration

- Keys in env vars only — never stored in DB: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PROFESSIONAL`
- `APP_URL` env var (not `PUBLIC_APP_URL`) used for redirect URLs — must be `$env/static/private`
- Checkout flow: `upgrade` action → `createCheckoutSession()` → redirect to Stripe → webhook updates `subscriptions` table
- Portal flow: `manage` action → `createPortalSession()` → redirect to Stripe portal
- Webhook at `/api/stripe/webhook`: handles `checkout.session.completed`, `customer.subscription.created/updated/deleted`

---

## UI / Design System

All styling is hand-written CSS with CSS custom properties. No external CSS framework.

### Theme system

Three pre-defined themes selectable per-org via `Settings → Branding`. Stored as `org_settings.branding.theme`. Applied via `data-theme` attribute on `.app-shell`.

| Theme | Accent | Background | Character |
|---|---|---|---|
| `slate` (default) | `#4f6ef7` indigo | `#f3f4f6` light grey | Clean modern SaaS |
| `dark` | `#818cf8` soft indigo | `#0f1117` near-black | Dark mode |
| `warm` | `#7c3aed` violet | `#faf9f7` off-white | Editorial/premium |

Custom accent color (from branding settings) overrides `--accent` on top of any theme.

There is **no separate `--accent-action` (pink)** — all interactive elements use `--accent`. `.btn-action` renders the accent color. `--accent-action` is kept as an alias for backward compatibility.

### Design tokens (default/slate)
```css
--bg-base:       #f3f4f6   /* page content background */
--bg-panel:      #ffffff   /* sidebar, cards */
--bg-panel2:     #f9fafb   /* input backgrounds */
--bg-hover:      #f0f2f5   /* hover state fill */
--border:        #e3e6ed
--border-subtle: #eef0f5
--accent:        #4f6ef7   /* indigo — all interactive elements */
--accent-dim:    #eef1fe   /* tint for active nav items */
--text-base:     #111827
--text-muted:    #6b7280
--text-subtle:   #9ca3af
--danger / --success / --warning  (+ *-dim variants)
--shadow-sm / --shadow
--radius-sm: 5px  --radius: 8px  --radius-lg: 12px
--sidebar-width: 240px
```

### Global utility classes
- `.btn-action` — filled accent button
- `.btn-outline` — bordered secondary button
- `.btn-sm` — smaller padding variant
- `.btn-danger` — destructive (uses `--danger-dim` background)
- `.card` — white rounded panel (`border-radius: var(--radius-lg)`)
- `.alert-error` / `.alert-warning` — inline alert banners
- `.field` / `.field-row` — form field wrappers (flex column / 2-column grid)

### Layout
- **Landing page (`/`)**: Renders outside the app shell entirely — plain `<div>` wrapper in root layout, window scroll enabled. Dark theme with grid background, gradient orbs, animated hero card.
- **Auth pages (`/app/login` etc.)**: `AuthShell.svelte` — split two-panel (dark brand left, form right). Brand panel has CSS grid lines (minor 36px, major 180px intervals) + accent glow.
- **App pages (`/app/*`)**: 240px fixed left `Sidebar.svelte` + scrollable `<main class="app-main">`; `.app-shell { height: 100vh; overflow: hidden }` traps scroll to the main panel only. `html/body` has no overflow restriction so the landing page can scroll.
- **`Sidebar.svelte`**: Unified nav — logo, org switcher, main links (Home, Messages), Admin section (if org admin), Organization section (Members, Billing, Settings), Platform section (if platform admin), user footer with dropdown
- **Admin/Platform pages**: render directly into `app-main` — their layout svelte files are minimal (guard only, no sidebar of their own)
- **Font**: `Inter`, `Segoe UI`, `system-ui` — no web font loaded
- **Logo font**: `Poppins 900 italic`
- **Scrollbars**: custom thin (4px) webkit scrollbars

---

## Theme System

### How it works
- **Three themes**: `slate` (default, light blue-grey), `dark` (near-black indigo), `warm` (off-white violet)
- **Org default**: stored in `org_settings.branding.theme`; set by admins on the Customize page (`/app/admin/settings/branding`)
- **User override**: stored in `localStorage` key `hallify-theme`; user choice wins over org default
- **Precedence**: user localStorage → org default → `'slate'`

### Architecture
- **`src/lib/stores/theme.svelte.ts`**: singleton Svelte 5 rune store (`$state`). Setting the store also calls `document.documentElement.setAttribute('data-theme', val)` so the CSS tokens apply to the whole document.
- **`src/app.html`**: inline `<script>` reads `localStorage.hallify-theme` and sets `data-theme` on `<html>` synchronously before first paint (prevents flash).
- **`src/routes/+layout.svelte`**: on `onMount`, initializes the store from localStorage or org default. An `$effect` also updates the store if the org default changes (e.g. after an org switch) and the user has no personal preference.
- **`src/lib/components/Sidebar.svelte`**: three-button row (Slate / Dark / Warm) just above the user footer. Clicking calls `themeStore.set()` and writes to `localStorage`.
- **CSS**: `[data-theme="dark"] { ... }` and `[data-theme="warm"] { ... }` blocks in `app.css` define theme token overrides. Applied to `<html>`, so they cascade everywhere.

---

## Landing Page (`/`)

Full dark marketing page. Sections: Hero → Features → How It Works → Stats → Values → CTA → Footer.

### Structure
- **Hero**: Vertical layout — text block centered at top, app preview card (500px fixed height, max-width 1080px) below. Two-tier CSS grid background (minor 36px / major 180px) + 3 animated gradient orbs (`orbDrift` keyframe).
- **Hero text**: Headline, sub-copy, CTA buttons. Preceded by `hero-brand` row (Hallify.svg logo + "Hallify" wordmark) so branding is explicit in the hero.
- **Hero card**: Dark-chrome app preview with 3 tabs — Editor (SVG floor plan), Reservations (table), Messages (dark `#0d1117` theme). `heroTab = $state<'editor'|'reservations'|'messages'>('editor')`. Card slides in via opacity+translateY on `.loaded` class.
- **Section overlines**: `<span class="section-eyebrow">01 · Features</span>` — `font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,.22); no border/background`. Replaces pill/badge labels (those were explicitly removed as AI-looking).
- **Features**: 6-card 3-col grid, each with icon + title + description. Cards use `reveal` scroll-in + `--mx`/`--my` spotlight hover.
- **How it works**: 3 steps in a row with SVG visuals + spotlight hover. Step cards use same `mask-composite: exclude` spotlight technique.
- **Stats**: 4 numbers separated by `1px` dividers. Numbers use `white-space: nowrap` to prevent mid-number wrapping.
- **Values (Why Hallify)**: 3 cards with `data-accent="amber|teal|purple"` per-card spotlight color (`--va`/`--vb` CSS vars).
- **CTA**: Full-width dark section with grid background + center-glow + "Get started free" CTA.
- **Footer**: Logo + nav links + copyright.

### UI Anti-Patterns (explicitly banned)
- **No pill/badge section labels** — `border-radius: 100px` colored badge above headings looks AI-generated. Use typographic overlines only.
- **No "section name only" labels** — a label reading just "Features" above the Features heading adds nothing.
- **No floating hero preview widgets** — small isolated card in hero feels like a template. Use a proper full-width anchored card.

### Animation patterns
- **Hero entrance**: triggered by `loaded` state set via `requestAnimationFrame` on mount. Card: `opacity: 0; transform: translateY(20px)` → `opacity: 1; transform: none` (transition 0.9s 0.35s ease).
- **Scroll reveal**: IntersectionObserver adds `in-view` class to `.reveal` elements. CSS uses `:global(.reveal)` / `:global(.reveal.in-view)` because the JS-added class can't match Svelte-scoped selectors.
- **Stagger**: `data-delay="1|2|3"` attributes on sibling reveals for staggered entrance via `:global(.reveal[data-delay="N"]) { transition-delay: ... }`.
- **Spotlight hover**: `onMount` attaches `mousemove` listener to `.feature-card, .step, .value-card`. Sets `--mx`/`--my` CSS vars on each element, consumed by `::before`/`::after` with `mask-composite: exclude` for border glow effect.

---

## i18n

- Two locales: Slovak (`sk`, default) and English (`en`)
- Single file (`src/lib/i18n.ts`), plain object — no runtime i18n library
- Active locale set by `export const t = sk` at the bottom of the file — compile-time switch
- Some hardcoded Slovak strings remain in components — not yet fully extracted

---

## Server-Side Patterns

- `hooks.server.ts` runs on every request (see Auth & Session Flow above)
- `+layout.server.ts` at root injects `user`, `branding`, `currentOrg`, `orgs[]`, and `unreadMessages` to all pages
- SvelteKit form actions used for all mutations — no REST endpoints except Stripe webhook and file upload
- All DB queries use tagged template literals (`sql\`...\``) — no string interpolation, no SQL injection risk
- Auto-completes past reservations on request (rate-limited to once/min, fire-and-forget)

---

## Floorplan / Canvas Editor

- Custom canvas-based table layout editor (`MapEditor.svelte`) and viewer (`FloorplanViewer.svelte`)
- Data format: `MultiFloorState` (v2) — array of floors, each with walls, zones, tables, and a shared guest list
- Tables have per-side chair counts (`chairsTop/Bottom/Left/Right`), rotation, label, and seat assignments
- Legacy single-floor format auto-migrated on load via `migrateToMultiFloor()`
- Stored as JSONB in `reservations.layout_json` (per-event) and `floorplan_templates.layout_json` (admin templates)

---

## Email System

- Per-org SMTP config stored in `org_settings` (key: `'smtp'`)
- Per-org email templates in `org_settings` (key: `'email_templates'`) with `{{variable}}` placeholder syntax
- Per-org notification toggles in `org_settings` (key: `'email_notifications'`)
- Platform-level fallback SMTP config in `system_settings`
- Default templates hardcoded in `email.ts` as final fallback
- All sends logged to `email_log` table with status and error

---

## App Dashboard (`/app`)

`src/routes/app/+page.svelte`

- **KPI-first layout**: 4 KPI cards at the very top in a 4-column grid, then `main-grid` (events table + mini calendar) below.
- **Staggered entrance**: each `.kpi-item` has `animation: fadeSlideUp 0.4s ease both` with inline `animation-delay: 0/80/160/240ms`. Table card enters at 320ms.
- **Create Event button**: filled primary style — `background: var(--accent)`, white text, box-shadow glow. Not an outline button.
- **Empty state**: `.empty-icon-wrap` (64px square, `border-radius: 16px`, border) containing a calendar SVG. Followed by title, sub-copy, and a primary CTA.

---

## Event Creation Flow (`/app/reservation/new`)

`src/routes/app/reservation/new/+page.svelte`

3-step wizard inside a single `<form method="POST" use:enhance>`.

### Steps
- **Step 1** — Hall + Date: 45/55 grid. Left: hall selection cards (building icon + name + capacity badge, `onclick` selects). Right: `<MiniCalendar>`. Both must be filled before Step 2 is enabled.
- **Step 2** — Event Details: Full-width form (title, description, expected guests, status). Summary strip shows selected hall and date at the top.
- **Step 3** — Layout Template: Template grid with SVG previews. Only shown if `filteredTemplates.length > 0` for the selected hall.

### State
```typescript
let step = $state(1);
const maxStep = $derived(selectedHall && filteredTemplates.length > 0 ? 3 : 2);
```

### Hidden inputs always in DOM
```html
<input type="hidden" name="hallId" value={selectedHall} />
<input type="hidden" name="eventDate" value={selectedDate} />
<input type="hidden" name="templateId" value={selectedTemplate} />
```
This ensures values POST correctly on any step's submit without needing to duplicate them.

### Auto-select
If only one hall exists: `$effect(() => { if (data.halls.length === 1 && !selectedHall) { selectedHall = data.halls[0].id; onHallChange(); } })`

### Step indicator
3 numbered circles with connector lines. CSS classes: `.step-dot.active`, `.step-dot.done`, connector `.step-connector.done`.

---

## Auth Shell (`src/lib/components/AuthShell.svelte`)

Split two-panel: dark brand panel (left, 420px) + form panel (right, flex: 1).

### Brand panel
- Dark `#0d1117` background with two-tier CSS grid (minor 36px / major 180px) + accent glow radial gradient (bottom-left).
- Logo, headline, 3 bullet features, footer copyright.

### Entrance animations
All brand panel elements use `class="brand-anim"` + inline `style="animation-delay: Xms"`:
- Logo: 0ms
- Headline: 80ms
- Bullet 1/2/3: 200/280/360ms
- Footer: 440ms

Form panel content (`form-content`) animates at 120ms.

```css
@keyframes brandSlideUp {
  from { opacity: 0; transform: translateY(18px); }
  to   { opacity: 1; transform: none; }
}
.brand-anim { opacity: 0; animation: brandSlideUp 0.55s cubic-bezier(0.22, 1, 0.36, 1) both; }
```

Easing `cubic-bezier(0.22, 1, 0.36, 1)` is a spring-like ease-out — used consistently across all entrance animations.

---

## Route Naming

| Old | New | Changed |
|---|---|---|
| `/app/admin/*` | `/app/manage/*` | June 2026 — better reflects org management purpose |

All 12 files updated. Variable names (`is_platform_admin`, etc.) unchanged — only URL routes renamed. `Sidebar.svelte` navigation links updated. After rename: clear `.svelte-kit/` and restart dev server to regenerate type proxies.

---

## Public Hall Profiles (`/halls/*`)

Added June 2026. Allows org admins to create a public-facing profile for each hall, visible to anyone (no auth required). Cross-org: a visitor at `/halls` sees all public halls across all organizations.

### DB changes (migration-006.sql)
New columns on `halls`:
- `is_public BOOLEAN NOT NULL DEFAULT false` — opt-in flag, must be true for hall to appear publicly
- `slug TEXT UNIQUE (partial, WHERE slug IS NOT NULL)` — URL-friendly identifier used in `/halls/[slug]`
- `cover_image_url TEXT` — hero/card cover image (URL; file upload via R2 coming later)
- `gallery_images JSONB DEFAULT '[]'` — array of image URL strings (R2 gallery, scaffolded)
- `amenities JSONB DEFAULT '[]'` — string[] of amenity IDs (parking, wifi, catering, av, etc.)
- `pricing_info TEXT` — free-text pricing description
- `contact_phone / contact_email / contact_website TEXT`
- `opening_hours JSONB DEFAULT '{}'` — `Record<dayId, {open: boolean, from: string, to: string}>`

### Public routes (no auth required)
- `/halls` — directory of all `is_public = true` halls; search by name/address, filter by min capacity
- `/halls/[slug]` — full hall profile: hero image, amenity chips, pricing, gallery, floorplan preview, opening hours, contact, sidebar CTA

### Root layout bypass
`+layout.svelte` checks `$page.url.pathname.startsWith('/halls')`. When true, renders without the app shell and sidebar — same bare wrapper as the landing page. Hall profiles use their own public header with Hallify logo and "Request this hall →" CTA.

### Admin profile editor
New collapsible "Public Profile" section on `/app/manage/halls/[id]` before Templates. Contains:
- Visibility toggle + slug input (slugified in real-time)
- Cover image URL input with inline thumbnail preview
- Amenities checkboxes (10 predefined: parking, catering, av, wifi, ac, accessible, outdoor, stage, dancefloor, bar)
- Pricing info textarea
- Contact fields (phone, email, website)
- Opening hours: per-day toggle + time range
- Save via `?/saveProfile` server action (slug uniqueness checked server-side)

### R2 image upload
`/api/upload/image` endpoint scaffolded but returns 503 until R2 credentials are connected.
Expected env vars: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `R2_PUBLIC_URL`.

### Reservation new page
Hall cards now show: cover thumbnail (if set), colored icon with hall color (fallback), "Profile →" link to public profile page (if slug is set). Server query extended to fetch `color, slug, cover_image_url`.

---

## Account Types: Client vs Organization (migration-007)

Added June 2026. Splits users into two distinct account types at registration.

### Two account types
| Type | Purpose |
|---|---|
| `organization` (default) | Create and manage halls, handle reservations, billing — the existing admin/venue owner flow |
| `client` | Browse public halls, request reservations, track their own bookings — no org access |

### DB change
`users.account_type TEXT NOT NULL DEFAULT 'organization'` — migration-007.sql.

### Sign-up flow
`/app/register` now shows two large cards ("Find & Book" vs "Manage Venues") before the form fields. Selecting a card reveals the name/email/password form with the type hidden in a `<input type="hidden" name="accountType">`. After registration:
- `client` → redirected to `/app/client`
- `organization` → redirected to `/app/org/new` (unchanged)

### Client routes
- `/app/client` — dashboard: upcoming reservations + "Browse halls" CTA. Has its own `+layout.svelte` (simple topbar: Browse / My Reservations / Profile / Sign out).
- `/app/client/reservations` — full reservation history
- `/app/halls` — public hall directory (no auth required to browse; search by name/address/description)
- `/app/halls/[slug]` — hall detail page: hero, gallery, amenities, hours, pricing, contact, sidebar CTA
- `/app/halls/[slug]/book` — booking request form (requires `account_type = 'client'`; org users redirected back to hall page)

### Route guards
- `hooks.server.ts`: client users skip the entire org-context loading block — `currentOrg` is always `null` for clients.
- `/app/manage/+layout.server.ts`: clients redirected to `/app/client`.
- `/app/+page.server.ts`: clients redirected to `/app/client`.
- `/app/client/+layout.server.ts`: org users (and unauthenticated) redirected away.

### Booking flow
Client books a hall → `reservations` row created with `org_id = hall.org_id` (hall's owner org), `user_id = client.id`. Org admins see it in their manage/reservations list. Client sees it at `/app/client/reservations`. Conflict check: rejects if an approved/planned/pending reservation already exists for that hall on the chosen date. `auto_approve` flag on hall is respected.

---

## Custom domain white-labeling

Hall owners can point their own domain (e.g. `bookings.myvenue.com`) at Hallify. Visitors arrive at a fully org-branded experience with no global Hallify search — only that org's halls are visible.

### Architecture
- **Cloudflare for SaaS** provisions SSL per custom hostname; customers CNAME their domain to `custom.hallify.app` (the CF fallback origin).
- **`custom_domains` table** (migration-008): `id, org_id, domain, cf_hostname_id, verified_at, created_at`. One row per registered domain.
- **`hooks.server.ts`** reads the `Host` header, strips the port, and compares against `HALLIFY_DOMAIN` env var (default `hallify.app`). If it's a custom host, queries `custom_domains` and sets `event.locals.domainOrg`. On custom domains: root `/` and all `/app/*` paths redirect to `/halls`.
- **`event.locals.domainOrg`** — `{ id, name, slug, logoUrl } | null`. Exposed via root `App.Locals` in `app.d.ts`. On custom domains, `event.locals.branding` is overridden with the org's branding settings (colors, logo).

### Public domain routes (`/halls/*`)
The existing `/halls/` routes become the domain-scoped public surface:
- **`/halls/+layout.server.ts`** — redirects to `/app/halls` if `!domainOrg` (prevents Hallify.app users from hitting the domain-only routes); returns `{ domainOrg }`.
- **`/halls/+layout.svelte`** — org-branded sticky header (logo + name, Browse link, Sign in/out). "Powered by Hallify" footer.
- **`/halls/+page.server.ts`** — queries only halls where `org_id = domainOrg.id`.
- **`/halls/[slug]/+page.server.ts`** — scoped to `org_id = domainOrg.id`.
- **`/halls/[slug]/book/`** — booking request form. Requires `locals.user`; redirects to `/login?redirect=...` if unauthenticated.

### Domain auth (`/login`, `/logout`)
- **`/login`** — login + register tabs for `client` accounts only. Guard: `!domainOrg` → redirect `/app/login`. Passwords hashed with bcrypt (12 rounds).
- **`/logout`** — `deleteSession` then redirect to `/halls` (if `domainOrg`) or `/app/login` (main domain).
- Session cookies have no explicit `domain` attribute → automatically scoped to the current hostname. Domain-visitor sessions are isolated from Hallify.app admin sessions.

### Admin domain management
- **`/app/manage/domains`** — CRUD UI for org admins. Shows domains, verification status, DNS instructions. Add triggers `addCustomHostname()` CF API call (graceful degradation if `CF_ZONE_ID`/`CF_API_TOKEN` not set). Refresh polls `getHostnameStatus()` and marks `verified_at` when CF reports `ssl.status = active`.

### Env vars
| Variable | Required | Purpose |
|---|---|---|
| `HALLIFY_DOMAIN` | No (default `hallify.app`) | App's own hostname — custom domain detection skips this |
| `CF_ZONE_ID` | For SSL provisioning | Cloudflare zone ID |
| `CF_API_TOKEN` | For SSL provisioning | CF API token with Custom Hostnames Edit permission |
