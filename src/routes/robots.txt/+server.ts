import { robotsBody } from '$lib/server/seo';
import type { RequestHandler } from './$types';

/** Served dynamically because the rules differ per surface: the apex is the marketing
 *  site and the directory, and should be indexed, while an org bubble is a customer's
 *  own storefront -- its public hall pages should be indexed, but never the app. */
export const GET: RequestHandler = ({ url, locals }) => new Response(robotsBody(url.origin, !!locals.domainOrg), {
  headers: {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'public, max-age=3600',
  },
});
