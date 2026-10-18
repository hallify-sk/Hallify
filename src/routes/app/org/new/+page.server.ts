import { redirect, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { dbFirst, dbRun } from '$lib/db/index';
import { isReservedSubdomain } from '$lib/reserved-subdomains';
import { seedBuiltInRoles } from '$lib/server/people';
import { st } from '$lib/i18n-server';

/** Who may reach the org form.
 *
 *  Registration no longer funnels anyone here: an apex account is a plain personal
 *  account, and creating an organisation is a separate, explicit step the same
 *  account takes later. So this route has to stand on its own and re-check every
 *  precondition itself rather than trusting where the visitor came from.
 *
 *  Returns a redirect target, or null when the visitor may proceed. */
function orgFormGuard(locals: App.Locals): string | null {
  if (!locals.user) return '/app/login';
  // Per-org client accounts live inside one org's bubble and own nothing on the
  // apex. They can't authenticate here today, but the check costs nothing and
  // keeps the rule in the route rather than in the login query.
  if (locals.user.account_type === 'client') return '/app/client';
  // Creating organizations is disabled inside an org's bubble (subdomain / custom
  // domain) — you manage only this org here. Create new orgs from the main app (apex).
  if (locals.domainOrg) return '/app/manage';
  return null;
}

export const load: PageServerLoad = ({ locals }) => {
  const away = orgFormGuard(locals);
  if (away) redirect(303, away);
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
    const away = orgFormGuard(locals);
    if (away) redirect(303, away);
    // orgFormGuard has already redirected when there is no user; the helper's
    // string return just doesn't narrow locals.user for the compiler.
    const userId = locals.user!.id;

    const data = await request.formData();
    const name = (data.get('name') as string)?.trim();

    if (!name || name.length < 2) {
      return fail(400, { name, error: st(locals.locale).serverErrors.orgNameMin2 });
    }
    // The input carries maxlength="80"; a posted form need not.
    if (name.length > 80) {
      return fail(400, { name, error: st(locals.locale).serverErrors.orgNameMax80 });
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
      userId,
      'owner'
    );

    // The built-in roles. Migration 0007 seeded these for organisations that
    // already existed; one created here needs them too, or it has no default role
    // — the floor every member holds implicitly, and the one role the Roles tab
    // cannot create for itself. Never fatal: see seedBuiltInRoles.
    await seedBuiltInRoles(locals.db, orgId);

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
