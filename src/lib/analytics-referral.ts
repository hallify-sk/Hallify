/**
 * Did this visit to a venue's site come from Hallify?
 *
 * True when the visitor arrived from Hallify's own domain (or one of its
 * subdomains other than the venue's) or followed a link tagged utm_source=hallify.
 * The answer is kept for the browser session, so a booking made several pages
 * later is still credited to Hallify. Only a boolean is stored, never the referrer.
 */
const KEY = 'hallify-ref';

export function isHallifyReferral(referrer: string, search: string, currentHost: string, hallifyHost: string): boolean {
	const utm = new URLSearchParams(search).get('utm_source');
	if (utm && utm.toLowerCase() === 'hallify') return true;
	if (!referrer) return false;
	let host: string;
	try { host = new URL(referrer).hostname.toLowerCase(); } catch { return false; }
	const apex = hallifyHost.toLowerCase().replace(/^www\./, '');
	if (host === currentHost.toLowerCase()) return false; // moving within the venue's own site
	return host === apex || host.endsWith(`.${apex}`);
}

export function cameFromHallify(hallifyHost: string | undefined): boolean {
	if (typeof window === 'undefined' || !hallifyHost) return false;
	try {
		if (sessionStorage.getItem(KEY) === '1') return true;
		const hit = isHallifyReferral(document.referrer, location.search, location.hostname, hallifyHost);
		if (hit) sessionStorage.setItem(KEY, '1');
		return hit;
	} catch {
		return isHallifyReferral(document.referrer, location.search, location.hostname, hallifyHost);
	}
}
