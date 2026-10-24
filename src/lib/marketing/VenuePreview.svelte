<script lang="ts">
  import { imageSrcset } from '$lib/image-variants';
  import Icon from './Icon.svelte';
  import { venueHref, type PublicVenue } from './types';
  let { venue = null, english = false }: { venue?: PublicVenue | null; english?: boolean } = $props();
  let dialog: HTMLDialogElement;
  let photoFailed = $state(false);
  export function open(next: PublicVenue) { venue = next; photoFailed = false; dialog.showModal(); }
</script>
<dialog bind:this={dialog} id="venue-preview" class="marketing-dialog venue-preview-dialog" aria-labelledby="venue-preview-title">
  <button class="dialog-close" onclick={() => dialog.close()} aria-label={english ? 'Close venue preview' : 'Zatvoriť náhľad priestoru'}>×</button>
  {#if venue}
    {#if venue.cover_image_url && !photoFailed}<img class="dialog-photo" onerror={() => (photoFailed = true)} src={venue.cover_image_url} srcset={imageSrcset(venue.cover_image_url)} sizes="(max-width: 640px) 100vw, 600px" alt={venue.demo ? (english ? 'Illustrative event space' : 'Ilustračný priestor na podujatie') : venue.name} width="600" height="280">{/if}
    <p class="eyebrow">{venue.demo ? (english ? 'Demo venue' : 'Ukážkový priestor') : (english ? 'Venue details' : 'Detail priestoru')}</p>
    <h2 id="venue-preview-title">{venue.name}</h2><p>{venue.description}</p>
    <div class="dialog-facts"><div><small>{english ? 'Capacity' : 'Kapacita'}</small><strong>{venue.max_people} {english ? 'guests' : 'hostí'}</strong></div><div><small>{english ? 'Floorplan' : 'Pôdorys'}</small><strong>{venue.has_floorplan ? (english ? 'Available' : 'K dispozícii') : (english ? 'Ask the venue' : 'Na vyžiadanie')}</strong></div><div><small>{english ? 'Price' : 'Cena'}</small><strong>{english ? 'On request' : 'Na dopyt'}</strong></div></div>
    {#if venue.demo}<div class="preview-success"><p>{english ? 'This is a test pin with a sample venue and illustrative photography. You can select it, search for it and filter it, but it cannot be booked.' : 'Toto je testovací bod s ukážkovým priestorom a ilustračnou fotografiou. Môžete ho vybrať, vyhľadať a filtrovať; rezervácia sa nevytvára.'}</p></div><button class="primary" onclick={() => dialog.close()}>{english ? 'Back to the map' : 'Späť na mapu'} <Icon /></button>
    {:else}<a class="primary" href={venueHref(venue)}>{english ? 'Open venue' : 'Otvoriť priestor'} <Icon /></a>{/if}
  {/if}
</dialog>
