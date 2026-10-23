import { OPERATOR } from '$lib/legal';

/** The body of /.well-known/security.txt (RFC 9116). Contact and Expires are the
 *  required fields; Expires is kept 360 days ahead of `now` (the RFC asks for less
 *  than a year). */
export function securityTxt(origin: string, now: Date = new Date()): string {
	const expires = new Date(now.getTime() + 360 * 24 * 60 * 60 * 1000);
	expires.setUTCHours(0, 0, 0, 0);
	return [
		`Contact: mailto:${OPERATOR.contactEmail}`,
		`Expires: ${expires.toISOString()}`,
		'Preferred-Languages: sk, en',
		`Canonical: ${origin}/.well-known/security.txt`,
		'',
	].join('\n');
}
