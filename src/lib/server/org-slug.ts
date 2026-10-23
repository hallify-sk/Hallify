// The slug of a new organisation, which is also its free subdomain (<slug>.hallify.sk).

import { dbFirst } from '$lib/db/index';
import { isReservedSubdomain } from '$lib/reserved-subdomains';
import { slugify } from '$lib/slug';
import type { D1Database } from '@cloudflare/workers-types';

/**
 * A slug no live organisation holds and no closed one ever held.
 *
 * Closed organisations are checked because their subdomain is out in the world: on
 * clients' booking confirmations, in calendars, on printed invitations. Handing it to a
 * new business the moment the old one closed sent those clients to a stranger.
 * closed_organizations is kept forever, so a closed venue's slug is never reused.
 */
export async function uniqueOrgSlug(db: D1Database, name: string): Promise<string> {
	// 48 leaves room for a "-NN" suffix inside a 63-character DNS label.
	const base = slugify(name, 48) || 'org';
	for (let attempt = 1; ; attempt++) {
		const slug = attempt === 1 ? base : `${base}-${attempt}`;
		if (isReservedSubdomain(slug)) continue;
		const taken = await dbFirst<{ hit: number }>(
			db,
			`SELECT 1 AS hit WHERE EXISTS (SELECT 1 FROM organizations WHERE slug = ?)
			                  OR EXISTS (SELECT 1 FROM closed_organizations WHERE slug = ?)`,
			slug,
			slug
		);
		if (!taken) return slug;
	}
}
