import type { PublicVenue } from './types';

export interface MapCenter { latitude: number; longitude: number }
/** Banská Bystrica, near the middle of Slovakia: where demo venues sit and the map opens
 *  when nothing else says where to look. Hallify's venues are Slovak, not around Prague. */
export const DEFAULT_CENTER: MapCenter = { latitude: 48.7363, longitude: 19.1462 };

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
    address: nearby ? (english ? 'Your area · sample location' : 'Vaše okolie · ukážková poloha') : (english ? 'Central Slovakia · sample location' : 'Stredné Slovensko · ukážková poloha'),
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

/** Lower case without diacritics, so "kosice" finds "Ko\u0161ice" and "sala" finds "\u0160a\u013ea". */
export function normalizeText(text: string): string {
  return text.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

const queryWords = (query: string) => query.toLocaleLowerCase().split(/[\s,]+/).filter(Boolean);

/** How a venue matches a typed query, or null when it does not. */
export interface QueryMatch {
  /** Every word found as typed, diacritics included ("Šaľa" in "Šaľa", not in "Sála"). */
  exact: boolean;
  /** Every word found in the address, i.e. the town or street, not only the name. */
  inAddress: boolean;
}

/**
 * Whether a venue's name or address mentions every word of the query, in any order:
 * "Reduta Bratislava" finds Reduta on Meden\u00e1 in Bratislava even though the words are
 * not next to each other in the text. Diacritics are ignored for the match itself
 * ("kosice" finds Košice); `exact` says whether it also matched as typed.
 */
export function queryMatch(venue: Pick<PublicVenue, 'name' | 'address'>, query: string): QueryMatch | null {
  const words = queryWords(query);
  if (!words.length) return { exact: true, inAddress: true };
  const folded = words.map(normalizeText);
  const text = `${venue.name} ${venue.address ?? ''}`;
  const foldedText = normalizeText(text);
  if (!folded.every(word => foldedText.includes(word))) return null;
  const lower = text.toLocaleLowerCase();
  const address = normalizeText(venue.address ?? '');
  return { exact: words.every(word => lower.includes(word)), inAddress: folded.every(word => address.includes(word)) };
}

export function matchesQuery(venue: Pick<PublicVenue, 'name' | 'address'>, query: string): boolean {
  return queryMatch(venue, query) !== null;
}

/**
 * The directory filters.
 *
 * `center` + `radius` is the "around" filter. When the centre is where the typed
 * query was geocoded to (`centerIsQuery`), the area widens the search rather than
 * narrowing it: a venue matches by its name or address OR by lying in the area.
 * Requiring both hid exactly what people searched for -- "Reduta" geocodes to Brno,
 * "kosice" to a Czech village, and a venue in \u0160a\u013ea without a map position was
 * dropped by the radius however well its address matched. When the centre is the
 * visitor's own position, the area is a real constraint and both must hold.
 *
 * A query typed with diacritics prefers what was typed: when any venue matches it
 * exactly (diacritics included), venues that match only once diacritics are ignored are
 * left out, so the town "Šaľa" no longer brings in every hall called "Sála".
 * Matches are then ranked: town/address first, then name, then venues that are only
 * in the area, so a town search leads with the venues in that town.
 */
export function filterVenues(venues: PublicVenue[], filters: { query: string; guests: number; floorplan: boolean; booking: boolean; center?: MapCenter | null; radius?: number; bands?: number[]; centerIsQuery?: boolean }): PublicVenue[] {
  // An unstated band must not pass a band filter: it is unknown, not cheap.
  const bands = filters.bands?.length ? new Set(filters.bands) : null;
  const center = filters.center && filters.radius ? filters.center : null;
  const typed = !!filters.query.trim();
  const inArea = (venue: PublicVenue) => !!center && venue.latitude !== null && venue.longitude !== null &&
    distanceKm(center, { latitude: venue.latitude, longitude: venue.longitude }) <= filters.radius!;
  // The band filter is left out of the exact-match decision, so turning it on never
  // swaps which spelling of the query the list honours.
  const candidates = venues.filter(venue => venue.max_people >= filters.guests && (!filters.floorplan || !!venue.has_floorplan) &&
    (!filters.booking || !!venue.allow_reservations));
  const inBand = (venue: PublicVenue) => !bands || (venue.price_band !== null && bands.has(venue.price_band));
  const matches = new Map(candidates.map(venue => [venue.id, queryMatch(venue, filters.query)]));
  // Only a query typed with diacritics says which spelling was meant: "Kosice" must
  // still find every venue in Košice, even when one venue spells its town "Kosice".
  const accented = filters.query.toLocaleLowerCase() !== normalizeText(filters.query);
  const preferExact = typed && accented && [...matches.values()].some(m => m?.exact);
  const textMatch = (venue: PublicVenue) => {
    const m = matches.get(venue.id);
    return !!m && (!preferExact || m.exact) ? m : null;
  };
  const place = (venue: PublicVenue) => {
    const text = !!textMatch(venue);
    if (!center) return text;
    return filters.centerIsQuery && typed ? text || inArea(venue) : text && inArea(venue);
  };
  const result = candidates.filter(venue => inBand(venue) && place(venue));
  if (!typed) return result;
  const rank = (venue: PublicVenue) => {
    const m = textMatch(venue);
    return m ? (m.inAddress ? 0 : 1) : 2;
  };
  // Array.prototype.sort is stable, so the given order holds within a rank.
  return result.sort((a, b) => rank(a) - rank(b));
}

/**
 * The head of a `filterVenues` result that shares its best match: the venues in the
 * searched town when there are any. Featured partners are drawn from these, so a
 * partner that only shares a word with the query in its name does not jump ahead
 * of the venues in the town that was searched for. Everything without a query.
 */
export function bestMatches(ranked: PublicVenue[], query: string): PublicVenue[] {
  if (!query.trim() || !ranked.length) return ranked;
  const kind = (venue: PublicVenue) => {
    const m = queryMatch(venue, query);
    return m ? (m.inAddress ? 0 : 1) : 2;
  };
  const best = kind(ranked[0]);
  return ranked.filter(venue => kind(venue) === best);
}

/** The orders the directory offers. 'recommended' keeps featured partners first. */
export const VENUE_SORTS = ['recommended', 'distance', 'capacity-desc', 'capacity-asc', 'price', 'name'] as const;
export type VenueSort = typeof VENUE_SORTS[number];

export function parseVenueSort(value: string | null | undefined): VenueSort {
  return (VENUE_SORTS as readonly string[]).includes(value ?? '') ? value as VenueSort : 'recommended';
}

/**
 * Sort a result list. Ties fall back to the name, so the order is stable. What a
 * sort cannot rank goes last rather than first: a venue without a map position when
 * sorting by distance, one that never stated a price when sorting by price.
 * 'recommended' (and 'distance' with no known centre) keeps the given order.
 */
export function sortVenues(venues: PublicVenue[], sort: VenueSort, center?: MapCenter | null): PublicVenue[] {
  const byName = (a: PublicVenue, b: PublicVenue) => a.name.localeCompare(b.name, 'sk');
  const last = (value: number | null) => value ?? Number.POSITIVE_INFINITY;
  const distance = (venue: PublicVenue) => center && venue.latitude !== null && venue.longitude !== null
    ? distanceKm(center, { latitude: venue.latitude, longitude: venue.longitude }) : null;
  const list = [...venues];
  switch (sort) {
    case 'distance': return center ? list.sort((a, b) => last(distance(a)) - last(distance(b)) || byName(a, b)) : list;
    case 'capacity-desc': return list.sort((a, b) => b.max_people - a.max_people || byName(a, b));
    case 'capacity-asc': return list.sort((a, b) => a.max_people - b.max_people || byName(a, b));
    case 'price': return list.sort((a, b) => last(a.price_band) - last(b.price_band) || byName(a, b));
    case 'name': return list.sort(byName);
    default: return list;
  }
}
