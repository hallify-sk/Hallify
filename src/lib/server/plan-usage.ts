// Where an organisation stands against its plan's limits, for the billing page.

import { dbFirst } from '$lib/db/index';
import { activeHallCount, memberCount, monthKey } from '$lib/limits';

type Db = App.Locals['db'];

export interface PlanUsage {
	activeHalls: number;
	lockedHalls: number;
	members: number;
	/** Bookings this calendar month in the busiest venue (the cap is per venue). */
	reservationsMax: number;
	/** Gallery photos in the venue with the most (the cap is per venue). */
	galleryMax: number;
	/** Bookable extras in the venue with the most (the cap is per venue). */
	extrasMax: number;
}

const n = async (db: Db, sql: string, ...params: unknown[]) =>
	(await dbFirst<{ n: number | null }>(db, sql, ...params).catch(() => null))?.n ?? 0;

export async function planUsage(db: Db, orgId: string, now = new Date()): Promise<PlanUsage> {
	const month = monthKey(now.toISOString());
	const [activeHalls, lockedHalls, members, reservationsMax, galleryMax, extrasMax] = await Promise.all([
		activeHallCount(db, orgId),
		n(db, 'SELECT COUNT(*) AS n FROM halls WHERE org_id = ? AND plan_locked = 1 AND archived_at IS NULL', orgId),
		memberCount(db, orgId),
		n(db,
			`SELECT MAX(c) AS n FROM (
			   SELECT COUNT(*) AS c FROM reservations r JOIN halls h ON h.id = r.hall_id
			    WHERE h.org_id = ? AND h.archived_at IS NULL AND r.status != 'cancelled'
			      AND substr(r.event_date, 1, 7) = ?
			    GROUP BY r.hall_id)`, orgId, month),
		n(db,
			`SELECT MAX(CASE WHEN json_valid(gallery_images) THEN json_array_length(gallery_images) ELSE 0 END) AS n
			   FROM halls WHERE org_id = ? AND archived_at IS NULL`, orgId),
		n(db,
			`SELECT MAX(c) AS n FROM (
			   SELECT COUNT(*) AS c FROM hall_extras e JOIN halls h ON h.id = e.hall_id
			    WHERE h.org_id = ? AND h.archived_at IS NULL
			    GROUP BY e.hall_id)`, orgId),
	]);
	return { activeHalls, lockedHalls, members, reservationsMax, galleryMax, extrasMax };
}
