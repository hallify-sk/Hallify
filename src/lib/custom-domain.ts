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
	const t = Date.parse(createdAt.includes('T') ? createdAt : createdAt.replace(' ', 'T') + 'Z');
	if (Number.isNaN(t)) return false;
	return now.getTime() - t > UNVERIFIED_CLAIM_DAYS * 86_400_000;
}
