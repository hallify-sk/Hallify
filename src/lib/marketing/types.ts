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
