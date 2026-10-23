import { dbFirst, dbRun, dbAll } from '$lib/db/index';
import { getPlan } from '$lib/plans';
import { aiConfigured } from './openai';
import { loadAiPlatform } from './pricing';
import { memberCan } from './tools';
import type { OrgContext } from '../../../app.d';

/**
 * AI credits: the monthly allowance, purchases, and spending.
 *
 * There is no scheduler. An account is brought up to date whenever it is read: if
 * the period it holds is not the period we are in now, the allowance is refilled
 * on the spot. Paid plans follow their Stripe renewal date; Free (and anything
 * without a live subscription) runs monthly from the day the organisation was
 * created.
 *
 * Amounts are milli-credits (see migration 0012).
 */

type Db = App.Locals['db'];

export const MC = 1000;

export interface AiAccount {
	org_id: string;
	balance_mc: number;
	purchased_mc: number;
	period_start: string | null;
	period_end: string | null;
	period_grant_mc: number;
	allowance_override: number | null;
	enabled: number;
	enabled_by: string | null;
	enabled_at: string | null;
}

/** Credits per period for this org: its plan's, unless a contract says otherwise. */
export function allowanceCredits(org: OrgContext, override: number | null): number {
	if (override != null && override >= 0) return override;
	return getPlan(org.subscription.plan).limits.aiCreditsMonthly;
}

function addMonths(d: Date, n: number): Date {
	const out = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1,
		d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()));
	// Clamp the day: a period anchored on the 31st renews on the last day of short months.
	const last = new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate();
	out.setUTCDate(Math.min(d.getUTCDate(), last));
	return out;
}

/** The monthly window around `now` that started on `anchor`'s day of the month. */
export function monthlyWindow(anchor: Date, now: Date): { start: Date; end: Date } {
	let k = (now.getUTCFullYear() - anchor.getUTCFullYear()) * 12 + (now.getUTCMonth() - anchor.getUTCMonth());
	if (addMonths(anchor, k) > now) k -= 1;
	if (k < 0) k = 0;
	return { start: addMonths(anchor, k), end: addMonths(anchor, k + 1) };
}

/** The period the org is in right now. A live paid subscription defines it; anything
 *  else falls back to monthly from the org's creation. */
async function currentWindow(db: Db, org: OrgContext, now: Date): Promise<{ start: string; end: string }> {
	const sub = org.subscription;
	const live = sub.plan !== 'free' && ['active', 'trialing', 'past_due'].includes(sub.status);
	if (live && sub.currentPeriodEnd) {
		const end = new Date(sub.currentPeriodEnd);
		if (!Number.isNaN(end.getTime()) && end > now) {
			return { start: addMonths(end, -1).toISOString(), end: end.toISOString() };
		}
	}
	const row = await dbFirst<{ created_at: string }>(db, 'SELECT created_at FROM organizations WHERE id = ?', org.id);
	const anchor = new Date(`${(row?.created_at ?? now.toISOString()).replace(' ', 'T').replace(/Z?$/, 'Z')}`);
	const w = monthlyWindow(Number.isNaN(anchor.getTime()) ? now : anchor, now);
	return { start: w.start.toISOString(), end: w.end.toISOString() };
}

async function ledger(
	db: Db,
	row: { orgId: string; kind: 'grant' | 'purchase' | 'charge' | 'adjust'; amountMc: number; userId?: string | null;
		feature?: string | null; model?: string | null; inputTokens?: number; cachedTokens?: number;
		outputTokens?: number; costUsdMicro?: number; ref?: string | null; threadId?: string | null; turnId?: string | null }
) {
	// thread_id / turn_id (migration 0015a) are only written when there is something to
	// write, so grants and purchases keep working on a database that lacks them.
	const turn = row.threadId || row.turnId;
	await dbRun(db,
		`INSERT INTO ai_ledger (id, org_id, kind, amount_mc, user_id, feature, model, input_tokens, cached_tokens, output_tokens, cost_usd_micro, ref${turn ? ', thread_id, turn_id' : ''})
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?${turn ? ', ?, ?' : ''})`,
		crypto.randomUUID(), row.orgId, row.kind, row.amountMc, row.userId ?? null, row.feature ?? null,
		row.model ?? null, row.inputTokens ?? null, row.cachedTokens ?? null, row.outputTokens ?? null,
		row.costUsdMicro ?? null, row.ref ?? null, ...(turn ? [row.threadId ?? null, row.turnId ?? null] : []));
}

/**
 * The account as it stands now — created if missing, refilled if a new period has
 * begun, topped up if the plan grew mid-period.
 *
 * Each refill is a conditional UPDATE keyed on the period it replaces, so when two
 * requests notice the new period at once only one of them grants it.
 */
export async function getAccount(db: Db, org: OrgContext, now = new Date()): Promise<AiAccount> {
	await dbRun(db, 'INSERT OR IGNORE INTO ai_accounts (org_id) VALUES (?)', org.id);
	let acc = (await dbFirst<AiAccount>(db, 'SELECT * FROM ai_accounts WHERE org_id = ?', org.id))!;
	const allowanceMc = allowanceCredits(org, acc.allowance_override) * MC;
	const win = await currentWindow(db, org, now);

	if (acc.period_end !== win.end) {
		// Monthly credits are spent first, so what is left of the balance, up to the
		// purchased amount, is purchased credit. That survives; the rest lapses.
		const keep = Math.min(acc.purchased_mc, Math.max(0, acc.balance_mc));
		const lapsed = Math.max(0, acc.balance_mc) - keep;
		const res = await dbRun(db,
			`UPDATE ai_accounts
			    SET balance_mc = ?, purchased_mc = ?, period_start = ?, period_end = ?,
			        period_grant_mc = ?, updated_at = datetime('now')
			  WHERE org_id = ? AND period_end IS ?`,
			allowanceMc + keep, keep, win.start, win.end, allowanceMc, org.id, acc.period_end);
		if (res.meta.changes === 1) {
			if (lapsed > 0) await ledger(db, { orgId: org.id, kind: 'adjust', amountMc: -lapsed, feature: 'period_end' });
			if (allowanceMc > 0) await ledger(db, { orgId: org.id, kind: 'grant', amountMc: allowanceMc, feature: 'monthly' });
		}
	} else if (allowanceMc > acc.period_grant_mc) {
		// Upgraded mid-period: the difference arrives now, not at the next renewal.
		const diff = allowanceMc - acc.period_grant_mc;
		const res = await dbRun(db,
			`UPDATE ai_accounts SET balance_mc = balance_mc + ?, period_grant_mc = ?, updated_at = datetime('now')
			  WHERE org_id = ? AND period_grant_mc = ?`,
			diff, allowanceMc, org.id, acc.period_grant_mc);
		if (res.meta.changes === 1) await ledger(db, { orgId: org.id, kind: 'grant', amountMc: diff, feature: 'upgrade' });
	} else {
		return acc;
	}
	acc = (await dbFirst<AiAccount>(db, 'SELECT * FROM ai_accounts WHERE org_id = ?', org.id))!;
	return acc;
}

/** Below this nothing starts: not enough left for even a short answer (half a cent). */
export const MIN_TURN_MC = 50;

/**
 * Reserve credits before a model call: the worst case, or whatever is left if
 * that is less. Returns the amount held, 0 if the balance is under MIN_TURN_MC.
 *
 * Holding the full worst case would refuse a member with 8 credits a question
 * that will actually cost 2. Holding less means one call can take the balance a
 * little below zero; the next turn is then refused. The UPDATE is conditional,
 * so two calls at once can never both hold the same credits.
 */
export async function holdUpTo(db: Db, orgId: string, worstMc: number): Promise<number> {
	const row = await dbFirst<{ balance_mc: number }>(db, 'SELECT balance_mc FROM ai_accounts WHERE org_id = ?', orgId);
	const available = row?.balance_mc ?? 0;
	if (available < MIN_TURN_MC) return 0;
	const amount = Math.min(worstMc, available);
	const res = await dbRun(db,
		`UPDATE ai_accounts SET balance_mc = balance_mc - ?, updated_at = datetime('now')
		  WHERE org_id = ? AND balance_mc >= ?`,
		amount, orgId, amount);
	return res.meta.changes === 1 ? amount : 0;
}

/** Give back an unused hold (the call failed before anything was spent). */
export async function release(db: Db, orgId: string, mc: number): Promise<void> {
	await dbRun(db, 'UPDATE ai_accounts SET balance_mc = balance_mc + ? WHERE org_id = ?', mc, orgId);
}

/** Replace a hold with the real charge and record it. */
export async function settle(
	db: Db,
	orgId: string,
	heldMc: number,
	charge: { mc: number; userId: string; feature: string; model: string; inputTokens: number;
		cachedTokens: number; outputTokens: number; costUsdMicro: number;
		/** The conversation and the question this call served, for the activity list. */
		threadId?: string | null; turnId?: string | null }
): Promise<void> {
	await dbRun(db, 'UPDATE ai_accounts SET balance_mc = balance_mc + ? WHERE org_id = ?', heldMc - charge.mc, orgId);
	await ledger(db, {
		orgId, kind: 'charge', amountMc: -charge.mc, userId: charge.userId, feature: charge.feature,
		model: charge.model, inputTokens: charge.inputTokens, cachedTokens: charge.cachedTokens,
		outputTokens: charge.outputTokens, costUsdMicro: charge.costUsdMicro,
		threadId: charge.threadId, turnId: charge.turnId
	});
}

/**
 * Credit a purchase exactly once. The ledger row goes in first and carries the
 * Stripe session id under a unique index, so a webhook delivered twice adds the
 * credits once.
 */
export async function grantPurchase(db: Db, orgId: string, credits: number, ref: string, userId: string | null): Promise<boolean> {
	await dbRun(db, 'INSERT OR IGNORE INTO ai_accounts (org_id) VALUES (?)', orgId);
	try {
		await ledger(db, { orgId, kind: 'purchase', amountMc: credits * MC, userId, feature: 'topup', ref });
	} catch {
		return false; // already credited
	}
	await dbRun(db,
		`UPDATE ai_accounts SET balance_mc = balance_mc + ?, purchased_mc = purchased_mc + ?, updated_at = datetime('now')
		  WHERE org_id = ?`,
		credits * MC, credits * MC, orgId);
	return true;
}

export async function setEnabled(db: Db, orgId: string, enabled: boolean, userId: string): Promise<void> {
	await dbRun(db, 'INSERT OR IGNORE INTO ai_accounts (org_id) VALUES (?)', orgId);
	await dbRun(db,
		`UPDATE ai_accounts SET enabled = ?, enabled_by = ?, enabled_at = datetime('now'), updated_at = datetime('now')
		  WHERE org_id = ?`,
		enabled ? 1 : 0, userId, orgId);
}

export interface LedgerRow {
	id: string; kind: string; amount_mc: number; feature: string | null; model: string | null;
	created_at: string; user_name: string | null;
}

export async function recentLedger(db: Db, orgId: string, limit = 50): Promise<LedgerRow[]> {
	return dbAll<LedgerRow>(db,
		`SELECT l.id, l.kind, l.amount_mc, l.feature, l.model, l.created_at,
		        NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '') AS user_name
		   FROM ai_ledger l LEFT JOIN users u ON u.id = l.user_id
		  WHERE l.org_id = ? ORDER BY l.created_at DESC LIMIT ?`,
		orgId, limit);
}

export interface ActivityRow {
	id: string; kind: string; amount_mc: number; feature: string | null; created_at: string;
	user_id: string | null; user_name: string | null;
	/** Model calls in this row: one question can take several. */
	calls: number;
	thread_id: string | null; thread_title: string | null; thread_user_id: string | null;
}

/** A ledger timestamp bound for comparisons with `created_at` (SQLite's 'YYYY-MM-DD HH:MM:SS'). */
const sqlTime = (iso: string) => iso.replace('T', ' ').replace(/\.\d+Z$|Z$/, '');

/**
 * Credit activity for the settings page: one row per question (all the model calls
 * that answered it), plus grants, purchases and expiries. `since` limits it to the
 * current period, so the period's own grant cannot scroll out of view behind 50
 * single model calls, as it used to.
 */
export async function ledgerActivity(db: Db, orgId: string, opts: { since?: string | null; limit?: number } = {}): Promise<ActivityRow[]> {
	const limit = opts.limit ?? 200;
	const since = opts.since ? sqlTime(opts.since) : null;
	try {
		return await dbAll<ActivityRow>(db,
			`SELECT MIN(l.id) AS id, l.kind, SUM(l.amount_mc) AS amount_mc, MAX(l.feature) AS feature,
			        MAX(l.created_at) AS created_at, COUNT(*) AS calls, l.user_id,
			        NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '') AS user_name,
			        l.thread_id, t.title AS thread_title, t.user_id AS thread_user_id
			   FROM ai_ledger l
			   LEFT JOIN users u ON u.id = l.user_id
			   LEFT JOIN ai_threads t ON t.id = l.thread_id
			  WHERE l.org_id = ?${since ? ' AND l.created_at >= ?' : ''}
			  GROUP BY COALESCE(l.turn_id, l.id)
			  ORDER BY created_at DESC LIMIT ?`,
			...(since ? [orgId, since, limit] : [orgId, limit]));
	} catch {
		// Before migration 0015a: one row per call, as before.
		const rows = await recentLedger(db, orgId, limit);
		return rows.map((r) => ({ ...r, user_id: null, calls: 1, thread_id: null, thread_title: null, thread_user_id: null }));
	}
}

/** Credits spent in the current period, for the settings page. */
export async function spentThisPeriod(db: Db, acc: AiAccount): Promise<number> {
	if (!acc.period_start) return 0;
	const start = acc.period_start.replace('T', ' ').replace(/\.\d+Z$|Z$/, '');
	const row = await dbFirst<{ mc: number | null }>(db,
		"SELECT -SUM(amount_mc) AS mc FROM ai_ledger WHERE org_id = ? AND kind = 'charge' AND created_at >= ?",
		acc.org_id, start);
	return row?.mc ?? 0;
}

/**
 * Whether the floating assistant should appear for this request. Runs on every
 * page load, so it is cheap first: configuration and the org's switch (one indexed
 * read, no refill) before the member's permission. Never throws — a database
 * without migration 0012 simply has no assistant.
 */
export async function assistantVisible(locals: App.Locals): Promise<boolean> {
	const org = locals.currentOrg;
	if (!locals.user || !org || locals.domainOrg || org.impersonated || locals.user.account_type === 'client') return false;
	try {
		if (!aiConfigured()) return false;
		if (!(await loadAiPlatform(locals.db)).enabled) return false;
		const acc = await dbFirst<{ enabled: number }>(locals.db, 'SELECT enabled FROM ai_accounts WHERE org_id = ?', org.id);
		if (!acc?.enabled) return false;
		return await memberCan(locals, 'ai.use');
	} catch {
		return false;
	}
}
