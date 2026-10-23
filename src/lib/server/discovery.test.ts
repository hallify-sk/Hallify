import { describe, expect, it } from 'vitest';
import { venueSiteOrigin } from './discovery';

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
