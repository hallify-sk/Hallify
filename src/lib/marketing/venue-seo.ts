/**
 * Search and sharing metadata for public venue pages: absolute image URLs for
 * og:image, a description of the right length, and schema.org JSON-LD.
 */

/** An absolute http(s) URL for a stored path or URL, or null when it is neither. */
export function absoluteUrl(raw: string | null | undefined, origin: string): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(value, origin);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/** One line of at most `max` characters, cut at a word and marked as cut. */
export function metaDescription(text: string | null | undefined, fallback: string, max = 160): string {
  const flat = (text ?? '').replace(/\s+/g, ' ').trim();
  if (!flat) return fallback;
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, '')}…`;
}

export interface VenueLd {
  name: string;
  description?: string | null;
  url: string;
  images: string[];
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  maxPeople?: number | null;
  telephone?: string | null;
  email?: string | null;
  website?: string | null;
  amenities?: string[];
}

/**
 * schema.org EventVenue for a venue page, serialised so it can sit inside a
 * <script type="application/ld+json"> element: every "<" is escaped, so a venue
 * description containing "</script>" cannot close the element early.
 */
export function venueJsonLd(venue: VenueLd): string {
  const data: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'EventVenue',
    name: venue.name,
    url: venue.url,
  };
  if (venue.description?.trim()) data.description = venue.description.trim();
  if (venue.images.length) data.image = venue.images;
  if (venue.address?.trim()) data.address = { '@type': 'PostalAddress', streetAddress: venue.address.trim() };
  if (venue.latitude != null && venue.longitude != null && Number.isFinite(venue.latitude) && Number.isFinite(venue.longitude)) {
    data.geo = { '@type': 'GeoCoordinates', latitude: venue.latitude, longitude: venue.longitude };
  }
  if (venue.maxPeople && venue.maxPeople > 0) data.maximumAttendeeCapacity = venue.maxPeople;
  if (venue.telephone?.trim()) data.telephone = venue.telephone.trim();
  if (venue.email?.trim()) data.email = venue.email.trim();
  if (venue.website) data.sameAs = [venue.website];
  if (venue.amenities?.length) {
    data.amenityFeature = venue.amenities.map(name => ({ '@type': 'LocationFeatureSpecification', name, value: true }));
  }
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
