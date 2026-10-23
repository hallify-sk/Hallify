// Telling the owner when a hall's month is full under the plan's reservation cap (M17).
//
// The Free plan takes 5 reservations per hall and month (Starter 12, Professional
// 20). Once a month is full the venue site shows it as taken and refuses bookings,
// and the owner used to learn nothing: no email, no banner, no count. That moment is
// the clearest reason to upgrade, so it is recorded in hall_month_caps (migration
// 0027) and surfaced three ways:
//   - an email to the owners the moment a month fills (once per hall and month),
//   - a count of client bookings refused by the cap since then,
//   - a banner on the dashboard and the reservations page while the month is ahead.
// Everything here is best effort: a booking never fails because a notice could not
// be recorded or sent.

import { env } from '$env/dynamic/private';
import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import { monthlyCap, monthName } from '$lib/availability';
import { sendEmail } from '$lib/email';
import { st } from '$lib/i18n-server';
import { PLANS, getPlan, type PlanId } from '$lib/plans';
import { orgDefaultLocale } from '$lib/server/user-locale';
import type { D1Database } from '@cloudflare/workers-types';

const esc = (s: string) => String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c] as string));

/** The first plan above `current` with a higher monthly cap (-1 = unlimited), or null. */
export function nextPlanForCap(current: PlanId): { id: PlanId; name: string; cap: number } | null {
	const order = Object.keys(PLANS) as PlanId[];
	const have = getPlan(current).limits.maxReservationsPerHallMonth;
	if (have === -1) return null;
	for (const id of order.slice(order.indexOf(current) + 1)) {
		const cap = PLANS[id].limits.maxReservationsPerHallMonth;
		if (cap === -1 || cap > have) return { id, name: PLANS[id].name, cap };
	}
	return null;
}

async function orgPlan(db: D1Database, orgId: string): Promise<PlanId> {
	const sub = await dbFirst<{ plan: string | null }>(db, 'SELECT plan FROM subscriptions WHERE org_id = ?', orgId);
	return ((sub?.plan ?? 'free') in PLANS ? sub?.plan ?? 'free' : 'free') as PlanId;
}

async function bookedInMonth(db: D1Database, hallId: string, month: string): Promise<number> {
	const row = await dbFirst<{ n: number }>(db,
		"SELECT COUNT(*) AS n FROM reservations WHERE hall_id = ? AND status != 'cancelled' AND substr(event_date, 1, 7) = ?",
		hallId, month);
	return Number(row?.n ?? 0);
}

/** Email the owners, once per hall and month (the row is claimed first). */
async function notifyOwners(db: D1Database, hall: { id: string; org_id: string; name: string }, month: string, cap: number): Promise<void> {
	const claim = await dbRun(db,
		"UPDATE hall_month_caps SET notified_at = datetime('now') WHERE hall_id = ? AND month = ? AND notified_at IS NULL",
		hall.id, month);
	if ((claim.meta?.changes ?? 0) === 0) return;

	const owners = await dbAll<{ email: string }>(db,
		`SELECT u.email FROM organization_members m JOIN users u ON u.id = m.user_id
		  WHERE m.org_id = ? AND m.role = 'owner'`, hall.org_id);
	if (!owners.length) return;
	const locale = (await orgDefaultLocale(db, hall.org_id)) ?? 'sk';
	const tx = st(locale).accountPages.capEmail;
	const plan = await orgPlan(db, hall.org_id);
	const next = nextPlanForCap(plan);
	const row = await dbFirst<{ turned_away: number }>(db,
		'SELECT turned_away FROM hall_month_caps WHERE hall_id = ? AND month = ?', hall.id, month);
	const monthLabel = monthName(month, locale);
	const subject = tx.subject(hall.name, monthLabel);
	const p = (text: string) => `<p style="font-size:14px;line-height:1.6;color:#454a45;margin:0 0 12px">${esc(text)}</p>`;
	const html = `
	<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#202322">
		<h2 style="font-size:20px;font-weight:800;margin:0 0 12px">${esc(subject)}</h2>
		${p(tx.body(hall.name, monthLabel, cap, PLANS[plan].name))}
		${row?.turned_away ? p(tx.turnedAway(row.turned_away)) : ''}
		${next ? p(next.cap === -1 ? tx.upgradeUnlimited(next.name) : tx.upgrade(next.name, next.cap)) : ''}
		<a href="${esc(`${env.APP_URL ?? ''}/app/billing`)}" style="display:inline-block;background:#f05ca1;color:#27131c;text-decoration:none;font-weight:700;font-size:14px;padding:11px 22px;border-radius:12px">${esc(tx.cta)}</a>
	</div>`;
	for (const o of owners) await sendEmail(db, o.email, subject, html, 'monthFull');
}

/**
 * After a booking was added for `eventDate`: if that made the hall's month reach the
 * plan's cap, record it and tell the owners. Call it for every new booking.
 */
export async function noteMonthUsage(
	db: D1Database,
	hall: { id: string; org_id: string; name: string },
	eventDate: string
): Promise<void> {
	try {
		const cap = await monthlyCap(db, hall.org_id);
		if (cap === -1) return;
		const month = eventDate.slice(0, 7);
		if ((await bookedInMonth(db, hall.id, month)) < cap) return;
		await dbRun(db,
			`INSERT INTO hall_month_caps (hall_id, month, org_id, cap) VALUES (?, ?, ?, ?)
			 ON CONFLICT (hall_id, month) DO UPDATE SET cap = excluded.cap`,
			hall.id, month, hall.org_id, cap);
		await notifyOwners(db, hall, month, cap);
	} catch (err) {
		console.error('[cap-notices] noting month usage failed:', err);
	}
}

/**
 * A client's booking was refused because the month is full: count it, and make sure
 * the owners have heard about the full month.
 */
export async function recordTurnedAway(
	db: D1Database,
	hall: { id: string; org_id: string; name: string },
	eventDate: string
): Promise<void> {
	try {
		const cap = await monthlyCap(db, hall.org_id);
		if (cap === -1) return;
		const month = eventDate.slice(0, 7);
		await dbRun(db,
			`INSERT INTO hall_month_caps (hall_id, month, org_id, cap, turned_away, last_turned_away_at)
			 VALUES (?, ?, ?, ?, 1, datetime('now'))
			 ON CONFLICT (hall_id, month) DO UPDATE SET
			   turned_away = turned_away + 1, last_turned_away_at = datetime('now'), cap = excluded.cap`,
			hall.id, month, hall.org_id, cap);
		await notifyOwners(db, hall, month, cap);
	} catch (err) {
		console.error('[cap-notices] recording a refused booking failed:', err);
	}
}

export interface CapNotice {
	hallId: string;
	hallName: string;
	month: string;
	booked: number;
	cap: number;
	turnedAway: number;
}

/**
 * Halls whose current or a coming month is full under the org's CURRENT plan (an
 * upgrade, or a cancellation that freed a slot, makes a notice go away by itself).
 */
export async function loadCapNotices(db: D1Database, orgId: string): Promise<{ notices: CapNotice[]; plan: PlanId; next: ReturnType<typeof nextPlanForCap> }> {
	const plan = await orgPlan(db, orgId);
	const cap = getPlan(plan).limits.maxReservationsPerHallMonth;
	if (cap === -1) return { notices: [], plan, next: null };
	let rows: Array<{ hall_id: string; hall_name: string; month: string; booked: number; turned_away: number | null }>;
	try {
		rows = await dbAll(db,
			`SELECT r.hall_id, h.name AS hall_name, substr(r.event_date, 1, 7) AS month, COUNT(*) AS booked,
			        (SELECT c.turned_away FROM hall_month_caps c WHERE c.hall_id = r.hall_id AND c.month = substr(r.event_date, 1, 7)) AS turned_away
			   FROM reservations r JOIN halls h ON h.id = r.hall_id
			  WHERE r.org_id = ? AND r.status != 'cancelled' AND h.archived_at IS NULL
			    AND substr(r.event_date, 1, 7) >= strftime('%Y-%m', 'now')
			  GROUP BY r.hall_id, month
			 HAVING COUNT(*) >= ?
			  ORDER BY month, h.name
			  LIMIT 6`, orgId, cap);
	} catch {
		return { notices: [], plan, next: null }; // hall_month_caps arrives with migration 0027
	}
	return {
		plan,
		next: nextPlanForCap(plan),
		notices: rows.map((r) => ({
			hallId: r.hall_id, hallName: r.hall_name, month: r.month,
			booked: Number(r.booked), cap, turnedAway: Number(r.turned_away ?? 0),
		})),
	};
}
