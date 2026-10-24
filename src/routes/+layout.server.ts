import type { LayoutServerLoad } from './$types';
import { dbAll, dbFirst } from '$lib/db/index';
import { env } from '$env/dynamic/private';
import { unreadMessageCount } from '$lib/unread';
import { unreadAnnouncementCount } from '$lib/announcements';
import { loadPlatformAnalytics } from '$lib/server/platform-settings';
import { container, cspOrigins, type AnalyticsContainer } from '$lib/analytics-servers';
import { aiVisibilityFor } from '$lib/server/ai/availability';
import { orgPermissionList } from '$lib/server/nav-access';
import { unreadNotificationCount } from '$lib/server/notification-centre';
import { notificationAreas } from '$lib/notification-centre';
import { orgPublicBaseUrl } from '$lib/orgUrl';
import { MARKETING_THEME_COOKIE, readMarketingTheme } from '$lib/marketing/theme.svelte';

/** The GTM containers on THIS page, in load order.
 *
 *  Hallify's own platform container runs everywhere it is configured, venues'
 *  public sites included: that is how Hallify sees whether it brings a venue
 *  visitors and bookings. On a venue's site the venue's own container loads as well.
 *  Each reports to its own property, so nothing is counted twice. A platform admin
 *  can still keep Hallify's container off venue sites (the includeBubbles switch).
 *  Each container may come from a server container (sGTM) instead of Google. */
async function resolveContainers(locals: App.Locals): Promise<AnalyticsContainer[]> {
  const out: AnalyticsContainer[] = [];
  const platform = await loadPlatformAnalytics(locals.db);
  const platformId = platform.containerId || (/^GTM-[A-Z0-9]+$/i.test(env.GTM_CONTAINER_ID ?? '') ? env.GTM_CONTAINER_ID! : '');
  if (platformId && (!locals.domainOrg || platform.includeBubbles)) {
    const c = container(platformId, platform.serverUrl, 'platform');
    if (c) out.push(c);
  }
  if (locals.domainOrg) {
    try {
      const row = await dbFirst<{ value: string }>(
        locals.db,
        "SELECT value FROM org_settings WHERE org_id = ? AND key = 'gtm'",
        locals.domainOrg.id
      );
      const parsed = row?.value ? (typeof row.value === 'string' ? JSON.parse(row.value) : row.value) : null;
      const c = parsed ? container(String(parsed.containerId ?? ''), parsed.serverUrl, 'venue') : null;
      // The same container entered twice would load once anyway; skip the duplicate.
      if (c && !out.some((o) => o.id === c.id)) out.push(c);
    } catch { /* a malformed row means no venue container */ }
  }
  return out;
}

export const load: LayoutServerLoad = async ({ locals, url, cookies }) => {
  let unreadMessages = 0;
  let unreadAnnouncements = 0;
  let unreadNotifications = 0;
  let notificationCentre = false;
  let orgs: { id: string; name: string; slug: string; role: string }[] = [];
  let allOrgs: { id: string; name: string; slug: string }[] = [];

  // The console sidebar shows each link by the permission its page requires.
  const permissionList = await orgPermissionList(locals);
  // The AI switches, read once for the request (see $lib/ai-visibility). While the
  // assistant is off for this member, `ai.use` leaves the sidebar's list, so the
  // link to it (and a dashboard opened by nothing else) goes with it.
  const ai = await aiVisibilityFor(locals, permissionList);
  const navPermissions = ai.page ? permissionList : permissionList.filter((p) => p !== 'ai.use');

  if (locals.user) {
    const orgId = locals.currentOrg?.id ?? null;
    const isStaff = locals.currentOrg?.role === 'owner' || locals.currentOrg?.role === 'admin';
    // The client inbox and the team channels both open on messages.view (D3).
    const readsMessages = navPermissions.includes('messages.view');
    unreadMessages = await unreadMessageCount(locals.db, locals.user.id, orgId, readsMessages, readsMessages);
    if (isStaff && orgId) {
      unreadAnnouncements = await unreadAnnouncementCount(locals.db, locals.user.id, orgId);
    }

    // The notification centre (D12): the bell, for every member of the organisation.
    if (orgId && locals.user.account_type !== 'client') {
      notificationCentre = true;
      unreadNotifications = await unreadNotificationCount(locals.db, {
        orgId, userId: locals.user.id, areas: notificationAreas(navPermissions),
      });
    }

    orgs = await dbAll<{ id: string; name: string; slug: string; role: string }>(
      locals.db,
      `SELECT o.id, o.name, o.slug, m.role
      FROM organization_members m
      JOIN organizations o ON o.id = m.org_id
      WHERE m.user_id = ?
        AND o.suspended_at IS NULL
      ORDER BY m.joined_at`,
      locals.user.id
    );

    // Platform admins can switch into ANY org ("view as") — expose the full list
    // so the org switcher offers them all, not just their memberships.
    if (locals.user.is_platform_admin) {
      allOrgs = await dbAll<{ id: string; name: string; slug: string }>(
        locals.db,
        `SELECT id, name, slug FROM organizations WHERE suspended_at IS NULL ORDER BY name`
      );
    }
  }

  // Analytics segmentation dimensions. Pseudonymous only — no email, no names, no
  // org name. See the exclusion note in $lib/analytics.
  const analyticsUser = {
    logged_in: !!locals.user,
    user_type: (!locals.user
      ? 'anonymous'
      : locals.user.is_platform_admin
        ? 'platform_admin'
        : locals.user.account_type === 'client'
          ? 'client'
          : 'organization') as 'anonymous' | 'client' | 'organization' | 'platform_admin',
    user_id: locals.user?.id,
    org_id: locals.currentOrg?.id ?? locals.domainOrg?.id,
    org_role: locals.currentOrg?.role,
    plan: locals.currentOrg?.subscription?.plan,
    subscription_status: locals.currentOrg?.subscription?.status,
    surface: (locals.domainOrg ? 'bubble' : 'apex') as 'apex' | 'bubble',
    venue_id: locals.domainOrg?.id,
    locale: locals.locale,
  };

  // "Public site" in the sidebar: on the venue's own host that is its /halls; on the
  // apex it is the venue's own domain (null on localhost, where there is none).
  let venueSiteUrl: string | null = null;
  if (locals.currentOrg && locals.user?.account_type !== 'client') {
    if (locals.domainOrg) venueSiteUrl = '/halls';
    else {
      try {
        const base = await orgPublicBaseUrl(locals.db, locals.currentOrg.id, url);
        venueSiteUrl = base ? `${base}/halls` : null;
      } catch { /* no link rather than a broken page */ }
    }
  }

  const analyticsContainers = await resolveContainers(locals);
  // Read back by the security-header hook, which lets these origins through the CSP.
  locals.analyticsOrigins = cspOrigins(analyticsContainers);

  return {
    analyticsContainers,
    // Where a visit counts as coming from Hallify (see the layout).
    hallifyHost: env.HALLIFY_DOMAIN ?? 'hallify.app',
    analyticsUser,
    user: locals.user,
    branding: locals.branding,
    currentOrg: locals.currentOrg,
    locale: locals.locale,
    onBubble: !!locals.domainOrg,
    // The marketing pages' light/dark choice. Here as well as in each marketing
    // page's load because an error page (a 404 on the public site renders the
    // marketing shell) gets only layout data, and it fell back to dark.
    marketingTheme: readMarketingTheme(cookies.get(MARKETING_THEME_COOKIE)),
    orgs,
    allOrgs,
    unreadMessages,
    unreadAnnouncements,
    unreadNotifications,
    notificationCentre,
    navPermissions,
    venueSiteUrl,
    // The floating AI assistant (bottom right of every console page).
    assistant: ai.widget,
    // Whether the platform offers the assistant at all, and what of it this member sees.
    aiAvailable: ai.available,
    aiVisibility: ai,
  };
};
