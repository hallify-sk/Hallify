import { dbFirst } from '$lib/db/index';
import type { D1Database } from '@cloudflare/workers-types';
import { env } from '$env/dynamic/private';
import { getPlan } from '$lib/plans';
import type { PlanId } from '$lib/plans';

/** Public base origin for an organization's OWN bubble — its custom domain if the
 *  plan allows, otherwise the free `<slug>.<HALLIFY_DOMAIN>` subdomain. No trailing
 *  slash. Returns null on localhost/dev or when the org can't be resolved, so callers
 *  fall back to the current request origin.
 *
 *  The custom domain is chosen when it has a Cloudflare hostname provisioned
 *  (`cf_hostname_id` set) — preferring a fully-verified one — because that's what
 *  hooks.server.ts actually serves the bubble on. (hooks doesn't gate on
 *  `verified_at`, so requiring it here used to drop a live-but-not-yet-"refreshed"
 *  domain back to the subdomain.) A domain that was only typed in but never
 *  provisioned won't route, so it's excluded and we fall back to the subdomain. */
export async function orgPublicBaseUrl(db: D1Database, orgId: string, url: URL): Promise<string | null> {
	const host = url.hostname;
	if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) return null;
	const org = await dbFirst<{ slug: string; plan: string | null; domain: string | null }>(db,
		`SELECT o.slug, s.plan,
		        (SELECT cd.domain FROM custom_domains cd
		         WHERE cd.org_id = o.id AND cd.cf_hostname_id IS NOT NULL
		         ORDER BY (cd.verified_at IS NOT NULL) DESC, cd.created_at DESC
		         LIMIT 1) AS domain
		 FROM organizations o LEFT JOIN subscriptions s ON s.org_id = o.id
		 WHERE o.id = ? AND o.suspended_at IS NULL`, orgId);
	if (!org) return null;
	const appDomain = env.HALLIFY_DOMAIN ?? 'hallify.app';
	if (org.domain && getPlan((org.plan ?? 'free') as PlanId).limits.customDomains) {
		return `https://${org.domain}`;
	}
	return `https://${org.slug}.${appDomain}`;
}
