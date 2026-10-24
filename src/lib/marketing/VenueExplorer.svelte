<script lang="ts">
  import { imageSrcset } from '$lib/image-variants';
  import Icon from './Icon.svelte';
  import { onMount, tick, untrack } from 'svelte';
  import { dev } from '$app/environment';
  import { goto, replaceState } from '$app/navigation';
  import { page } from '$app/state';
  import { getLocale, t } from '$lib/i18n.svelte';
  import { hasCoordinates } from '$lib/venue-location';
  import { DEFAULT_CENTER, bestMatches, demoVenues, distanceKm, filterVenues, featuredVenues, parseVenueSort, sortVenues, type VenueSort } from './discovery';
  import { formatDate } from '$lib/format';
  import { userLocation, locateUser, locateIfGranted } from './user-location.svelte';
  import { createSearchCenter } from './search-center.svelte';
  import { venueHref, bookingHref, PRICE_BANDS, parsePriceBands, priceBandLabel, priceGlyphs, type PriceBand, type PublicVenue } from './types';
  import VenueMap from './VenueMap.svelte';
  import VenuePreview from './VenuePreview.svelte';
  import SelectedVenue from './SelectedVenue.svelte';
  let { halls, initialQuery = '', initialGuests = 0, initialDemo = dev, initialFloorplan = false }: { halls: PublicVenue[]; initialQuery?: string; initialGuests?: number; initialDemo?: boolean; initialFloorplan?: boolean } = $props();
  const en = $derived(getLocale() === 'en');
  let query = $state(untrack(() => initialQuery)), guests = $state(untrack(() => initialGuests));
  let floorplan = $state(untrack(() => initialFloorplan)), booking = $state(false), amenity = $state(''), radius = $state(50);
  // Off until the visitor asks for an area (the button, the map's location control or
  // the radius). It used to start on, so a typed venue name became the centre of a
  // 50 km circle around wherever the geocoder placed it, and the venue itself vanished.
  let nearby = $state(false);
  // Read straight from the URL rather than through a prop: the landing page hands the
  // chosen bands over in ?price=, and page.url is the same value on the server render
  // and after a client-side navigation, so the first paint already has the filter on.
  let bands = $state<PriceBand[]>(untrack(() => parsePriceBands(page.url.searchParams.get('price'))));
  let filtersOpen = $state(false);
  let selectionRevision = $state(0);
  // Covers that failed to load: the card shows the placeholder instead of a broken image.
  let failedCovers = $state<Record<string, true>>({});
  let demo = $state(untrack(() => initialDemo)), selectedId = $state<string | null>(null);
  let preview: { open: (venue: PublicVenue) => void };
  let list: HTMLDivElement;
  // Where "near" means, in order of preference: the place that was searched for, then
  // the visitor's own position, then nowhere -- and "nowhere" is a real answer that
  // makes featuredVenues rotate fairly, not a reason to fall back to the map origin.
  const searchCenter = createSearchCenter(() => query);
  const rankCenter = $derived(searchCenter.center ?? userLocation.center);
  // Nominatim answers with the full administrative chain; the first part is the place.
  const nearLabel = $derived(searchCenter.center ? (searchCenter.label || query).split(',')[0].trim() || null : null);
  const venues = $derived([...halls, ...(demo ? demoVenues(rankCenter ?? DEFAULT_CENTER, !!rankCenter, en) : [])]);
  const base = $derived({ query, guests, floorplan, booking, center: nearby ? rankCenter : null, radius, centerIsQuery: !!searchCenter.center });
  // Sort order and a date, both kept in the URL so a result list can be shared.
  let sort = $state<VenueSort>(untrack(() => parseVenueSort(page.url.searchParams.get('sort'))));
  let date = $state(untrack(() => page.url.searchParams.get('date') ?? ''));
  // Which venues are free on the date. Asked of the server, because it depends on
  // bookings, blocked days and the plan's monthly cap, none of which the page has.
  let availability = $state<{ date: string; ids: Set<string> } | null>(null);
  let availabilityState = $state<'idle' | 'loading' | 'error'>('idle');
  $effect(() => {
    const wanted = date;
    if (!wanted) { availability = null; availabilityState = 'idle'; return; }
    availabilityState = 'loading';
    const controller = new AbortController();
    fetch(`/api/venues/availability?date=${encodeURIComponent(wanted)}`, { signal: controller.signal, headers: { accept: 'application/json' } })
      .then(response => response.ok ? response.json() as Promise<{ date: string; available: string[] }> : Promise.reject(new Error(String(response.status))))
      .then(body => { availability = { date: body.date, ids: new Set(body.available) }; availabilityState = 'idle'; })
      .catch(() => { if (!controller.signal.aborted) { availability = null; availabilityState = 'error'; } });
    return () => controller.abort();
  });
  const dateActive = $derived(!!date && availability?.date === date);
  // Demo venues have no calendar; the ones that "take bookings" count as free.
  const freeOnDate = (venue: PublicVenue) => !dateActive || (venue.demo ? !!venue.allow_reservations : !!availability?.ids.has(venue.id));
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  const matching = $derived(filterVenues(venues, base).filter(v => (!amenity || v.amenities.includes(amenity)) && freeOnDate(v)));
  const visible = $derived(filterVenues(venues, { ...base, bands }).filter(v => (!amenity || v.amenities.includes(amenity)) && freeOnDate(v)));
  // A venue that never stated a price cannot satisfy a band filter, so say how many
  // the filter is holding back rather than letting them vanish without explanation.
  const unstatedHidden = $derived(bands.length ? matching.filter(v => v.price_band === null).length : 0);
  let searchSubmitted = $state(false);
  const searching = $derived(searchSubmitted || !!query.trim() || guests > 0 || floorplan || booking || !!amenity || radius !== 50 || bands.length > 0 || !!date);
  // Partners lead only among the best matches (a town search: venues in that town).
  const featured = $derived(sort === 'recommended' ? featuredVenues(bestMatches(visible, query), rankCenter) : []);
  const others = $derived(visible.filter(venue => !featured.some(item => item.id === venue.id)));
  // The list in display order. Featured partners lead only the recommended order.
  const ordered = $derived(sort === 'recommended' ? [...featured, ...others] : sortVenues(visible, sort, rankCenter));
  // The list is paged; the map always shows every match.
  const PAGE_SIZE = 24;
  let shown = $state(PAGE_SIZE);
  const filterKey = $derived(JSON.stringify([query, guests, floorplan, booking, amenity, radius, nearby, bands, date, sort, demo]));
  $effect(() => { void filterKey; shown = PAGE_SIZE; });
  const selected = $derived(visible.find(v => v.id === selectedId) ?? null);
  const points = $derived(visible.filter(v => hasCoordinates(v)).map(v => ({ id:v.id, name:v.name, latitude:v.latitude!, longitude:v.longitude!, label:`${v.max_people} ${en ? 'guests' : 'hostí'}`, demo:v.demo })));
  onMount(() => { if (!query) void locateIfGranted(); });
  async function select(id: string, fromMap = false) {
    selectedId = id; selectionRevision += 1;
    // A pin can belong to a result further down than the list shows yet.
    const index = ordered.findIndex(venue => venue.id === id);
    if (fromMap && index >= shown) { shown = Math.ceil((index + 1) / PAGE_SIZE) * PAGE_SIZE; await tick(); }
    if (fromMap) list?.querySelector<HTMLElement>(`[data-venue-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block:'nearest', behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
  function open(venue: PublicVenue) { if (venue.demo) preview.open(venue); else void goto(venueHref(venue)); }
  function distanceLabel(venue: PublicVenue): string | null {
    if (!rankCenter || !hasCoordinates(venue)) return null;
    return `${Math.round(distanceKm(rankCenter, { latitude: venue.latitude!, longitude: venue.longitude! }))} km`;
  }
  function toggleBand(band: PriceBand) {
    bands = bands.includes(band) ? bands.filter(item => item !== band) : PRICE_BANDS.filter(item => item === band || bands.includes(item));
    writeBands();
  }
  function writeBands() {
    const url = new URL(location.href);
    if (bands.length) url.searchParams.set('price', bands.join(',')); else url.searchParams.delete('price');
    replaceState(url, {});
  }
  function writeParam(name: string, value: string) {
    const url = new URL(location.href);
    if (value) url.searchParams.set(name, value); else url.searchParams.delete(name);
    replaceState(url, {});
  }
  function toggleNearby() {
    if (nearby && rankCenter) { nearby = false; return; }
    nearby = true;
    // A typed place is already the centre; clearing the box would throw it away.
    if (searchCenter.center) return;
    query = '';
    if (!userLocation.center) void locateUser();
  }
  function reset() {
    query = ''; guests = 0; searchSubmitted = false; radius = 50; floorplan = false; booking = false; amenity = ''; nearby = false; bands = []; selectedId = null; date = ''; sort = 'recommended';
    const url = new URL(location.href); for (const name of ['q', 'guests', 'floorplan', 'price', 'date', 'sort']) url.searchParams.delete(name); replaceState(url, {});
  }
  function search(event: SubmitEvent) {
    event.preventDefault(); searchSubmitted = true; const url = new URL(location.href);
    if (query.trim()) url.searchParams.set('q',query.trim()); else url.searchParams.delete('q');
    if (guests) url.searchParams.set('guests',String(guests)); else url.searchParams.delete('guests');
    if (floorplan) url.searchParams.set('floorplan','1'); else url.searchParams.delete('floorplan');
    if (bands.length) url.searchParams.set('price',bands.join(',')); else url.searchParams.delete('price');
    url.searchParams.set('demo',demo ? '1' : '0');
    replaceState(url,{});
  }
</script>

{#snippet priceTag(venue: PublicVenue)}
{#if venue.price_band}<span class="price-band"><span class="sr-only">{priceBandLabel(venue.price_band, en)}</span><span aria-hidden="true">{priceGlyphs(venue.price_band)}<span class="price-band-rest">{priceGlyphs(3 - venue.price_band)}</span></span></span>{/if}{#if venue.pricing_info}<span class="price-note">{venue.pricing_info}</span>{:else if !venue.price_band}<span class="price-note">{en ? 'Price on request' : 'Cena na dopyt'}</span>{/if}
{/snippet}

{#snippet resultCards(collection: PublicVenue[], highlight: boolean)}
{#each collection as venue (venue.id)}
        <article class="explorer-result" class:is-selected={selectedId === venue.id} class:featured-result={highlight} data-venue-id={venue.id}>
          <button class="explorer-result-select" onclick={() => select(venue.id)} aria-pressed={selectedId === venue.id}>
            {#if venue.cover_image_url && !failedCovers[venue.id]}<img src={venue.cover_image_url} srcset={imageSrcset(venue.cover_image_url)} sizes="112px" alt="" width="112" height="100" loading="lazy" onerror={() => (failedCovers[venue.id] = true)}>{:else}<div class="explorer-no-photo"><img src="/Hallify.svg" alt="" width="30" height="30"></div>{/if}
            <span class="explorer-result-copy">{#if venue.demo || venue.address}<small>{venue.demo ? (en ? 'Demo venue' : 'Ukážkový priestor') : venue.address}</small>{/if}<strong>{venue.name}</strong><span>{venue.max_people} {en ? 'guests' : 'hostí'}{#if distanceLabel(venue)}{' '}· {distanceLabel(venue)}{/if}</span><span class="result-features">{venue.is_partner ? (en ? "Hallify partner / " : "Partner Hallify / ") : ""}{venue.has_floorplan ? (en ? 'Floorplan' : 'Pôdorys') : (en ? 'Venue profile' : 'Profil priestoru')}{venue.allow_reservations ? (en ? ' / Booking' : ' / Rezervácie') : ''}</span></span>
          </button>
          <div class="explorer-result-footer"><span class="explorer-price">{@render priceTag(venue)}</span><span class="explorer-result-actions">{#if bookingHref(venue)}<a href={bookingHref(venue)} aria-label={`${t.appHalls.bookOnVenueSite}: ${venue.name}`}>{t.appHalls.bookOnVenueSite}</a>{/if}{#if venue.demo}<button onclick={() => open(venue)}>{en ? 'Details' : 'Detail'} <Icon /></button>{:else}<a href={venueHref(venue)} aria-label={`${en ? 'Details' : 'Detail'}: ${venue.name}`}>{en ? 'Details' : 'Detail'} <Icon /></a>{/if}</span></div>
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
      <div class="explorer-filter-row"><label>{t.appHalls.dateLabel}<input class="explorer-date" type="date" min={today} bind:value={date} onchange={() => writeParam('date', date)}></label><label>{t.appHalls.sortLabel}<span class="select-wrap"><select bind:value={sort} onchange={() => writeParam('sort', sort === 'recommended' ? '' : sort)}><option value="recommended">{t.appHalls.sortRecommended}</option><option value="distance" disabled={!rankCenter}>{t.appHalls.sortDistance}</option><option value="capacity-desc">{t.appHalls.sortCapacityDesc}</option><option value="capacity-asc">{t.appHalls.sortCapacityAsc}</option><option value="price">{t.appHalls.sortPrice}</option><option value="name">{t.appHalls.sortName}</option></select><Icon name="chevron" /></span></label></div>
      {#if date}<p class="price-filter-note" aria-live="polite">{availabilityState === 'loading' ? t.appHalls.dateChecking : availabilityState === 'error' ? t.appHalls.dateFailed : t.appHalls.dateNote(formatDate(date, getLocale()))} <button type="button" class="filter-clear" onclick={() => { date = ''; writeParam('date', ''); }}>{t.appHalls.dateClear}</button></p>{/if}
      <div class="explorer-chips"><button aria-pressed={floorplan} onclick={() => floorplan = !floorplan}>{en ? 'With a floorplan' : 'S pôdorysom'} {floorplan ? '✓' : '+'}</button><button aria-pressed={booking} onclick={() => booking = !booking}>{en ? 'Booking available' : 'Možnosť rezervácie'} {booking ? '✓' : '+'}</button></div>
      <div class="explorer-chips price-filter" role="group" aria-label={en ? 'Price range' : 'Cenové rozpätie'}><span class="filter-label">{en ? 'Price' : 'Cena'}</span>{#each PRICE_BANDS as band (band)}<button type="button" aria-pressed={bands.includes(band)} onclick={() => toggleBand(band)}><span class="sr-only">{priceBandLabel(band, en)}</span><span aria-hidden="true">{priceGlyphs(band)}</span></button>{/each}{#if bands.length}<button type="button" class="filter-clear" onclick={() => { bands = []; writeBands(); }}>{en ? 'Any price' : 'Ľubovoľná cena'}</button>{/if}</div>
      {#if bands.length}<p class="price-filter-note">{en ? 'Only venues that stated a price range are shown.' : 'Zobrazujú sa len priestory s uvedenou cenovou úrovňou.'}{#if unstatedHidden}{' '}{en ? `${unstatedHidden} without a stated price ${unstatedHidden === 1 ? 'is' : 'are'} hidden.` : `${unstatedHidden} ${t.units.venues(unstatedHidden)} bez uvedenej ceny ${unstatedHidden === 1 ? 'je skrytý' : unstatedHidden <= 4 ? 'sú skryté' : 'je skrytých'}.`}{/if}</p>{/if}
      <div class="nearby-controls"><button class:nearby-active={nearby && !!rankCenter} aria-pressed={nearby && !!rankCenter} disabled={userLocation.status === 'loading'} onclick={toggleNearby}><Icon name="locate" /> {userLocation.status === 'loading' ? (en ? 'Finding location…' : 'Hľadám polohu…') : nearLabel ? (en ? `Around ${nearLabel}` : `V okolí: ${nearLabel}`) : (en ? 'Around me' : 'V mojom okolí')}</button>{#if rankCenter}<label><span class="sr-only">{en ? 'Distance radius' : 'Vzdialenosť'}</span><span class="select-wrap"><select bind:value={radius} onchange={() => nearby = true}>{#each [10,25,50,100] as distance}<option value={distance}>{distance} km</option>{/each}</select><Icon name="chevron" /></span></label><span class="nearby-status">{nearby ? (en ? 'Within radius' : 'V okruhu') : (en ? 'Everywhere' : 'Všade')}</span>{/if}</div>
      <div class="explorer-demo-row"><label><input type="checkbox" bind:checked={demo}>{en ? 'Demo venues' : 'Ukážkové priestory'}</label><button onclick={reset}>{en ? 'Reset filters' : 'Zrušiť filtre'}</button></div>
      </div>
    </div>
    <div class="explorer-results" bind:this={list}>
      <p class="explorer-result-count" aria-live="polite">{visible.length} {t.units.venues(visible.length)} {en ? 'in your selection' : 'vo vašom výbere'}</p>
      {#if featured.length}
        <h2 class="explorer-group-heading">{nearLabel ? (en ? `Partners near ${nearLabel}` : `Partneri v okolí: ${nearLabel}`) : rankCenter ? (en ? 'Featured partners nearby' : 'Partneri vo vašom okolí') : (en ? 'Featured Hallify partners' : 'Vybrané priestory partnerov')}</h2>
        {@render resultCards(featured,true)}
        {#if others.length}<h2 class="explorer-group-heading secondary">{searching ? (en ? 'Other results' : 'Ďalšie výsledky') : (en ? 'More venues' : 'Ďalšie priestory')}</h2>{@render resultCards(others.slice(0, Math.max(0, shown - featured.length)),false)}{/if}
      {:else}
        <h2 class="explorer-group-heading">{searching ? (en ? 'Search results' : 'Výsledky vyhľadávania') : (en ? 'All venues' : 'Všetky priestory')}</h2>
        {@render resultCards(ordered.slice(0, shown),false)}
      {/if}
      {#if ordered.length > shown}<button type="button" class="explorer-more" onclick={() => (shown += PAGE_SIZE)}>{t.appHalls.showMore(ordered.length - shown)}</button>{/if}
      {#if visible.some(v => !hasCoordinates(v))}<p class="fine">{en ? 'Venues without a saved position appear in the list.' : 'Priestory bez nastavenej polohy nájdete v zozname.'}</p>{/if}
    </div>
  </aside>
  <section class="explorer-map" aria-label={en ? 'Venue map' : 'Mapa priestorov'}><VenueMap fullScreen {points} {selectionRevision} selected={selected?.id} onselect={(id) => select(id,true)} onlocation={() => { nearby = true; query = ''; }} english={en} fitKey={query} areaCenter={nearby ? rankCenter : null} areaLabel={nearLabel} radiusKm={radius} />{#if selected}<SelectedVenue venue={selected} english={en} onopen={open} onclose={() => selectedId = null} />{/if}</section>
</div>
<VenuePreview bind:this={preview} english={en} />
