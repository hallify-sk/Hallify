// Single source of truth for reservation availability: whole-day model,
// past-date / min-advance / capacity / blocked / taken / held rules, and the
// hold (soft-lock) lifecycle. Reused by the org wizard, both client booking
// forms, and the /api/holds endpoint.
import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import { getPlan } from '$lib/plans';
import type { PlanId } from '$lib/plans';
import { st } from '$lib/i18n-server';
import { rateLimit, type RateLimitRule } from '$lib/rateLimit';
import { closedWeekdays } from '$lib/site/opening-hours';
import { localeTag } from '$lib/format';
import type { D1Database } from '@cloudflare/workers-types';

export const HOLD_MINUTES = 15;

/**
 * Limits on a CLIENT's holds (staff holds in their own org are not capped).
 *
 * Without them one client account could hold every date of a venue, and keep
 * holding them: there was no cap, and every renewal pushed the expiry another
 * fifteen minutes out, forever.
 *
 *   HOLD_MAX_ACTIVE         dates one client may hold at once, across all halls.
 *   HOLD_MAX_LIFETIME_MIN   a hold ends this long after it was taken, however often
 *                           it is renewed. Plenty for filling in the booking form.
 *   HOLD_FRESH_LIMIT        fresh holds on one hall+date per client per window, so
 *                           the end of a hold cannot simply be followed by a new one.
 */
export const HOLD_MAX_ACTIVE = 3;
export const HOLD_MAX_LIFETIME_MIN = 30;
export const HOLD_FRESH_LIMIT = { limit: 3, windowSeconds: 3 * 60 * 60 } as const;

// ── Date helpers (timezone-safe, string-keyed YYYY-MM-DD) ──
export function isoLocal(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function parseISO(s: string): Date { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(d.getDate() + n); return r; }
export function todayISO(): string { return isoLocal(new Date()); }

/** A real calendar day in YYYY-MM-DD. The shape alone let '2026-13-99' through, which
 *  `new Date` quietly rolls over into a different, valid-looking date. */
export function isRealDateISO(s: string): boolean {
	if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
	return isoLocal(parseISO(s)) === s;
}

/** Earliest date a hall can be booked = today + min_days_advance. */
export function earliestBookableISO(minDaysAdvance: number | null | undefined): string {
	return isoLocal(addDays(new Date(), Math.max(0, minDaysAdvance ?? 0)));
}

// ── Blocking rules (hall_blocks) ──
export interface BlockRow {
	block_type: string;
	date_from: string | null;
	date_to: string | null;
	days_of_week: number[]; // JS getDay() values (0 = Sun)
}

/** opening_hours keys as written by the hall editor, indexed by JS getDay(). */
export const DOW_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export function isDateBlocked(blocks: BlockRow[], dateISO: string): boolean {
	const jsDow = parseISO(dateISO).getDay();
	return blocks.some(b => {
		if (b.block_type === 'weekly') return b.days_of_week.includes(jsDow);
		if (b.block_type !== 'date_range' || !b.date_from || !b.date_to) return false;
		const inRange = dateISO >= b.date_from.slice(0, 10) && dateISO <= b.date_to.slice(0, 10);
		if (!inRange) return false;
		// The block wizard lets you pick WHICH days inside the range to close (e.g.
		// "weekends in June"). That selection used to be ignored here, so a date_range
		// always closed every day in the range. An empty/absent selection still means
		// "every day", which is what the old behaviour effectively did.
		return b.days_of_week.length === 0 || b.days_of_week.includes(jsDow);
	});
}

/** Expand blocking rules into a set of blocked ISO dates over [fromISO, toISO]. */
export function expandBlocks(blocks: BlockRow[], fromISO: string, toISO: string): Set<string> {
	const out = new Set<string>();
	const end = parseISO(toISO);
	for (let d = parseISO(fromISO); d <= end; d = addDays(d, 1)) {
		const key = isoLocal(d);
		if (isDateBlocked(blocks, key)) out.add(key);
	}
	return out;
}

/** Every date in [fromISO, toISO] that falls on one of `weekdays` (JS getDay()). */
export function expandWeekdays(weekdays: number[], fromISO: string, toISO: string): string[] {
	if (!weekdays.length) return [];
	const out: string[] = [];
	const end = parseISO(toISO);
	for (let d = parseISO(fromISO); d <= end; d = addDays(d, 1)) {
		if (weekdays.includes(d.getDay())) out.push(isoLocal(d));
	}
	return out;
}

/**
 * Dates in [fromISO, toISO] that cannot be booked whatever else happens: closed by a
 * hall block, or a weekday the venue marks closed in its opening hours.
 *
 * The booking calendars used to work this out in the browser from the blocks alone,
 * so a closed Sunday looked free, could be held, and failed only on submit.
 */
export function unavailableDates(
	blocks: BlockRow[],
	openingHours: unknown,
	fromISO: string,
	toISO: string
): string[] {
	const out = expandBlocks(blocks, fromISO, toISO);
	for (const d of expandWeekdays(closedWeekdays(openingHours), fromISO, toISO)) out.add(d);
	return [...out].sort();
}

/** Same as unavailableDates, read from the database. */
export async function getUnavailableDates(
	db: D1Database,
	hall: { id: string; opening_hours?: unknown },
	fromISO: string,
	toISO: string
): Promise<string[]> {
	const rows = await dbAll<BlockRow>(db,
		'SELECT block_type, date_from, date_to, days_of_week FROM hall_blocks WHERE hall_id = ?', hall.id);
	const blocks = rows.map(b => ({ ...b, days_of_week: parseDow(b.days_of_week as unknown) }));
	return unavailableDates(blocks, hall.opening_hours ?? null, fromISO, toISO);
}

/** The plan's per-hall monthly reservation cap for an org; -1 = unlimited. */
async function monthlyCap(db: D1Database, orgId: string): Promise<number> {
	const sub = await dbFirst<{ plan: string | null }>(db, 'SELECT plan FROM subscriptions WHERE org_id = ?', orgId);
	return getPlan((sub?.plan ?? 'free') as PlanId).limits.maxReservationsPerHallMonth;
}

/**
 * Months ('YYYY-MM') in [fromISO, toISO] where the hall has reached its plan's monthly
 * cap, so the calendar can show them as full instead of letting a client hold a date
 * and be refused on submit. `excludeReservationId` is left out of the count (a client
 * moving their own booking).
 */
export async function getFullMonths(
	db: D1Database,
	hall: { id: string; org_id: string },
	fromISO: string,
	toISO: string,
	excludeReservationId: string | null = null
): Promise<string[]> {
	const limit = await monthlyCap(db, hall.org_id);
	if (limit === -1) return [];
	const rows = await dbAll<{ m: string; n: number }>(db,
		`SELECT substr(event_date, 1, 7) AS m, COUNT(*) AS n FROM reservations
		 WHERE hall_id = ? AND status != 'cancelled' AND id IS NOT ?
		   AND substr(event_date, 1, 10) >= ? AND substr(event_date, 1, 10) <= ?
		 GROUP BY m HAVING n >= ?`,
		hall.id, excludeReservationId, fromISO.slice(0, 7) + '-01', toISO, limit);
	return rows.map(r => r.m).sort();
}

/** 'november 2026' / 'November 2026' for a 'YYYY-MM' key. */
export function monthName(month: string, locale: 'sk' | 'en'): string {
	const [y, m] = month.split('-').map(Number);
	if (!y || !m) return month;
	return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString(localeTag(locale), { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// ── Taken / held lookups ──
/** Dates with a non-cancelled reservation in [fromISO, toISO] — the canonical "taken" rule. */
export async function getTakenDates(db: D1Database, hallId: string, fromISO: string, toISO: string): Promise<string[]> {
	const rows = await dbAll<{ event_date: string }>(db,
		`SELECT DISTINCT substr(event_date, 1, 10) AS event_date FROM reservations
		 WHERE hall_id = ? AND status != 'cancelled'
		   AND substr(event_date, 1, 10) >= ? AND substr(event_date, 1, 10) <= ?`,
		hallId, fromISO, toISO);
	return rows.map(r => r.event_date);
}

/** Active holds owned by someone other than `userId`. */
export async function getHeldDatesByOthers(db: D1Database, hallId: string, userId: string): Promise<string[]> {
	const rows = await dbAll<{ event_date: string }>(db,
		`SELECT event_date FROM reservation_holds
		 WHERE hall_id = ? AND user_id != ? AND expires_at > datetime('now')`,
		hallId, userId);
	return rows.map(r => r.event_date);
}

// ── Hold lifecycle ──
export interface AcquireResult {
	ok: boolean;
	/** taken: booked · held: someone else holds it · invalid: not a real date ·
	 *  limit: too many holds at once · expired: the hold reached its lifetime ·
	 *  too-often: this person has held this date too often lately. */
	reason?: 'taken' | 'held' | 'invalid' | 'limit' | 'expired' | 'too-often';
	ttl?: number;
}

/** Acquire a fresh hold or renew the caller's own. Rejects if the day is taken
 *  or actively held by another user. Hold expiry is computed in SQL so it
 *  string-compares correctly against datetime('now').
 *
 *  `maxActive` and `maxLifetimeMinutes` are the client limits (see HOLD_MAX_*);
 *  leave them out for staff. A renewal never pushes the expiry past the lifetime,
 *  and a hold that has reached it is dropped, so it cannot be renewed forever.
 *  Availability (past dates, blocks, closed days) is the caller's to check with
 *  `assertCanBook` first: it needs the hall row and the viewer's locale. */
export async function acquireOrRenewHold(
	db: D1Database,
	opts: {
		hallId: string;
		eventDate: string;
		userId: string;
		orgId?: string | null;
		minutes?: number;
		maxActive?: number | null;
		maxLifetimeMinutes?: number | null;
		/** Fresh holds allowed on this hall+date per user per window. */
		freshLimit?: RateLimitRule | null;
	}
): Promise<AcquireResult> {
	const {
		hallId, eventDate, userId, orgId = null, minutes = HOLD_MINUTES,
		maxActive = null, maxLifetimeMinutes = null, freshLimit = null
	} = opts;
	if (!isRealDateISO(eventDate)) return { ok: false, reason: 'invalid' };
	const mod = `+${minutes} minutes`;
	// The latest an expiry may be: `minutes` from now, and never past the lifetime.
	const lifetime = maxLifetimeMinutes == null ? null : `+${maxLifetimeMinutes} minutes`;
	const expirySql = lifetime == null
		? "datetime('now', ?)"
		: "MIN(datetime('now', ?), datetime(created_at, ?))";

	await dbRun(db, "DELETE FROM reservation_holds WHERE expires_at <= datetime('now')");

	const taken = await dbFirst<{ id: string }>(db,
		"SELECT id FROM reservations WHERE hall_id = ? AND event_date = ? AND status != 'cancelled' LIMIT 1",
		hallId, eventDate);
	if (taken) return { ok: false, reason: 'taken' };

	const active = await dbFirst<{ id: string; user_id: string }>(db,
		"SELECT id, user_id FROM reservation_holds WHERE hall_id = ? AND event_date = ? AND expires_at > datetime('now') LIMIT 1",
		hallId, eventDate);

	if (active) {
		if (active.user_id !== userId) return { ok: false, reason: 'held' };
		await dbRun(db,
			`UPDATE reservation_holds SET expires_at = ${expirySql}, org_id = ? WHERE id = ?`,
			...(lifetime == null ? [mod] : [mod, lifetime]), orgId, active.id);
		const left = await holdSecondsLeft(db, active.id);
		if (left <= 0) {
			// Reached its lifetime: gone now, rather than lingering as a hold nobody
			// (the holder included) can renew.
			await dbRun(db, 'DELETE FROM reservation_holds WHERE id = ?', active.id);
			return { ok: false, reason: 'expired' };
		}
		return { ok: true, ttl: left };
	}

	if (maxActive != null) {
		const mine = await dbFirst<{ n: number }>(db,
			"SELECT COUNT(*) AS n FROM reservation_holds WHERE user_id = ? AND expires_at > datetime('now')",
			userId);
		if (Number(mine?.n ?? 0) >= maxActive) return { ok: false, reason: 'limit' };
	}

	// Counted only for a NEW hold, after every other check: renewals are free, and a
	// refused attempt must not use up the person's allowance.
	if (freshLimit) {
		const rl = await rateLimit(db, `hold:${userId}:${hallId}:${eventDate}`, freshLimit);
		if (!rl.ok) return { ok: false, reason: 'too-often' };
	}

	try {
		await dbRun(db,
			`INSERT INTO reservation_holds (id, hall_id, event_date, user_id, org_id, expires_at)
			 VALUES (?, ?, ?, ?, ?, datetime('now', ?))`,
			crypto.randomUUID(), hallId, eventDate, userId, orgId, mod);
		return { ok: true, ttl: Math.min(minutes, maxLifetimeMinutes ?? minutes) * 60 };
	} catch {
		// Lost a race on the unique index — someone else just grabbed it.
		return { ok: false, reason: 'held' };
	}
}

async function holdSecondsLeft(db: D1Database, id: string): Promise<number> {
	const row = await dbFirst<{ s: number }>(db,
		"SELECT CAST(ROUND((julianday(expires_at) - julianday('now')) * 86400) AS INTEGER) AS s FROM reservation_holds WHERE id = ?",
		id);
	return Number(row?.s ?? 0);
}

export async function releaseHold(db: D1Database, hallId: string, eventDate: string, userId: string): Promise<void> {
	await dbRun(db, 'DELETE FROM reservation_holds WHERE hall_id = ? AND event_date = ? AND user_id = ?', hallId, eventDate, userId);
}

// ── Final pre-insert validation (used by every submit) ──
export interface BookableHall {
	id: string;
	org_id: string;
	allow_reservations: number | boolean;
	max_people: number | null;
	min_days_advance: number | null;
	plan_locked?: number | boolean;
}

export async function assertCanBook(
	db: D1Database,
	hall: BookableHall,
	eventDate: string,
	userId: string,
	numGuests: number | null,
	locale: 'sk' | 'en' = 'sk',
	/** When rescheduling, the reservation being moved — excluded from the monthly cap
	 *  and the taken-date check so an edit never conflicts with itself. */
	excludeReservationId: string | null = null
): Promise<{ ok: boolean; reason?: string }> {
	const e = st(locale).serverErrors;
	if (hall.plan_locked) return { ok: false, reason: e.hallUnavailable };
	if (!hall.allow_reservations) return { ok: false, reason: e.hallNotAcceptingBookings };
	if (!isRealDateISO(eventDate)) return { ok: false, reason: e.chooseValidDate };

	// Per-hall/month reservation cap (by the event's calendar month; excludes
	// cancelled). The number comes from the hall's org plan. The message names the
	// month in words and keeps the plan's number to itself: it is shown to the
	// venue's clients, who have no business knowing the venue's plan.
	const monthLimit = await monthlyCap(db, hall.org_id);
	if (monthLimit !== -1) {
		const mc = await dbFirst<{ n: number }>(db,
			"SELECT COUNT(*) AS n FROM reservations WHERE hall_id = ? AND status != 'cancelled' AND substr(event_date, 1, 7) = ? AND id IS NOT ?",
			hall.id, eventDate.slice(0, 7), excludeReservationId);
		if ((mc?.n ?? 0) >= monthLimit) {
			return { ok: false, reason: e.hallFullyBookedMonth(monthName(eventDate.slice(0, 7), locale)) };
		}
	}

	const minAdv = hall.min_days_advance ?? 0;
	if (eventDate < earliestBookableISO(minAdv)) {
		return { ok: false, reason: minAdv > 0 ? e.minDaysAdvance(minAdv) : e.dateInPast };
	}

	// Days the venue marks CLOSED in opening_hours are not bookable. This was stored
	// and displayed but never enforced, so a hall open Fri–Sun still accepted a Monday
	// booking (reported by a venue during testing).
	//
	// NOTE: only the per-day open/closed flag is enforced — NOT the from/to times, since
	// the field doubles as "office hours" for some venues. If opening_hours is unset or
	// malformed, nothing is enforced.
	// The calendars read the same rule (unavailableDates), so a closed day is greyed
	// out there rather than refused here after the client filled in the form.
	const oh = await dbFirst<{ opening_hours: string | null }>(db,
		'SELECT opening_hours FROM halls WHERE id = ?', hall.id);
	if (closedWeekdays(oh?.opening_hours ?? null).includes(parseISO(eventDate).getDay())) {
		return { ok: false, reason: e.venueClosedThatDay };
	}

	const blocks = await dbAll<BlockRow>(db,
		'SELECT block_type, date_from, date_to, days_of_week FROM hall_blocks WHERE hall_id = ?', hall.id);
	const normalized = blocks.map(b => ({ ...b, days_of_week: parseDow(b.days_of_week as unknown) }));
	if (isDateBlocked(normalized, eventDate)) return { ok: false, reason: e.dateUnavailable };

	if (numGuests != null && hall.max_people && hall.max_people > 0 && numGuests > hall.max_people) {
		return { ok: false, reason: e.hallMaxCapacityGuests(hall.max_people) };
	}

	const taken = await dbFirst<{ id: string }>(db,
		"SELECT id FROM reservations WHERE hall_id = ? AND event_date = ? AND status != 'cancelled' AND id IS NOT ? LIMIT 1",
		hall.id, eventDate, excludeReservationId);
	if (taken) return { ok: false, reason: e.hallAlreadyBooked };

	const held = await dbFirst<{ user_id: string }>(db,
		"SELECT user_id FROM reservation_holds WHERE hall_id = ? AND event_date = ? AND expires_at > datetime('now') LIMIT 1",
		hall.id, eventDate);
	if (held && held.user_id !== userId) return { ok: false, reason: e.dateBeingBooked };

	return { ok: true };
}

/** hall_blocks.days_of_week is stored as a JSON string; normalize to number[]. */
export function parseDow(value: unknown): number[] {
	if (Array.isArray(value)) return value as number[];
	if (typeof value === 'string' && value.trim()) {
		try { const p = JSON.parse(value); return Array.isArray(p) ? p : []; } catch { return []; }
	}
	return [];
}
