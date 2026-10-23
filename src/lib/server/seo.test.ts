import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { dbAll } from '$lib/db/index';
import { apexEntries, lastmodOf, robotsBody, sitemapXml, venueSiteEntries } from './seo';

vi.mock('$lib/db/index', () => ({ dbAll: vi.fn() }));
const db = {} as App.Locals['db'];

beforeEach(() => { vi.resetAllMocks(); });

describe('robots.txt', () => {
  it('is one group for every crawler, with hall photos allowed and the rest of uploads not', () => {
    const body = robotsBody('https://hallify.sk', false);
    expect(body.match(/^User-agent:/gm)).toHaveLength(1);
    expect(body.indexOf('Allow: /uploads/halls/')).toBeLessThan(body.indexOf('Disallow: /uploads/'));
    expect(body).toContain('Disallow: /app/');
    expect(body).toContain('Sitemap: https://hallify.sk/sitemap.xml');
    expect(body).not.toContain('/halls/my-reservations');
    expect(robotsBody('https://reduta.hallify.sk', true)).toContain('Disallow: /halls/my-reservations');
  });
});

describe('sitemaps', () => {
  it('reads database timestamps as UTC dates', () => {
    expect(lastmodOf('2026-03-31 23:30:00')).toBe('2026-03-31');
    expect(lastmodOf(null)).toBeNull();
  });

  it('escapes locations', () => {
    expect(sitemapXml([{ loc: 'https://x.sk/?a=1&b=2', priority: '0.5' }])).toContain('<loc>https://x.sk/?a=1&amp;b=2</loc>');
  });

  it('lists every listed venue page on the apex, with its last change', async () => {
    vi.mocked(dbAll).mockResolvedValueOnce([
      { slug: 'velka-sala', org_slug: 'kastiel', changed: '2026-10-01 08:00:00' },
      { slug: 'terasa', org_slug: 'reduta', changed: '2026-10-20 08:00:00' },
    ]);
    const entries = await apexEntries(db, 'https://hallify.sk');
    expect(entries).toContainEqual({ loc: 'https://hallify.sk/priestory/kastiel/velka-sala', lastmod: '2026-10-01', priority: '0.7' });
    expect(entries.find(e => e.loc === 'https://hallify.sk/priestory')?.lastmod).toBe('2026-10-20');
    expect(vi.mocked(dbAll).mock.calls[0][1]).toContain('h.plan_locked = 0');
  });

  it('falls back to the creation time until the updated_at migration has run', async () => {
    vi.mocked(dbAll).mockRejectedValueOnce(new Error('D1_ERROR: no such column: h.updated_at: SQLITE_ERROR'));
    vi.mocked(dbAll).mockResolvedValueOnce([{ slug: 'sala', org_slug: 'x', changed: '2026-01-02 00:00:00' }]);
    const entries = await venueSiteEntries(db, 'https://x.hallify.sk', 'org');
    expect(vi.mocked(dbAll).mock.calls[1][1]).toContain('h.created_at AS changed');
    expect(entries).toContainEqual({ loc: 'https://x.hallify.sk/halls/sala', lastmod: '2026-01-02', priority: '0.8' });
    // A plan-locked hall's page answers 404, so the venue sitemap leaves it out.
    expect(vi.mocked(dbAll).mock.calls[0][1]).toContain('h.plan_locked = 0');
  });
});

describe('migration 0020: halls.updated_at', () => {
  const databases: DatabaseSync[] = [];
  afterEach(() => { for (const database of databases.splice(0)) database.close(); });

  function database() {
    const sqlite = new DatabaseSync(':memory:'); databases.push(sqlite);
    sqlite.exec(readFileSync(new URL('../../../migrations/0001_baseline.sql', import.meta.url), 'utf8'));
    sqlite.exec("INSERT INTO organizations(id,name,slug) VALUES ('org','Venue','venue')");
    sqlite.exec("INSERT INTO halls(id,org_id,name,created_at) VALUES ('old','org','Old hall','2020-01-01 10:00:00')");
    sqlite.exec(readFileSync(new URL('../../../migrations/0020_hall_updated_at.sql', import.meta.url), 'utf8'));
    return sqlite;
  }
  const stamp = (sqlite: DatabaseSync, id: string) =>
    (sqlite.prepare('SELECT updated_at FROM halls WHERE id = ?').get(id) as { updated_at: string | null }).updated_at;

  it('back-fills existing halls from their creation time', () => {
    expect(stamp(database(), 'old')).toBe('2020-01-01 10:00:00');
  });

  it('stamps new halls, and any later change, without recursing', () => {
    const sqlite = database();
    sqlite.exec('PRAGMA recursive_triggers = ON');
    sqlite.exec("INSERT INTO halls(id,org_id,name,created_at) VALUES ('new','org','New hall','2021-05-05 05:05:05')");
    expect(stamp(sqlite, 'new')).toBe('2021-05-05 05:05:05');
    sqlite.exec("UPDATE halls SET name = 'Renamed' WHERE id = 'old'");
    expect(stamp(sqlite, 'old')! > '2020-01-01 10:00:00').toBe(true);
    sqlite.exec("UPDATE halls SET name = 'Renamed again' WHERE id = 'old'");
    expect(stamp(sqlite, 'old')).not.toBeNull();
  });

  it('leaves an explicitly written updated_at alone', () => {
    const sqlite = database();
    sqlite.exec("UPDATE halls SET updated_at = '2022-02-02 02:02:02' WHERE id = 'old'");
    expect(stamp(sqlite, 'old')).toBe('2022-02-02 02:02:02');
  });
});
