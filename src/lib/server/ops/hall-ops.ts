import { dbFirst, dbRun, toJson } from '$lib/db/index';
import { getPlan, type PlanId } from '$lib/plans';
import { canAddExtra, canAddHall } from '$lib/limits';
import { st } from '$lib/i18n-server';
import { uniqueHallSlug } from '$lib/server/hall-naming';
import type { OpResult } from './reservation-ops';

/**
 * Setting a hall up — blocked dates, bookable extras, table types, booking rules and
 * creating the hall itself. The hall page's actions and the AI assistant both go
 * through these, so a plan limit or a validation rule cannot hold on one path and
 * not the other. Authorization is the caller's; these scope everything to the org.
 */

type Db = App.Locals['db'];
type Locale = 'sk' | 'en';

const clamp = (n: number, lo: number, hi: number, dflt: number) =>
	Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;

async function hallInOrg(db: Db, orgId: string, hallId: string): Promise<boolean> {
	return !!(await dbFirst<{ ok: number }>(db, 'SELECT 1 AS ok FROM halls WHERE id = ? AND org_id = ?', hallId, orgId));
}

// ─── Blocked dates ──────────────────────────────────────────────────────────

export interface BlockInput {
	type: 'date_range' | 'weekly';
	dateFrom: string | null;
	dateTo: string | null;
	/** JavaScript weekdays, 0 = Sunday … 6 = Saturday. Inside a range: which days of it. */
	days: number[] | null;
	reason: string | null;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function addHallBlock(db: Db, orgId: string, hallId: string, b: BlockInput, locale: Locale): Promise<OpResult<{ id: string }>> {
	const e = st(locale).serverErrors;
	if (!(await hallInOrg(db, orgId, hallId))) return { ok: false, status: 404, error: e.hallNotFound };
	const days = b.days?.length ? [...new Set(b.days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : null;
	if (b.type === 'date_range') {
		if (!b.dateFrom || !b.dateTo || !ISO.test(b.dateFrom) || !ISO.test(b.dateTo)) return { ok: false, status: 400, error: e.dateRangeRequiresBothDates };
		if (b.dateTo < b.dateFrom) return { ok: false, status: 400, error: e.dateRangeRequiresBothDates };
	} else if (!days?.length) {
		return { ok: false, status: 400, error: e.weeklyBlockRequiresDay };
	}
	const id = crypto.randomUUID();
	await dbRun(db,
		'INSERT INTO hall_blocks (id, hall_id, block_type, date_from, date_to, days_of_week, reason) VALUES (?, ?, ?, ?, ?, ?, ?)',
		id, hallId, b.type, b.type === 'date_range' ? b.dateFrom : null, b.type === 'date_range' ? b.dateTo : null,
		toJson(days), b.reason?.trim().slice(0, 200) || null);
	return { ok: true, id };
}

export async function removeHallBlock(db: Db, orgId: string, blockId: string): Promise<OpResult> {
	const r = await dbRun(db, 'DELETE FROM hall_blocks WHERE id = ? AND hall_id IN (SELECT id FROM halls WHERE org_id = ?)', blockId, orgId);
	return r.meta.changes ? { ok: true } : { ok: false, status: 404, error: 'not_found' };
}

// ─── Extras ─────────────────────────────────────────────────────────────────

export interface ExtraInput { name: string; description: string | null; priceEur: number; pricing: 'fixed' | 'per_guest' }

function normalizeExtra(x: ExtraInput) {
	return {
		name: x.name.trim().slice(0, 120),
		description: x.description?.trim().slice(0, 500) || null,
		priceCents: Math.max(0, Math.round((Number(x.priceEur) || 0) * 100)),
		pricing: x.pricing === 'per_guest' ? 'per_guest' : 'fixed'
	};
}

export async function addHallExtra(db: Db, orgId: string, plan: PlanId, hallId: string, x: ExtraInput, locale: Locale): Promise<OpResult<{ id: string }>> {
	const e = st(locale).serverErrors;
	if (!(await hallInOrg(db, orgId, hallId))) return { ok: false, status: 404, error: e.hallNotFound };
	const n = normalizeExtra(x);
	if (!n.name) return { ok: false, status: 400, error: e.nameRequired };
	if (!(await canAddExtra(db, hallId, plan))) {
		const limit = getPlan(plan).limits.maxExtrasPerHall;
		return { ok: false, status: 403, error: e.extrasLimit(limit) };
	}
	const id = crypto.randomUUID();
	await dbRun(db, 'INSERT INTO hall_extras (id, hall_id, name, description, price_cents, pricing) VALUES (?, ?, ?, ?, ?, ?)',
		id, hallId, n.name, n.description, n.priceCents, n.pricing);
	return { ok: true, id };
}

export async function updateHallExtra(db: Db, orgId: string, extraId: string, x: ExtraInput, locale: Locale): Promise<OpResult> {
	const n = normalizeExtra(x);
	if (!n.name) return { ok: false, status: 400, error: st(locale).serverErrors.nameRequired };
	const r = await dbRun(db,
		'UPDATE hall_extras SET name=?, description=?, price_cents=?, pricing=? WHERE id=? AND hall_id IN (SELECT id FROM halls WHERE org_id = ?)',
		n.name, n.description, n.priceCents, n.pricing, extraId, orgId);
	return r.meta.changes ? { ok: true } : { ok: false, status: 404, error: 'not_found' };
}

export async function removeHallExtra(db: Db, orgId: string, extraId: string): Promise<OpResult> {
	const r = await dbRun(db, 'DELETE FROM hall_extras WHERE id = ? AND hall_id IN (SELECT id FROM halls WHERE org_id = ?)', extraId, orgId);
	return r.meta.changes ? { ok: true } : { ok: false, status: 404, error: 'not_found' };
}

// ─── Table types ────────────────────────────────────────────────────────────

export interface TableTypeInput {
	name: string; shape: 'rect' | 'round'; width: number; height: number; radius: number;
	maxChairs: number; amount: number; color: string | null;
}

/** The same bounds the table-type dialog enforces. */
export function normalizeTableType(t: Partial<TableTypeInput>, locale: Locale): TableTypeInput | { error: string } {
	const name = String(t.name ?? '').trim().slice(0, 80);
	if (!name) return { error: st(locale).serverErrors.nameRequired };
	let color = String(t.color ?? '#92400e').trim();
	if (!/^#[0-9a-fA-F]{6}$/.test(color)) color = '#92400e';
	return {
		name,
		shape: t.shape === 'round' ? 'round' : 'rect',
		width: clamp(Number(t.width ?? 2), 0.5, 10, 2),
		height: clamp(Number(t.height ?? 1), 0.5, 10, 1),
		radius: clamp(Number(t.radius ?? 1), 0.3, 5, 1),
		maxChairs: Math.round(clamp(Number(t.maxChairs ?? 8), 1, 40, 8)),
		amount: Math.round(clamp(Number(t.amount ?? 0), 0, 200, 0)),
		color
	};
}

export async function addTableType(db: Db, orgId: string, hallId: string, raw: Partial<TableTypeInput>, locale: Locale): Promise<OpResult<{ id: string }>> {
	if (!(await hallInOrg(db, orgId, hallId))) return { ok: false, status: 404, error: st(locale).serverErrors.hallNotFound };
	const t = normalizeTableType(raw, locale);
	if ('error' in t) return { ok: false, status: 400, error: t.error };
	const id = crypto.randomUUID();
	await dbRun(db,
		'INSERT INTO table_types (id, hall_id, name, shape, width, height, radius, max_chairs, amount, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
		id, hallId, t.name, t.shape, t.width, t.height, t.radius, t.maxChairs, t.amount, t.color);
	return { ok: true, id };
}

export async function updateTableType(db: Db, orgId: string, hallId: string, typeId: string, raw: Partial<TableTypeInput>, locale: Locale): Promise<OpResult> {
	const t = normalizeTableType(raw, locale);
	if ('error' in t) return { ok: false, status: 400, error: t.error };
	const r = await dbRun(db,
		`UPDATE table_types SET name=?, shape=?, width=?, height=?, radius=?, max_chairs=?, amount=?, color=?
		  WHERE id=? AND hall_id=? AND hall_id IN (SELECT id FROM halls WHERE org_id = ?)`,
		t.name, t.shape, t.width, t.height, t.radius, t.maxChairs, t.amount, t.color, typeId, hallId, orgId);
	return r.meta.changes ? { ok: true } : { ok: false, status: 404, error: 'not_found' };
}

export async function removeTableType(db: Db, orgId: string, hallId: string, typeId: string): Promise<OpResult> {
	const r = await dbRun(db,
		'DELETE FROM table_types WHERE id = ? AND hall_id = ? AND hall_id IN (SELECT id FROM halls WHERE org_id = ?)', typeId, hallId, orgId);
	return r.meta.changes ? { ok: true } : { ok: false, status: 404, error: 'not_found' };
}

// ─── Booking rules ──────────────────────────────────────────────────────────

export interface BookingSettings {
	allow_reservations?: boolean;
	auto_approve?: boolean;
	custom_layouts?: boolean;
	force_layouts?: boolean;
	allow_feedback?: boolean;
	min_days_advance?: number;
	min_cancel_days?: number;
	pre_reservation_text?: string;
}

export const BOOKING_FLAGS = ['allow_reservations', 'auto_approve', 'custom_layouts', 'force_layouts', 'allow_feedback'] as const;

/** Change only the booking rules given; the rest of the hall is untouched. An
 *  archived hall stays closed whatever is asked — restoring it is the way back. */
export async function updateBookingSettings(db: Db, orgId: string, hallId: string, s: BookingSettings, locale: Locale): Promise<OpResult<{ changed: string[] }>> {
	const hall = await dbFirst<{ archived_at: string | null; plan_locked: number }>(db,
		'SELECT archived_at, plan_locked FROM halls WHERE id = ? AND org_id = ?', hallId, orgId);
	if (!hall) return { ok: false, status: 404, error: st(locale).serverErrors.hallNotFound };
	const sets: string[] = [];
	const params: unknown[] = [];
	for (const f of BOOKING_FLAGS) {
		if (typeof s[f] !== 'boolean') continue;
		const on = s[f] && !(f === 'allow_reservations' && hall.archived_at);
		sets.push(`${f} = ?`);
		params.push(on ? 1 : 0);
	}
	for (const f of ['min_days_advance', 'min_cancel_days'] as const) {
		if (s[f] == null) continue;
		sets.push(`${f} = ?`);
		params.push(Math.round(clamp(Number(s[f]), 0, 365, 0)));
	}
	if (typeof s.pre_reservation_text === 'string') {
		sets.push('pre_reservation_text = ?');
		params.push(s.pre_reservation_text.trim().slice(0, 2000) || null);
	}
	if (!sets.length) return { ok: true, changed: [] };
	await dbRun(db, `UPDATE halls SET ${sets.join(', ')} WHERE id = ? AND org_id = ?`, ...params, hallId, orgId);
	return { ok: true, changed: sets.map((x) => x.split(' ')[0]) };
}

// ─── A new hall ─────────────────────────────────────────────────────────────

export const DEFAULT_HALL_COLOR = '#f05ca1';
export const DEFAULT_MAX_PEOPLE = 100;

/** A new hall starts as a draft: unlisted and taking no bookings, with its public
 *  URL already reserved. It is listed only when the operator turns that on in its
 *  profile, which asks for an address first — so the directory never fills with
 *  empty "Nová sála" cards (B73), and the venue site has a URL for it (B11). */
export async function createHall(db: Db, orgId: string, plan: PlanId, name: string, maxPeople: number | null, locale: Locale): Promise<OpResult<{ id: string }>> {
	if (!(await canAddHall(db, orgId, plan))) {
		const limit = getPlan(plan).limits.maxHalls;
		return { ok: false, status: 403, error: st(locale).serverErrors.hallLimitReached.replace('{limit}', String(limit)) };
	}
	const id = crypto.randomUUID();
	const finalName = name.trim().slice(0, 120) || st(locale).halls.untitledHall;
	const slug = await uniqueHallSlug(db, finalName, null, locale === 'en' ? 'hall' : 'sala');
	const insert = (s: string) => dbRun(db,
		`INSERT INTO halls (id, org_id, name, slug, max_people, color, allow_reservations, is_public) VALUES (?, ?, ?, ?, ?, ?, 0, 0)`,
		id, orgId, finalName, s,
		maxPeople && maxPeople >= 1 ? Math.round(maxPeople) : DEFAULT_MAX_PEOPLE, DEFAULT_HALL_COLOR);
	try {
		await insert(slug);
	} catch {
		// Another hall took the same slug between the lookup and the insert.
		await insert(`${slug.slice(0, 50)}-${id.slice(0, 6)}`);
	}
	return { ok: true, id };
}
