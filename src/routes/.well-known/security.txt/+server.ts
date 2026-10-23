import type { RequestHandler } from './$types';
import { securityTxt } from '$lib/security-txt';

/** RFC 9116. Served from code rather than static/ so the mandatory Expires field
 *  is always about a year ahead and never goes stale in a forgotten file. */
export const GET: RequestHandler = ({ url }) =>
	new Response(securityTxt(url.origin), {
		headers: {
			'content-type': 'text/plain; charset=utf-8',
			'cache-control': 'public, max-age=86400',
		},
	});
