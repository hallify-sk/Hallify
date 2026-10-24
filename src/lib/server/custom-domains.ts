// Custom-domain verification against Cloudflare for SaaS (D9).
//
// A domain is served (hooks.server.ts) only while `verified_at` is set, and it is set
// only when Cloudflare reports both the hostname and its certificate active. Each check
// also stores what the settings page shows: the DNS records Cloudflare asks for, the
// last status, and Cloudflare's own explanation of what is missing.
//
// Checks run when the owner presses "Check status", while the settings page is open
// (it re-checks pending domains on its own), and from the hourly Cron Trigger, which
// also releases claims nobody verified within UNVERIFIED_CLAIM_DAYS.
import type { D1Database } from '@cloudflare/workers-types';
import { dbAll, dbRun } from '$lib/db/index';
import { dispatchPlatformEvent } from '$lib/server/platform-webhooks';
import {
	addCustomHostname, deleteCustomHostname, findCustomHostname, getHostnameStatus,
	isCFEnabled, cnameTarget, CFApiError, type CFHostname,
} from '$lib/cloudflare-saas';
import { claimExpired, dnsRecordsFor, hostnameProblems, judgeHostname } from '$lib/custom-domain';

export interface DomainCheckRow {
	id: string;
	org_id: string;
	domain: string;
	cf_hostname_id: string | null;
	verified_at: string | null;
	created_at: string;
}

export interface DomainCheckResult {
	/** False when Cloudflare could not be asked (not configured, API down); nothing
	 *  about the domain's verification changed. */
	ok: boolean;
	verified: boolean;
	error?: string;
}

/** Cloudflare's hostname record for the row, registering one when the row has none
 *  (added before Cloudflare was configured) or Cloudflare lost it. */
async function hostnameFor(db: D1Database, row: DomainCheckRow): Promise<CFHostname> {
	if (row.cf_hostname_id) {
		try {
			return await getHostnameStatus(row.cf_hostname_id);
		} catch (e) {
			if (!(e instanceof CFApiError && e.status === 404)) throw e;
			// Deleted on Cloudflare's side: register it again below.
		}
	}
	let cf: CFHostname;
	try {
		cf = await addCustomHostname(row.domain);
	} catch (e) {
		// Already registered (a leftover from an earlier row): adopt it.
		const found = await findCustomHostname(row.domain).catch(() => null);
		if (!found) throw e;
		cf = found;
	}
	await dbRun(db, 'UPDATE custom_domains SET cf_hostname_id = ? WHERE id = ?', cf.id, row.id);
	row.cf_hostname_id = cf.id;
	return cf;
}

/** Ask Cloudflare about one domain and record the answer. Never throws. */
export async function checkCustomDomain(db: D1Database, row: DomainCheckRow): Promise<DomainCheckResult> {
	if (!isCFEnabled()) return { ok: false, verified: !!row.verified_at };
	let cf: CFHostname;
	try {
		cf = await hostnameFor(db, row);
	} catch (e) {
		const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500);
		await dbRun(db, `UPDATE custom_domains SET check_error = ?, checked_at = datetime('now') WHERE id = ?`, msg, row.id).catch(() => {});
		return { ok: false, verified: !!row.verified_at, error: msg };
	}

	const verdict = judgeHostname(cf);
	const verified = verdict === 'live' || (verdict === 'pending' && !!row.verified_at);
	const problems = hostnameProblems(cf);
	await dbRun(db,
		`UPDATE custom_domains
		    SET cf_status = ?, ssl_status = ?, dns_records = ?, check_error = ?, checked_at = datetime('now'),
		        verified_at = CASE WHEN ? THEN COALESCE(verified_at, datetime('now')) ELSE NULL END
		  WHERE id = ?`,
		cf.status ?? null, cf.ssl?.status ?? null,
		JSON.stringify(dnsRecordsFor(row.domain, cnameTarget(), cf)),
		verified ? null : problems,
		verified ? 1 : 0,
		row.id);
	// Platform webhooks on a change only: a domain went live, or a live one stopped.
	if (verified && !row.verified_at) {
		dispatchPlatformEvent(db, 'custom_domain.verified', { org_id: row.org_id, domain_id: row.id, domain: row.domain });
	} else if (!verified && row.verified_at) {
		dispatchPlatformEvent(db, 'custom_domain.failed', { org_id: row.org_id, domain_id: row.id, domain: row.domain, reason: 'unverified', problem: problems?.slice(0, 300) ?? null });
	}
	return { ok: true, verified, error: verified ? undefined : problems ?? undefined };
}

/** Register a newly added domain with Cloudflare and store the records to show.
 *  Throws the Cloudflare error so the add form can report it. */
export async function registerCustomDomain(db: D1Database, row: DomainCheckRow): Promise<void> {
	if (!isCFEnabled()) {
		// Still show the CNAME the venue will need; nothing can verify it on this server.
		await dbRun(db, 'UPDATE custom_domains SET dns_records = ? WHERE id = ?',
			JSON.stringify(dnsRecordsFor(row.domain, cnameTarget())), row.id);
		return;
	}
	const cf = await hostnameFor(db, row);
	await dbRun(db,
		`UPDATE custom_domains SET cf_status = ?, ssl_status = ?, dns_records = ?, check_error = NULL, checked_at = datetime('now') WHERE id = ?`,
		cf.status ?? null, cf.ssl?.status ?? null, JSON.stringify(dnsRecordsFor(row.domain, cnameTarget(), cf)), row.id);
}

/** Forget a domain on Cloudflare's side (best-effort) and delete the row. */
export async function releaseCustomDomain(db: D1Database, row: Pick<DomainCheckRow, 'id' | 'cf_hostname_id'>): Promise<void> {
	if (row.cf_hostname_id && isCFEnabled()) {
		try { await deleteCustomHostname(row.cf_hostname_id); } catch { /* best-effort */ }
	}
	await dbRun(db, 'DELETE FROM custom_domains WHERE id = ?', row.id);
}

/** Re-check pending domains of one organisation that were not checked in the last
 *  `staleSeconds`, at most `limit` of them: what keeps the settings page current
 *  while it is open. */
export async function refreshPendingDomains(db: D1Database, orgId: string, staleSeconds = 30, limit = 5): Promise<number> {
	if (!isCFEnabled()) return 0;
	const rows = await dbAll<DomainCheckRow>(db,
		`SELECT id, org_id, domain, cf_hostname_id, verified_at, created_at FROM custom_domains
		  WHERE org_id = ? AND verified_at IS NULL
		    AND (checked_at IS NULL OR checked_at < datetime('now', ?))
		  ORDER BY checked_at IS NOT NULL, checked_at LIMIT ?`,
		orgId, `-${staleSeconds} seconds`, limit);
	for (const row of rows) await checkCustomDomain(db, row);
	return rows.length;
}

export interface DomainSweep {
	checked: number;
	verified: number;
	unverified: number;
	expired: number;
}

/** The hourly pass: check every pending domain (oldest check first), re-check verified
 *  ones once a day so a domain whose DNS moved away stops being served, and release
 *  unverified claims older than UNVERIFIED_CLAIM_DAYS. A claim is released only right
 *  after a successful check that found it still not live, so a Cloudflare outage or a
 *  missing API token never deletes anything. Bounded per run to stay well inside the
 *  Worker's subrequest limit. */
export async function sweepCustomDomains(db: D1Database, now: Date = new Date(), limit = 40): Promise<DomainSweep> {
	const out: DomainSweep = { checked: 0, verified: 0, unverified: 0, expired: 0 };
	if (!isCFEnabled()) return out;

	const pending = await dbAll<DomainCheckRow>(db,
		`SELECT id, org_id, domain, cf_hostname_id, verified_at, created_at FROM custom_domains
		  WHERE verified_at IS NULL
		  ORDER BY checked_at IS NOT NULL, checked_at LIMIT ?`, limit);
	for (const row of pending) {
		const r = await checkCustomDomain(db, row);
		out.checked++;
		if (!r.ok) continue;
		if (r.verified) { out.verified++; continue; }
		if (claimExpired(row.created_at, now)) {
			await releaseCustomDomain(db, row);
			out.expired++;
			dispatchPlatformEvent(db, 'custom_domain.failed', { org_id: row.org_id, domain_id: row.id, domain: row.domain, reason: 'expired', problem: r.error?.slice(0, 300) ?? null });
		}
	}

	const room = Math.max(0, limit - pending.length);
	if (room > 0) {
		const live = await dbAll<DomainCheckRow>(db,
			`SELECT id, org_id, domain, cf_hostname_id, verified_at, created_at FROM custom_domains
			  WHERE verified_at IS NOT NULL AND (checked_at IS NULL OR checked_at < datetime('now', '-1 day'))
			  ORDER BY checked_at IS NOT NULL, checked_at LIMIT ?`, room);
		for (const row of live) {
			const r = await checkCustomDomain(db, row);
			out.checked++;
			if (r.ok && !r.verified) out.unverified++;
		}
	}
	return out;
}
