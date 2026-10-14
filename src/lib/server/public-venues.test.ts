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
    expect(fallbackSql).toContain('h.is_public = 1 AND h.plan_locked = 0 AND o.suspended_at IS NULL');
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

  it('does not suppress unrelated database failures', async () => {
    const error = new Error('D1_ERROR: database unavailable');
    vi.mocked(dbAll).mockRejectedValueOnce(error);
    await expect(publicVenues(db)).rejects.toBe(error);
    expect(dbAll).toHaveBeenCalledTimes(1);
  });
});
