// Platform admins granting or taking back an organisation's AI credits (pilots,
// compensation, corrections). Until now that meant editing the database by hand.
//
// A grant behaves like purchased credit: it is kept when the monthly allowance
// renews, because compensation that lapses at the end of the month is no
// compensation. Every change is a ledger row, so the organisation's own credit
// history shows it.
import { dbFirst, dbRun } from '$lib/db/index';
import type { D1Database } from '@cloudflare/workers-types';

const MC = 1000;
export const MAX_ADJUST_CREDITS = 100_000;

/** Validate the typed amount: a non-zero whole number of credits within bounds. */
export function parseCreditAdjustment(raw: unknown): number | null {
	const s = String(raw ?? '').trim().replace(/\s/g, '');
	if (!/^[+-]?\d+$/.test(s)) return null;
	const n = Number(s);
	if (!Number.isSafeInteger(n) || n === 0 || Math.abs(n) > MAX_ADJUST_CREDITS) return null;
	return n;
}

export async function aiBalanceCredits(db: D1Database, orgId: string): Promise<number | null> {
	try {
		const row = await dbFirst<{ balance_mc: number }>(db, 'SELECT balance_mc FROM ai_accounts WHERE org_id = ?', orgId);
		return row ? row.balance_mc / MC : 0;
	} catch {
		return null; // AI tables not migrated here
	}
}

/** Add (positive) or remove (negative) credits. Removal never takes the balance
 *  below zero. Returns the change actually applied, in credits. */
export async function adjustAiCredits(db: D1Database, orgId: string, credits: number, adminId: string | null, reason: string): Promise<number> {
	await dbRun(db, 'INSERT OR IGNORE INTO ai_accounts (org_id) VALUES (?)', orgId);
	let appliedMc = credits * MC;
	if (credits > 0) {
		await dbRun(db,
			`UPDATE ai_accounts SET balance_mc = balance_mc + ?, purchased_mc = purchased_mc + ?, updated_at = datetime('now') WHERE org_id = ?`,
			appliedMc, appliedMc, orgId);
	} else {
		const row = await dbFirst<{ balance_mc: number }>(db, 'SELECT balance_mc FROM ai_accounts WHERE org_id = ?', orgId);
		const take = Math.min(-appliedMc, Math.max(0, row?.balance_mc ?? 0));
		appliedMc = -take;
		if (take === 0) return 0;
		await dbRun(db,
			`UPDATE ai_accounts SET balance_mc = balance_mc - ?, purchased_mc = MAX(0, purchased_mc - ?), updated_at = datetime('now') WHERE org_id = ?`,
			take, take, orgId);
	}
	await dbRun(db,
		`INSERT INTO ai_ledger (id, org_id, kind, amount_mc, user_id, feature) VALUES (?, ?, ?, ?, ?, ?)`,
		crypto.randomUUID(), orgId, appliedMc > 0 ? 'grant' : 'adjust', appliedMc, adminId,
		`platform: ${reason}`.slice(0, 200));
	return appliedMc / MC;
}
