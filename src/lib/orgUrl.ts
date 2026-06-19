import { dbFirst } from '$lib/db/index';
import type { D1Database } from '@cloudflare/workers-types';
import { env } from '$env/dynamic/private';
import { getPlan } from '$lib/plans';
import type { PlanId } from '$lib/plans';

/** Public base origin for an organization's OWN bubble — a verified custom domain
 *  if the plan allows, otherwise the free `<slug>.<HALLIFY_DOMAIN>` subdomain. No
 *  trailing slash. Returns null on localhost/dev or when the org can't be resolved,
 *  so callers fall back to the current request origin. Mirrors the bubble-resolution
 *  rules in hooks.server.ts so links land where the client actually signs in. */
export async function orgPublicBaseUrl(db: D1Database, orgId: string, url: URL): Promise<string | null> {
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
		return `https://${org.domain}`;
	}
	return `https://${org.slug}.${appDomain}`;
}
