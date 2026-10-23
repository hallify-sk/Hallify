import { dbAll } from '$lib/db/index';
import { LISTED_HALL_SQL } from './discovery';
import { venuePagePath } from '$lib/marketing/types';
import { parseDbTime } from '$lib/format';

/**
 * robots.txt as one `User-agent: *` group. A crawler follows only the most specific
 * group that matches it, so splitting the rules across several groups for the same
 * agent silently drops some of them. Hall photos are allowed ahead of the broader
 * `Disallow: /uploads/`; the longer match wins, so venue photos can appear in image
 * search while other uploads stay out.
 */
export function robotsBody(origin: string, onVenueSite: boolean): string {
  return [
    'User-agent: *',
    'Allow: /uploads/halls/',
    // Never index the authenticated app, API, other uploads or one-time token links.
    'Disallow: /app/',
    'Disallow: /api/',
    'Disallow: /uploads/',
    'Disallow: /invite/',
    'Disallow: /rsvp/',
    'Disallow: /reset-password/',
    'Disallow: /forgot-password/',
    'Disallow: /login',
    'Disallow: /logout',
    // A venue site's signed-in client pages.
    ...(onVenueSite ? ['Disallow: /halls/my-reservations', 'Disallow: /halls/messages'] : []),
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

/** W3C date (YYYY-MM-DD) of a database timestamp, read as UTC; null when unreadable. */
export function lastmodOf(value: string | null | undefined): string | null {
  const date = parseDbTime(value ?? null);
  return date ? date.toISOString().slice(0, 10) : null;
}

export interface SitemapEntry { loc: string; lastmod?: string | null; priority: string }

export function sitemapXml(entries: SitemapEntry[]): string {
  const lines = entries.map(({ loc, lastmod, priority }) =>
    `  <url><loc>${esc(loc)}</loc>${lastmod ? `<lastmod>${esc(lastmod)}</lastmod>` : ''}<priority>${priority}</priority></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${lines.join('\n')}
</urlset>
`;
}

/** The newest of some dates, for a list page whose content is those items. */
function newest(dates: (string | null)[]): string | null {
  return dates.filter((d): d is string => !!d).sort().at(-1) ?? null;
}

type HallStamp = { slug: string; org_slug: string; changed: string | null };

/**
 * Halls with their last-change time. `updated_at` arrives with migration 0020; until
 * it has been applied the creation time stands in, rather than the sitemap failing.
 */
async function stampedHalls(db: App.Locals['db'], where: string, ...params: unknown[]): Promise<HallStamp[]> {
  const query = (changed: string) => `SELECT h.slug, o.slug AS org_slug, ${changed} AS changed
      FROM halls h JOIN organizations o ON o.id = h.org_id
     WHERE ${where}
     ORDER BY h.created_at DESC`;
  try {
    return await dbAll<HallStamp>(db, query('COALESCE(h.updated_at, h.created_at)'), ...params);
  } catch (error) {
    const message = error instanceof Error ? `${error.message} ${error.cause instanceof Error ? error.cause.message : ''}` : String(error);
    if (!/no such column:\s*(?:h\.)?updated_at/i.test(message)) throw error;
    return dbAll<HallStamp>(db, query('h.created_at'), ...params);
  }
}

/** A venue's own site: its hall list and each hall it shows the public. */
export async function venueSiteEntries(db: App.Locals['db'], origin: string, orgId: string): Promise<SitemapEntry[]> {
  // The same halls the venue site itself shows: public, with a slug, and not locked
  // by a plan downgrade (a locked hall's page answers 404).
  const halls = await stampedHalls(db,
    'h.org_id = ? AND h.is_public = 1 AND h.plan_locked = 0 AND h.slug IS NOT NULL', orgId);
  const stamps = halls.map(h => lastmodOf(h.changed));
  return [
    { loc: `${origin}/halls`, lastmod: newest(stamps), priority: '0.9' },
    ...halls.map((h, i) => ({ loc: `${origin}/halls/${encodeURIComponent(h.slug)}`, lastmod: stamps[i], priority: '0.8' })),
  ];
}

/** The apex: marketing pages, the directory and every listed venue page. */
export async function apexEntries(db: App.Locals['db'], origin: string): Promise<SitemapEntry[]> {
  const halls = await stampedHalls(db, LISTED_HALL_SQL);
  const stamps = halls.map(h => lastmodOf(h.changed));
  const directoryChanged = newest(stamps);
  return [
    { loc: `${origin}/`, lastmod: directoryChanged, priority: '1.0' },
    { loc: `${origin}/?lang=en`, lastmod: directoryChanged, priority: '0.9' },
    { loc: `${origin}/pre-prevadzkovatelov`, priority: '0.9' },
    { loc: `${origin}/pre-prevadzkovatelov?lang=en`, priority: '0.8' },
    { loc: `${origin}/priestory`, lastmod: directoryChanged, priority: '0.9' },
    { loc: `${origin}/priestory?lang=en`, lastmod: directoryChanged, priority: '0.8' },
    ...halls.map((h, i) => ({ loc: `${origin}${venuePagePath(h.org_slug, h.slug)}`, lastmod: stamps[i], priority: '0.7' })),
    ...['/terms', '/privacy', '/dpa'].map(path => ({ loc: `${origin}${path}`, priority: '0.3' })),
  ];
}
