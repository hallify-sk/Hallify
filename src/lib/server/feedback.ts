// Client feedback (D5): storing it, summarising it for the venue, and inviting
// clients to give it. The rules are in $lib/feedback.
//
// Every read tolerates a database where migration 0031b has not run yet: the pages
// then show no feedback rather than failing.

import { dbAll, dbFirst, dbRun } from '$lib/db/index';
import { notifyFeedbackRequest } from '$lib/email';
import { FEEDBACK_DAYS, summariseRatings, type FeedbackRow, type RatingSummary } from '$lib/feedback';
import type { D1Database } from '@cloudflare/workers-types';
import { dispatchPlatformEvent } from '$lib/server/platform-webhooks';

export async function loadFeedback(db: D1Database, reservationId: string): Promise<FeedbackRow | null> {
	try {
		return await dbFirst<FeedbackRow>(db,
			'SELECT reservation_id, rating, comment, created_at, updated_at FROM reservation_feedback WHERE reservation_id = ?',
			reservationId);
	} catch {
		return null;
	}
}

/** When the client was invited to rate this booking, or null. */
export async function feedbackRequestedAt(db: D1Database, reservationId: string): Promise<string | null> {
	try {
		const row = await dbFirst<{ feedback_requested_at: string | null }>(db,
			'SELECT feedback_requested_at FROM reservations WHERE id = ?', reservationId);
		return row?.feedback_requested_at ?? null;
	} catch {
		return null;
	}
}

/** Give or change the rating of a booking. The caller has checked that the booking is
 *  this client's and that the card is open. */
export async function saveFeedback(db: D1Database, f: {
	reservationId: string; orgId: string; hallId: string; userId: string; rating: number; comment: string | null;
}): Promise<void> {
	const existed = await dbFirst<{ ok: number }>(db, 'SELECT 1 AS ok FROM reservation_feedback WHERE reservation_id = ?', f.reservationId).catch(() => null);
	await dbRun(db,
		`INSERT INTO reservation_feedback (reservation_id, org_id, hall_id, user_id, rating, comment)
		 VALUES (?, ?, ?, ?, ?, ?)
		 ON CONFLICT (reservation_id) DO UPDATE SET
		   rating = excluded.rating, comment = excluded.comment, updated_at = datetime('now')`,
		f.reservationId, f.orgId, f.hallId, f.userId, f.rating, f.comment);
	// Low detail for the platform: the rating, never the client or what they wrote.
	dispatchPlatformEvent(db, 'feedback.received', {
		org_id: f.orgId, hall_id: f.hallId, reservation_id: f.reservationId, rating: f.rating, has_comment: !!f.comment, updated: !!existed,
	});
}

export interface FeedbackListItem {
	reservation_id: string;
	rating: number;
	comment: string | null;
	created_at: string;
	updated_at: string;
	title: string;
	event_date: string;
	hall_id: string;
	hall_name: string;
	user_id: string | null;
	client_name: string | null;
}

const LIST_SQL = `
	SELECT f.reservation_id, f.rating, f.comment, f.created_at, f.updated_at,
	       r.title, r.event_date, f.hall_id, h.name AS hall_name, f.user_id,
	       NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '') AS client_name
	  FROM reservation_feedback f
	  JOIN reservations r ON r.id = f.reservation_id
	  JOIN halls h ON h.id = f.hall_id
	  LEFT JOIN users u ON u.id = f.user_id`;

/** A hall's ratings: the summary and the latest few, for the hall page. */
export async function hallFeedback(db: D1Database, orgId: string, hallId: string, recent = 5): Promise<{ summary: RatingSummary; recent: FeedbackListItem[] } | null> {
	try {
		const ratings = await dbAll<{ rating: number }>(db,
			'SELECT rating FROM reservation_feedback WHERE hall_id = ? AND org_id = ?', hallId, orgId);
		const latest = await dbAll<FeedbackListItem>(db,
			`${LIST_SQL} WHERE f.hall_id = ? AND f.org_id = ? ORDER BY f.updated_at DESC LIMIT ?`, hallId, orgId, recent);
		return { summary: summariseRatings(ratings.map((r) => r.rating)), recent: latest };
	} catch {
		return null;
	}
}

/** Every rating a client gave this venue, newest first. */
export async function clientFeedback(db: D1Database, orgId: string, userId: string): Promise<FeedbackListItem[]> {
	try {
		return await dbAll<FeedbackListItem>(db,
			`${LIST_SQL} WHERE f.org_id = ? AND f.user_id = ? ORDER BY r.event_date DESC`, orgId, userId);
	} catch {
		return [];
	}
}

// ── Invitations ──────────────────────────────────────────────────────────────

/** Bookings invited per run; the rest follow on the next run. */
const BATCH = 25;

/** Completed client bookings at halls that ask for feedback, from the last
 *  FEEDBACK_DAYS, not yet invited and not yet rated. Older events are never invited:
 *  the invitation is for an event the client has just had (and so a release does not
 *  email everyone who ever booked). */
export const DUE_FEEDBACK_SQL = `
	SELECT r.id, r.org_id
	  FROM reservations r
	  JOIN halls h ON h.id = r.hall_id
	  JOIN users u ON u.id = r.user_id
	  JOIN organizations o ON o.id = r.org_id
	 WHERE r.status = 'completed'
	   AND h.allow_feedback = 1
	   AND r.feedback_requested_at IS NULL
	   AND u.account_type = 'client'
	   AND o.suspended_at IS NULL
	   AND substr(r.event_date, 1, 10) < date('now')
	   AND substr(r.event_date, 1, 10) >= date('now', '-${FEEDBACK_DAYS} days')
	   AND NOT EXISTS (SELECT 1 FROM reservation_feedback f WHERE f.reservation_id = r.id)
	 ORDER BY r.event_date
	 LIMIT ${BATCH}`;

/** Invite the clients whose events just finished. Each booking is claimed before its
 *  email goes out, so two overlapping runs never invite twice. Returns how many were
 *  claimed. Never throws: before migration 0031b nothing is sent. */
export async function sendFeedbackInvites(db: D1Database): Promise<number> {
	let due: Array<{ id: string; org_id: string }>;
	try {
		due = await dbAll(db, DUE_FEEDBACK_SQL);
	} catch {
		return 0;
	}
	let claimed = 0;
	for (const r of due) {
		const claim = await dbRun(db,
			"UPDATE reservations SET feedback_requested_at = datetime('now') WHERE id = ? AND feedback_requested_at IS NULL", r.id);
		if ((claim.meta?.changes ?? 0) === 0) continue;
		claimed++;
		await notifyFeedbackRequest(db, r.org_id, r.id).catch((err) => console.error('[feedback] invite failed:', err));
	}
	return claimed;
}
