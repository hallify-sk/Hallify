import { parseDbTime } from './format';

// Custom domains typed by venue owners. The old check (/^[a-z0-9.-]+\.[a-z]{2,}$/)
// accepted '-bad-.sk' and 'a..b.sk', which no DNS will ever resolve.

/** How long an unverified claim blocks the same domain for everyone else. After
 *  this, another organisation can add it (the first one never pointed DNS at us,
 *  so it was not theirs to hold). */
export const UNVERIFIED_CLAIM_DAYS = 7;

/** What people paste: 'https://Rezervacie.Kastiel.sk/', 'www.kastiel.sk.' → the bare
 *  lower-case hostname. Does not validate. */
export function tidyDomain(raw: unknown): string {
	return String(raw ?? '')
		.trim()
		.toLowerCase()
		.replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
		.replace(/[/?#].*$/, '')
		.replace(/:\d+$/, '')
		.replace(/\.$/, '');
}

/** A real public hostname: 2+ labels, each 1-63 characters of a-z, 0-9 and inner
 *  hyphens, at most 253 characters, alphabetic top-level domain, not an IP address. */
export function isValidCustomDomain(domain: string): boolean {
	if (!domain || domain.length > 253) return false;
	const labels = domain.split('.');
	if (labels.length < 2) return false;
	for (const l of labels) {
		if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(l)) return false;
	}
	const tld = labels[labels.length - 1];
	return /^[a-z]{2,63}$/.test(tld) || /^xn--[a-z0-9-]{2,59}$/.test(tld);
}

/** True when an unverified claim is old enough to give up. `createdAt` is a SQLite
 *  UTC timestamp ('YYYY-MM-DD HH:MM:SS'). */
export function claimExpired(createdAt: string, now: Date = new Date()): boolean {
	const until = claimExpiresAt(createdAt);
	return !!until && now.getTime() > until.getTime();
}

/** When an unverified claim made at `createdAt` is released (null if unparseable). */
export function claimExpiresAt(createdAt: string): Date | null {
	const t = parseDbTime(createdAt);
	return t ? new Date(t.getTime() + UNVERIFIED_CLAIM_DAYS * 86_400_000) : null;
}

// ── Cloudflare for SaaS status (D9) ──────────────────────────────────────────

/** One record the venue creates at its DNS provider. */
export interface DnsRecord {
	type: 'CNAME' | 'TXT';
	name: string;
	value: string;
	/** routing: sends visitors to Hallify; ownership: proves the domain is theirs;
	 *  certificate: lets Cloudflare issue the SSL certificate. */
	purpose: 'routing' | 'ownership' | 'certificate';
}

/** The slice of a Cloudflare custom-hostname record these helpers read. */
export interface HostnameStatus {
	status: string;
	ssl?: {
		status?: string;
		validation_records?: { txt_name?: string; txt_value?: string }[];
		validation_errors?: { message: string }[];
	};
	verification_errors?: string[];
	ownership_verification?: { type?: string; name?: string; value?: string };
}

/** The records to show for `domain`: always the CNAME, plus whatever TXT records
 *  Cloudflare asked for (ownership, and certificate validation when it uses TXT). */
export function dnsRecordsFor(domain: string, target: string, cf?: HostnameStatus | null): DnsRecord[] {
	const records: DnsRecord[] = [{ type: 'CNAME', name: domain, value: target, purpose: 'routing' }];
	const own = cf?.ownership_verification;
	if (own?.name && own.value && (own.type ?? 'txt').toLowerCase() === 'txt') {
		records.push({ type: 'TXT', name: own.name, value: own.value, purpose: 'ownership' });
	}
	for (const v of cf?.ssl?.validation_records ?? []) {
		if (v.txt_name && v.txt_value && !records.some((r) => r.name === v.txt_name && r.value === v.txt_value)) {
			records.push({ type: 'TXT', name: v.txt_name, value: v.txt_value, purpose: 'certificate' });
		}
	}
	return records;
}

/** Stored dns_records JSON → records, tolerating junk. */
export function parseDnsRecords(json: string | null | undefined): DnsRecord[] {
	if (!json) return [];
	try {
		const v: unknown = JSON.parse(json);
		if (!Array.isArray(v)) return [];
		return v.filter((r): r is DnsRecord =>
			!!r && (r.type === 'CNAME' || r.type === 'TXT') && typeof r.name === 'string' && typeof r.value === 'string');
	} catch {
		return [];
	}
}

/** Hostname states in which Cloudflare routes traffic to us. */
const LIVE_HOSTNAME = new Set(['active', 'active_redeploying']);
/** Hostname states that mean the domain no longer reaches us (DNS moved away, removed,
 *  blocked). Anything else (pending, a certificate renewing) is not a reason to stop
 *  serving a domain that was already verified. */
const GONE_HOSTNAME = new Set(['moved', 'deleted', 'pending_deletion', 'blocked', 'pending_blocked']);
const GONE_SSL = new Set(['deleted', 'expired', 'inactive', 'deactivating']);

/** What a status check means for the domain:
 *   live    — hostname and certificate active: verified, serve the venue site;
 *   pending — not there yet (or a transient state): keep whatever it was;
 *   gone    — Cloudflare has no such hostname (null) or it moved away: not verified. */
export function judgeHostname(cf: HostnameStatus | null): 'live' | 'pending' | 'gone' {
	if (!cf) return 'gone';
	if (GONE_HOSTNAME.has(cf.status) || GONE_SSL.has(cf.ssl?.status ?? '')) return 'gone';
	if (LIVE_HOSTNAME.has(cf.status) && cf.ssl?.status === 'active') return 'live';
	return 'pending';
}

/** Cloudflare's own explanation of what is still missing, de-duplicated, or null. */
export function hostnameProblems(cf: HostnameStatus | null): string | null {
	if (!cf) return null;
	const msgs = [
		...(cf.verification_errors ?? []),
		...(cf.ssl?.validation_errors ?? []).map((e) => e?.message),
	].map((m) => String(m ?? '').trim()).filter(Boolean);
	return msgs.length ? [...new Set(msgs)].join(' · ').slice(0, 1000) : null;
}

/** What the settings page shows for one domain: verified (served), pending (waiting
 *  for DNS / the certificate), or not_configured (this server has no Cloudflare for
 *  SaaS credentials, so nothing can ever verify it — local development). */
export type DomainState = 'verified' | 'pending' | 'not_configured';

export function domainState(row: { verified_at: string | null }, cfEnabled: boolean): DomainState {
	if (row.verified_at) return 'verified';
	return cfEnabled ? 'pending' : 'not_configured';
}
