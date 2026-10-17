import type { Coordinates } from '$lib/venue-location';

export interface PublicVenue extends Coordinates {
  id: string;
  name: string;
  slug: string | null;
  description: string | null;
  address: string | null;
  max_people: number;
  cover_image_url: string | null;
  amenities: string[];
  pricing_info: string | null;
  /** 1 = EUR, 2 = EUREUR, 3 = EUREUREUR. null = not stated by the operator. */
  price_band: 1 | 2 | 3 | null;
  allow_reservations: number;
  has_floorplan: number;
  demo?: boolean;
  is_partner: boolean;
}

// UUIDs are globally unique; slugs are only unique within an organization.
export function venueHref(venue: PublicVenue): string {
  if (venue.demo) return '#venue-preview';
  return `/app/halls/${encodeURIComponent(venue.id)}`;
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
