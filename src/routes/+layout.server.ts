import type { LayoutServerLoad } from './$types';
import { dbAll, dbFirst } from '$lib/db/index';
import { env } from '$env/dynamic/private';
import { unreadMessageCount } from '$lib/unread';
import { unreadAnnouncementCount } from '$lib/announcements';

/** Which GTM container applies to THIS surface.
 *
 *  On an org bubble the visitors belong to that venue, and the DPA makes the venue the
 *  controller for their data — so only the venue's own container may run there, never
 *  Hallify's. On the apex it is Hallify's own container. The two are never mixed, and
 *  either may be absent (analytics is entirely opt-in). */
async function resolveGtmId(locals: App.Locals): Promise<string | null> {
  if (locals.domainOrg) {
    try {
      const row = await dbFirst<{ value: string }>(
        locals.db,
        "SELECT value FROM org_settings WHERE org_id = ? AND key = 'gtm'",
        locals.domainOrg.id
      );
      if (!row?.value) return null;
      const parsed = typeof row.value === 'string' ? JSON.parse(row.value) : row.value;
      const id = (parsed as { containerId?: unknown })?.containerId;
      return typeof id === 'string' && /^GTM-[A-Z0-9]+$/i.test(id) ? id : null;
    } catch {
      return null;
    }
  }
  const id = env.GTM_CONTAINER_ID ?? '';
  return /^GTM-[A-Z0-9]+$/i.test(id) ? id : null;
}

export const load: LayoutServerLoad = async ({ locals }) => {
  let unreadMessages = 0;
  let unreadAnnouncements = 0;
  let orgs: { id: string; name: string; slug: string; role: string }[] = [];
  let allOrgs: { id: string; name: string; slug: string }[] = [];

  if (locals.user) {
    const orgId = locals.currentOrg?.id ?? null;
    const isStaff = locals.currentOrg?.role === 'owner' || locals.currentOrg?.role === 'admin';
    unreadMessages = await unreadMessageCount(locals.db, locals.user.id, orgId, isStaff);
    if (isStaff && orgId) {
      unreadAnnouncements = await unreadAnnouncementCount(locals.db, locals.user.id, orgId);
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
    locale: locals.locale,
  };

  return {
    gtmId: await resolveGtmId(locals),
    analyticsUser,
    user: locals.user,
    branding: locals.branding,
    currentOrg: locals.currentOrg,
    locale: locals.locale,
    onBubble: !!locals.domainOrg,
    orgs,
    allOrgs,
    unreadMessages,
    unreadAnnouncements,
  };
};
