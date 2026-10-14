<script lang="ts">
  import Icon from './Icon.svelte';
  import type { PublicVenue } from './types';
  let { venue, english = false, onopen }: { venue: PublicVenue; english?: boolean; onopen: (venue: PublicVenue) => void } = $props();
</script>
<div class="map-venue-detail" aria-live="polite">
  {#if venue.cover_image_url}<img src={venue.cover_image_url} alt="" width="78" height="78">{/if}
  <div class="map-venue-copy"><p class="map-venue-status">{venue.demo ? (english ? 'Demo venue' : 'Ukážkový priestor') : (venue.has_floorplan ? (english ? 'With a floorplan' : 'S pôdorysom') : (english ? 'Venue profile' : 'Profil priestoru'))}</p><h3>{venue.name}</h3><p>{venue.max_people} {english ? 'guests' : 'hostí'} · {venue.pricing_info ? (english ? 'Pricing available' : 'Cenové informácie') : (english ? 'Price on request' : 'Cena na dopyt')}</p></div>
  <button type="button" onclick={() => onopen(venue)} aria-label={`${english ? 'Open' : 'Otvoriť'} ${venue.name}`}><Icon /></button>
</div>
