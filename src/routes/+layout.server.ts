import type { LayoutServerLoad } from './$types';
import { dbAll } from '$lib/db/index';
import { unreadMessageCount } from '$lib/unread';
import { unreadAnnouncementCount } from '$lib/announcements';

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

  return {
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
