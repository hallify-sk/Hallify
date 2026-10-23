// The public URL (/halls/<slug>) of a venue created by the first-run wizard.

import { dbFirst } from '$lib/db/index';
import { slugify } from '$lib/slug';
import type { D1Database } from '@cloudflare/workers-types';

/** Paths under /halls on a venue site that a hall slug must not shadow. */
const RESERVED_HALL_SLUGS = new Set(['messages', 'my-reservations', 'book', 'new']);

/**
 * A hall slug no other hall uses, derived from the name.
 *
 * The wizard used to create its hall with no slug, and the venue site lists only halls
 * that have one, so a brand-new venue's public site was an empty page until the owner
 * found and saved the hall profile. halls.slug is unique across every organisation
 * (it is the URL), hence the global check.
 */
export async function uniqueHallSlug(db: D1Database, name: string): Promise<string> {
	const base = slugify(name, 60) || 'sala';
	for (let attempt = 1; ; attempt++) {
		const slug = attempt === 1 ? base : `${base}-${attempt}`;
		if (RESERVED_HALL_SLUGS.has(slug)) continue;
		const taken = await dbFirst<{ id: string }>(db, 'SELECT id FROM halls WHERE slug = ? LIMIT 1', slug);
		if (!taken) return slug;
	}
}
