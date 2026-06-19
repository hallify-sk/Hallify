import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { dbFirst, dbRun } from '$lib/db/index';
import { st } from '$lib/i18n-server';
import { env } from '$env/dynamic/private';
import { getPlan } from '$lib/plans';
import type { PlanId } from '$lib/plans';

/** Login URL on the target org's OWN domain — a verified custom domain if the plan allows,
 *  otherwise the free <slug>.<HALLIFY_DOMAIN> subdomain. Returns null on localhost/dev or
 *  when the org can't be resolved, so the caller falls back to a same-host redirect.
 *  Switching org moves a member to that org's bubble; sessions are host-scoped, so they
 *  re-authenticate there (the bubble /login sends org members on to /app/manage). */
async function orgLoginUrl(db: App.Locals['db'], orgId: string, url: URL): Promise<string | null> {
  const host = url.hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) return null;
  const org = await dbFirst<{ slug: string; plan: string | null; domain: string | null }>(db,
    `SELECT o.slug, s.plan,
            (SELECT cd.domain FROM custom_domains cd WHERE cd.org_id = o.id AND cd.verified_at IS NOT NULL LIMIT 1) AS domain
     FROM organizations o LEFT JOIN subscriptions s ON s.org_id = o.id
     WHERE o.id = ? AND o.suspended_at IS NULL`, orgId);
  if (!org) return null;
  const appDomain = env.HALLIFY_DOMAIN ?? 'hallify.app';
  if (org.domain && getPlan((org.plan ?? 'free') as PlanId).limits.customDomains) {
    return `https://${org.domain}/login`;
  }
  return `https://${org.slug}.${appDomain}/login`;
}

export const POST: RequestHandler = async ({ request, locals, cookies, url }) => {
  if (!locals.user) redirect(303, '/app/login');
  // Clients never have org context — reject explicitly (don't rely only on the hooks early-return).
  if (locals.user.account_type === 'client') redirect(303, '/app/client');

  const data = await request.formData();
  const orgId = (data.get('org_id') as string) || '';
  const returnTo = (data.get('return_to') as string) || '/';
  const sessionId = cookies.get('session_id');
  if (!sessionId) redirect(303, '/app/login');

  // Empty org_id = exit/clear (e.g. exit platform-admin impersonation). hooks
  // re-derives the user's own first org on the next request (or none).
  if (!orgId) {
    await dbRun(locals.db, 'UPDATE sessions SET current_org_id = NULL WHERE id = ?', sessionId);
    redirect(303, returnTo);
  }

  // A regular member switching orgs is moved to the target org's own bubble; a platform
  // admin "viewing as" stays on the current host (apex) so impersonation keeps working.
  let crossDomain: string | null = null;
  if (locals.user.is_platform_admin) {
    // Platform admins may "view as" any non-suspended org without membership.
    const org = await dbFirst<{ id: string }>(
      locals.db,
      'SELECT id FROM organizations WHERE id = ? AND suspended_at IS NULL',
      orgId
    );
    if (!org) error(404, st(locals.locale).serverErrors.organizationNotFound);
  } else {
    // Everyone else must be a member of the target org.
    const membership = await dbFirst<{ org_id: string }>(
      locals.db,
      'SELECT org_id FROM organization_members WHERE org_id = ? AND user_id = ?',
      orgId,
      locals.user.id
    );
    if (!membership) error(403, st(locals.locale).serverErrors.notMemberOfOrg);
    crossDomain = await orgLoginUrl(locals.db, orgId, url);
  }

  await dbRun(locals.db, 'UPDATE sessions SET current_org_id = ? WHERE id = ?', orgId, sessionId);
  redirect(303, crossDomain ?? returnTo);
};
