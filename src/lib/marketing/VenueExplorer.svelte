<script lang="ts">
  import Icon from './Icon.svelte';
  import { onMount, untrack } from 'svelte';
  import { dev } from '$app/environment';
  import { goto, replaceState } from '$app/navigation';
  import { getLocale } from '$lib/i18n.svelte';
  import { hasCoordinates } from '$lib/venue-location';
  import { DEFAULT_CENTER, demoVenues, distanceKm, filterVenues, featuredVenues } from './discovery';
  import { userLocation, locateUser, locateIfGranted } from './user-location.svelte';
  import { venueHref, type PublicVenue } from './types';
  import VenueMap from './VenueMap.svelte';
  import VenuePreview from './VenuePreview.svelte';
  import SelectedVenue from './SelectedVenue.svelte';
  let { halls, initialQuery = '', initialGuests = 0, initialDemo = dev, initialFloorplan = false }: { halls: PublicVenue[]; initialQuery?: string; initialGuests?: number; initialDemo?: boolean; initialFloorplan?: boolean } = $props();
  const en = $derived(getLocale() === 'en');
  let query = $state(untrack(() => initialQuery)), guests = $state(untrack(() => initialGuests));
  let floorplan = $state(untrack(() => initialFloorplan)), booking = $state(false), amenity = $state(''), radius = $state(50), nearby = $state(true);
  let filtersOpen = $state(false);
  let selectionRevision = $state(0);
  let demo = $state(untrack(() => initialDemo)), selectedId = $state<string | null>(null);
  let preview: { open: (venue: PublicVenue) => void };
  let list: HTMLDivElement;
  const venues = $derived([...halls, ...(demo ? demoVenues(userLocation.center ?? DEFAULT_CENTER, !!userLocation.center, en) : [])]);
  const visible = $derived(filterVenues(venues, { query, guests, floorplan, booking, center: nearby ? userLocation.center : null, radius }).filter(v => !amenity || v.amenities.includes(amenity)));
  let searchSubmitted = $state(false);
  const searching = $derived(searchSubmitted || !!query.trim() || guests > 0 || floorplan || booking || !!amenity || radius !== 50);
  const featured = $derived(featuredVenues(visible,userLocation.center ?? DEFAULT_CENTER));
  const others = $derived(visible.filter(venue => !featured.some(item => item.id === venue.id)));
  const selected = $derived(visible.find(v => v.id === selectedId) ?? null);
  const points = $derived(visible.filter(v => hasCoordinates(v)).map(v => ({ id:v.id, name:v.name, latitude:v.latitude!, longitude:v.longitude!, label:`${v.max_people} ${en ? 'guests' : 'hostí'}`, demo:v.demo })));
  onMount(() => { if (!query) void locateIfGranted(); });
  function select(id: string, fromMap = false) {
    selectedId = id; selectionRevision += 1;
    if (fromMap) list?.querySelector<HTMLElement>(`[data-venue-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block:'nearest', behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
  function open(venue: PublicVenue) { if (venue.demo) preview.open(venue); else void goto(venueHref(venue)); }
  function toggleNearby() {
    if (nearby && userLocation.center) { nearby = false; return; }
    nearby = true;
    query = '';
    if (!userLocation.center) void locateUser();
  }
  function reset() {
    query = ''; guests = 0; searchSubmitted = false; radius = 50; floorplan = false; booking = false; amenity = ''; nearby = false; selectedId = null;
    const url = new URL(location.href); url.searchParams.delete('q'); url.searchParams.delete('guests'); url.searchParams.delete('floorplan'); replaceState(url, {});
  }
  function search(event: SubmitEvent) {
    event.preventDefault(); searchSubmitted = true; const url = new URL(location.href);
    if (query.trim()) url.searchParams.set('q',query.trim()); else url.searchParams.delete('q');
    if (guests) url.searchParams.set('guests',String(guests)); else url.searchParams.delete('guests');
    if (floorplan) url.searchParams.set('floorplan','1'); else url.searchParams.delete('floorplan');
    url.searchParams.set('demo',demo ? '1' : '0');
    replaceState(url,{});
  }
</script>

{#snippet resultCards(collection: PublicVenue[], highlight: boolean)}
{#each collection as venue (venue.id)}
        <article class="explorer-result" class:is-selected={selectedId === venue.id} class:featured-result={highlight} data-venue-id={venue.id}>
          <button class="explorer-result-select" onclick={() => select(venue.id)} aria-pressed={selectedId === venue.id}>
            {#if venue.cover_image_url}<img src={venue.cover_image_url} alt="" width="112" height="100" loading="lazy">{:else}<div class="explorer-no-photo"><img src="/Hallify.svg" alt="" width="30" height="30"></div>{/if}
            <span class="explorer-result-copy"><small>{venue.demo ? (en ? 'Demo venue' : 'Ukážkový priestor') : (venue.address || 'Hallify')}</small><strong>{venue.name}</strong><span>{venue.max_people} {en ? 'guests' : 'hostí'}{#if userLocation.center && hasCoordinates(venue)} · {Math.round(distanceKm(userLocation.center, { latitude:venue.latitude!, longitude:venue.longitude! }))} km{/if}</span><span class="result-features">{venue.is_partner ? (en ? "Partner Hallify / " : "Partner Hallify / ") : ""}{venue.has_floorplan ? (en ? 'Floorplan' : 'Pôdorys') : (en ? 'Venue profile' : 'Profil priestoru')}{venue.allow_reservations ? (en ? ' / Booking' : ' / Rezervácie') : ''}</span></span>
          </button>
          <div class="explorer-result-footer"><span>{venue.pricing_info || (en ? 'Price on request' : 'Cena na dopyt')}</span><button onclick={() => open(venue)}>{en ? 'Details' : 'Detail'} <Icon /></button></div>
        </article>
      {:else}<div class="explorer-empty"><h2>{en ? 'No spaces here yet.' : 'Zatiaľ žiadny priestor.'}</h2><p>{en ? 'Change the filters or enable demo venues to try the map.' : 'Zmeňte filtre alebo zapnite ukážkové priestory a vyskúšajte mapu.'}</p><button onclick={reset}>{en ? 'Reset selection' : 'Obnoviť výber'}</button></div>{/each}
{/snippet}


<div class="venue-explorer">
  <aside class="explorer-sidebar" aria-label={en ? 'Venue search and results' : 'Vyhľadávanie a zoznam priestorov'}>
    <div class="explorer-search">
      <a class="explorer-back" href="/"><Icon name="back" /> {en ? 'Back to homepage' : 'Späť na úvod'}</a>
      <div class="explorer-title"><h1>{en ? 'Find your place.' : 'Nájdite svoje miesto.'}</h1><span>{visible.length}</span><button class="mobile-filter-toggle" aria-expanded={filtersOpen} onclick={() => filtersOpen = !filtersOpen}>{en ? "Filters" : "Filtre"} {filtersOpen ? "−" : "+"}</button></div>
      <form onsubmit={search} method="GET" action="/priestory"><label class="explorer-query-label"><span class="sr-only">{en ? 'Search venues or cities' : 'Vyhľadať priestor alebo mesto'}</span><input type="search" name="q" bind:value={query} maxlength="150" placeholder={en ? 'Venue name or location' : 'Názov priestoru alebo miesto'}><button type="submit" aria-label={en ? 'Search' : 'Vyhľadať'}><Icon name="search" /></button></label></form>
      <div class="explorer-filter-body" class:collapsed={!filtersOpen}><div class="explorer-filter-row"><label>{en ? 'Guests' : 'Počet hostí'}<span class="select-wrap"><select bind:value={guests}><option value={0}>{en ? 'Any' : 'Ľubovoľný'}</option>{#each [30,60,100,150,250] as count}<option value={count}>{count}+</option>{/each}{#if guests > 0 && ![30,60,100,150,250].includes(guests)}<option value={guests}>{guests}+</option>{/if}</select><Icon name="chevron" /></span></label><label>{en ? 'Amenities' : 'Vybavenie'}<span class="select-wrap"><select bind:value={amenity}><option value="">{en ? 'Any' : 'Ľubovoľné'}</option><option value="parking">{en ? 'Parking' : 'Parkovanie'}</option><option value="catering">Catering</option><option value="outdoor">{en ? 'Outdoor space' : 'Vonkajší priestor'}</option><option value="accessible">{en ? 'Accessible' : 'Bezbariérový'}</option></select><Icon name="chevron" /></span></label></div>
      <div class="explorer-chips"><button aria-pressed={floorplan} onclick={() => floorplan = !floorplan}>{en ? 'With a floorplan' : 'S pôdorysom'} {floorplan ? '✓' : '+'}</button><button aria-pressed={booking} onclick={() => booking = !booking}>{en ? 'Booking available' : 'Možnosť rezervácie'} {booking ? '✓' : '+'}</button></div>
      <div class="nearby-controls"><button class:nearby-active={nearby && !!userLocation.center} aria-pressed={nearby && !!userLocation.center} disabled={userLocation.status === 'loading'} onclick={toggleNearby}><Icon name="locate" /> {userLocation.status === 'loading' ? (en ? 'Finding location…' : 'Hľadám polohu…') : (en ? 'Around me' : 'V mojom okolí')}</button>{#if userLocation.center}<label><span class="sr-only">{en ? 'Distance radius' : 'Vzdialenosť'}</span><span class="select-wrap"><select bind:value={radius} onchange={() => nearby = true}>{#each [10,25,50,100] as distance}<option value={distance}>{distance} km</option>{/each}</select><Icon name="chevron" /></span></label><span class="nearby-status">{nearby ? (en ? 'Within radius' : 'V okruhu') : (en ? 'Everywhere' : 'Všade')}</span>{/if}</div>
      <div class="explorer-demo-row"><label><input type="checkbox" bind:checked={demo}>{en ? 'Demo venues' : 'Ukážkové priestory'}</label><button onclick={reset}>{en ? 'Reset filters' : 'Zrušiť filtre'}</button></div>
      </div>
    </div>
    <div class="explorer-results" bind:this={list}>
      <p class="explorer-result-count" aria-live="polite">{visible.length} {en ? 'venues in your selection' : 'priestorov vo vašom výbere'}</p>
      {#if !searching && featured.length}
        <h2 class="explorer-group-heading">{userLocation.center ? (en ? 'Featured partners nearby' : 'Partneri vo vašom okolí') : (en ? 'Featured Hallify partners' : 'Vybrané priestory partnerov')}</h2>
        {@render resultCards(featured,true)}
        {#if others.length}<h2 class="explorer-group-heading secondary">{en ? 'More venues' : 'Ďalšie priestory'}</h2>{@render resultCards(others,false)}{/if}
      {:else}
        <h2 class="explorer-group-heading">{searching ? (en ? 'Search results' : 'Výsledky vyhľadávania') : (en ? 'All venues' : 'Všetky priestory')}</h2>
        {@render resultCards(visible,false)}
      {/if}
      {#if visible.some(v => !hasCoordinates(v))}<p class="fine">{en ? 'Venues without a saved position appear in the list.' : 'Priestory bez nastavenej polohy nájdete v zozname.'}</p>{/if}
    </div>
  </aside>
  <section class="explorer-map" aria-label={en ? 'Venue map' : 'Mapa priestorov'}><VenueMap fullScreen {points} {selectionRevision} selected={selected?.id} onselect={(id) => select(id,true)} onlocation={() => { nearby = true; query = ''; }} english={en} fitKey={query} areaCenter={nearby ? userLocation.center : null} radiusKm={radius} />{#if selected}<SelectedVenue venue={selected} english={en} onopen={open} />{:else}<div class="map-selection-hint">{en ? 'Choose a pin or a venue from the list.' : 'Vyberte bod na mape alebo priestor zo zoznamu.'}</div>{/if}</section>
</div>
<VenuePreview bind:this={preview} english={en} />
