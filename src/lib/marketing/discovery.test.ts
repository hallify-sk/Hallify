import { describe, expect, it } from 'vitest';
import { DEFAULT_CENTER, bestMatches, demoVenues, destination, distanceKm, filterVenues, featuredVenues, parseVenueSort, sortVenues } from './discovery';

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
    const here = DEFAULT_CENTER;
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
  it('sorts by distance, capacity, price and name, with what cannot be ranked last', () => {
    const base = demoVenues()[0];
    const v = (id: string, name: string, max_people: number, price_band: 1 | 2 | 3 | null, latitude: number | null) =>
      ({ ...base, id, name, max_people, price_band, latitude, longitude: latitude === null ? null : 17 });
    const venues = [v('a', 'Cyprus', 100, 3, 48.5), v('b', 'Agáta', 300, null, 48.1), v('c', 'Breza', 50, 1, null)];
    const ids = (sort: Parameters<typeof sortVenues>[1], center?: { latitude: number; longitude: number }) => sortVenues(venues, sort, center).map(x => x.id);
    expect(ids('recommended')).toEqual(['a', 'b', 'c']);
    expect(ids('distance', { latitude: 48.1, longitude: 17 })).toEqual(['b', 'a', 'c']);
    expect(ids('distance')).toEqual(['a', 'b', 'c']);
    expect(ids('capacity-desc')).toEqual(['b', 'a', 'c']);
    expect(ids('capacity-asc')).toEqual(['c', 'a', 'b']);
    expect(ids('price')).toEqual(['c', 'a', 'b']);
    expect(ids('name')).toEqual(['b', 'c', 'a']);
    expect(parseVenueSort('price')).toBe('price');
    expect(parseVenueSort('drop table')).toBe('recommended');
  });
  it('finds a venue searched for by name or town even when the geocoder places the query elsewhere', () => {
    const venue = (id: string, name: string, address: string | null, latitude: number | null, longitude: number | null) =>
      ({ ...demoVenues()[0], id, name, address, latitude, longitude, demo: false });
    const venues = [
      venue('reduta', 'Reduta', 'Medená 3, Bratislava', 48.1406, 17.1105),
      venue('kosice', 'Dom umenia', 'Moyzesova 66, Košice', 48.7194, 21.2577),
      venue('sala', 'Kaštieľ', 'Hlavná 1, Šaľa', null, null),
    ];
    const base = { guests: 0, floorplan: false, booking: false, radius: 50, centerIsQuery: true };
    // "Reduta" geocodes to Brno; the area must not hide the venue that is called Reduta.
    expect(filterVenues(venues, { ...base, query: 'Reduta', center: { latitude: 49.19, longitude: 16.6 } }).map(v => v.id)).toEqual(['reduta']);
    // Typed without diacritics, and geocoded to a Czech village.
    expect(filterVenues(venues, { ...base, query: 'kosice', center: { latitude: 49.9, longitude: 15.1 } }).map(v => v.id)).toEqual(['kosice']);
    // No map position, but the address says Šaľa.
    expect(filterVenues(venues, { ...base, query: 'Šaľa', center: { latitude: 48.15, longitude: 17.88 } }).map(v => v.id)).toEqual(['sala']);
    // Words in any order, across name and address.
    expect(filterVenues(venues, { ...base, query: 'reduta bratislava', center: null }).map(v => v.id)).toEqual(['reduta']);
    // A typed town also brings in what lies around it.
    expect(filterVenues(venues, { ...base, query: 'Pezinok', center: { latitude: 48.29, longitude: 17.27 } }).map(v => v.id)).toEqual(['reduta']);
    // Around the visitor's own position the area is a real limit.
    expect(filterVenues(venues, { ...base, centerIsQuery: false, query: 'kosice', center: { latitude: 48.14, longitude: 17.1 } })).toEqual([]);
  });

  // Round-1 regression: ignoring diacritics made the town "Šaľa" match every hall
  // called "Sála".
  it('prefers what was typed and ranks town matches above name matches', () => {
    const venue = (id: string, name: string, address: string | null) =>
      ({ ...demoVenues()[0], id, name, address, latitude: null, longitude: null, demo: false });
    const venues = [
      venue('hall', 'Veľká sála', 'Hlavná 5, Nitra'),
      venue('town', 'Kaštieľ', 'Hlavná 1, Šaľa'),
      venue('other', 'Mlyn', 'Dolná 2, Senec'),
    ];
    const base = { guests: 0, floorplan: false, booking: false };
    expect(filterVenues(venues, { ...base, query: 'Šaľa' }).map(v => v.id)).toEqual(['town']);
    expect(filterVenues(venues, { ...base, query: 'sála' }).map(v => v.id)).toEqual(['hall']);
    // Typed without diacritics: both spellings are possible, the town leads.
    expect(filterVenues(venues, { ...base, query: 'sala' }).map(v => v.id)).toEqual(['town', 'hall']);
    // Featured partners come from the town matches only.
    expect(bestMatches(filterVenues(venues, { ...base, query: 'sala' }), 'sala').map(v => v.id)).toEqual(['town']);
    expect(bestMatches(venues, '')).toHaveLength(3);
  });

  // One venue spelling its town "Kosice" must not hide every venue in "Košice".
  it('keeps every spelling for a query typed without diacritics', () => {
    const venue = (id: string, address: string) =>
      ({ ...demoVenues()[0], id, name: id, address, latitude: null, longitude: null, demo: false });
    const venues = [venue('plain', 'Testovacia 7, Kosice'), venue('a', 'Hlavná 1, Košice'), venue('b', 'Mlynská 2, Košice')];
    const base = { guests: 0, floorplan: false, booking: false };
    expect(filterVenues(venues, { ...base, query: 'Kosice' }).map(v => v.id).sort()).toEqual(['a', 'b', 'plain']);
    expect(filterVenues(venues, { ...base, query: 'Košice' }).map(v => v.id).sort()).toEqual(['a', 'b']);
  });
});
