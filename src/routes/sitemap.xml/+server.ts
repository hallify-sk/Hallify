import { dbAll } from '$lib/db/index';
import type { RequestHandler } from './$types';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function urlEntry(loc: string, lastmod?: string | null, priority = '0.6'): string {
  return `  <url><loc>${esc(loc)}</loc>${lastmod ? `<lastmod>${esc(lastmod.slice(0, 10))}</lastmod>` : ''}<priority>${priority}</priority></url>`;
}

/** Two shapes, because the same code serves two very different surfaces:
 *  - On an org bubble: that venue's own public halls (its storefront).
 *  - On the apex: the marketing page, its EN variant, and the legal documents.
 *  Only `is_public` halls are listed, and bubble output is scoped to that org. */
export const GET: RequestHandler = async ({ url, locals }) => {
  const origin = url.origin;
  const entries: string[] = [];

  if (locals.domainOrg) {
    entries.push(urlEntry(`${origin}/halls`, null, '0.9'));
    const halls = await dbAll<{ slug: string; created_at: string }>(
      locals.db,
      'SELECT slug, created_at FROM halls WHERE org_id = ? AND is_public = 1 AND slug IS NOT NULL ORDER BY created_at DESC',
      locals.domainOrg.id
    );
    for (const h of halls) entries.push(urlEntry(`${origin}/halls/${h.slug}`, h.created_at, '0.8'));
  } else {
    entries.push(urlEntry(`${origin}/`, null, '1.0'));
    entries.push(urlEntry(`${origin}/?lang=en`, null, '0.9'));
    for (const p of ['/terms', '/privacy', '/dpa']) entries.push(urlEntry(`${origin}${p}`, null, '0.3'));
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>
`;

  return new Response(xml, {
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
};
