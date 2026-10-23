import { dbAll, dbFirst } from '$lib/db/index';
import { slugify } from '$lib/slug';

/**
 * A hall's public URL (/halls/<slug> on the venue site) and its default name.
 *
 * Every hall gets a slug the moment it is created: the venue site lists only halls
 * that have one, so a hall created without it left a new venue's site blank until
 * somebody happened to save the profile (B11).
 */

type Db = App.Locals['db'];

/** Longest slug we hand out; long enough for any real hall name. */
export const MAX_HALL_SLUG = 60;

/** Paths under /halls/ on the venue site (and words reserved for later), which a
 *  hall must never shadow: a hall called "messages" made itself unreachable. */
export const RESERVED_HALL_SLUGS: ReadonlySet<string> = new Set([
	'messages', 'my-reservations', 'book', 'new', 'edit', 'search', 'map', 'login', 'logout',
	'register', 'account', 'profile', 'settings', 'admin', 'api', 'app', 'manage', 'uploads',
	'static', 'assets', 'favicon', 'robots', 'sitemap', 'index', 'halls', 'hall'
]);

export function hallSlug(raw: unknown): string {
	return slugify(String(raw ?? ''), MAX_HALL_SLUG);
}

export function isReservedHallSlug(slug: string): boolean {
	return RESERVED_HALL_SLUGS.has(slug);
}

/** Whether another hall already uses this slug (slugs are unique across Hallify). */
export async function hallSlugTaken(db: Db, slug: string, exceptHallId?: string | null): Promise<boolean> {
	return !!(await dbFirst<{ id: string }>(db,
		'SELECT id FROM halls WHERE slug = ? AND id != ? LIMIT 1', slug, exceptHallId ?? ''));
}

/**
 * A free slug derived from `base`: the base itself, else base-2, base-3, … A reserved
 * or empty base falls back to "sala" (or "hall" in English). Never returns null for
 * a usable base; the numbered tail keeps it within MAX_HALL_SLUG.
 */
export async function uniqueHallSlug(db: Db, base: string, exceptHallId?: string | null, fallback = 'sala'): Promise<string> {
	let root = hallSlug(base);
	if (!root || isReservedHallSlug(root)) root = root ? `${root}-${fallback}` : fallback;
	// One query for the whole family instead of one per candidate.
	const rows = await dbAll<{ slug: string }>(db,
		"SELECT slug FROM halls WHERE (slug = ? OR slug LIKE ? ESCAPE '\\') AND id != ?",
		root, `${root.replace(/[\\%_]/g, (c) => `\\${c}`)}-%`, exceptHallId ?? '');
	const taken = new Set(rows.map((r) => r.slug));
	if (!taken.has(root)) return root;
	for (let n = 2; n < 10_000; n++) {
		const tail = `-${n}`;
		const candidate = `${root.slice(0, MAX_HALL_SLUG - tail.length).replace(/-+$/, '')}${tail}`;
		if (!taken.has(candidate)) return candidate;
	}
	return `${root.slice(0, MAX_HALL_SLUG - 9)}-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * The name for a hall created without one: "Nová sála", then "Nová sála 2", "Nová
 * sála 3"… within the organisation, so three new halls are not three identical
 * cards (I14).
 */
export async function nextUntitledHallName(db: Db, orgId: string, base: string): Promise<string> {
	const rows = await dbAll<{ name: string }>(db,
		'SELECT name FROM halls WHERE org_id = ? AND (name = ? OR name LIKE ?)', orgId, base, `${base} %`);
	const names = new Set(rows.map((r) => r.name));
	if (!names.has(base)) return base;
	for (let n = 2; n < 10_000; n++) if (!names.has(`${base} ${n}`)) return `${base} ${n}`;
	return base;
}
