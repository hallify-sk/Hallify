import { describe, expect, it } from 'vitest';
import { isBookableOn, parseSearchDate, venueSiteOrigin, type AvailabilityFacts } from './discovery';

describe('directory date filter', () => {
  it('accepts only real dates from today up to two years ahead', () => {
    expect(parseSearchDate('2026-11-14', '2026-10-23')).toBe('2026-11-14');
    expect(parseSearchDate('2026-10-23', '2026-10-23')).toBe('2026-10-23');
    expect(parseSearchDate('2026-10-22', '2026-10-23')).toBeNull();
    expect(parseSearchDate('2026-02-31', '2026-01-01')).toBeNull();
    expect(parseSearchDate('2031-01-01', '2026-10-23')).toBeNull();
    expect(parseSearchDate('14.11.2026', '2026-10-23')).toBeNull();
    expect(parseSearchDate(null)).toBeNull();
  });

  const free: AvailabilityFacts = { min_days_advance: 0, opening_hours: null, month_count: 0, month_limit: -1, taken: false, blocks: [] };
  const far = '2099-06-13'; // a Saturday

  it('applies the rules the booking form applies', () => {
    expect(isBookableOn(free, far)).toBe(true);
    expect(isBookableOn({ ...free, taken: true }, far)).toBe(false);
    expect(isBookableOn({ ...free, month_limit: 5, month_count: 5 }, far)).toBe(false);
    expect(isBookableOn({ ...free, month_limit: 5, month_count: 4 }, far)).toBe(true);
    expect(isBookableOn({ ...free, opening_hours: JSON.stringify({ sat: { open: false, from: '', to: '' } }) }, far)).toBe(false);
    expect(isBookableOn({ ...free, blocks: [{ block_type: 'weekly', date_from: null, date_to: null, days_of_week: [6] }] }, far)).toBe(false);
    expect(isBookableOn({ ...free, min_days_advance: 400000 }, far)).toBe(false);
  });
});

const prod = new URL('https://hallify.sk/priestory');

describe('venue site origin', () => {
  it('uses the free subdomain by default', () => {
    expect(venueSiteOrigin({ slug: 'kastiel' }, prod, 'hallify.sk')).toBe('https://kastiel.hallify.sk');
  });
  it('uses a custom domain only while the plan includes one', () => {
    expect(venueSiteOrigin({ slug: 'reduta', custom_domain: 'reduta.sk', plan: 'professional' }, prod, 'hallify.sk')).toBe('https://reduta.sk');
    expect(venueSiteOrigin({ slug: 'reduta', custom_domain: 'reduta.sk', plan: 'free' }, prod, 'hallify.sk')).toBe('https://reduta.hallify.sk');
  });
  it('keeps the development port and scheme on localhost', () => {
    expect(venueSiteOrigin({ slug: 'kastiel' }, new URL('http://localhost:5173/'), 'localhost')).toBe('http://kastiel.localhost:5173');
  });
  it('never invents an address that would not route', () => {
    expect(venueSiteOrigin({ slug: 'www' }, prod, 'hallify.sk')).toBeNull();
    expect(venueSiteOrigin({ slug: null }, prod, 'hallify.sk')).toBeNull();
    expect(venueSiteOrigin({ slug: 'a/b' }, prod, 'hallify.sk')).toBeNull();
  });
});
