import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { dbFirst, dbRun } from '$lib/db/index';
import { isReservedSubdomain } from '$lib/reserved-subdomains';
import { st } from '$lib/i18n-server';

export const load: PageServerLoad = ({ locals }) => {
  if (!locals.user) redirect(303, '/app/login');
  // Creating organizations is disabled inside an org's bubble (subdomain / custom
  // domain) — you manage only this org here. Create new orgs from the main app (apex).
  if (locals.domainOrg) redirect(303, '/app/manage');
  return {};
};

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export const actions: Actions = {
  default: async ({ request, locals, cookies }) => {
    if (!locals.user) redirect(303, '/app/login');
    if (locals.domainOrg) redirect(303, '/app/manage');

    const data = await request.formData();
    const name = (data.get('name') as string)?.trim();

    if (!name || name.length < 2) {
      return fail(400, { name, error: st(locals.locale).serverErrors.orgNameMin2 });
    }

    // Derive a unique slug. The slug doubles as the org's free subdomain
    // (<slug>.hallify.sk), so it must avoid reserved labels and collisions.
    const baseSlug = toSlug(name) || 'org';
    let slug = baseSlug;
    let attempt = 1;
    while (true) {
      const exists = await dbFirst<{ id: string }>(
        locals.db,
        'SELECT id FROM organizations WHERE slug = ?',
        slug
      );
      if (!exists && !isReservedSubdomain(slug)) break;
      slug = `${baseSlug}-${++attempt}`;
    }

    const orgId = crypto.randomUUID();

    await dbRun(
      locals.db,
      'INSERT INTO organizations (id, name, slug) VALUES (?, ?, ?)',
      orgId,
      name,
      slug
    );

    // Owner membership
    await dbRun(
      locals.db,
      'INSERT INTO organization_members (id, org_id, user_id, role) VALUES (?, ?, ?, ?)',
      crypto.randomUUID(),
      orgId,
      locals.user.id,
      'owner'
    );

    // Free subscription
    await dbRun(
      locals.db,
      'INSERT INTO subscriptions (id, org_id, plan, status) VALUES (?, ?, ?, ?)',
      crypto.randomUUID(),
      orgId,
      'free',
      'active'
    );

    // Switch session to new org
    const sessionId = cookies.get('session_id');
    if (sessionId) {
      await dbRun(
        locals.db,
        'UPDATE sessions SET current_org_id = ? WHERE id = ?',
        orgId,
        sessionId
      );
    }

    redirect(303, '/app/');
  },
};
