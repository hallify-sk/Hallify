import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dbAll } from '$lib/db/index';
import { applyDiscoveryMigrations } from './discovery-migrations';
import { publicVenues } from './public-venues';

vi.mock('./discovery-migrations', () => ({ applyDiscoveryMigrations: vi.fn() }));
vi.mock('$lib/db/index', () => ({ dbAll: vi.fn(), fromJsonArr: (value: string) => JSON.parse(value) }));
const db = {} as App.Locals['db'];

beforeEach(() => { vi.resetAllMocks(); });

describe('public venue migration compatibility', () => {
  it('keeps the directory available without inventing locations or partners on the old schema', async () => {
    const warning = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(applyDiscoveryMigrations).mockRejectedValueOnce(new Error('Schema temporarily unavailable'));
    vi.mocked(dbAll).mockRejectedValueOnce(new Error('D1_ERROR: no such column: h.latitude: SQLITE_ERROR'));
    vi.mocked(dbAll).mockResolvedValueOnce([{ id: 'hall', amenities: '["parking"]', latitude: null, longitude: null, is_partner: 0 }]);
    const venues = await publicVenues(db);
    expect(venues[0]).toMatchObject({ latitude: null, longitude: null, is_partner: false, amenities: ['parking'] });
    const fallbackSql = vi.mocked(dbAll).mock.calls[1][1];
    expect(fallbackSql).toContain('h.is_public = 1 AND h.plan_locked = 0 AND h.archived_at IS NULL');
    expect(fallbackSql).toContain('o.suspended_at IS NULL');
    // Without coordinates, an address is what makes a hall complete enough to list.
    expect(fallbackSql).toContain("TRIM(COALESCE(h.address, '')) != ''");
    expect(fallbackSql).toContain('NULL AS latitude');
    warning.mockRestore();
  });

  it('retries the real directory query after completing the additive migrations', async () => {
    vi.mocked(dbAll).mockRejectedValueOnce(new Error('no such column: o.is_hallify_partner'));
    vi.mocked(applyDiscoveryMigrations).mockResolvedValueOnce();
    vi.mocked(dbAll).mockResolvedValueOnce([{ id: 'hall', amenities: '[]', latitude: 50, longitude: 14, is_partner: 1 }]);
    const ready = vi.fn();
    const venues = await publicVenues(db, ready);
    expect(applyDiscoveryMigrations).toHaveBeenCalledWith(db);
    expect(venues[0]).toMatchObject({ latitude: 50, longitude: 14, is_partner: true });
    expect(ready).toHaveBeenCalledWith(true);
  });

  it('lists only halls complete enough to show: a slug and an address or a map position', async () => {
    vi.mocked(dbAll).mockResolvedValueOnce([]);
    await publicVenues(db);
    const sql = vi.mocked(dbAll).mock.calls[0][1];
    expect(sql).toContain("h.slug IS NOT NULL AND TRIM(h.slug) != ''");
    expect(sql).toContain('h.latitude IS NOT NULL AND h.longitude IS NOT NULL');
    expect(sql).toContain('h.plan_locked = 0');
    expect(sql).toContain('o.suspended_at IS NULL');
  });

  it('points each venue at its own site, where it is booked', async () => {
    vi.mocked(dbAll).mockResolvedValueOnce([
      { id: 'a', slug: 'sala', org_slug: 'kastiel', amenities: '[]', is_partner: 0, custom_domain: null, plan: 'free' },
      { id: 'b', slug: 'sala', org_slug: 'reduta', amenities: '[]', is_partner: 1, custom_domain: 'reduta.sk', plan: 'starter' },
      { id: 'c', slug: 'sala', org_slug: 'mlyn', amenities: '[]', is_partner: 0, custom_domain: 'mlyn.sk', plan: 'free' },
    ]);
    const venues = await publicVenues(db, undefined, { url: new URL('https://hallify.sk/priestory'), appDomain: 'hallify.sk' });
    expect(venues.map(v => v.site_url)).toEqual(['https://kastiel.hallify.sk', 'https://reduta.sk', 'https://mlyn.hallify.sk']);
    // The plan and the raw domain are inputs, not something the page needs to carry.
    expect(venues[0]).not.toHaveProperty('plan');
    expect(venues[0]).not.toHaveProperty('custom_domain');
  });

  it('does not suppress unrelated database failures', async () => {
    const error = new Error('D1_ERROR: database unavailable');
    vi.mocked(dbAll).mockRejectedValueOnce(error);
    await expect(publicVenues(db)).rejects.toBe(error);
    expect(dbAll).toHaveBeenCalledTimes(1);
  });
});
