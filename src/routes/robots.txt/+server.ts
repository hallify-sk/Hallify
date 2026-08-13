import type { RequestHandler } from './$types';

/** Served dynamically because the rules differ per surface: the apex is the marketing
 *  site and should be indexed, while an org bubble is a customer's own storefront —
 *  its public hall pages should be indexed, but never the app. */
export const GET: RequestHandler = ({ url }) => {
  const body = [
    'User-agent: *',
    // Never index the authenticated app, API, uploads or one-time token links.
    'Disallow: /app/',
    'Disallow: /api/',
    'Disallow: /uploads/',
    'Disallow: /invite/',
    'Disallow: /rsvp/',
    'Disallow: /reset-password/',
    'Disallow: /forgot-password/',
    'Disallow: /login',
    'Disallow: /logout',
    '',
    `Sitemap: ${url.origin}/sitemap.xml`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
};
