import { getSessionUser, switchOrg } from '$lib/auth';
import { getBrandingCacheTime, setBrandingCacheTime, BRANDING_CACHE_TTL } from '$lib/branding-cache';
import sql from '$lib/db';
import { env } from '$env/dynamic/private';
import type { Handle } from '@sveltejs/kit';
import type { Branding, OrgContext } from './app.d';

const DEFAULT_BRANDING: Branding = {
  appName: 'Hallify',
  logoUrl: '/Hallify.svg',
  primaryColor: '#3b82f6',
  accentColor: '#e91e8a',
};

// Platform-level branding cache (30s TTL) — cache time managed in $lib/branding-cache
let cachedPlatformBranding: Branding = { ...DEFAULT_BRANDING };

async function loadPlatformBranding(): Promise<Branding> {
  const now = Date.now();
  if (now - getBrandingCacheTime() < BRANDING_CACHE_TTL) return cachedPlatformBranding;
  try {
    const [row] = await sql<{ value: Partial<Branding> }[]>`
      SELECT value FROM system_settings WHERE key = 'branding'
    `;
    cachedPlatformBranding = { ...DEFAULT_BRANDING, ...row?.value };
    setBrandingCacheTime(now);
  } catch {
    // keep cached on error
  }
  return cachedPlatformBranding;
}

/** Load org context (org info + user's role + subscription) for a given org + user. */
async function loadOrgContext(orgId: string, userId: string): Promise<OrgContext | null> {
  const rows = await sql<{
    org_id: string; org_name: string; org_slug: string; org_logo_url: string | null;
    member_role: string;
    sub_plan: string; sub_status: string; stripe_customer_id: string | null; current_period_end: Date | null;
  }[]>`
    SELECT
      o.id        AS org_id,
      o.name      AS org_name,
      o.slug      AS org_slug,
      o.logo_url  AS org_logo_url,
      m.role      AS member_role,
      s.plan      AS sub_plan,
      s.status    AS sub_status,
      s.stripe_customer_id,
      s.current_period_end
    FROM organizations o
    JOIN organization_members m ON m.org_id = o.id AND m.user_id = ${userId}
    LEFT JOIN subscriptions s   ON s.org_id = o.id
    WHERE o.id = ${orgId}
      AND o.suspended_at IS NULL
  `;

  const r = rows[0];
  if (!r) return null;

  return {
    id:      r.org_id,
    name:    r.org_name,
    slug:    r.org_slug,
    logoUrl: r.org_logo_url,
    role:    r.member_role as OrgContext['role'],
    subscription: {
      plan:              (r.sub_plan ?? 'free') as OrgContext['subscription']['plan'],
      status:            (r.sub_status ?? 'active') as OrgContext['subscription']['status'],
      stripeCustomerId:  r.stripe_customer_id,
      currentPeriodEnd:  r.current_period_end,
    },
  };
}

/** Load org-specific branding, falling back to platform branding. */
async function loadOrgBranding(orgId: string, fallback: Branding): Promise<Branding> {
  try {
    const [row] = await sql<{ value: Partial<Branding> }[]>`
      SELECT value FROM org_settings WHERE org_id = ${orgId} AND key = 'branding'
    `;
    if (row?.value) return { ...fallback, ...row.value };
  } catch {
    // fall through
  }
  return fallback;
}

// Auto-complete past events (rate-limited to once per minute)
let lastAutoComplete = 0;
const AUTO_COMPLETE_INTERVAL = 60_000;

function autoCompletePastEvents() {
  const now = Date.now();
  if (now - lastAutoComplete < AUTO_COMPLETE_INTERVAL) return;
  lastAutoComplete = now;
  sql`
    UPDATE reservations SET status = 'completed'
    WHERE event_date < CURRENT_DATE
      AND status IN ('approved', 'planned')
  `.catch(() => {});
}

export const handle: Handle = async ({ event, resolve }) => {
  // ── 1. Custom domain detection ──
  const host = (event.request.headers.get('host') ?? '').split(':')[0];
  const appDomain = env.HALLIFY_DOMAIN ?? 'hallify.app';
  const isCustomDomain = host
    && host !== appDomain
    && !host.startsWith('localhost')
    && host !== '127.0.0.1'
    && !host.endsWith('.hallify.app');

  let domainOrg: App.Locals['domainOrg'] = null;
  if (isCustomDomain) {
    try {
      const [r] = await sql<{ org_id: string; name: string; slug: string; logo_url: string | null }[]>`
        SELECT cd.org_id, o.name, o.slug, o.logo_url
        FROM custom_domains cd
        JOIN organizations o ON o.id = cd.org_id
        WHERE cd.domain = ${host}
        LIMIT 1
      `;
      if (r) domainOrg = { id: r.org_id, name: r.name, slug: r.slug, logoUrl: r.logo_url };
    } catch { /* DB unavailable — serve without domain context */ }
  }
  event.locals.domainOrg = domainOrg;

  // ── 2. Domain-level route guards ──
  if (domainOrg) {
    const { pathname } = new URL(event.request.url);
    if (pathname === '/' || pathname.startsWith('/app/')) {
      return new Response(null, { status: 303, headers: { Location: '/halls' } });
    }
  }

  // ── 3. Session + user/org context ──
  const session = await getSessionUser(event.cookies);
  const platformBranding = await loadPlatformBranding();

  if (!session) {
    event.locals.user = null;
    event.locals.currentOrg = null;
    event.locals.branding = domainOrg
      ? await loadOrgBranding(domainOrg.id, platformBranding)
      : platformBranding;
    return resolve(event);
  }

  event.locals.user = {
    id: session.id,
    email: session.email,
    first_name: session.first_name,
    last_name: session.last_name,
    is_platform_admin: session.is_platform_admin,
    account_type: session.account_type,
  };

  // Client accounts don't belong to any org — skip org context entirely
  if (session.account_type === 'client') {
    event.locals.currentOrg = null;
    event.locals.branding = domainOrg
      ? await loadOrgBranding(domainOrg.id, platformBranding)
      : platformBranding;
    autoCompletePastEvents();
    return resolve(event);
  }

  let orgId = session.currentOrgId;

  // If session has no org, pick the user's first org and persist it
  if (!orgId) {
    const [firstOrg] = await sql<{ org_id: string }[]>`
      SELECT org_id FROM organization_members WHERE user_id = ${session.id} ORDER BY joined_at LIMIT 1
    `;
    if (firstOrg) {
      orgId = firstOrg.org_id;
      await switchOrg(session.sessionId, orgId);
    }
  }

  if (orgId) {
    event.locals.currentOrg = await loadOrgContext(orgId, session.id);
    event.locals.branding = event.locals.currentOrg
      ? await loadOrgBranding(orgId, platformBranding)
      : platformBranding;
  } else {
    event.locals.currentOrg = null;
    event.locals.branding = platformBranding;
  }

  // On custom domains, domain org branding always wins
  if (domainOrg) {
    event.locals.branding = await loadOrgBranding(domainOrg.id, platformBranding);
  }

  autoCompletePastEvents();
  return resolve(event);
};
