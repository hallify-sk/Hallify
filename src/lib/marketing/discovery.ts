import type { PublicVenue } from './types';

export interface MapCenter { latitude: number; longitude: number }
export const DEFAULT_CENTER: MapCenter = { latitude: 50.0755, longitude: 14.4378 };

export function distanceKm(a: MapCenter, b: MapCenter): number {
  const radians = Math.PI / 180;
  const lat = (b.latitude - a.latitude) * radians, lng = (b.longitude - a.longitude) * radians;
  const value = Math.sin(lat / 2) ** 2 + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * Math.sin(lng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(Math.max(0, 1 - value)));
}

export function destination(center: MapCenter, distance: number, bearing: number): MapCenter {
  const rad = Math.PI / 180, angular = distance / 6371, heading = bearing * rad;
  const lat = center.latitude * rad, lng = center.longitude * rad;
  const nextLat = Math.asin(Math.sin(lat) * Math.cos(angular) + Math.cos(lat) * Math.sin(angular) * Math.cos(heading));
  const nextLng = lng + Math.atan2(Math.sin(heading) * Math.sin(angular) * Math.cos(lat), Math.cos(angular) - Math.sin(lat) * Math.sin(nextLat));
  return { latitude: nextLat / rad, longitude: ((nextLng / rad + 540) % 360) - 180 };
}

/** Local illustrative places. These never become database records or bookable halls. */
export function demoVenues(center: MapCenter = DEFAULT_CENTER, nearby = false, english = false): PublicVenue[] {
  const names = english ? ['Riverside studio','Lakeside courtyard','City gallery','Garden pavilion','Oak hall','Old mill','Forest retreat'] : ['Ateliér pri rieke','Dvor pri jazere','Mestská galéria','Záhradný pavilón','Dubová sála','Starý mlyn','Lesný dvor'];
  const capacities = [120,80,180,60,240,100,40], distances = [3,7,11,18,25,34,42];
  return names.map((name, i) => ({
    id: `demo-${i}`, name, slug: null, description: english ? 'An illustrative venue for trying map selection and filters.' : 'Ilustračný priestor na vyskúšanie výberu na mape a filtrov.',
    address: nearby ? (english ? 'Your area · sample location' : 'Vaše okolie · ukážková poloha') : (english ? 'Prague area · sample location' : 'Okolie Prahy · ukážková poloha'),
    ...destination(center, distances[i], 32 + i * 51), max_people: capacities[i],
    cover_image_url: ['/marketing/venue-example.jpg','/marketing/venue-dinner.jpg','/marketing/venue-conference.jpg'][i % 3],
    amenities: i % 2 ? ['parking','outdoor'] : ['wifi','catering'],
    pricing_info: null, price_band: ([1,2,3] as const)[i % 3], allow_reservations: i % 3 === 0 ? 0 : 1, has_floorplan: i % 2 ? 0 : 1, demo: true, is_partner: [0,2,4,5].includes(i),
  }));
}

/** How many partner venues the featured strip can show. */
export const FEATURED_LIMIT = 3;

/**
 * Day index since the epoch. Stable for a whole day, so server and client agree
 * during hydration and the order does not churn while someone browses.
 */
export function rotationSeed(now: Date): number {
  return Math.floor(now.getTime() / 86_400_000);
}

/**
 * The partner venues to feature.
 *
 * `center` should be whatever location the visitor is actually thinking about: the
 * place they searched for if they picked one, otherwise their detected position.
 * The caller passes it through rather than this defaulting to the map origin --
 * otherwise someone who searched Kosice gets venues ranked around Prague.
 *
 * With no location at all, distance cannot rank anything, and a plain alphabetical
 * sort would permanently hand the top slots to whoever named their venue "A...".
 * Rotating by day gives every eligible partner the same share of exposure over
 * time while staying stable within a day, so it is cacheable, survives hydration,
 * and is explainable to a partner who asks why they are not on top.
 */
export function featuredVenues(
  venues: PublicVenue[],
  center?: MapCenter | null,
  options: { limit?: number; seed?: number } = {}
): PublicVenue[] {
  const limit = options.limit ?? FEATURED_LIMIT;
  const partners = venues.filter(venue => venue.is_partner === true);

  if (center) {
    return partners
      .filter(venue => venue.latitude !== null && venue.longitude !== null &&
        Number.isFinite(venue.latitude) && Number.isFinite(venue.longitude))
      .sort((a, b) =>
        distanceKm(center, a as MapCenter) - distanceKm(center, b as MapCenter) ||
        a.name.localeCompare(b.name))
      .slice(0, limit);
  }

  const seed = options.seed ?? rotationSeed(new Date());
  const ordered = [...partners].sort((a, b) => a.id.localeCompare(b.id));
  if (ordered.length <= limit) return ordered;
  const offset = ((seed % ordered.length) + ordered.length) % ordered.length;
  return Array.from({ length: limit }, (_, i) => ordered[(offset + i) % ordered.length]);
}

export function filterVenues(venues: PublicVenue[], filters: { query: string; guests: number; floorplan: boolean; booking: boolean; center?: MapCenter | null; radius?: number; bands?: number[] }): PublicVenue[] {
  const normalize = (text: string) => text.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // An unstated band must not pass a band filter: it is unknown, not cheap.
  const bands = filters.bands?.length ? new Set(filters.bands) : null;
  return venues.filter(venue => venue.max_people >= filters.guests && (!filters.floorplan || !!venue.has_floorplan) &&
    (!filters.booking || !!venue.allow_reservations) && normalize(`${venue.name} ${venue.address ?? ''}`).includes(normalize(filters.query.trim())) &&
    (!bands || (venue.price_band !== null && bands.has(venue.price_band))) &&
    (!filters.center || !filters.radius || (venue.latitude !== null && venue.longitude !== null && distanceKm(filters.center, { latitude: venue.latitude, longitude: venue.longitude }) <= filters.radius)));
}
