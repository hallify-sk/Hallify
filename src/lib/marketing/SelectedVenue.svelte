<script lang="ts">
  import { imageSrcset } from '$lib/image-variants';
  import Icon from './Icon.svelte';
  import type { PublicVenue } from './types';
  let { venue, english = false, onopen, onclose }: { venue: PublicVenue; english?: boolean; onopen: (venue: PublicVenue) => void; onclose?: () => void } = $props();
  let imageFailed = $state(false);
  $effect(() => { venue.cover_image_url; imageFailed = false; });
</script>
<div class="map-venue-detail" aria-live="polite">
  <button type="button" class="map-venue-summary" onclick={() => onopen(venue)} aria-label={`${english ? 'Open venue details:' : 'Otvoriť detail priestoru:'} ${venue.name}`}>
    {#if venue.cover_image_url && !imageFailed}<img src={venue.cover_image_url} srcset={imageSrcset(venue.cover_image_url)} sizes="52px" onerror={() => imageFailed = true} alt="" width="52" height="52">{:else}<span class="map-venue-placeholder" aria-hidden="true"><Icon name="pin" size={22} /></span>{/if}
    <span class="map-venue-copy">{#if venue.demo}<small>{english ? 'Demo venue' : 'Ukážkový priestor'}</small>{/if}<strong>{venue.name}</strong><span>{venue.max_people} {english ? 'guests' : 'hostí'}{venue.has_floorplan ? (english ? ' · Floorplan' : ' · Pôdorys') : ''}</span></span>
  </button>
  {#if onclose}<button type="button" class="map-venue-close" onclick={onclose} aria-label={english ? 'Close selected venue' : 'Zavrieť vybraný priestor'}><Icon name="close" size={16} /></button>{/if}
</div>
