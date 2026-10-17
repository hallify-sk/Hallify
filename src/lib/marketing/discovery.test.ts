import { describe, expect, it } from 'vitest';
import { DEFAULT_CENTER, demoVenues, destination, distanceKm, filterVenues, featuredVenues } from './discovery';

describe('venue explorer', () => {
  it('places every sample within 50 km and retains a clear demo flag', () => {
    for (const center of [DEFAULT_CENTER, { latitude: 0, longitude: 179.9 }, { latitude: -33.86, longitude: 151.2 }]) {
      const venues = demoVenues(center);
      expect(venues).toHaveLength(7);
      for (const venue of venues) { expect(venue.demo).toBe(true); expect(distanceKm(center, venue as { latitude: number; longitude: number })).toBeLessThan(50); }
    }
  });
  it('measures a destination by distance without longitude wrap errors', () => {
    expect(distanceKm(DEFAULT_CENTER, destination(DEFAULT_CENTER, 50, 270))).toBeCloseTo(50, 6);
  });
  it('features only partners, and ranks by distance from the given location', () => {
    const venues = demoVenues();
    const here = { latitude: 50.0755, longitude: 14.4378 };
    expect(featuredVenues(venues, here).map(v => v.id)).toEqual(['demo-0','demo-2','demo-4']);
    expect(featuredVenues(venues, here).some(v => v.id === 'demo-1')).toBe(false);
    expect(featuredVenues(venues.map(v => ({ ...v, is_partner:false })), here)).toEqual([]);
    // Distance ranking needs coordinates; a partner without a pin cannot be ranked.
    expect(featuredVenues(venues.map(v => ({ ...v, latitude:null })), here)).toEqual([]);
  });
  it('rotates fairly instead of favouring the alphabet when no location is known', () => {
    const venues = demoVenues();
    const partners = venues.filter(v => v.is_partner).length;
    expect(partners).toBeGreaterThan(3);

    // Stable for a given day, so SSR and hydration agree.
    expect(featuredVenues(venues, null, { seed: 7 }).map(v => v.id))
      .toEqual(featuredVenues(venues, null, { seed: 7 }).map(v => v.id));

    // Over a full cycle of days every partner gets a turn in the strip.
    const seen = new Set<string>();
    for (let seed = 0; seed < partners; seed += 1) {
      for (const venue of featuredVenues(venues, null, { seed })) seen.add(venue.id);
    }
    expect(seen.size).toBe(partners);

    // A partner with no coordinates is still eligible when nothing is being measured.
    expect(featuredVenues(venues.map(v => ({ ...v, latitude:null })), null, { seed: 0 })).toHaveLength(3);
    expect(featuredVenues(venues.map(v => ({ ...v, is_partner:false })), null, { seed: 0 })).toEqual([]);
  });
  it('filters by price band and never treats an unstated band as cheap', () => {
    const venues = demoVenues();
    const base = { query: '', guests: 0, floorplan: false, booking: false };
    const cheap = filterVenues(venues, { ...base, bands: [1] });
    expect(cheap.length).toBeGreaterThan(0);
    expect(cheap.every(v => v.price_band === 1)).toBe(true);
    expect(filterVenues(venues.map(v => ({ ...v, price_band: null })), { ...base, bands: [1,2,3] })).toEqual([]);
    expect(filterVenues(venues, { ...base, bands: [] })).toHaveLength(venues.length);
  });
  it('changes featured order for the viewer location without mutating the list', () => {
    const venues = demoVenues(), ids = venues.map(v => v.id);
    const nearest = venues.find(v => v.id === 'demo-5')!;
    expect(featuredVenues(venues, nearest as {latitude:number;longitude:number})[0].id).toBe('demo-5');
    expect(venues.map(v => v.id)).toEqual(ids);
  });
  it('combines accent-insensitive search, capacity and actual feature filters', () => {
    const venues = demoVenues();
    const base = { query: 'galeria', guests: 150, floorplan: true, booking: true };
    expect(filterVenues(venues, base).map(v => v.name)).toEqual(['Mestská galéria']);
    expect(filterVenues(venues, { ...base, guests: 200 })).toEqual([]);
    expect(filterVenues(venues, { query: '', guests: 0, floorplan: false, booking: false, center: DEFAULT_CENTER, radius: 10 })).toHaveLength(2);
  });
});
