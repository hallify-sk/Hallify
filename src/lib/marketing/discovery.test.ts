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
  it('features only explicit partners and ranks the closest three', () => {
    const venues = demoVenues();
    expect(featuredVenues(venues).map(v => v.id)).toEqual(['demo-0','demo-2','demo-4']);
    expect(featuredVenues(venues).some(v => v.id === 'demo-1')).toBe(false);
    expect(featuredVenues(venues.map(v => ({ ...v, is_partner:false })))).toEqual([]);
    expect(featuredVenues(venues.map(v => ({ ...v, latitude:null })))).toEqual([]);
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
