import { describe, expect, it } from 'vitest';
import { amenityLabel, amenityLabels } from './amenities';
import { absoluteUrl, metaDescription, venueJsonLd } from './venue-seo';
import { bookingHref, venueHref, type PublicVenue } from './types';

const venue = (patch: Partial<PublicVenue> = {}): PublicVenue => ({
  id: 'uuid-1', name: 'Veľká sála', slug: 'velka-sala', description: null, address: 'Hlavná 1, Košice', max_people: 120,
  latitude: null, longitude: null, cover_image_url: null, amenities: [], pricing_info: null, price_band: null,
  allow_reservations: 1, has_floorplan: 0, is_partner: false, org_slug: 'kastiel', site_url: 'https://kastiel.hallify.sk',
  ...patch,
});

describe('directory links', () => {
  it('links a venue to its indexable page, not the robots-blocked /app/', () => {
    expect(venueHref(venue())).toBe('/priestory/kastiel/velka-sala');
    expect(venueHref(venue({ demo: true }))).toBe('#venue-preview');
  });
  it("books on the venue's own site, and only where bookings are taken", () => {
    expect(bookingHref(venue())).toBe('https://kastiel.hallify.sk/halls/velka-sala/book');
    expect(bookingHref(venue({ allow_reservations: 0 }))).toBeNull();
    expect(bookingHref(venue({ site_url: null }))).toBeNull();
    expect(bookingHref(venue({ demo: true }))).toBeNull();
  });
});

describe('amenity labels', () => {
  const custom = [{ slug: 'custom-virivka', label_sk: 'Vírivka', label_en: null }];
  it('names built-in and custom amenities instead of showing their keys', () => {
    expect(amenityLabel('parking', 'sk')).toBe('Parkovanie');
    expect(amenityLabel('wifi', 'en')).toBe('WiFi');
    expect(amenityLabel('custom-virivka', 'sk', custom)).toBe('Vírivka');
    // The other language stands in when a venue named it only once.
    expect(amenityLabel('custom-virivka', 'en', custom)).toBe('Vírivka');
  });
  it('drops keys nobody can name any more', () => {
    expect(amenityLabels(['parking', 'custom-deleted', 'parking'], 'sk', custom)).toEqual(['Parkovanie']);
  });
});

describe('venue page metadata', () => {
  it('makes stored image paths absolute and refuses other schemes', () => {
    expect(absoluteUrl('/uploads/halls/a.jpg', 'https://hallify.sk')).toBe('https://hallify.sk/uploads/halls/a.jpg');
    expect(absoluteUrl('javascript:alert(1)', 'https://hallify.sk')).toBeNull();
    expect(absoluteUrl('', 'https://hallify.sk')).toBeNull();
  });
  it('keeps descriptions to one line of a sensible length', () => {
    expect(metaDescription('  Krásna\n sála ', 'x')).toBe('Krásna sála');
    expect(metaDescription(null, 'fallback')).toBe('fallback');
    const long = metaDescription('slovo '.repeat(60), 'x');
    expect(long.length).toBeLessThanOrEqual(160);
    expect(long.endsWith('…')).toBe(true);
  });
  it('describes the venue as schema.org JSON-LD that cannot break out of its script element', () => {
    const json = venueJsonLd({ name: 'Sála </script><script>alert(1)</script>', url: 'https://hallify.sk/priestory/a/b', images: ['https://hallify.sk/x.jpg'], latitude: 48.7, longitude: 21.2, maxPeople: 120, amenities: ['WiFi'] });
    expect(json).not.toContain('<');
    const data = JSON.parse(json);
    expect(data['@type']).toBe('EventVenue');
    expect(data.geo).toEqual({ '@type': 'GeoCoordinates', latitude: 48.7, longitude: 21.2 });
    expect(data.maximumAttendeeCapacity).toBe(120);
    expect(data.amenityFeature[0].name).toBe('WiFi');
  });
});
