/**
 * Organisation invites: the rules the Invites tab and the acceptance page share.
 */
import { dbFirst } from '$lib/db/index';

type Db = App.Locals['db'];

/** Plain shape check. The invite e-mail is the real test; this stops typos such as
 *  "notanemail" or "jan@firma" from creating an invite nobody can ever receive. */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s.]{2,}$/;

export function isValidInviteEmail(email: string): boolean {
	return email.length <= 254 && EMAIL_RE.test(email);
}

/**
 * Seats already spoken for: current members plus invites still waiting for an answer.
 *
 * Counting members alone let an owner on a one-seat-left plan send two invites; the
 * second invitee then hit "your plan allows N members" on the acceptance page and
 * the invite stayed pending for good. `exceptEmail` leaves out the invite being
 * (re)issued, so re-sending one never counts it twice.
 *
 * `datetime(expires_at)`, not the raw column: expiry is stored as an ISO string
 * ('2026-10-23T10:00:00.000Z'). Compared as text with datetime('now')
 * ('2026-10-23 15:00:00'), the 'T' sorts after the space, which kept an invite
 * alive until the end of the day it expired on.
 */
export async function seatsSpokenFor(db: Db, orgId: string, exceptEmail?: string): Promise<number> {
	const members = await dbFirst<{ n: number }>(
		db,
		'SELECT COUNT(*) AS n FROM organization_members WHERE org_id = ?',
		orgId
	);
	const pending = await dbFirst<{ n: number }>(
		db,
		`SELECT COUNT(*) AS n FROM organization_invites
		  WHERE org_id = ? AND accepted_at IS NULL
		    AND datetime(expires_at) > datetime('now')
		    AND email <> ?`,
		orgId,
		exceptEmail ?? ''
	);
	return Number(members?.n ?? 0) + Number(pending?.n ?? 0);
}

/** Whether one more invite fits under a seat cap (-1 = unlimited). */
export function hasSeatForInvite(limit: number, spokenFor: number): boolean {
	return limit === -1 || spokenFor < limit;
}

/** The acceptance link. Invites are accepted on the apex app, never a venue site. */
export function inviteLink(base: string, token: string): string {
	return `${base.replace(/\/$/, '')}/app/invite/${token}`;
}

/** A fresh token and a seven-day expiry, for a new invite or a resent one. */
export function freshInviteToken(now = Date.now()): { token: string; expiresAt: string } {
	return {
		token: crypto.randomUUID().replace(/-/g, '').slice(0, 24),
		expiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString()
	};
}
