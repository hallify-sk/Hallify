import { getSessionUser, switchOrg } from '$lib/auth';
import { extendCsp } from '$lib/analytics-servers';
import { isReservedSubdomain } from '$lib/reserved-subdomains';
import { getBrandingCacheTime, setBrandingCacheTime, BRANDING_CACHE_TTL } from '$lib/branding-cache';
import { dbAll, dbFirst, dbRun } from '$lib/db';
import { runCleanup } from '$lib/cleanup';
import { sendEventReminders } from '$lib/server/reminders';
import { expirePastRequests } from '$lib/server/reservation-activity';
import { getPlan } from '$lib/plans';
import type { PlanId } from '$lib/plans';
import { env } from '$env/dynamic/private';
import { runInRequestScope, keepAlive } from '$lib/server/background';
import { syncUserLocale } from '$lib/server/user-locale';
import { suspendedResponse } from '$lib/server/suspended-page';
import { canonicalRedirect, needsOriginCheck, originAllowed, redirectStatus } from '$lib/server/edge';
import { loginUrl } from '$lib/login-redirect';
import { isGatedPath, verificationRequired } from '$lib/server/email-verification';
import { sequence } from '@sveltejs/kit/hooks';
import type { Handle } from '@sveltejs/kit';
import type { Branding, OrgContext } from './app.d';
import type { D1Database } from '@cloudflare/workers-types';

const DEFAULT_BRANDING: Branding = {
  appName: 'Hallify',
  logoUrl: '/Hallify.svg',
  primaryColor: '#f05ca1',
  accentColor: '#f05ca1',
};

// Platform-level branding cache (30s TTL) — cache time managed in $lib/branding-cache
let cachedPlatformBranding: Branding = { ...DEFAULT_BRANDING };

async function loadPlatformBranding(db: D1Database): Promise<Branding> {
  const now = Date.now();
  if (now - getBrandingCacheTime() < BRANDING_CACHE_TTL) return cachedPlatformBranding;
  try {
    const row = await dbFirst<{ value: string }>(db, "SELECT value FROM system_settings WHERE key = 'branding'");
    cachedPlatformBranding = { ...DEFAULT_BRANDING, ...(row?.value ? JSON.parse(row.value as string) : {}) };
    setBrandingCacheTime(now);
  } catch {
    // keep cached on error
  }
  return cachedPlatformBranding;
}

/** Load org context (org info + user's role + subscription) for a given org + user.
 *  Platform admins who are NOT members can still load any org, suspended ones
 *  included (so "view as" can inspect what was suspended), with a synthetic owner
 *  role ("view as" / impersonation), flagged via `impersonated`. */
async function loadOrgContext(orgId: string, userId: string, db: D1Database, isPlatformAdmin = false): Promise<OrgContext | null> {
  const r = await dbFirst<{
    org_id: string; org_name: string; org_slug: string; org_logo_url: string | null;
    member_role: string;
    sub_plan: string; sub_status: string; stripe_customer_id: string | null; current_period_end: string | null;
  }>(db,
    'SELECT o.id AS org_id, o.name AS org_name, o.slug AS org_slug, o.logo_url AS org_logo_url, m.role AS member_role, s.plan AS sub_plan, s.status AS sub_status, s.stripe_customer_id, s.current_period_end FROM organizations o JOIN organization_members m ON m.org_id = o.id AND m.user_id = ? LEFT JOIN subscriptions s ON s.org_id = o.id WHERE o.id = ? AND o.suspended_at IS NULL',
    userId, orgId);

  if (r) {
    return {
      id:      r.org_id,
      name:    r.org_name,
      slug:    r.org_slug,
      logoUrl: r.org_logo_url,
      role:    r.member_role as OrgContext['role'],
      impersonated: false,
      subscription: {
        plan:              (r.sub_plan ?? 'free') as OrgContext['subscription']['plan'],
        status:            (r.sub_status ?? 'active') as OrgContext['subscription']['status'],
        stripeCustomerId:  r.stripe_customer_id,
        currentPeriodEnd:  r.current_period_end,
      },
    };
  }

  // Platform-admin "view as": not a member, but allowed to inspect/manage any org.
  if (isPlatformAdmin) {
    const p = await dbFirst<{
      org_id: string; org_name: string; org_slug: string; org_logo_url: string | null;
      sub_plan: string | null; sub_status: string | null; stripe_customer_id: string | null; current_period_end: string | null;
    }>(db,
      'SELECT o.id AS org_id, o.name AS org_name, o.slug AS org_slug, o.logo_url AS org_logo_url, s.plan AS sub_plan, s.status AS sub_status, s.stripe_customer_id, s.current_period_end FROM organizations o LEFT JOIN subscriptions s ON s.org_id = o.id WHERE o.id = ?',
      orgId);
    if (p) {
      return {
        id:      p.org_id,
        name:    p.org_name,
        slug:    p.org_slug,
        logoUrl: p.org_logo_url,
        role:    'owner',
        impersonated: true,
        subscription: {
          plan:             (p.sub_plan ?? 'free') as OrgContext['subscription']['plan'],
          status:           (p.sub_status ?? 'active') as OrgContext['subscription']['status'],
          stripeCustomerId: p.stripe_customer_id,
          currentPeriodEnd: p.current_period_end,
        },
      };
    }
  }

  return null;
}

/** Load org-specific branding, falling back to platform branding. */
async function loadOrgBranding(orgId: string, fallback: Branding, db: D1Database): Promise<Branding> {
  try {
    // Custom branding is a paid feature — on a non-eligible plan we fall back to
    // the platform default (the org's saved branding is kept, just not applied).
    const sub = await dbFirst<{ plan: string | null }>(db, 'SELECT plan FROM subscriptions WHERE org_id = ?', orgId);
    if (!getPlan((sub?.plan ?? 'free') as PlanId).limits.customBranding) return fallback;
    const row = await dbFirst<{ value: string }>(db, "SELECT value FROM org_settings WHERE org_id = ? AND key = 'branding'", orgId);
    if (row?.value) return { ...fallback, ...JSON.parse(row.value as string) };
  } catch {
    // fall through
  }
  return fallback;
}

// ── Locale resolution ──────────────────────────────────────────────────────
const isLocale = (v: unknown): v is 'sk' | 'en' => v === 'sk' || v === 'en';

/** The org's preferred default language. Stored under its own 'locale' org_settings key
 *  (NOT the paid 'branding' blob) — a default language is free for every plan. */
async function loadOrgLanguage(orgId: string, db: D1Database): Promise<'sk' | 'en' | null> {
  try {
    const row = await dbFirst<{ value: string }>(db, "SELECT value FROM org_settings WHERE org_id = ? AND key = 'locale'", orgId);
    if (row?.value) {
      const lang = (JSON.parse(row.value as string) as { default?: unknown }).default;
      if (isLocale(lang)) return lang;
    }
  } catch { /* ignore */ }
  return null;
}

type HandleArgs = Parameters<Handle>[0];

/** The language a visitor explicitly chose (?lang or the cookie), if any. */
function chosenLocale(event: HandleArgs['event']): 'sk' | 'en' | null {
  const param = event.url.searchParams.get('lang');
  if (isLocale(param)) return param;
  const cookie = event.cookies.get('hallify-lang');
  return isLocale(cookie) ? cookie : null;
}

/** The marketing site's origin, keeping a dev port. */
function apexOrigin(url: URL, appDomain: string): string {
  const port = url.port ? `:${url.port}` : '';
  return `${url.protocol}//${appDomain}${port}`;
}

/** Console pages that need a current organisation (where a suspended owner lands). */
function isConsolePath(pathname: string): boolean {
  return pathname === '/app' || pathname === '/app/' || pathname === '/app/manage' || pathname.startsWith('/app/manage/');
}

/** Resolve the request locale (?lang > 'hallify-lang' cookie > org default > 'sk'),
 *  expose it on locals, persist an explicit ?lang choice as a cookie, and stamp the
 *  <html lang> attribute via %lang% in app.html. */
async function resolveWithLocale(
  event: HandleArgs['event'],
  resolve: HandleArgs['resolve'],
  orgIdForDefault: string | null,
  db: D1Database,
): Promise<Response> {
  const param = event.url.searchParams.get('lang');
  let locale: 'sk' | 'en';
  let chosen = true;
  if (isLocale(param)) {
    locale = param;
    event.cookies.set('hallify-lang', param, { path: '/', maxAge: 60 * 60 * 24 * 365, httpOnly: false, sameSite: 'lax' });
  } else {
    const cookie = event.cookies.get('hallify-lang');
    if (isLocale(cookie)) locale = cookie;
    else {
      chosen = false;
      locale = (orgIdForDefault ? await loadOrgLanguage(orgIdForDefault, db) : null) ?? 'sk';
    }
  }
  event.locals.locale = locale;
  // Remember a signed-in person's own choice on their account, so emails reach them
  // in the language they read (the switcher only sets a cookie). Once per change.
  if (chosen && event.locals.user) {
    const write = syncUserLocale(db, event.locals.user.id, locale);
    if (write) keepAlive(write);
  }
  return resolve(event, { transformPageChunk: ({ html }) => html.replace('%lang%', locale) });
}

// Auto-complete past events (rate-limited to once per minute)
let lastAutoComplete = 0;
const AUTO_COMPLETE_INTERVAL = 60_000;

function autoCompletePastEvents(db: D1Database) {
  const now = Date.now();
  if (now - lastAutoComplete < AUTO_COMPLETE_INTERVAL) return;
  lastAutoComplete = now;
  keepAlive(dbRun(db, "UPDATE reservations SET status = 'completed' WHERE event_date < date('now') AND status IN ('approved', 'planned')").catch(() => {}));
  // Requests nobody answered before their date expire instead of waiting forever (B121).
  keepAlive(expirePastRequests(db).catch(() => {}));
  // Sweep expired booking holds (reads already filter on expires_at; this is housekeeping).
  keepAlive(dbRun(db, "DELETE FROM reservation_holds WHERE expires_at <= datetime('now')").catch(() => {}));
}

// ── Housekeeping: reap expired sessions, tokens, invites and counters ────────
// adapter-cloudflare only emits a `fetch` handler, so a Cron Trigger (which needs a
// `scheduled` export) isn't available without a second Worker. Instead this runs
// opportunistically off request traffic, at most once an hour per isolate, inside
// waitUntil so it never adds latency to the response. /api/cron/cleanup exists for
// running it explicitly.
const CLEANUP_INTERVAL = 60 * 60 * 1000;
let lastCleanup = 0;

function housekeeping(db: D1Database, ctx: { waitUntil?: (p: Promise<unknown>) => void } | undefined) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  // Event reminders ride on the same hourly tick: there is no Cron Trigger.
  const job = Promise.all([
    runCleanup(db).catch(() => []),
    sendEventReminders(db).catch(() => 0),
  ]);
  if (ctx?.waitUntil) ctx.waitUntil(job);
}

const appHandle: Handle = async ({ event, resolve }) => {
  const db: D1Database = event.platform!.env.DB;
  event.locals.db = db;

  // ── 1. Bubble detection — org subdomain OR custom domain → domainOrg ──
  const host = (event.request.headers.get('host') ?? '').split(':')[0];
  const appDomain = env.HALLIFY_DOMAIN ?? 'hallify.app';

  let domainOrg: App.Locals['domainOrg'] = null;
  // True when the host looks like an org subdomain (<slug>.hallify.sk, non-reserved)
  // but no such org exists — we bounce these to the apex rather than serving the
  // marketing app on an unclaimed subdomain.
  let unmatchedSubdomain = false;
  // The venue exists but is suspended: visitors get an explanation, not a bounce.
  let suspendedVenue: string | null = null;
  try {
    if (host.endsWith(`.${appDomain}`)) {
      // Free bubble: <slug>.hallify.sk — single-level, non-reserved label.
      const sub = host.slice(0, -(appDomain.length + 1));
      if (sub && !sub.includes('.') && !isReservedSubdomain(sub)) {
        const r = await dbFirst<{ id: string; name: string; slug: string; logo_url: string | null; suspended_at: string | null }>(db, 'SELECT id, name, slug, logo_url, suspended_at FROM organizations WHERE slug = ? LIMIT 1', sub);
        if (r?.suspended_at) suspendedVenue = r.name;
        else if (r) domainOrg = { id: r.id, name: r.name, slug: r.slug, logoUrl: r.logo_url };
        else unmatchedSubdomain = true;
      }
    } else if (
      host
      && host !== appDomain
      && !host.startsWith('localhost')
      && host !== '127.0.0.1'
      && !host.endsWith('.hallify.pages.dev')
      && !host.endsWith('.workers.dev')
    ) {
      // Paid bubble: external custom domain. Only resolves while the org's plan
      // includes custom domains — a downgrade quietly stops serving it (the domain
      // config is kept and resumes on re-upgrade).
      const r = await dbFirst<{ org_id: string; name: string; slug: string; logo_url: string | null; plan: string | null; suspended_at: string | null }>(db,
        'SELECT cd.org_id, o.name, o.slug, o.logo_url, o.suspended_at, s.plan FROM custom_domains cd JOIN organizations o ON o.id = cd.org_id LEFT JOIN subscriptions s ON s.org_id = cd.org_id WHERE cd.domain = ? LIMIT 1', host);
      if (r && getPlan((r.plan ?? 'free') as PlanId).limits.customDomains) {
        // A suspended venue's custom domain used to keep serving the site.
        if (r.suspended_at) suspendedVenue = r.name;
        else domainOrg = { id: r.org_id, name: r.name, slug: r.slug, logoUrl: r.logo_url };
      }
    }
  } catch { /* DB unavailable — serve without domain context */ }
  event.locals.domainOrg = domainOrg;

  if (suspendedVenue) {
    return suspendedResponse('venue', suspendedVenue, chosenLocale(event) ?? 'sk', apexOrigin(event.url, appDomain));
  }

  // Unclaimed org subdomain → send to the apex instead of serving the app here.
  if (unmatchedSubdomain) {
    const port = event.url.port ? `:${event.url.port}` : '';
    return new Response(null, { status: 302, headers: { Location: `${event.url.protocol}//${appDomain}${port}/` } });
  }

  // ── 2. Session resolution ──
  // Resolve the session before the bubble guards so an org member of the
  // bubble's org can reach the management app on their own domain.
  const session = await getSessionUser(event.cookies, db, domainOrg?.id ?? null);

  // True when an organization account (owner/admin/member) is signed in on a
  // bubble — getSessionUser has already verified they belong to that org.
  const orgMemberOnBubble = !!domainOrg && !!session && session.account_type !== 'client';

  // ── 3. Domain-level route guards ──
  if (domainOrg) {
    const { pathname } = new URL(event.request.url);
    if (orgMemberOnBubble) {
      // Org member of this org: the public root sends them to their dashboard;
      // the rest of /app/* is theirs to manage from their own domain.
      if (pathname === '/') {
        return new Response(null, { status: 303, headers: { Location: '/app/manage' } });
      }
    } else if (!session && (pathname === '/app/manage' || pathname.startsWith('/app/manage/'))) {
      // A signed-out member opening a console link on their venue's domain (from a
      // notification email, a bookmark) signs in here and comes back to that page.
      return new Response(null, { status: 303, headers: { Location: loginUrl(event.url, '/login') } });
    } else if (pathname === '/' || pathname.startsWith('/app/')) {
      // Clients, anonymous visitors, and non-members stay on the public surface.
      return new Response(null, { status: 303, headers: { Location: '/halls' } });
    }
  }

  const platformBranding = await loadPlatformBranding(db);

  if (!session) {
    event.locals.user = null;
    event.locals.currentOrg = null;
    event.locals.branding = domainOrg
      ? await loadOrgBranding(domainOrg.id, platformBranding, db)
      : platformBranding;
    return resolveWithLocale(event, resolve, domainOrg?.id ?? null, db);
  }

  event.locals.user = {
    id: session.id,
    email: session.email,
    first_name: session.first_name,
    last_name: session.last_name,
    is_platform_admin: session.is_platform_admin,
    account_type: session.account_type,
    org_id: session.org_id,
    email_verified_at: session.email_verified_at ?? null,
  };

  // Operators confirm their email before they run a venue (D11). Behind a switch,
  // REQUIRE_EMAIL_VERIFICATION, while production email is not reliable; platform
  // admins are never locked out of their own console.
  if (
    session.account_type !== 'client'
    && !session.email_verified_at
    && !session.is_platform_admin
    && isGatedPath(event.url.pathname)
    && verificationRequired()
  ) {
    const back = encodeURIComponent(event.url.pathname + event.url.search);
    return new Response(null, { status: 303, headers: { Location: `/verify-email?redirect=${back}` } });
  }

  // Client accounts don't belong to any org — skip org context entirely
  if (session.account_type === 'client') {
    event.locals.currentOrg = null;
    event.locals.branding = domainOrg
      ? await loadOrgBranding(domainOrg.id, platformBranding, db)
      : platformBranding;
    autoCompletePastEvents(db);
    housekeeping(db, event.platform?.context);
    return resolveWithLocale(event, resolve, domainOrg?.id ?? null, db);
  }

  let orgId = session.currentOrgId;

  // On a bubble, an org account is always scoped to that bubble's org (not
  // whatever org their session last had active on the apex).
  if (orgMemberOnBubble) orgId = domainOrg!.id;

  // If session has no org, pick the user's first org and persist it
  if (!orgId) {
    const firstOrg = await dbFirst<{ org_id: string }>(db, 'SELECT org_id FROM organization_members WHERE user_id = ? ORDER BY joined_at LIMIT 1', session.id);
    if (firstOrg) {
      orgId = firstOrg.org_id;
      await switchOrg(session.sessionId, orgId, db);
    }
  }

  if (orgId) {
    event.locals.currentOrg = await loadOrgContext(orgId, session.id, db, !!session.is_platform_admin);

    // Their organisation is suspended. Move them to another organisation of theirs if
    // they have one; otherwise the console explains the suspension instead of
    // falling through to "create an organisation".
    if (!event.locals.currentOrg) {
      const suspended = await dbFirst<{ name: string }>(db,
        `SELECT o.name FROM organizations o JOIN organization_members m ON m.org_id = o.id AND m.user_id = ?
          WHERE o.id = ? AND o.suspended_at IS NOT NULL`, session.id, orgId);
      if (suspended) {
        const other = await dbFirst<{ org_id: string }>(db,
          `SELECT m.org_id FROM organization_members m JOIN organizations o ON o.id = m.org_id
            WHERE m.user_id = ? AND o.suspended_at IS NULL ORDER BY m.joined_at LIMIT 1`, session.id);
        if (other) {
          orgId = other.org_id;
          await switchOrg(session.sessionId, orgId, db);
          event.locals.currentOrg = await loadOrgContext(orgId, session.id, db, !!session.is_platform_admin);
        } else if (isConsolePath(event.url.pathname)) {
          event.locals.locale = chosenLocale(event) ?? 'sk';
          return suspendedResponse('console', suspended.name, event.locals.locale, apexOrigin(event.url, appDomain));
        }
      }
    }
    event.locals.branding = event.locals.currentOrg
      ? await loadOrgBranding(orgId, platformBranding, db)
      : platformBranding;
  } else {
    event.locals.currentOrg = null;
    event.locals.branding = platformBranding;
  }

  // On custom domains, domain org branding always wins
  if (domainOrg) {
    event.locals.branding = await loadOrgBranding(domainOrg.id, platformBranding, db);
  }

  autoCompletePastEvents(db);
  housekeeping(db, event.platform?.context);
  // The organisation's default language is for VISITORS of its site. Staff in the
  // console keep their own choice (cookie) or Slovak: applying the visitor default
  // here switched the whole team's console when an owner set it to English.
  const visitorOrgId = domainOrg && !event.url.pathname.startsWith('/app') ? domainOrg.id : null;
  return resolveWithLocale(event, resolve, visitorOrgId, db);
};

/** Security response headers.
 *
 *  Composed OUTSIDE appHandle via `sequence`, so it also covers appHandle's early
 *  returns (the unclaimed-subdomain redirect and the bubble route guards) — not just
 *  the pages that make it to `resolve`.
 *
 *  CSP itself is configured in svelte.config.js (`kit.csp`), which hashes SvelteKit's
 *  own inline bootstrap for us; hand-rolling it here would break hydration.
 */
/** The only route this app frames itself: the public-site builder's live preview. */
const SELF_EMBEDDABLE = '/app/manage/settings/site/preview';

const securityHeaders: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  // Server-side GTM: the page's own server-container origins (set by the root
  // layout) are allowed for scripts, beacons and pixels, and nothing else is.
  const origins = event.locals.analyticsOrigins ?? [];
  if (origins.length) {
    const policy = response.headers.get('content-security-policy');
    if (policy) response.headers.set('content-security-policy', extendCsp(policy, origins));
  }

  // Clickjacking. frame-ancestors in the CSP is the modern control; X-Frame-Options
  // is kept for older browsers that ignore it.
  //
  // The site builder's preview is the one page we frame ourselves, so a blanket
  // DENY made it refuse to render — in production as well as locally, the browser
  // simply reports that it will not embed the page. It is opened to SAME-ORIGIN
  // only, and only for that exact path: every other route, including the public
  // site it is previewing, stays un-embeddable.
  if (event.url.pathname === SELF_EMBEDDABLE) {
    response.headers.set('X-Frame-Options', 'SAMEORIGIN');
    // svelte.config.js sets `frame-ancestors: none` for the whole app. It has to
    // be relaxed on the response itself; a second CSP header would be intersected
    // with the first, and the stricter value would still win.
    const csp = response.headers.get('content-security-policy');
    if (csp) {
      response.headers.set(
        'content-security-policy',
        csp.replace(/frame-ancestors[^;]*/i, "frame-ancestors 'self'")
      );
    }
  } else {
    response.headers.set('X-Frame-Options', 'DENY');
  }
  // Stop MIME sniffing — matters for the R2-backed /uploads/ path, where the stored
  // content-type is whatever the uploader claimed.
  response.headers.set('X-Content-Type-Options', 'nosniff');
  // Don't leak booking URLs (which contain ids) to third-party sites.
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  const discoveryPage = event.url.pathname === '/' || event.url.pathname === '/priestory';
  response.headers.set('Permissions-Policy', `camera=(), microphone=(), geolocation=${discoveryPage ? '(self)' : '()'}, payment=(), usb=()`);

  // HSTS only over HTTPS; browsers ignore it on http, and setting it in local dev
  // would pin localhost to https for the developer's whole browser profile.
  if (event.url.protocol === 'https:') {
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  return response;
};

/** Canonical scheme and host, and the Origin check on API writes. Runs first, so a
 *  login form on http:// is redirected before anything can be posted to it.
 *
 *  Production had no http→https redirect at all (HSTS only helps after a first
 *  https visit), and www.hallify.sk served a second copy of the site with its own
 *  canonical. Local and preview hosts are never redirected (see isDevHost). */
const edgeRules: Handle = async ({ event, resolve }) => {
  const target = canonicalRedirect(event.url, event.request.headers, env.HALLIFY_DOMAIN ?? 'hallify.app');
  if (target) {
    return new Response(null, { status: redirectStatus(event.request.method), headers: { Location: target } });
  }

  // SvelteKit's CSRF check only covers form submissions; the JSON endpoints under
  // /api relied on CORS preflight alone. Refuse a cross-site write outright.
  if (needsOriginCheck(event.request.method, event.url.pathname) && !originAllowed(event.request.headers, event.url)) {
    return new Response(JSON.stringify({ error: 'Cross-site request refused' }), {
      status: 403,
      headers: { 'content-type': 'application/json' },
    });
  }

  // Everything below runs inside a request scope, so background work (notification
  // emails) is kept alive with waitUntil after the response is sent.
  const ctx = event.platform?.context;
  return runInRequestScope(
    {
      waitUntil: ctx ? (p) => ctx.waitUntil(p) : undefined,
      url: event.url,
      locals: event.locals,
    },
    () => resolve(event),
  );
};

export const handle: Handle = sequence(edgeRules, securityHeaders, appHandle);
