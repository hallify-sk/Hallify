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
| Database | Cloudflare D1 (SQLite) | Accessed via `dbAll`/`dbFirst`/`dbRun` helpers in `$lib/db/index` |
| Auth | Custom cookie sessions | `session_id` httpOnly cookie, 30-day TTL, stored in `sessions` table |
| Billing | Stripe | Server-side checkout + portal + webhooks; API version `2025-05-28.basil` |
| Email | Brevo (HTTP API) | Single platform sender `noreply@hallify.sk` via the Brevo transactional API; no per-org SMTP |
| Adapter | `@sveltejs/adapter-cloudflare` | Deployed as a Cloudflare Worker |
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
| Free | €0 | 1 | 2 | 5 |
| Starter | €29.99/mo | 3 | 10 | 50 |
| Professional | €79.99/mo | 10 | Unlimited | 200 |
| Enterprise | Contact | Unlimited | Unlimited | Unlimited |

Gallery images per hall: Free 5, Starter 10, Professional 20, Enterprise unlimited. Free also gets `Basic RSVP`; Starter+ get `Advanced RSVP editing` — the `advancedRsvp` limit still gates this, but since RSVP is off for v1 neither is listed in the plan features or the pricing copy (2026-09-24; see `features.ts`). (Reworked June 2026; the Starter reservations/month value of **50** was inferred — Free 5 / Pro 200 were given, Starter was not.)

Stripe price IDs for Starter and Professional are configured via env vars (`STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PROFESSIONAL`). Enterprise plan uses a `mailto:` contact link — no Stripe checkout.

**Plan capabilities & wording (June 2026):** `PlanLimits.webhooks` gates outgoing webhooks to **paid plans (Starter and up)** — Free is excluded. `PlanLimits.customDomains` and `PlanLimits.customBranding` likewise. `customBranding` locks the **Customize page** (`/app/manage/settings/branding`: logo / colors / theme) for Free — same pattern as webhooks (locked upsell card on load, `fail(403)` on save/resetDefaults). Prices are €29.99 / €79.99 (Starter / Professional). Plan `features` say "**organization members**" (not just "members") for clarity, and `Custom SMTP` was removed from every plan (per-org SMTP no longer exists; see Email System). The `/app/billing` page is the redesigned plan picker: panel design language, each plan card "pops" on hover, **Starter carries the "Most popular" ribbon** (accent border + glow + gentle lift), the current plan is tagged, and `members`-related copy reads "organization members". Webhooks page (`/app/manage/settings/webhooks`) shows a locked upsell card for Free plans and `fail(403)`s its create/toggle/delete actions when `!PLANS[plan].limits.webhooks`.

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
      index.ts        — D1 query helpers (dbAll/dbFirst/dbRun) + ALL typed row interfaces
      seed.sql        — default org + subscription (data, not schema)
  (schema lives in /migrations — see migrations/README.md)
    auth.ts           — createSession / getSessionUser / deleteSession / switchOrg
    email.ts          — Brevo HTTP API + email templates (no per-org SMTP)
    stripe.ts         — Stripe client + createCheckoutSession / createPortalSession
    plans.ts          — PLANS constant, PlanId type, getPlan(), isWithinLimit()
    i18n.ts           — sk (default) + en translations as plain objects
    floorplan-types.ts — shared canvas types (MultiFloorState, TableObj, etc.)
    tickets.ts        — ticket/messaging helpers
    components/
      Nav.svelte      — top nav with OrgSwitcher, org role badge, platform link
      OrgSwitcher.svelte — org dropdown: list orgs, POST /org/switch, create org link
      Sidebar.svelte — unified nav (Home, Messages, Admin, Organization, Platform sections by role)
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
        +layout.svelte  — guard only (renders into the shared app shell)
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

- Keys in env vars only — never stored in DB: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`. (`STRIPE_PRICE_STARTER`/`STRIPE_PRICE_PROFESSIONAL` are now only a **legacy fallback** in the webhook — see below.)
- `APP_URL` env var (not `PUBLIC_APP_URL`) used for redirect URLs — must be `$env/static/private`.

### Pricing is driven by `plans.ts` (June 2026 rework)
- `createCheckoutSession` builds the line item with **inline `price_data`** from `PLANS[plan]`: `unit_amount = priceMonthly*100`, `currency eur`, `recurring monthly`, `product_data.name = "Hallify <Plan>"`, `product_data.description = "Includes: <features>"`. So Stripe **always charges the current price** and shows a description — no pre-created Stripe Price objects to keep in sync. (Tradeoff: each subscription creates an ad-hoc Stripe product; fine for now, migrate to fixed Products if clean per-product reporting is needed.)
- The plan is carried in `metadata.plan` (checkout + subscription). The **webhook reads `sub.metadata.plan`** (falls back to the legacy `STRIPE_PRICE_*` id mapping for old subs); a **canceled subscription reverts the org to `free`**.
- **Redirect URLs are `/app/billing/*`** (the route is `/app/billing`, NOT `/billing` — the old `/billing` URLs 404'd on return from Stripe). Success → `/app/billing/success?plan=…`; cancel → `/app/billing?cancelled=1`; portal return → `/app/billing`.

### Cancel / resume (in-app, June 2026)
- Billing page (`/app/billing`) has **Cancel plan** (paid orgs) → `?/cancel` → `stripe.subscriptions.update(sub, { cancel_at_period_end: true })` (keeps the plan until period end, then the `subscription.deleted` webhook drops them to Free). When a cancellation is scheduled, the card shows a "cancels soon" pill + "Ends on <date>" + a **Resume subscription** button → `?/resume`. The billing `load` reads `cancel_at_period_end` **live from Stripe** (best-effort, only for paid orgs) via the DB-stored `stripe_subscription_id`. The Stripe Customer Portal ("Manage billing") is still available; enabling cancellation there is a Stripe dashboard setting.

### Payment success page (`/app/billing/success`)
- Celebratory page shown after checkout: animated SVG checkmark (draw), pop + ripple rings, falling confetti (client-only, `prefers-reduced-motion` aware), plan-aware copy, and CTAs to the dashboard / billing.

- Webhook at `/api/stripe/webhook`: handles `checkout.session.completed`, `customer.subscription.created/updated/deleted`.

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
- **`Sidebar.svelte`**: Unified nav — logo, org switcher, main links (Home, Messages), Admin section (if org admin), Organization section (Members, Billing, Customize, **Domains**, Webhooks, **Email** notifications), Platform section (if platform admin; includes **Email**), user footer with dropdown. **The "Main" section (Domov / Správy → `/app/`, `/app/messages`) is hidden for org owners/admins** (`{#if !isOrgAdmin}`, June 2026): those are the personal-booking home + user-facing ticket list, redundant with the Admin dashboard and the manage client-messages view (and a confusing second "Správy"). Plain `member`-role org accounts still see them — `/app/` is their booking home.
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

Full dark marketing page, **redesigned June 2026** (via the `design-taste-frontend` skill) to lead with the interactive demo and tell the SaaS story (white-label, multi-tenancy, plans). Sections: Sticky Nav → Hero (split, demo right) → Trust strip → Features (bento) → White-label → How It Works → Pricing → Proof band → CTA → Footer.

Local CSS tokens are declared on `.page` (`--bg`, `--panel`, `--accent #4f6ef7`, `--accent-2 #818cf8`, `--txt*`, `--border*`) and used throughout, so the whole page shares one indigo accent and one neutral ramp. Accent is hardcoded indigo (platform brand); landing renders on the apex with no org branding override.

### Structure
- **Sticky nav** (`.nav`): logo + links (Features / White-label / Pricing) + Sign in + "Get started". Transparent over the hero; gains a blurred solid background (`.nav-solid`) once a 1px `#top-sentinel` scrolls out of view (IntersectionObserver, not a scroll listener). Links hide < 860px; Sign-in hides < 560px.
- **Hero**: **asymmetric split** (`grid-template-columns: 0.86fr 1.14fr`). Left = headline (2 lines, italic accent word "managed"), 18-word subtext, two CTAs, one note line. Right = the interactive demo card (now the centerpiece, above the fold on desktop). Two-tier grid background (36/180px) radial-masked to fade at edges + 3 `orbDrift` orbs. Collapses to single column < 1024px.
- **Demo card** (`.hero-card`, fixed 470px): dark-chrome app preview, 3 tabs — Editor (clickable SVG floor plan + table list), Reservations (expandable rows), Messages (live reply input). `heroTab` state. **Auto-cycles** through the three tabs every 3.8s (the "guided tour") until the visitor interacts — any tab click, table/row select, reply, or `mouseenter` on the card calls `stopAutoplay()`. A small `.card-autoplay` chip in the tab bar reads `tour` / `you`. Auto-cycle is skipped under `prefers-reduced-motion`.
- **Trust strip**: "Trusted by venue teams across Slovakia" + 5 **monogram SVG marks** (circle + two-letter initials), not plain text wordmarks. Logo-only (names are `title`/alt).
- **Features**: **bento grid** (3-col, `grid-template-areas`) with rhythm, not 6 equal cards. Two wide visual cells (floor-plan mini-SVG, brand color swatches), one tall visual cell (RSVP form preview), three text cells. Plain text cells are positioned by `:nth-of-type(3|4|6)`; visual cells by `.cell-floor/.cell-rsvp/.cell-brand`. Re-flows to 2-col then 1-col.
- **White-label** (`#white-label`): split section conveying the SaaS differentiator — own domain, own branding, org isolation. Right side is a **stylized browser mock** showing `bookings.yourvenue.com` with an org-branded booking page + a "Powered by Hallify" badge.
- **How it works**: 3 numbered step cards (gradient `01/02/03`), spotlight hover, single row → stack on mobile.
- **Pricing** (`#pricing`): 4 plan cards built from a local `plans` array mirroring `src/lib/plans.ts` (Free €0 / Starter €29 / Professional €79 (featured "Most popular") / Enterprise Custom). Enterprise CTA is a `mailto:`. 4-col → 2-col → 1-col.
- **Proof band**: 4 **honest** capability facts (Free to start / Your domain / ∞ reservations on Professional / sk · en), not invented traction numbers.
- **CTA**: full-width grid + orbs + "Get started free" / "Sign in".
- **Footer**: 3-column (brand+tag / Product / Account) + copyright bar.

### Shared interaction primitives
- **`.spot`** class = the cursor-following spotlight (inner glow `::before` + `mask-composite: exclude` border glow `::after`, driven by `--mx`/`--my`). Applied to bento cells, steps, and pricing cards. A single `onMount` `mousemove` handler over `.spot` sets the vars.
- **`.reveal`** = IntersectionObserver scroll-in (`:global` because the `in-view` class is JS-added); `data-delay="1|2|3"` staggers siblings.

### Conventions / AI-tells removed in the redesign
- **No section-number eyebrows** (`01 · Features` etc.) — removed as an AI tell. Section headers are headline + sub only.
- **One accent only** — the old amber/teal/purple per-card value section was dropped; everything is indigo. (Semantic status colors inside the demo — green/amber reservation dots — stay, they encode real state.)
- **Zero em/en dashes** anywhere in copy (frontend-skill hard ban); middle dot `·` rationed to ≤1 per line.
- **Trust = real marks, not text wordmarks.** No invented vanity metrics in the proof band.
- **Reduced motion**: a `prefers-reduced-motion: reduce` block disables orbs, pulses, reveals, hero entrance, and the demo auto-cycle.

---

## i18n — runtime SK/EN (reworked June 2026)

Two locales: Slovak (`sk`, default) + English (`en`). Translations are plain objects in `src/lib/i18n.ts` (`en: typeof sk` guarantees the two stay structurally identical) — no i18n library. **The active locale is now resolved at runtime** (was a compile-time `export const t = sk`):

- **`src/lib/i18n.ts`** is data-only now: exports `sk`, `en`, and the `Locale` type. (No `t`.)
- **`src/lib/i18n.svelte.ts`** holds a module-level `let _locale = $state<Locale>('sk')` and exports a reactive **`t` Proxy** over the active dictionary — reading any `t.foo.bar` tracks `_locale`, so the whole UI re-renders on switch. **Call sites are unchanged** (`import { t } from '$lib/i18n.svelte'`). Also exports `getLocale()`, `setLocale()` (no persistence — for SSR/init sync), and `chooseLocale()` (sets `_locale` + cookie + localStorage + `?lang=` URL).
- **Locale resolution (server)** in `hooks.server.ts` → `resolveWithLocale()`: priority **`?lang=` > `hallify-lang` cookie > org default > `'sk'`**. Sets `event.locals.locale`, persists an explicit `?lang=` as the cookie, and stamps `<html lang>` via `transformPageChunk` (`%lang%` placeholder in `app.html`).
- **Org default language**: stored per-org in the **`locale`** `org_settings` key (`{default:'sk'|'en'}`), read **ungated** by `loadOrgLanguage()` (NOT the paid `branding` blob — a default language is free for every plan). Edited on the Customize page (`/app/manage/settings/branding`) via the ungated `?/saveLanguage` action — the language card renders even for free orgs (above the paid-branding lock). Applies to the org's bubble (`/halls/*`) and their `/app/*` for visitors who haven't chosen a language.
- **Client sync**: root `+layout.server.ts` returns `locale`; root `+layout.svelte` calls `setLocale(data.locale)` synchronously in its `<script>` (runs before children → SSR HTML matches, no hydration mismatch) + an `$effect` to re-sync on navigation.
- **Switchers**: SK/EN buttons in the app `Sidebar.svelte` and the bubble shell `halls/+layout.svelte` (mirroring the theme switcher); the landing keeps its SK/EN pill (now driving the global `chooseLocale`). The landing was migrated off its bespoke local locale state onto the global `t`.
- **SSR safety**: module-level `_locale` is safe here because component SSR is synchronous (set-then-render is atomic per request) AND the app uses no `{#await}`/streaming that would render `t.*` in a deferred microtask. If streamed translated content is ever added, move to a context-based `t`.
- **Reactivity caveat**: a top-level `const X = t.foo` in a `<script>` is a one-time snapshot — use `$derived(t.foo)` instead. When a file's loop/param var is already named `t`, import the dictionary as `{ t as tr }`.
- **String extraction (done, June 2026)**: ~977 keys across 23 area namespaces (`bubble`, `hallDir`, `hallProfile`, `publicBooking`, `myRes`, `manifest`, `editor`, `sidebar`, `hallAdmin`, `reservationAdmin`, `messagesAdmin`, `settingsPages`, `platformOrgs`, `platformMisc`, `adminPages`, `appHalls`, `authPages`, `accountPages`, `components`, `membersAdmin`, `memberMessages`, `platformExtra`, `accountExtra`). **Every reachable route page now uses `t.*`** — extracted in 4 parallel workflow waves (analyze+edit per file → merge keys into `i18n.ts` as a single writer → build-verify). Translations were authored by the agents; refine Slovak wording as needed.
- **Server-side messages (done)**: `+page.server.ts` `fail()`/`error()` messages are localized via **`src/lib/i18n-server.ts`** → `st(locals.locale)` returns the raw `sk`/`en` dict (servers must NOT import the runes-only `i18n.svelte`). All messages live under a shared **`serverErrors`** namespace (~140 keys). Interpolated messages are **function-valued keys** (e.g. `serverErrors.memberSeatLimit(limit)`, `hallMaxCapacityGuests(max)`) — `en: typeof sk` enforces matching function signatures. Helpers that lacked request context (`parseTableType`, `assertCanBook` in `availability.ts`) now take a `locale` param threaded from their callers.
- **Known gaps**: (1) a handful of `+server.ts` **API** endpoint errors (image upload size/type, R2-not-configured) are still English — they throw `error()` and surface via fetch handlers; localize with `locals.locale` if needed. (2) `/app/client/*` is vestigial/unreachable (the client area is the org bubble) and was intentionally skipped.

### Locale-aware dates
Date formatters that were hardcoded to `'sk-SK'` (e.g. the printable seating manifest) now switch with the locale: `toLocaleDateString(getLocale() === 'en' ? 'en-GB' : 'sk-SK', …)`.

---

## Past / started events (June 2026)

Two thresholds, both from shared helpers in `src/lib/reservationStatus.ts` (naive date+time parsed as **UTC** via `Date.parse(\`${date}T${time}Z\`)` so the UTC server and local client agree):
- **`hasEventStarted(date, start_time)`** — true once the event begins (a whole-day event with no `start_time` starts at 00:00 of the date). **Locks all client mutation.**
- **`isEventPast(date, end_time)`** — true once the event is over (no `end_time` → after 23:59). Drives the **visual "Past" marker**.

**Client edit-lock at start (server-enforced):** in `halls/my-reservations/[id]/+page.server.ts` the load gates `editable`/`cancellable`/`canManageEvent`/`extrasEditable` with `&& !hasEventStarted(...)`, and the `editExtras`/`update`/`cancel` actions `fail()` once started. The seating layout editor (`…/layout/+page.server.ts`) redirects on load and `fail()`s its `saveLayout`/`loadTemplate` actions once started. **`sendMessage` stays open** (messaging isn't editing). The **read-only seating sheet stays viewable** for started/past/completed events via a new `canViewSeating` flag — only the editable "Table layout" button is hidden.

**Visual marking, all UIs:** client detail header badge (`In progress` / `Past`) + a "this event has started, so it can no longer be edited" note; client list "Past" chip; admin reservations list "Past" tag + dimmed row; calendar past events dimmed + strikethrough across month/week/day/agenda; the admin reservation detail keeps its existing past banner. New i18n keys `event.past` / `event.inProgress` / `event.startedLocked` (sk+en).

---

## Organizations on bubbles (June 2026)

- **No org creation inside a bubble.** When `locals.domainOrg` is set (you're on a `<slug>.hallify.sk` subdomain or a custom domain), `/app/org/new` redirects to `/app/manage` (load + action guard) and the `OrgSwitcher` hides its "Create organization" link. New orgs are created from the apex only. The bubble flag reaches the UI via `onBubble: !!locals.domainOrg` in the root `+layout.server.ts` → Sidebar → OrgSwitcher.
- **Switching org moves a member to that org's own domain.** `/app/org/switch` (`+server.ts`): for a regular member, after verifying membership it redirects to the target org's **verified custom domain** (if the plan allows) else its `<slug>.<HALLIFY_DOMAIN>` subdomain — at `/login` (the bubble login sends org members on to `/app/manage`). Sessions are **host-scoped** (cookie has no `domain` attribute, by design), so the member **re-authenticates** on the target host (chosen over changing the cookie/security model). Platform-admin **"view as"** is exempt (stays on the current host so impersonation keeps working), and **localhost/dev** falls back to the same-host switch (no real subdomains). `orgLoginUrl()` computes the target.

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

## Layout templates rework + RSVP hidden (June 2026)

**RSVP shelved (UI-only, non-destructive).** RSVP is hidden from the admin and client panels but **all backend stays intact** (DB tables `rsvp_entries`/`rsvp_templates`, the `/app/manage/rsvp-templates`, `/app/reservation/[id]/rsvp-editor`, and public `/rsvp/[code]` routes, `rsvp_config`, the `advancedRsvp` plan limit, and i18n strings). To re-enable, reverse these UI gates:
- Sidebar "RSVP šablóny" nav item commented out in `Sidebar.svelte`.
- `FloorplanViewer.svelte` gates its "Import RSVPs" panel behind a local `const SHOW_RSVP = false` (matches the existing flag on `/app/reservation/[id]/+page.svelte`); the `importRsvp()`/`rsvps` plumbing is untouched.
- Reservation detail "Attendees" row now shows `num_guests` + seat count (was RSVP confirmed/registrations); the layout summary dropped its "confirmed" stat; the right-hand RSVP stat stack was already behind `SHOW_RSVP` (the detail grid collapses via `class:single={!SHOW_RSVP}`).
- Visible RSVP copy reworded: `i18n.ts` `guestHint` (sk+en), `AuthShell.svelte` brand bullet.
- **Out of scope:** landing-page marketing copy.

**Templates now created/edited from the hall manage page, not the floorplan editor.** Previously the floorplan editor (`/app/manage/halls/[id]/editor`) had a "Šablóny…" button that snapshotted the editor's working state. New model:
- That button + its `saveTemplate` action are removed. The editor only edits the hall's live room structure (walls/zones/bounds — it already hides `['table','chair']`).
- The hall manage **Templates** section has a **Create template** dialog (name + event type). `createTemplate` snapshots the hall's current live `floorplan_json` into a new `floorplan_templates` row, then `redirect`s to a new restricted editor. Requires a live floorplan first (else `fail`).
- New route **`/app/manage/halls/[id]/templates/[templateId]`**: mounts `MapEditor` with the same restricted props the reservation layout editor uses (`hiddenTools=['wall','bounds']`, `protectWallsZones`, `allowZones`, `lockFloors`, `tablesFromTypesOnly`) — admin places **tables/chairs/zones** on the locked room structure. Debounced autosave → `floorplan_templates.layout_json`.
- Template cards gained an **Edit layout** link (preview + Edit + delete).
- **Event types centralized** in `src/lib/eventTypes.ts` (`EVENT_TYPE_KEYS` + `normalizeEventType`). `event_type` now stored as the lowercase key; `normalizeEventType` folds legacy capitalized values ("Wedding") for display. The `/app/reservation/new` filter already lowercases, so it's back-compatible.

**Clients apply templates in the post-booking layout editor.** Both the client (`/halls/my-reservations/[id]/layout`) and staff (`/app/reservation/[id]/layout`) editors gained a searchable **"Start from a template"** picker (filter by name/event type), shown when the hall has templates. Selecting one posts to a `loadTemplate` action that persists the template into `reservations.layout_json` **and returns the parsed layout**; the page remounts `MapEditor` via `{#key editorKey}` on the returned layout — no full reload, and avoids the autosave-remount pitfall of keying on `data`.

**Extras:** the hall manage Extras section shows an "indicative price only / not a binding quote" disclaimer.

**Dialog consistency:** the "New extra" and "New template" dialogs were restyled to match the table-type dialog — `.dialog-title` header, a padded `.dialog-form` body (flex column, 14px gap), and `.field-input`/`.field-label` on every control (they previously used bare `<input>`/`<select>`/`<textarea>` and rendered with browser defaults — a stark white box in dark mode).

---

## Layout templates: multiple types, edit-details, client recommendations (June 2026)

**A template can carry multiple event types.** Stored as a JSON array in the existing `floorplan_templates.event_type TEXT` column (e.g. `["wedding","ball"]`) — **no migration** (schema.sql uses `CREATE TABLE IF NOT EXISTS`, which can't add columns). `src/lib/eventTypes.ts` centralizes this:
- `parseEventTypes(raw)` → `EventTypeKey[]` — handles the JSON array AND legacy single values ("wedding" / "Wedding").
- `serializeEventTypes(keys)` → JSON array string or null (normalized + deduped).
- All readers go through `parseEventTypes` (manage card chips, `/app/reservation/new` filter, the layout pickers). Create/edit dialogs are multi-select chip groups posting repeated `eventTypes` form fields → `data.getAll('eventTypes')`.

**Templates have editable details.** The restricted template editor (`/app/manage/halls/[id]/templates/[templateId]`) gained an **"Edit details"** dialog (name + event-type chips) → `?/updateMeta` action (separate from the layout autosave; `assertOwned` re-checks org ownership). Previously only the layout was editable.

**Clients are recommended layouts** in the post-booking layout picker (client `/halls/my-reservations/[id]/layout` + staff `/app/reservation/[id]/layout`), ranked by:
1. **Event type** — the customer picks their type in the picker (reservations carry **no** event-type column, only `num_guests`), templates whose types include it rank first.
2. **Guest count → seat count** — closest `|template seats − num_guests|` wins ("closest match wins").
The top result gets a **Recommended** badge. Seat counts are computed **server-side** via `countSeats(layoutJson)` (new in `floorplan-types.ts` — sums per-side `chairsTop/Bottom/Left/Right` or legacy `chairs` across all floors/tables) so the full layout JSON stays off the wire; each picker item shows its seat count + type chips.

---

## Bounds lock, seating CSV export, "Seating sheet" rename (June 2026)

**Clients can no longer delete the room bounds.** `MapEditor.svelte` gated walls/zones via `wallsLocked`/`zonesLocked` but the **bounds** panel (with its "Remove bounds" button) rendered whenever a bounds object existed, regardless of `protectWallsZones` — so clients/template-editors saw it. Added `const boundsLocked = $derived(protectWallsZones)` and gated the panel: `{#if !boundsLocked && (tool === 'bounds' || bounds) && tool !== 'table'}`. Verified there's no other client-reachable path to bounds: the bounds **tool** is in `hiddenTools`, the **eraser** never targets bounds, the **Delete key** filters by `selectedId` (bounds has no id), and `addFloor`'s reset is gated by `lockFloors`. Bounds remain editable only in the hall room editor (`/app/manage/halls/[id]/editor`, which doesn't set `protectWallsZones`).

**Seating manifest exports the guest list as CSV.** New `src/lib/csvExport.ts` (`seatingManifestCsv(floors)` + `downloadCsv` + `fileSlug`) builds a roster CSV — columns **Floor, Table, Seat, Guest, Group, Notes** — from the manifest page's already-derived `floors` structure. RFC-4180 quoting, CRLF, and a leading UTF-8 BOM so Excel renders Slovak diacritics. Pure client-side Blob download, zero deps (no xlsx lib, none would run on Workers). An **"Export CSV"** button sits beside Print in both manifest toolbars (`/halls/my-reservations/[id]/manifest`, `/app/reservation/[id]/manifest` — identical but for the back-link). Opens cleanly in Excel and Google Sheets.

**"Guest list & seating" → "Seating sheet".** The reservation-detail button to the manifest had a misleading bar-chart icon + label. Renamed to **"Seating sheet"** with a document icon (matching the sibling "Table layout" stroke), consistently across the client detail page and both staff occurrences (was "View & print manifest"). Knowledgebase copy updated to match.

---

## Email System (Brevo, June 2026)

All email is sent **platform-wide via the Brevo transactional HTTP API** (`POST https://api.brevo.com/v3/smtp/email`), not SMTP. SMTP was dropped because (a) it does not work reliably on Cloudflare Workers, and (b) per-org SMTP was removed to keep onboarding simple. `src/lib/email.ts` is the single send path:
- **One sender for everything:** `EMAIL_FROM` (default `noreply@hallify.sk`) + `EMAIL_FROM_NAME` (default `Hallify`). Organizations cannot set their own mail server.
- **Auth:** `BREVO_API_KEY` (a Brevo **API key**, `xkeysib-...`, NOT the SMTP key `xsmtpsib-...`). Read via `$env/dynamic/private`. Local: `.env` (vite dev) / `.dev.vars` (wrangler dev). Prod: `wrangler secret put BREVO_API_KEY`. `EMAIL_FROM`/`EMAIL_FROM_NAME` are non-secret `[vars]` in `wrangler.toml`. If `BREVO_API_KEY` is unset, sends are skipped and logged `failed`.
- **Deliverability:** `hallify.sk` must be an authenticated sender (SPF + DKIM) in Brevo or mail from `noreply@hallify.sk` will bounce / spam.
- **Notification preferences are per-org** (`org_settings` key `email_notifications`, **six** booleans, default ON). `getNotifyConfig(db, orgId)` reads them per-org; every `notify*` helper takes `orgId` and gates on it. Two groups:
  - **Notify the team** (emails owners/admins via `emailOrgStaff()`): `newReservation`, `guestMessage` (guest sends a message), `guestCancel` (guest cancels), `guestEdit` (guest edits a pending booking). The three guest events are fired from the bubble reservation server (`/halls/my-reservations/[id]` sendMessage / cancel / update).
  - **Notify the guest**: `statusChange`, `newMessage` (org reply).
  - **`notifyNewReservation(db, orgId, …)`** emails the org's **owners + admins** (`organization_members.role IN ('owner','admin')`) — replaces the old broken `users.role = 'admin'` query. Fired from the org wizard (`/app/reservation/new`) AND the bubble client booking (`/halls/[slug]/book`).
  - **`notifyStatusChange`** / **`notifyNewMessage`** email the guest; all callers updated to pass `orgId`.
- **Templates are platform-level** (`system_settings` key `email_templates`, edited by superadmins — see below). `getEmailTemplates(db)` reads `system_settings`; `{{variable}}` placeholders; defaults hardcoded in `email.ts`. All sends logged to `email_log` (status + error).
- **Org settings UI** (`/app/manage/settings/email`) = **notification preferences only**: a sender note + two side-by-side switch groups ("Notify your team" / "Notify your guests", 6 toggles) → `?/saveNotifications` writes `org_settings`. (The previous SMTP form, per-org templates, mail log, and test button were all removed; the mail log in particular was NOT org-scoped, so showing it per-org leaked other orgs' recipients.) Platform email tab edits all 8 templates (incl. the 3 new guest ones) in `system_settings`.
- **`/app/manage/settings` (org system-metrics overview) was deleted** (June 2026): it showed CPU/memory/node/license info that makes no sense for an organization. Its sidebar link is removed; the settings sub-pages (branding / domains / email / webhooks) are reached directly from the Organization nav.
- **Platform email tab** (`/app/platform/email`, platform-admin only, linked in the Sidebar Platform section): provider/sender/`BREVO_API_KEY`-configured status + recent sent/failed counts, a **Send test** button (`?/testEmail`), the shared **email templates** editor (`?/saveTemplates` → `system_settings`), and the full **mail log** (all orgs).
- This split resolves the earlier `system_settings` vs `org_settings` disconnect: notifications live in `org_settings` (read + written there), templates live in `system_settings` (read + written there).

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

### R2 image upload + serving
Uploads use the **Cloudflare R2 binding** (`platform.env.R2`, bucket `hallify-uploads`), not the S3 API.
- `POST /api/upload/image` — auth required; validates type (jpeg/png/webp/gif) + size (≤8 MB); writes `halls/<userId>/<ts>-<rand>.<ext>` to R2; returns a **same-origin** URL `/uploads/<key>` (not an `r2.dev` domain).
- `GET /uploads/[...key]` — streams the object straight from the R2 binding with long-lived cache headers. This works identically on **localhost** (local R2 emulation), **production**, and any **SaaS custom hostname** — no public bucket / `r2.dev` domain / custom domain needed, and nothing breaks if the bucket isn't publicly exposed.

The legacy `R2_PUBLIC_URL`/`R2_*` S3 env vars are no longer used by the app. (Older image URLs stored as absolute `pub-*.r2.dev/...` links are dead — those images need re-upload.)

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
- **`/login`** — login + register tabs. **Register** always creates a `client` account bound to this bubble's org. **Login** authenticates either a client of this org OR an organization account that is a **member** of this org (so a venue owner can sign in on their own domain — see "Organization login on a custom domain" below). Guard: `!domainOrg` → redirect `/app/login`. Passwords hashed with bcrypt (12 rounds).
- **`/logout`** — `deleteSession` then redirect to `/halls` (if `domainOrg`) or `/app/login` (main domain).
- Session cookies have no explicit `domain` attribute → automatically scoped to the current hostname. Domain-visitor sessions are isolated from Hallify.app admin sessions.

### Organization login on a custom domain (June 2026)
Previously a bubble (`domainOrg`) hard-isolated all org/platform accounts: `getSessionUser` returned `null` for any non-client on a bubble, and `hooks.server.ts` redirected `/` and `/app/*` → `/halls` unconditionally. So a venue owner visiting their own domain could only ever create a *client* account. Now an **organization member of the bubble's org can sign in and manage the venue from that domain**:
- **`getSessionUser`** (`src/lib/auth.ts`): a client still resolves only inside its own org's bubble; an org/platform account now resolves on a bubble **iff it is a member of that bubble's org** (`organization_members` check). Non-members still get `null`. Apex behavior is unchanged (the membership check only runs when `domainOrgId` is set).
- **`hooks.server.ts`**: the session is now resolved *before* the domain route guards. `orgMemberOnBubble = !!domainOrg && session && account_type !== 'client'`. For such users the `/app/*` guard is lifted (they use the real management app on their domain) and bare `/` redirects to `/app/manage`; everyone else (clients, anon, non-members) still gets `/` and `/app/*` → `/halls`. On a bubble an org account is always scoped to the bubble's org (`orgId = domainOrg.id`), regardless of their session's last active org.
- **`/login` action**: looks up candidates matching the email that are either a client of this org or a member of this org, verifies bcrypt against each, and on success redirects clients to the booking surface and org members to `/app/manage`. The login page shows a muted hint: "Managing this venue? Sign in with your Hallify account."
- The whole `/app/*` management UI is served on the custom domain for these users; all queries remain org-scoped to `domainOrg.id`. Session cookies stay host-scoped, so a bubble session never leaks to the apex or another bubble.

### Admin domain management
- **`/app/manage/domains`** — CRUD UI for org admins. Shows domains, verification status, DNS instructions. Add triggers `addCustomHostname()` CF API call (graceful degradation if `CF_ZONE_ID`/`CF_API_TOKEN` not set). Refresh polls `getHostnameStatus()` and marks `verified_at` when CF reports `ssl.status = active`.

### Env vars
| Variable | Required | Purpose |
|---|---|---|
| `HALLIFY_DOMAIN` | No (default `hallify.app`) | App's own hostname — custom domain detection skips this |
| `CF_ZONE_ID` | For SSL provisioning | Cloudflare zone ID |
| `CF_API_TOKEN` | For SSL provisioning | CF API token with Custom Hostnames Edit permission |

---

## Platform-admin org impersonation ("view as") — June 2026

Platform admins (`is_platform_admin`) can view/manage any organization **as if they were a member**, without being one.

- **`loadOrgContext(orgId, userId, db, isPlatformAdmin)`** (`hooks.server.ts`): membership JOIN first (real role, `impersonated:false`); if no membership **and** `isPlatformAdmin`, a fallback loads any non-suspended org with synthetic `role:'owner'`, `impersonated:true`. Clients never reach this (the `account_type==='client'` early-return runs first).
- **`OrgContext.impersonated`** (`app.d.ts`) drives a sticky amber **banner** in the app shell (`+layout.svelte`): "Viewing {org} as platform admin · Exit". Exit posts `org_id=''` to clear.
- **`/app/org/switch`**: platform admins may switch into any non-suspended org (membership bypass); everyone else still needs membership (explicit client reject + sessionId guard added). Empty `org_id` clears `current_org_id` (hooks re-derives the user's own first org). SvelteKit's built-in CSRF origin check protects the POST.
- **Entry + search**: two surfaces. (1) The **OrgSwitcher** dropdown lists *all* non-suspended orgs for platform admins (root `+layout.server.ts` returns `allOrgs`; non-members are labelled "view as"), with an in-dropdown search when > 8 orgs. (2) `/app/platform/orgs` has a **"View as"** action per active org + a client-side org search (> 8 orgs). Both post to `/app/org/switch`.
- **Path-bug fixed**: `OrgSwitcher` posted to the pre-rename `/org/switch` and `/org/new` (dead since the `/app/*` move) — org switching via the dropdown had been silently 404ing for everyone; now `/app/org/switch` and `/app/org/new`.
- Suspended orgs are not impersonable (the fallback query filters `suspended_at IS NULL`).
- **Follow-up (not built):** no `audit_log` table yet, so impersonation isn't audit-logged — the banner is the visibility mechanism. Add an audit trail if compliance needs it.

## Bug-fix sweep — D1-migration leftovers (June 2026)

Two bug classes left by the Postgres→D1 migration, now fixed repo-wide:
- **Missing `db` first-arg**: every call to `postSystemMessage`, `notifyNewReservation` (also wrong arg *order*), `notifyStatusChange`, `notifyNewMessage`, `sendPasswordResetEmail`, `sendTestEmail`, and `dispatchWebhooks` now passes `locals.db` first. These would have thrown at runtime (org reservation status-changes, ticket emails, webhooks).
- **`locals.user.role` (removed from `SessionUser`)**: the `/app/manage/*` admin gates were always-falsy (fail-closed → admins couldn't manage users/messages/rsvp-templates/reservations). Replaced with the org-role check `currentOrg.role in (owner, admin)` (and `is_platform_admin` for `/api/system-metrics`). The `/app/manage` layout already guarantees owner/admin, so these are defense-in-depth.
- **Dead code**: `AdminSidebar.svelte` (legacy `/admin/*` nav, zero imports) deleted; `Sidebar.svelte` is the live unified nav.

## Event creation — whole-day model + holds (redesign June 2026)

A reservation is now a **whole day** for a hall: **one active (non-cancelled) reservation per hall per day**, enforced both in code and by a DB unique index (`reservations_hall_day_unique`, partial `WHERE status != 'cancelled'`). Booking a day blocks it for everyone else. Start/end times are kept as **optional event metadata** (so the calendar Week/Day views stay useful); `num_guests` is now a real column on `reservations`.

### Anti-race holds
- **`reservation_holds`** table (migration-010): a soft lock on `(hall_id, event_date)` while a user is mid-booking — unique index `reservation_holds_hall_date`. `expires_at` is computed in SQL (`datetime('now', '+N minutes')`) so it string-compares correctly against `datetime('now')`. `HOLD_MINUTES = 15`.
- **`/api/holds` (POST)** — acquire/renew, or `{action:'release'}` to drop (sendBeacon-friendly). Auth + scope: org users may hold halls in their current org; clients may hold public bookable halls. Returns `409` when taken/held.
- **Client heartbeat**: picking a date acquires a hold; a 60s interval renews it; `beforeNavigate` + `beforeunload` release it via `navigator.sendBeacon` (helpers in `src/lib/holdClient.ts`). Server `expires_at` is the backstop; `hooks.server.ts` sweeps expired holds alongside `autoCompletePastEvents`.

### Shared rule set — `src/lib/availability.ts`
Single source of truth used by **all three** creation paths (replaces the previously divergent/incomplete checks):
- `assertCanBook(db, hall, date, userId, numGuests)` — allow_reservations, **not past**, `min_days_advance` (earliest = today + N), blocked-by-rules (`hall_blocks`, weekly `days_of_week` = JS `getDay()`), capacity (`<= max_people`), taken (`status != 'cancelled'`), and held-by-another. Called at every submit.
- `acquireOrRenewHold` / `releaseHold` / `getTakenDates` / `getHeldDatesByOthers` / `expandBlocks`.
- Submits INSERT then rely on the unique index, catching the constraint → "this date was just taken" (`409`).

### UI
- **`MiniCalendar`** gained `minDate` (disable past / pre-min-advance), `takenDates` (booked — solid, non-selectable), `heldDates` (amber "being booked"), and `showLegend`. `blockedDates` (rules) shown hatched.
- **Org wizard** (`/app/reservation/new`): hall cards show propagated settings (capacity, auto-approve, min-advance, closed); halls with `allow_reservations=0` are unselectable; date selection acquires a hold with a live "Held · mm:ss" countdown; step 2 adds optional times (toggle) + guest count; layout step shown when `custom_layouts` + templates exist and **required when `force_layouts`**. Stale `/reservation/new` and `/reservation/[id]` nav paths fixed to `/app/...`.
- **Client booking forms** (`/app/halls/[slug]/book`, bubble `/halls/[slug]/book`) now render a shared **`ClientBookingForm.svelte`** (MiniCalendar + holds + guests + optional times), posting standardized fields (`eventDate`, `startTime`, `endTime`, `numGuests`). Fixes the bubble form's previously-missing conflict check.

### Migration / rollout
`migration-010-holds-fullday.sql` (no `BEGIN/COMMIT` — D1 manages it): `ALTER TABLE reservations ADD COLUMN num_guests`, create `reservation_holds`, create both unique indexes. **Pre-check** for same-hall/same-day non-cancelled dupes before running (the reservations index fails otherwise). Run local → dev → prod; keep `schema.sql` in sync for fresh DBs.

---

## Manage Calendar (`/app/manage/calendar`) — redesign June 2026

Rebuilt from a single month grid into a multi-view scheduling surface.

### Views (`?view=`, `?date=YYYY-MM-DD`)
- **Month** — 6-week grid (Monday-start), max 3 event chips per day + "+N more" → opens that day in Day view.
- **Week** — time grid: 7 day columns × hourly rows (`START_HOUR=6`…`END_HOUR=24`, `HOUR_H=46px`). Timed events absolutely positioned by `start_time`/`end_time`; greedy lane allocation handles overlaps; events without a time go in an all-day row.
- **Day** — same time grid, single column.
- **Agenda** — chronological list grouped by date for the anchor day → +90 days.

`+page.server.ts` computes the visible range per view and fetches events once for that range; the summary aggregate always reflects the **anchor month** (independent of view). Dates are string-keyed (`event_date.slice(0,10)`, local `iso()`) everywhere to avoid timezone drift — never `new Date().toISOString()` for calendar bounds.

### Features
- **Filters** (client-side, instant): hall chips + status chips toggle visibility (`hiddenHalls`/`hiddenStatuses` `Set`s). The legend doubles as the filter.
- **Status color-coding**: each reservation status has a fixed color (pending amber, waiting_payment orange, approved green, planned blue, completed teal). Event chips use **hall color** for the body + a **status dot/left-border** for status.
- **Month summary bar**: total events, per-status pills, busiest hall (from server aggregate).
- **Blocked dates**: `hall_blocks` (date_range + weekly, `days_of_week` uses JS `getDay()`, 0=Sun) are sent raw and expanded client-side. A day is shaded "blocked" only when **every currently-visible hall** is blocked that day (diagonal-hatch background).
- **Quick-create**: click the `+` on a day (or double-click a cell) → `/app/reservation/new?date=YYYY-MM-DD` (`&hall=` when exactly one hall is filtered). `reservation/new` now reads `?date=` to prefill `selectedDate`.
- **Event popover**: clicking any event opens a centered modal (hall, date/time, booker, status) with an "Open reservation" link — no navigation away.

### Notes
- **Bug fixed**: month nav previously linked to `/admin/calendar` (no such route → 404). All calendar navigation now uses `/app/manage/calendar`. `AdminSidebar.svelte` is dead/unused legacy (still references `/admin/*`); the live nav is `Sidebar.svelte`.
- New i18n keys under `t.calendar` (sk + en): view names, today, filters, summary labels, etc.

---

## D1 Migration (June 2026)

Database migrated from PostgreSQL (postgres.js) to Cloudflare D1 (SQLite).

### Key changes

| Area | Before | After |
|---|---|---|
| Database | PostgreSQL 16 (Docker) via `postgres` npm package | Cloudflare D1 (SQLite) via `@cloudflare/workers-types` |
| Adapter | `@sveltejs/adapter-auto` | `@sveltejs/adapter-cloudflare` |
| DB access | `sql\`...\`` tagged template literals | `dbAll`, `dbFirst`, `dbRun` helpers from `$lib/db/index` |

### Schema and seed files (reworked August 2026 — see "Tracked migrations" below)
- Schema lives in **`migrations/`**, applied and tracked by Wrangler. See `migrations/README.md`.
- `migrations/0001_baseline.sql` is the former `src/lib/db/schema.sql` (idempotent), and also
  supersedes the old `migration-009/010/011` files.
- Seed data: `src/lib/db/seed.sql` (data, not schema — not a migration)

### Deployment commands
```bash
npm run migrate:local          # local D1 (what `npm run dev` uses)
npm run migrate:dev            # dev-remote (hallify-dev)
npm run migrate:prod           # production (hallify)

npm run migrate:status:prod    # what's still pending
npm run migrate:new -- "msg"   # scaffold the next migration file
npm run seed:local             # seed default data
```

### D1 binding and access
- Binding name: `DB`
- Type: `D1Database` (from `@cloudflare/workers-types`)
- Bound in `wrangler.toml` at project root
- Injected into `event.locals.db` in `hooks.server.ts` via `platform.env.DB`
- Secrets configured via `wrangler secret put <SECRET_NAME>`

### Data type conventions (SQLite)
- Timestamps: `TEXT` in ISO 8601 format (e.g. `2026-06-13T10:00:00.000Z`)
- Booleans: `INTEGER` `0` (false) or `1` (true)
- JSON/JSONB: `TEXT` (serialized JSON string)

### DB helper functions (`$lib/db/index`)
| Helper | Usage |
|---|---|
| `dbAll<T>(db, sql, ...params)` | Returns `T[]` — all matching rows |
| `dbFirst<T>(db, sql, ...params)` | Returns `T \| null` — first row or null |
| `dbRun(db, sql, ...params)` | Executes a write statement; returns D1 result meta |

### Auth functions
All auth functions in `src/lib/auth.ts` updated to accept `db: D1Database` as their last parameter (e.g. `createSession(userId, db)`, `getSessionUser(sessionId, db)`, `deleteSession(sessionId, db)`, `switchOrg(sessionId, orgId, db)`).

---

## Hall management polish + R2 serving + calendar fix (June 2026)

### Required fields on the hall profile editor (`/app/manage/halls/[id]`)
Enforced both client-side (`required` attributes) and server-side in the `saveProfile` action:
- **Capacity** is always required (≥ 1).
- When **"Make this hall publicly visible"** is on, the hall must also have a **Public URL (slug)**, an **Address**, and a **Cover image** — a public listing with no URL, location, or photo is incomplete, so the toggle now gates on them. Labels show `*` conditionally; the cover "paste URL" field is `type="text"` (not `url`) so the same-origin `/uploads/...` paths and uploads both validate.

### Table Types — redesigned UI
Replaced the cramped two-column add-form/list with a **visual card grid**:
- Each type renders an SVG **table preview** (rect vs round, sized by aspect ratio), name, dims · seats · quantity, and a hover delete.
- **Chair placement (fixed June 2026):** `ttChairs` no longer walks the gap-expanded perimeter (which bunched chairs at the corners). It hands each chair to the side with the most room per chair (length / count), balancing per-side proportional to the shape (a 2×1 table → 3 top / 3 bottom / 1 left / 1 right), and places them **evenly spaced, inset from the corners** on each edge. Round tables stay evenly distributed on a circle.
- **Color removed (June 2026):** the per-type **colour palette was removed** from the add/edit dialog — the floor-plan editor renders every table in one fixed fill (`#92400e`) regardless of `table_types.color`, so a custom colour was useless and only fought the editor theme. Previews/cards now use `var(--tt-table, #92400e)`. The `table_types.color` column is kept (existing values preserved on edit via a hidden input defaulting to `#92400e`) but is no longer user-editable or shown.
- Add/edit happens in a **dialog** with a **live preview**. New `updateTableType` server action; `addTableType`/`updateTableType` share a `parseTableType` validator (clamps dims/chairs/amount). All table-type actions are scoped `WHERE hall_id = ?`.

### MiniCalendar form-submit fix
`MiniCalendar.svelte`'s prev/next/day `<button>`s had no `type`, so they defaulted to `type="submit"` — clicking a day inside the reservation form submitted it. Added `type="button"` to all three. This fixes date-picking across all three booking paths (org wizard at `/app/reservation/new` and both client forms via `ClientBookingForm`). (`DateRangePicker` was already correctly typed.)

---

## Client area lives in the org bubble, not `/app/client` (June 2026)

**Key fact for future work:** a `client` account is **bubble-scoped**. `getSessionUser` (`src/lib/auth.ts`) only resolves a client session when the request host is that client's org bubble (`domainOrgId === user.org_id`); on the apex it returns null. And `hooks.server.ts` redirects `/` and **`/app/*` → `/halls`** whenever a bubble is active. So a client's real, reachable area is **`/halls/*` on the org's subdomain / custom domain** — the `/app/client/*` routes are vestigial and unreachable for bubble clients (left as-is).

### Bubble shell — `src/routes/halls/+layout.svelte`
Replaced the sparse topbar with a **branded sidebar** (org logo + name) matching the org view: nav (Browse halls / My reservations / Messages, with an unread badge), a **theme switcher** (slate/dark/warm via `themeStore` + `localStorage 'hallify-theme'`), and an account footer (sign out → `/logout`). Anonymous visitors get Browse + Sign in. Collapses to a horizontal top bar under 760px. (`data.user`/`data.unreadMessages` come from the root layout; `data.domainOrg` from the bubble layout.)

### Reservation management — `src/routes/halls/my-reservations/`
- List redesigned: status-filter tabs (All/Upcoming/Past/Cancelled) + cards linking into a detail page; `?booked=1` success toast.
- **`/halls/my-reservations/[id]`** (new) — view everything supplied; **edit while `pending`** (title / date via `MiniCalendar` / optional times / guests / notes). Editing re-runs `assertCanBook` **only when the date changes** (otherwise it would conflict with itself); the reservation's own date is filtered out of `takenDates`. **Cancel** is allowed for `pending|waiting_payment|approved|planned` (→ `cancelled`, fires a `reservation.status_changed` webhook). All actions are scoped `WHERE user_id = ? AND org_id = ?`.

### Client ↔ org messaging
A per-reservation conversation reuses the existing **tickets/messages** tables: the ticket carries `org_id` (the bubble org) + `reservation_id` + subject `"<hall> – <date>"`, so the org sees client messages in its existing `/app/messages` view. The detail page hosts the thread + composer; **`/halls/messages`** (new) lists all the client's threads. Sending fires `ticket.new` / `ticket.reply` webhooks. (Note: `postSystemMessage` in `src/lib/tickets.ts` still creates **org-less** tickets — separate pre-existing concern.)

Shared `src/lib/reservationStatus.ts` centralises status labels, badge classes (`st-*`, theme-token based), and `fmtDate`.

---

## Org lifecycle: no-empty-org invariant + archive-then-delete (June 2026)

**Invariant: an organization can never exist without a member.** Enforced in `src/routes/app/manage/members/+page.server.ts`:
- `remove` / `leave` refuse to drop the **last member** or the **only owner** (`orgMemberCount <= 1` → "close the organization instead").
- **`closeOrg`** (owner-only, requires typing the org name to confirm) is the only way to remove the last member — it deletes the whole org.

**Closing archives first, then deletes.** `src/lib/orgLifecycle.ts`:
- `archiveAndDeleteOrg` writes a permanent **`closed_organizations`** row (kept indefinitely for legal/accounting) — identity + billing ids + a JSON `snapshot` of `{subscription, members, reservations}` — then calls `deleteOrgCascade`.
- `deleteOrgCascade` removes all org-scoped rows **child-first by hand** (D1 defaults `PRAGMA foreign_keys` OFF, so `ON DELETE CASCADE` does not fire). Keep it in sync with the schema's org-scoped tables.
- `deleteUserAndCleanup` removes a user's memberships/tickets/sessions, then **auto-closes** any org left memberless (`destroyOrgIfEmpty`, reason `user_deleted`). This was the real orphaning vector — the old bare `DELETE FROM users` left ghost memberships.
- Platform view: **`/app/platform/closed-orgs`** (platform-admin only) browses the archives.

**Hardening from the adversarial review:**
- **Impersonation is read-only.** "View as" sets `currentOrg.impersonated = true` with a synthetic `owner` role, so every role check would otherwise pass. All mutating actions in `manage/members` and `manage/users[/[id]]` now early-return `403` when `currentOrg?.impersonated` — a platform admin must switch back to act for real. (`remove` also got an explicit owner/admin re-check for defense-in-depth.)
- **Cascade no longer orphans bubble clients.** `deleteOrgCascade` now deletes the org's **client accounts** (`account_type='client'` AND `users.org_id = <org>`) plus their NULL-`org_id` tickets (from `postSystemMessage`), those tickets' messages, and their sessions/resets. **Org/admin members are NOT deleted** — they may belong to other orgs (only their memberships go). `deleteUserAndCleanup` likewise clears the user's own tickets/messages.

## Manage client-messages page redesign (June 2026)

`/app/manage/messages` (`+page.svelte`) rebuilt to match the panel design language (it had drifted from the polished list pages like `manage/reservations`):
- **Header**: `page-header` + `page-title` + `total-badge` (same pattern as the reservations list), replacing the `SectionHeader` overline.
- **Filters**: All / Open / Closed pill buttons (`border-radius: 99px`, `--sc`-tinted active state — Open uses `--success`, Closed uses `--text-subtle`), matching the reservations filter pills.
- **Thread cards**: each row is an avatar (client initials, stable color hashed from `user_id`) + body (name, status pill, relative time, hall · event date, 2-line clamped last-message preview, email + message count) and a separate border-left action panel (Close / Reopen, unchanged server actions). Closed threads render dimmed until hover.
- **Empty state**: icon tile + title + sub-copy (matches the dashboard empty-state pattern).
- Server load/actions unchanged; this is a pure view-layer redesign.

## Manage members page redesign (June 2026)

`/app/manage/members` (`+page.svelte`) rebuilt to the panel design language (it still used the old `<table>`-in-`.card` style with a `max-width: 900px` cap):
- Full-width `.page { padding: 24px 28px; }`, `page-header` + `page-title` + `total-badge`, matching the reservations/messages lists.
- **Member roster**: avatar-card rows (initials, stable hashed color from `user_id`) with name, "You" tag on your own row, email, joined date, a role control (colored pip + styled `<select>` that auto-submits `?/changeRole`), and an icon Remove button (hidden on your own row — you use Leave instead).
- **Invite**: the "+ Invite member" header button toggles a panel-styled inline form (email + role + send); `use:enhance` closes it on success.
- **Pending invites**: its own labelled section + count badge; dashed-avatar rows with a role pill, expiry, and Revoke.
- **Danger zone**: restyled card with a danger-tinted border (Leave + owner-only Close organization with the type-to-confirm input). All actions, field names, and server guards are unchanged; this is a view-layer redesign. Forms now use `use:enhance`.

## Event page unified (June 2026)

There were two org-side event detail pages: the canonical `/app/reservation/[id]` (full: status, cancel, layout editor, RSVP/templates, attendees) and a thinner, redundant `/app/manage/reservations/[id]` (status + edit-details + a broken `openChat` → dead `/admin/messages/…`, and notably an **unscoped** `WHERE r.id = ?` query — a cross-org read risk). Unified onto `/app/reservation/[id]`:
- `/app/manage/reservations/[id]/+page.server.ts` now just `redirect(307, '/app/reservation/' + params.id)` (old/bookmarked links keep working); its `+page.svelte` is a stub that never renders.
- The manage reservations **list** rows and the manage **dashboard** (recent + upcoming) now link straight to `/app/reservation/[id]`.
- Parity fix: `/app/reservation/[id]` load now `LEFT JOIN users` and shows a **"Booked by"** row (name + `mailto:` email) in the details card — the one thing the thin page had that the full one lacked. (The thin page's "edit title/date/times" form was NOT carried over; admins change status via the status dropdown. Add an edit-details form later if needed.)

## Reservation detail page — permissions, soft-delete, floorplan gating, redesign (June 2026)

`/app/reservation/[id]` (the unified event page):
- **State changes are staff-only.** `updateStatus` now `fail(403)`s for non-staff; the status dropdown only renders for owner/admin. The non-staff `markPlanned` action + button were removed. So **bringing an event back from `cancelled` is staff-only** (only staff have the status control).
- **"Delete" = soft-cancel.** The `cancel` action (available to the booking owner + staff, min-cancel-days enforced for non-staff) sets `status = 'cancelled'` — never a hard delete. The partial unique index `reservations_hall_day_unique (WHERE status != 'cancelled')` frees the day's slot automatically, while the row is kept for archiving.
- **Table layout is gated on the hall having a floor plan.** `hasFloorplan` is computed in `load` from the **raw** `halls.floorplan_json` (NOT the parsed value — `fromJson(null)` returns `{}`, which is truthy). No floor plan → the section shows an empty state ("Add a floor plan to <hall> first…", with an "Open hall settings" link to `/app/manage/halls/[id]` for staff) and the editor buttons are hidden; the `/app/reservation/[id]/layout` editor route redirects back, and its save action `fail(400)`s. With a floor plan, it loads into `FloorplanViewer`/`MapEditor`, and the placeable tables come from the hall's **table types** (managed in the hall editor).
- **Design pass:** the `SectionHeader` was replaced with the panel `page-header` (back-link + title + `StatusBadge`), padding aligned to `24px 28px`, past-event banner moved below the header, and the layout footer/empty-state restyled to the panel language.

## Seating editor rework (June 2026)

- **Detail page layout tab is read-only.** `/app/reservation/[id]` no longer embeds the interactive `FloorplanViewer` ("iframed editor"). When the hall has a floor plan it shows a **summary** (tables / seats / guests) + **Open seating editor** / Load template / Reset. All actual editing (tables, seating, guests) happens in the full editor at `/app/reservation/[id]/layout`. (No floor plan → the empty state from the previous pass.)
- **Autosave.** The editor route debounce-saves ~900ms after the last `onchange` from `MapEditor` (status: Unsaved changes → Saving… → All changes saved); the manual Save button remains.
- **Reservation-mode editor restrictions** (`MapEditor` new props): `lockFloors` hides + no-ops the add/remove-floor controls (a reservation must not invent floors); `tablesFromTypesOnly` blocks the freeform-table fallback so only the hall's **admin-defined table types** can be placed (and the route hides the Table tool entirely when the hall has zero table types). The reservation editor passes both.
- **Theme-aware canvas.** The editor's canvas background, grid lines, and ruler ticks/labels were hardcoded light (`#f8f9fc` / `rgba(0,0,0,…)`), so they ignored the theme. They now use new global tokens `--editor-canvas` / `--editor-grid` / `--editor-grid-strong` / `--editor-tick` / `--editor-tick-minor` / `--editor-label` (defined in `app.css` under `:root` light + `[data-theme="dark"]`; warm inherits the light values). The editor's chrome (header/toolbar/panels/rulers backgrounds) already used `var(--bg-*)`. So the existing global theme switcher now applies to the editor view.

## Org close — wider archive (June 2026)

`archiveAndDeleteOrg` (`orgLifecycle.ts`) now snapshots **invoices** (best-effort from Stripe via `listInvoices(customerId)` in `stripe.ts` — kept for accounting), plus **halls** and **custom domains**, in addition to subscription/members/reservations. Stripe failure or no customer just archives without invoices.

## Editor fixes — input/keyboard, label, group combobox (June 2026)

- **Backspace no longer deletes a table while typing.** `MapEditor.onKeyDown` now early-returns when the event target is an `INPUT`/`TEXTAREA`/`SELECT`/contentEditable, so Delete/Backspace/Ctrl-Z only act on the canvas when a field isn't focused.
- **Table label sized down.** Canvas table label font went from `clamp(8, ws(0.28), 18)` weight 700 to `clamp(6, ws(0.18), 12)` weight 600.
- **Group/family combobox** (guests tab): the "Group / family" input is now a type-ahead — `existingGroups` (distinct, sorted from `guests[].group`) feed `groupSuggestions` filtered by the current input; a `.gf-suggest` dropdown lets you pick an existing family (mousedown-preventDefault so the click beats blur).

### Editor work still open (scoped June 2026, NOT yet built)
- **RSVP → editor guest list + plus-ones** (confirmed: individual seatable people; attending RSVPs appear immediately). Needs: a max-extra-guests setting in the RSVP editor (`rsvp_config`), a guest-count picker on the public RSVP form, an `rsvp_entries` party-size field, and the editor loading attending RSVPs as derived `Guest` entries (invitee + N anonymous placeholders grouped by family, stable ids like `rsvp_<entryId>_<n>` so seat assignments persist).
- **Standalone chair tool** (confirmed: assignable like table seats). Needs a new entity on `FloorData` (e.g. `seats: {id,x,y,rotation,assignment}[]`), a `chair` tool in the toolbar, render + eraser + assignment-popover support in `MapEditor` AND read-only `FloorplanViewer`, and migration handling.

## RSVP plus-ones + RSVP→seating guests (built June 2026)

- **Per-event extras cap:** `RsvpConfig.maxExtraGuests` (0–20), set in the RSVP editor ("Extra guests per invite"), stored in `reservations.rsvp_config`.
- **Public RSVP form** (`/rsvp/[code]`): when `maxExtraGuests > 0`, shows a "Bringing extra guests?" select (Just me … +N). The action clamps `extra_guests` to the cap and stores it on the new `rsvp_entries.extra_guests` column (schema + local D1 migrated; `INTEGER NOT NULL DEFAULT 0`).
- **RSVP → seating editor (inject approach):** the layout route load derives seatable `Guest`s from attending RSVPs — the invitee (`rsvp_<entryId>_0`, name split into first/last) + N anonymous `Guest i` placeholders, all grouped under the invitee's name — and **merges them into the layout's guest list** (`initialLayout`, deduped by stable id; the route now also picks the hall floor plan as the base when the reservation has no saved layout, fixing the `fromJson(null)==={}` empty-start). No MapEditor refactor: the editor just sees them as guests. Tradeoff: once saved they persist in `layout_json` (dedup keeps reloads clean); a withdrawn/renamed RSVP can leave a stale placeholder (remove manually). Verified end-to-end (submit +2 → appears as 3 grouped seatable guests).

## Seat/guest notes + RSVP allergies + printable manifest (built June 2026)

User intent: write notes on seats; RSVP allergies become a note on that guest; admins can open a layout and read everything; print a per-floor seating manifest/legend (allergies etc.).

- **Notes live on the guest** (decision: travel with the person, not the chair). `Guest.note?: string` added to `floorplan-types.ts`. In `MapEditor` the guest-list rows gained a note (pencil) toggle → inline `<textarea>`; rows with a note show a small amber note indicator, and the chair-assignment popover shows the seated guest's note read-only. `updateGuestNote(id, text)` writes it; notes serialize into `layout_json` with the rest of the guest.
- **RSVP responses are captured.** New `rsvp_entries.responses` column (TEXT/JSON; schema + local D1 migrated). The public RSVP action (`/rsvp/[code]`) now walks `rsvp_config.fields` and stores a self-describing list `[{name,label,type,value}]` for every answer (checkbox→bool, allergies→string[] incl. the `_other` free-text, else string). It also resolves the attendee name/email more robustly (explicit `name`/`email` input → first text/email custom field → email local-part). `RsvpRow.responses` typed.
- **Allergies → guest note.** `src/lib/rsvp.ts` helpers: `parseResponses`, `allergiesList`, `allergiesNote` ("Allergies: Nuts, Dairy, …"), `summarizeResponses`. The layout load + manifest load seed the invitee guest's `note` from `allergiesNote(...)` — but only when the organiser hasn't replaced it (refresh only if empty or still starts with "Allergies:"), never clobbering a hand-edited note.
- **Printable manifest** at `/app/reservation/[id]/manifest` (org-scoped; linked from the detail page's layout section — "View & print manifest", shown even when the editor is locked so admins can still read+print). Per floor: a static SVG map (`FloorplanPrint.svelte`, geometry mirrors the editor's `localChairs`; occupied seats filled, empty hollow), a map key, a per-floor **Dietary & accessibility notes** roll-up, and per-table seat cards listing each seated guest with group, note, and full RSVP responses. `@media print` hides chrome and page-breaks per floor (`break-before: page`). A "Print" button calls `window.print()`. Verified: RSVP POST stores responses incl. allergies + `_other`; manifest route loads (303 auth gate, no error). **Visual render of the SVG map + print pagination still needs the user's eyes.**

### DB migration owed (dev-remote + prod), before deploying this code:
- `ALTER TABLE rsvp_entries ADD COLUMN extra_guests INTEGER NOT NULL DEFAULT 0;` (from the plus-ones work)
- `ALTER TABLE rsvp_entries ADD COLUMN responses TEXT;` (this work)

### Still open from this batch
- **Separate in-app read-only interactive viewer** (the manifest covers read+print; user wanted the read-only view tracked as its own surface).
- **Standalone assignable chair tool** (older promise; still not built — needs `FloorData.seats[]` + a `chair` tool in MapEditor & FloorplanViewer).

## Standalone assignable chair tool (built June 2026)

For concert / ceremony seating where chairs aren't attached to tables. New `SeatObj { id, x, y, rotation, assignment, label? }` on `FloorData.seats?` (optional; `migrateToMultiFloor` backfills `seats: []` on every floor for legacy + original-v2 layouts).
- **MapEditor:** new **"Add chair"** tool (between Place table and Eraser; chair-glyph icon). Click places a standalone seat, then snaps back to Grab. Seats render as a chair (slate when empty, green + initials when assigned), mirroring table-chair visuals. A standalone seat **drags** (press + move past ~0.05 m) and, on a press that *doesn't* move, opens the **assignment popover** (`seatClickCandidate` resolves click-vs-drag on pointerup). Eraser and Delete remove a selected seat. `seats` is threaded through every floor sync point (snapshot/undo-redo, saveCurrentFloor, loadFloor, add/removeFloor, initial-load, onchange) so it persists in `layout_json`.
- **Assignment** is unified: `ChairPopover` now carries either `{tableId,chairIdx}` or `{seatId}`; `assignGuest`/`clearChairAssignment`/`popoverChairGuest`/`filteredPopoverGuests` handle both, removing the guest from any prior table-chair OR seat across all floors first (a guest can occupy only one place). `assignedIds`, `totalSeats`, `removeGuest`, `clearAllAssignments` all include standalone seats. (`autoAssign` still seats into table chairs only — standalone chairs are assigned by hand.)
- **Print/manifest:** `FloorplanPrint` draws standalone seats (filled = occupied) and extends the viewBox to include them; the manifest adds a **"Standalone chairs"** card per floor (assigned chairs with guest, group, note, RSVP responses) and folds them into the floor's seated counts + dietary/accessibility roll-up.
- `FloorplanViewer.svelte` is **no longer imported anywhere** (the detail page went read-only-summary), so it was left untouched — if it's ever reused it'll need the same seats handling.
- Type-clean; editor + manifest routes compile (303 auth-gate). **Canvas interactions (place/drag/assign/erase a chair) need visual confirmation in-app — can't be curl-tested.**

### Manifest print refinements (June 2026)
- **Manifest renders without the app shell.** The root `+layout.svelte` (which owns the Sidebar — there is no `app/+layout.svelte`) now treats any `*/manifest` path as a document page (`isDocPage`), rendering bare like the landing/halls pages. So the sidebar/org-switcher no longer bleed into the print.
- **Map (`FloorplanPrint`):** table names auto-shrink to fit the table footprint (`labelFont`); **every chair shows its seat number** (white on an occupied/filled chair, slate on an empty one); standalone chairs are numbered `C1, C2…` and drawn slightly larger.
- **Print pagination = map page + checklist page(s).** Page one is the floor map; the **check-in roster** starts on the next page (`.roster-wrap { break-before: page }`) — a simple table with a **✓ tick-box column** (draw a box to pen-check arrivals), Seat (matching the map numbers; `C#` for standalone), Guest, Group, Notes/allergies, grouped by table with a dietary roll-up at the top. Multi-floor prints map+roster per floor. "Print" uses the browser dialog → Save as PDF.

### Chair tool + manifest fixes (June 2026, round 2)
- **Standalone chairs now have a collision hitbox.** New `seatHitbox`/`seatHasCollision` (circle, `SEAT_R = 0.26 m`): placing or dragging a chair is rejected if it overlaps walls, tables (incl. their chair zones), other chairs, or falls outside the floor bounds; `tableHasCollision` also now rejects tables that would overlap a standalone chair. Placement silently no-ops on collision (mirrors tables).
- **Chair tool icon** swapped for a clearer side-profile chair glyph.
- **Manifest walls were drawn open** (`<polyline>`) while the editor draws them as closed filled polygons → walls looked un-enclosed in print. `FloorplanPrint` now renders walls as filled `<polygon>` (slate), matching the editor.
- **Manifest is now theme-independent + always light.** Wrapped in `.manifest-page` (white bg, `color-scheme: light`); all `var(--text-muted)/--border` swapped for literal light values; toolbar buttons forced to readable light styling via scoped `:global`. So dark mode no longer breaks it and it always prints light (saves ink). `@media print` forces `html/body` white.

### Manifest — unique table tags (June 2026)
Two tables sharing a name (e.g. both "Circular Table") produced identical, ambiguous legend headers. Every table now gets a unique sequential tag `T1, T2…` (per floor) shown both on the map (bold, above the shrunk name in the table centre) and in the legend (group header `T1 · <name>` + each seat cell reads `T1·3`). Standalone chairs keep their `C1, C2…` tags. So a row/seat is always traceable to exactly one table on the map.

## Fair plan changes — proration & scheduled downgrades (June 2026)

**Bug:** the billing `upgrade` action always opened a fresh Checkout, which in subscription mode creates a NEW subscription each time and bills a full period immediately — so switching plans left the org with two parallel subscriptions (the old one kept charging) and no proration.

**Fix — change the existing subscription in place:**
- **First paid subscription** (org on Free, or no sub id) still goes through Checkout.
- **Upgrade** (cheaper → pricier): `stripe.subscriptions.update` swaps the item price and `proration_behavior: 'always_invoice'` charges only the prorated difference for the remaining days, applied immediately. Any pending downgrade schedule is released first.
- **Downgrade** (pricier → cheaper): a **subscription schedule** keeps the current price until `current_period_end`, then a second phase starts the cheaper price — no charge now, the org keeps the higher tier until the period it paid for ends.
- New helpers in `stripe.ts`: `getOrCreatePrice` (lazy, idempotent Price per plan via lookup_key `hallify_<plan>_eur_<amount>` — needed because schedules/updates want a Price id, not inline price_data), `changeSubscriptionPlan`, `cancelScheduledChange` (release the schedule → "Keep current plan"), `getPendingPlanChange` (reads the schedule's future phase for the UI). `plans.ts` adds `planFromAmount` + `comparePlanPrice`.
- **Webhook** now resolves the plan from the **active price amount** (`planFromAmount(unit_amount)`), not subscription metadata — this is what makes a scheduled downgrade sync correctly when its phase activates and the price drops (metadata would still read the old plan). Dropped the legacy `STRIPE_PRICE_*` id mapping.
- **Billing UI:** upgrade/downgrade confirms spell out what's billed (prorated-difference-now vs at-period-end-no-charge); a "Scheduled to switch to <plan> on <date>" banner with a "Keep <current plan>" button (cancels the schedule); success alerts for `upgraded` / `downgrade_scheduled` / `change_reverted`.
- **NOT verified against live Stripe** (no test-mode keys here) — needs a Stripe **test-mode** pass: upgrade charges only the diff, downgrade defers to period end + one subscription only, "Keep current plan" reverts, and the webhook flips the plan when the downgrade activates.

### Plan-change preview dialog + empty-floorplan fix (June 2026)
- **In-app charge preview before a plan change.** Billing plan buttons now open a confirm dialog instead of silently posting. `stripe.ts` `previewPlanChange` computes the exact prorated immediate charge via Stripe's invoice preview (`invoices.createPreview` with the new price in `subscription_details` + `proration_behavior:'always_invoice'`), summing the proration line items (basil flags those on `line.parent`); falls back to a local prorated estimate if the preview call fails (flagged "approximate"), charging the full difference when the period is unknown. (Until 2026-09-24 this called `retrieveUpcoming`, which API basil removed, so every preview silently fell back and showed €0.00.) The billing load precomputes previews for each upgrade target; the dialog shows "Charged now €X" + "then €Y/month from <renewal>" for upgrades, "€0.00 now, switches <date>" for downgrades, and "secure checkout" for a first subscription. (Reminder: an in-place upgrade charges the card already on file — no Checkout — which is why a preview was needed.)
- **Empty-SVG floorplan previews fixed.** The hall card, public hall page, and template previews call `migrateToMultiFloor(hall.floorplan_json)` with the **raw DB string** (those loads don't `fromJson` it), but the function only handled parsed objects → it returned the empty default → blank SVG. `migrateToMultiFloor` now `JSON.parse`s a string argument first. Reservation pages were unaffected (they pass parsed objects). Note: the preview's `computeViewBox`/render still ignores zones + standalone chairs — a zones-only or chairs-only floorplan can still frame poorly (minor follow-up).

### Platform admin — org detail page (June 2026)
New superadmin route `/app/platform/orgs/[id]` (under the platform layout's `is_platform_admin` guard), linked from the orgs overview (org name + a "Manage" button). It surfaces:
- **Subscription / plan override** — current plan + status, and a plan selector with an `setPlan` action that upserts `subscriptions.plan` (`ON CONFLICT(org_id)`), status forced `active`. It's a manual DB grant: a warning notes that orgs with an active Stripe subscription will resync to their paid plan on the next webhook (so it's for comps/support), while orgs with no Stripe sub keep the override.
- **Invoices towards us** — the org's Stripe invoices via `listInvoices(stripe_customer_id)` (number, date, status, amount, links to hosted invoice + PDF); empty states for "never billed" / "no invoices".
- **Org facts + suspend/unsuspend** — members, reservations, created date, Stripe customer id; suspend/unsuspend moved here too (still on the list as well).

### Client zones + dark-mode floorplan polish (June 2026)
- **Clients can draw & name zones.** New `MapEditor` prop `allowZones` splits the single `protectWallsZones` lock into `wallsLocked` (always, in reservation mode) vs `zonesLocked` (`protectWallsZones && !allowZones`). All zone select/drag/erase/vertex/render gates now use `zonesLocked`; walls stay protected. The reservation editor (`/app/reservation/[id]/layout`) now shows the Zone tool (`hiddenTools` drops `'zone'`) with `allowZones`; zone naming/colour already existed in the props panel.
- **Editor walls theme-aware.** Wall fill was hardcoded `#2b3462` (near-invisible in dark mode) → new `--editor-wall` token (`#2b3462` light, `#8b95c9` dark) in app.css.
- **Floorplan previews legible + richer.** The hall-card and public-hall previews were too dark in dark mode (themed bg + dark walls) and looked empty. Both now: render on a fixed light surface (`#f8f9fc`) in every theme (matches the printable manifest), draw the **bounds** outline, **zones with labels**, **standalone seats**, and a slightly lighter wall fill (`#334155`). `computeViewBox` on the public page now includes zones + seats so zone-only/seat-only plans frame correctly.
- **Billing "Renews on" no longer shows on Free.** Free plans don't renew; the renew/ends line is gated on `currentPlan !== 'free'`. (A stale `current_period_end` from a past paid period was the trigger; also cleared it for the Test org locally.)

## Plan-limit enforcement + non-destructive downgrades (June 2026)

Reworked limits so every plan number/feature is actually enforced, and a downgrade never deletes — it deactivates over-limit resources (restored on re-upgrade).

- **plans.ts:** `maxReservationsPerMonth` → `maxReservationsPerHallMonth` (Free 5, Starter **12**, Pro **20**, Ent ∞ — counted **per hall, per the event's calendar month**, excluding cancelled). Added `advancedRsvp` limit (Free false). Feature strings + landing pricing array updated.
- **`src/lib/limits.ts`** (new): central enforcement helpers — `reservationCapReached`, `activeHallCount`/`canAddHall`, `memberCount`/`canAddMember`, `enforcePlanLimits` (locks halls on downgrade). Counts live in D1, numbers from plans.ts.
- **Halls:** `halls.plan_locked` column (new). Creation blocked past `maxHalls` (counts ACTIVE/non-locked halls). On downgrade, if active halls > limit, `enforcePlanLimits` sets **all** halls `plan_locked=1, is_public=0` (called from the Stripe webhook + platform setPlan). Owner reactivates up to the limit via a `reactivate` action (re-checks `canAddHall`); a locked hall can't be made public (saveProfile guard) and `assertCanBook` refuses bookings on it. A banner on the hall page offers Reactivate.
- **Reservations cap:** enforced inside `assertCanBook` (so all booking paths — staff `reservation/new`, app/public client booking, reschedule — are covered): looks up the hall's org plan and rejects when the hall already has ≥limit non-cancelled reservations in the event's `YYYY-MM`. Applies to everyone (staff + clients).
- **Members:** invite action blocked past `maxMembers`.
- **Advanced RSVP:** the RSVP editor (`/app/reservation/[id]/rsvp-editor`) is paid-only — Free sees an upsell, the save action `fail(403)`s; Free events still collect basic name/email RSVPs.
- **Non-destructive point-of-use gating (data kept, auto-restores on upgrade):**
  - *Custom branding* — `loadOrgBranding` (hooks) returns the platform default if the org's plan lacks `customBranding`.
  - *Custom domain* — the custom-domain bubble in hooks only resolves while the plan allows it (free `<slug>.hallify.sk` subdomain always works).
  - *Webhooks* — `dispatchWebhooks` no-ops if the plan lacks webhooks.
  - *Gallery* — the public hall page clamps shown images to `maxGalleryImages` (upload was already capped).
- **Superadmin (`/app/platform/orgs/[id]`):** new `setSlug` action to change an org's subdomain (slug-normalised, reserved-word + uniqueness checked).
- **Platform user detail (`/app/platform/users/[id]`, new):** account type (business vs client), platform-admin, reservations made, joined; the orgs they belong to (role + plan, linked to the org page) or their client org; grant/revoke platform admin. Linked from the users list (name + View).

### DB migration owed (dev-remote + prod) before deploying:
- `ALTER TABLE halls ADD COLUMN plan_locked INTEGER NOT NULL DEFAULT 0;`
- (still outstanding from earlier) `ALTER TABLE rsvp_entries ADD COLUMN extra_guests INTEGER NOT NULL DEFAULT 0;` and `ADD COLUMN responses TEXT;`

### Invite emails, hall-profile polish, staff→client messaging (June 2026)
- **Organization invite emails now actually send.** The members `invite` action was a `TODO` (created the invite row but never emailed). Added `sendOrgInviteEmail` to `email.ts` (branded inline HTML + accept link) and called it from the action, building the link as `${APP_URL||url.origin}/app/invite/<token>`. The success message reflects whether the email send succeeded.
- **`/app/halls/[slug]` profile redesign.** It used undefined CSS tokens (`var(--surface)`, `var(--bg)`) so cards rendered with no fill (looked bare/off-brand), and `.page` had no padding (back link jammed to the top). Fixed: real tokens (`--bg-panel`/`--bg-panel2`/`--border`), `padding: 24px 28px`, a proper icon back-link, and an always-present **"At a glance"** facts card (capacity / location / booking status) so the page isn't empty for halls without description/gallery.
- **Staff → client messaging from `/app/reservation/[id]`.** New `messageClient` action (staff-only): finds-or-creates the reservation's ticket thread (`tickets.reservation_id`, client = `reservation.user_id`), inserts the message as the staff sender, emails the client (`notifyNewMessage`), and fires the `ticket.reply` webhook. A composer (textarea + Send, "Open Messages" link) shows under "Booked by" on the reservation page; the thread appears in Messages for both sides.

## Notification sounds + platform announcements (June 2026)

Three sounds live in `/static` (`order.wav`, `ticket.wav`, `announcement.wav`), played via `$lib/sounds.ts` (`playSound`, mute-aware, swallows autoplay-block errors).
- **order.wav** — plays on the billing success page (`onMount`).
- **ticket.wav** — plays when a new message arrives while the tab is backgrounded.
- **announcement.wav** — plays when a fresh announcement is received.

**Real-time = polling** (no websockets on CF Workers). The root `+layout.svelte` polls `/api/notifications` every 15s for signed-in users: it tracks the unread-message count (plays `ticket.wav` on an increase while `document.hidden`) and unread-announcement ids (plays `announcement.wav` on a new id; the first poll primes state without playing). Live counts feed the sidebar pings, overriding the SSR values.

**Announcements (platform → organization, one-directional):**
- New tables `announcements` (level `info|success|warning|error`, title, body, audience `all|specific`, email_sent), `announcement_targets`, `announcement_reads` (per-user). Helpers in `$lib/announcements.ts`.
- **Superadmin** `/app/platform/announcements` (+ sidebar link): compose an announcement (level, title, body, audience = all or specific orgs, "also email owners/admins" checkbox), list/delete recent ones with target + read counts. Creating one optionally emails owners/admins (`sendAnnouncementEmail` in email.ts, deduped across orgs).
- **Org owners/admins** see them at `/app/announcements` (sidebar item w/ red ping; plain members don't). Opening the page marks all visible as read (clears the ping). Levels are colour-coded; unread ones are highlighted.
- Unread counts: `unreadMessageCount` (`$lib/unread.ts`, now staff-aware — counts the user's own threads AND, for staff, the org inbox awaiting reply) + `unreadAnnouncementCount`, computed in the layout SSR and the poll endpoint. The Messages sidebar item also shows a red ping when unread.

### DB migration owed (dev-remote + prod): the three announcement tables (run `schema.sql`'s new `CREATE TABLE IF NOT EXISTS announcements / announcement_targets / announcement_reads` — these ARE idempotent, so `npm run migrate:dev` / `migrate:prod` apply them safely, unlike the earlier ADD COLUMN migrations).

### Fix: orphaned Cloudflare custom hostnames on org delete (June 2026)
Deleting an org dropped its `custom_domains` rows but never called Cloudflare, leaving the custom hostname registered on the zone → re-adding that domain failed with "Duplicate custom hostname found". `deleteOrgCascade` (orgLifecycle.ts) now calls `deleteCustomHostname(cf_hostname_id)` for each of the org's domains (best-effort, `isCFEnabled()` guarded) before deleting the rows; it also clears `announcement_targets`. (The domain **remove** action already cleaned up CF — only the org-delete path was missing it.) One orphaned hostname (`bookings.em1t.me`, left by the earlier raw-SQL org cleanup) was removed via the CF API. Deployed dev + prod.

## Client self-service editors + Hall Extras + RSVP parked (June 2026)

- **Client event tools.** After a booking is approved/planned, the booking client gets seating tools on `/halls/my-reservations/[id]`: a **table layout editor** (`…/layout`) and **guest list & manifest** (`…/manifest`), gated to the owner + status, sharing the same `layout_json` as staff (last-save-wins). Shared logic extracted to `$lib/reservationLayout.ts` (`buildSeatableLayout` + `rsvpDetailMap`), reused by the staff routes too.
- **RSVP parked.** The RSVP/invite feature is hidden from staff + client (`SHOW_RSVP=false` flag on the staff reservation page; client RSVP route removed; staff rsvp-editor route kept but unlinked). The staff detail page collapses to a single column when RSVP is off.
- **Hall Extras (new).** Bookable add-ons per hall (name, description, price, **fixed or per-guest**). Admin CRUD in an "Extras" section on the hall page, **plan-limited** (`maxExtrasPerHall`: Free 3 / Starter 6 / Pro 10 / Ent ∞; `canAddExtra`). New `hall_extras` table + `reservations.extras_json` (selected ids). Clients pick extras in the booking form (`ClientBookingForm`, shared) with a live cost total (per-guest × guest count); selection editable on their reservation **until approved**; **staff can edit anytime** (consensus-in-chat). Informational overview only (no payment). Cost helpers in `$lib/extras.ts` (`computeExtras`, `parseExtraIds`, `eur`). Shown on both client + staff reservation pages.

### DB migration owed (already applied to dev-remote + prod this session): `ALTER TABLE reservations ADD COLUMN extras_json TEXT;` + the new `hall_extras` table (via `migrate:*`).

### Still TODO: Help tab — phase 1 (onboarding checklist + static knowledgebase), then phase 2 (guided floorplan wizard + global completion toasts).

---

## Landing Page (June 2026)

`src/routes/+page.svelte`

### i18n (runtime, SK/EN)
- Both locales live in `src/lib/i18n.ts` under a `landing` namespace (added June 2026). Pattern mirrors the existing app i18n: `sk.landing.*` and `en.landing.*`.
- Default locale: `sk`. Toggle persists across page loads via `localStorage('hallify-lang')`.
- Runtime switching via `let locale = $state(...)` + `const lang = $derived(locale === 'en' ? en : sk)`. No page reload.
- Language switcher: `SK / EN` pill button in the nav (`<button class="lang-toggle">`). Active locale shown at full white; inactive is muted.
- The product demo mockup (editor, reservations, messages) intentionally stays in English — it's UI simulation, not marketing copy.

#### URL-based locale (SEO, June 2026)
- `?lang=en` query param is the canonical EN URL (`hallify.sk/?lang=en`); SK has no param (`hallify.sk/`).
- `+page.server.ts` reads `url.searchParams.get('lang')`, validates (`sk` | `en` | null), and returns `{ lang, canonicalSk, canonicalEn }` as page data.
- `+page.svelte` initializes `locale` from `data.lang ?? 'sk'` (SSR-safe, no hydration mismatch). `onMount` applies `localStorage` fallback only when no URL param was present.
- `toggleLocale` calls `history.replaceState` to sync the URL on toggle (no page reload).
- `<svelte:head>` emits `<link rel="canonical">` + `<link rel="alternate" hreflang="sk|en|x-default">` so Google indexes both language variants correctly.
- Used query param (not path segment) because a `[lang]` root route would capture arbitrary paths that conflict with `/halls`, `/app`, etc.

### Smooth scroll
- `scroll-behavior: smooth` + `scroll-padding-top: 72px` on `:global(html)`. No JS needed; SvelteKit doesn't intercept hash-only links.

### "Up and running in minutes" redesign
- Replaced card layout with an editorial step display: circular step markers (`step-marker`, 58px, gradient border), connecting line via `steps::before`, and icon widgets (`step-icon-wrap`).
- No card backgrounds or borders on steps — open-air feel on the dark background.
- Mobile (≤860px): steps collapse to left-aligned vertical rows (marker left, content right); connector line hidden.

### White-label browser mockup
- Replaced three empty `.bp-card` placeholder boxes with `.bp-hall-card` components: coloured top accent bar, hall name, guest capacity, and availability badge (Available / Selected / Booked). Fits within the existing mock browser chrome.

### Pricing features
- Synced with `src/lib/plans.ts` (starter and professional previously missing custom domain, custom branding, webhooks, advanced RSVP). Enterprise now lists all individual features instead of "Everything in Professional + …".

## Help tab — phase 1: onboarding checklist + knowledgebase (June 2026)
New `/app/manage/help` (sidebar "Help" in the Organization section):
- **Setup checklist** computed live from org data (create a hall, draw a floor plan, define table types, publish a hall, offer extras, invite a teammate) — each with done/✓ state, a progress bar, and a CTA link to where to do it.
- **Knowledgebase** — static articles authored in code (`$lib/knowledgebase.ts`, trusted HTML via `{@html}`), grouped by category, each at `/app/manage/help/[slug]` with "more in this category" links. Starter set: getting started, halls & floor plans, reservations & approvals, the seating editor, hall extras, plans & limits/downgrades, domains, team & roles.
- No DB changes. Deployed dev + prod.
- **Phase 2 still TODO:** guided floorplan wizard (bounds → walls → zones → done) + global completion toasts (svelte-sonner style).

## Org-created events: assign to a client + email invite (June 2026)
The org creates an event normally (any way it likes), then hands it to a client from the **reservation detail page** (`/app/reservation/[id]`). Decisions (confirmed with user): assign happens **from the reservation page** (re-sendable, not a wizard step); an email that already belongs to a client of the org is **assigned directly + notified**, otherwise a **prefilled-register invite** is emailed; **status is inherited** — assignment NEVER changes the reservation's status.

- **New table `reservation_invites`** (`schema.sql`): `id, reservation_id, org_id, email, first_name, last_name, token (unique), invited_by, created_at, expires_at, accepted_at`. Holds the pending invite for a person who has no account yet. `reservations.user_id` is **NOT NULL**, so until the invite is accepted the reservation keeps its existing owner (the staff member who created it); on acceptance `user_id` is set to the new/matched client. At most one pending (un-accepted) invite per reservation — re-inviting deletes the previous pending row.
- **Assign UI** (`/app/reservation/[id]/+page.svelte`, staff-only "Client" card): shows current state (real client owner / pending invite to <email> with Resend + Cancel / none), plus a `<details>` form (first name, last name, email) to assign or re-assign. The "message the client" block is now gated on a **real client owner** (`data.clientOwner`), not merely `user_id` (which for internal events is the staff creator).
- **Server actions** (`+page.server.ts`): `assignClient` (existing client → `UPDATE reservations.user_id` + `notifyEventAssigned`; new email → create/replace `reservation_invites` row + `sendReservationInviteEmail`), `resendInvite` (re-send same token), `cancelInvite` (delete pending). `load` now returns `clientOwner` (owner's `account_type === 'client'`) + `pendingInvite`.
- **Invite link → the org's own bubble.** New `$lib/orgUrl.ts` `orgPublicBaseUrl(db, orgId, url)` = verified custom domain (if plan allows) else `<slug>.<HALLIFY_DOMAIN>`, null on localhost/dev → falls back to `env.APP_URL || url.origin`. Link is `<base>/invite/<token>` (clients register on the bubble; mirrors hooks bubble-resolution). Same rule as `app/org/switch`'s `orgLoginUrl` (kept separate to avoid touching working code).
- **Accept route `/invite/[token]`** (top-level, so it serves on a bubble — non-`/app/`, non-`/` paths are allowed for anon/clients per hooks). `load` validates the token (404/410 on missing/used/expired) and branches on whether the email already has an account / the matching client is already logged in. Actions: `register` (password-only; name+email come from the invite, creates the `'client'` account scoped to `invite.org_id`, sets `reservations.user_id`, marks accepted, logs in → `/halls/my-reservations/[id]`) and `claim` (logged-in matching client takes ownership). 14-day expiry.
- **Emails** (`email.ts`, localized to the org's preferred `org_settings 'locale'`): `sendReservationInviteEmail` (new client, with the registration link) + `notifyEventAssigned` (existing client, with a link to the event). Both bilingual inline (sk/en), escaped.
- New i18n: `reservationAdmin.assign*` + new `inviteAccept` namespace + 5 `serverErrors` keys (sk+en, parity kept).

### DB migration owed (dev-remote + prod) before deploying: the new `reservation_invites` table (+ its index) via `schema.sql`'s `CREATE TABLE IF NOT EXISTS` — idempotent, so `migrate:dev` / `migrate:prod` apply it safely. Applied to **local D1** this session; dev-remote + prod still owed.

---

## Tracked migrations (August 2026)

Schema changes were previously hand-applied per environment with no record of what had
landed where — `DESIGN.md` carried "DB migration owed (dev-remote + prod)" notes as the
only tracking, and those notes went stale (all three were in fact already applied).

- **`migrations/` is now the single source of truth**, applied by Wrangler's native D1
  migrations and recorded per-database in `d1_migrations`. `migrations_dir = "migrations"`
  is set on both the prod and `env.dev` D1 bindings in `wrangler.toml`.
- `src/lib/db/schema.sql` → **`migrations/0001_baseline.sql`**. It is entirely
  `IF NOT EXISTS`, so applying it to the already-populated dev/prod databases is a no-op
  that records the baseline. Verified locally: data preserved, re-run reports
  "No migrations to apply!".
- Removed as superseded: `migration-009/010/011.sql` (folded into the baseline) and
  `src/lib/db/migrate.ts` (a comment stub, never imported). Instructions now live in
  **`migrations/README.md`**.
- `npm run migrate:{local,dev,prod}` now mean *apply pending migrations*, not *re-run the
  whole schema*. Added `migrate:status:*`, `migrate:new`, and `seed:local`.

**The trap this closes:** `CREATE TABLE IF NOT EXISTS` never adds a column to a table that
already exists, so any `ADD COLUMN` written into the schema file silently skipped every
existing database. That is exactly how `rsvp_entries.extra_guests` and
`rsvp_entries.responses` ended up needing manual `ALTER`s. Adding a column now always gets
its own migration file, and every environment records that it ran.
