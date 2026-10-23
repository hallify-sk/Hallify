// Extras a client may order, under the venue's current plan.
//
// The plan's extras limit was checked only when an extra was created, so after a
// downgrade (5 extras on Free, which allows 3) clients still saw and ordered all five.
// The policy: the oldest extras up to the limit stay bookable; the rest are kept for
// the venue (and return on an upgrade) but are not offered to clients.

import { dbAll, dbFirst } from '$lib/db/index';
import type { HallExtraRow } from '$lib/db/index';
import { getPlan, type PlanId } from '$lib/plans';
import type { D1Database } from '@cloudflare/workers-types';

/** The first `limit` extras in creation order; all of them when the limit is -1. */
export function withinExtrasLimit<T>(extras: T[], limit: number): T[] {
	return limit < 0 ? extras : extras.slice(0, Math.max(0, limit));
}

/**
 * The hall's extras a client can choose, oldest first. `keepIds` stay listed even
 * above the limit: a client who already ordered one does not see it vanish.
 */
export async function loadBookableExtras(
	db: D1Database,
	hallId: string,
	orgId: string,
	keepIds: string[] = []
): Promise<HallExtraRow[]> {
	const [extras, sub] = await Promise.all([
		dbAll<HallExtraRow>(db, 'SELECT * FROM hall_extras WHERE hall_id = ? ORDER BY created_at, id', hallId),
		dbFirst<{ plan: string | null }>(db, 'SELECT plan FROM subscriptions WHERE org_id = ?', orgId)
	]);
	const limit = getPlan((sub?.plan ?? 'free') as PlanId).limits.maxExtrasPerHall;
	const allowed = new Set(withinExtrasLimit(extras, limit).map((e) => e.id));
	return extras.filter((e) => allowed.has(e.id) || keepIds.includes(e.id));
}
