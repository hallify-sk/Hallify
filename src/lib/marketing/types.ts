import type { Coordinates } from '$lib/venue-location';
import type { BookingMode, ExternalContact, ListingRef, ListingType } from '$lib/listings';

export interface PublicVenue extends Coordinates {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  address: string | null;
  max_people: number;
  cover_image_url: string | null;
  /** Who the cover photo comes from (0042), shown on it; a URL shows as its host. */
  cover_image_credit?: string | null;
  amenities: string[];
  pricing_info: string | null;
  /** 1 = EUR, 2 = EUREUR, 3 = EUREUREUR. null = not stated by the operator. */
  price_band: 1 | 2 | 3 | null;
  allow_reservations: number;
  has_floorplan: number;
  demo?: boolean;
  is_partner: boolean;
  /** The organisation's slug; with the hall's slug it addresses the venue page. */
  org_slug?: string | null;
  /** Origin of the venue's own site (custom domain or org subdomain), where it is booked. */
  site_url?: string | null;
  /** The organisation's id (GA4's venue_id). */
  org_id?: string | null;
  /** 'external': booked directly with the venue, never through Hallify. */
  booking_mode?: BookingMode;
  listing_type?: ListingType;
  /** The venue's own website / phone / e-mail; only for an external hall. */
  contact?: ExternalContact | null;
}

/**
 * The venue's public page in the directory.
 *
 * Hall slugs are only unique within an organisation, so the organisation's slug
 * comes first. It lives under /priestory, not /app: robots.txt keeps search engines
 * out of the app, and the venue pages are exactly what should be found.
 */
export function venuePagePath(orgSlug: string, hallSlug: string): string {
  return `/priestory/${encodeURIComponent(orgSlug)}/${encodeURIComponent(hallSlug)}`;
}

export function venueHref(venue: PublicVenue): string {
  if (venue.demo) return '#venue-preview';
  if (venue.org_slug && venue.slug) return venuePagePath(venue.org_slug, venue.slug);
  // Listed halls always have both slugs; this keeps an odd row reachable all the same.
  return venue.site_url && venue.slug ? `${venue.site_url}/halls/${encodeURIComponent(venue.slug)}` : '/priestory';
}

/**
 * Where to book the venue: the booking page on the venue's own site, where the
 * visitor signs in or registers as that venue's client. Null when the hall takes
 * no bookings, or its site has no address that would route.
 */
export function bookingHref(venue: PublicVenue): string | null {
  if (venue.demo || !venue.allow_reservations || venue.booking_mode === 'external' || !venue.site_url || !venue.slug) return null;
  return `${venue.site_url}/halls/${encodeURIComponent(venue.slug)}/book`;
}

/** What the listing counters and GA4 are told about a card; null for a demo venue. */
export function venueListingRef(venue: PublicVenue): ListingRef | null {
  if (venue.demo) return null;
  return {
    hall_id: venue.id,
    slug: venue.slug,
    venue_id: venue.org_id ?? null,
    listing_type: venue.listing_type ?? (venue.is_partner ? 'partner' : 'basic'),
  };
}

export type PriceBand = 1 | 2 | 3;

/** The three public price levels, cheapest first. */
export const PRICE_BANDS: readonly PriceBand[] = [1, 2, 3];

/**
 * '€', '€€', '€€€'. A count of 0 is allowed so a card can draw the unfilled
 * remainder of the scale next to the filled part.
 */
export function priceGlyphs(count: number): string {
  return '€'.repeat(Math.max(0, Math.min(3, Math.trunc(count) || 0)));
}

/**
 * Wording for a band. Public pricing is a level, never a figure: real rates depend
 * on the date, the length of the booking and the extras, so the directory promises
 * only a range and leaves the exact number to the operator.
 */
export function priceBandLabel(band: PriceBand | null, english: boolean): string {
  if (band === 1) return english ? 'Lower price range' : 'Nižšia cenová úroveň';
  if (band === 2) return english ? 'Mid price range' : 'Stredná cenová úroveň';
  if (band === 3) return english ? 'Higher price range' : 'Vyššia cenová úroveň';
  return english ? 'Price not stated' : 'Cena neuvedená';
}

/** Read a `price=1,3` parameter. Anything unrecognised is dropped, never guessed. */
export function parsePriceBands(value: string | null | undefined): PriceBand[] {
  if (!value) return [];
  const chosen = value.split(',').map(part => Number(part.trim()));
  return PRICE_BANDS.filter(band => chosen.includes(band));
}
