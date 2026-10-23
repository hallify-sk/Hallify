import { apexEntries, sitemapXml, venueSiteEntries } from '$lib/server/seo';
import type { RequestHandler } from './$types';

/** Two shapes, because the same code serves two very different surfaces:
 *  - On an org bubble: that venue's own public halls (its storefront).
 *  - On the apex: the marketing pages, the directory, every listed venue page and
 *    the legal documents.
 *  Each hall carries its last change as <lastmod>. */
export const GET: RequestHandler = async ({ url, locals }) => {
  const entries = locals.domainOrg
    ? await venueSiteEntries(locals.db, url.origin, locals.domainOrg.id)
    : await apexEntries(locals.db, url.origin);

  return new Response(sitemapXml(entries), {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
};
