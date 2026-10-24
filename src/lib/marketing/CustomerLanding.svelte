<script lang="ts">
  import { imageSrcset } from '$lib/image-variants';
  import Icon from './Icon.svelte';
  import { onMount, untrack } from 'svelte';
  import { reveal } from './reveal';
  import { getLocale, t } from '$lib/i18n.svelte';
  import { goto, replaceState } from '$app/navigation';
  import { dev } from '$app/environment';
  import { DEFAULT_CENTER, DEMO_PINS, bestMatches, demoVenues, distanceKm, filterVenues, featuredVenues } from './discovery';
  import { userLocation, locateIfGranted } from './user-location.svelte';
  import { createSearchCenter } from './search-center.svelte';
  import VenuePreview from './VenuePreview.svelte';
  import SelectedVenue from './SelectedVenue.svelte';
  import VenueMap from './VenueMap.svelte';
  import { hasCoordinates } from '$lib/venue-location';
  import { listingImpression } from '$lib/listing-tracker';
  import VenueDirectLink from './VenueDirectLink.svelte';
  import { venueHref, bookingHref, venueListingRef, PRICE_BANDS, priceBandLabel, priceGlyphs, type PriceBand, type PublicVenue } from './types';
  let { halls, initialQuery = '', initialGuests = 0, initialDemo = dev }: { halls: PublicVenue[]; initialQuery?: string; initialGuests?: number; initialDemo?: boolean } = $props();
  const en = $derived(getLocale() === 'en');
  let query = $state(untrack(() => initialQuery)), guests = $state(untrack(() => initialGuests)), floorplanOnly = $state(false);
  let bands = $state<PriceBand[]>([]);
  let activeId = $state<string | null>(null), demo = $state(untrack(() => DEMO_PINS && !!initialDemo));
  let preview: { open: (venue: PublicVenue) => void };
  let selectionRevision = $state(0);
  // Covers that failed to load: the card shows the placeholder instead of the alt text.
  let failedCovers = $state<Record<string, true>>({});
  // Where "near" means, in order of preference: the place that was searched for, then
  // the visitor's own position, then nowhere -- which makes featuredVenues rotate
  // fairly instead of silently ranking everyone around the map origin.
  const searchCenter = createSearchCenter(() => query);
  const rankCenter = $derived(searchCenter.center ?? userLocation.center);
  // Nominatim answers with the full administrative chain; the first part is the place.
  const nearLabel = $derived(searchCenter.center ? (searchCenter.label || query).split(',')[0].trim() || null : null);
  const allVenues = $derived([...halls, ...(demo ? demoVenues(rankCenter ?? DEFAULT_CENTER, !!rankCenter, en) : [])]);
  onMount(() => { if (!query) void locateIfGranted(); });
  const searching = $derived(!!query.trim() || guests > 0 || floorplanOnly || bands.length > 0);
  const matching = $derived(filterVenues(allVenues, { query, guests, floorplan: floorplanOnly, booking: false }));
  const visible = $derived(filterVenues(allVenues, { query, guests, floorplan: floorplanOnly, booking: false, bands }));
  // A venue that never stated a price cannot satisfy a band filter, so say how many
  // the filter is holding back rather than letting them vanish without explanation.
  const unstatedHidden = $derived(bands.length ? matching.filter(venue => venue.price_band === null).length : 0);
  const featured = $derived(featuredVenues(bestMatches(visible, query), rankCenter));
  const others = $derived(visible.filter(venue => !featured.some(item => item.id === venue.id)));
  // The landing page shows a first selection, not every venue; the directory has the rest.
  const LANDING_LIMIT = 12;
  const othersShown = $derived(others.slice(0, Math.max(0, LANDING_LIMIT - featured.length)));
  const active = $derived(visible.find(h => h.id === activeId) ?? null);
  const points = $derived(visible.filter(h => hasCoordinates(h)).map(h => ({ id: h.id, name: h.name, latitude: h.latitude!, longitude: h.longitude!, label: `${h.max_people} ${en ? 'guests' : 'hostí'}`, demo: h.demo })));
  const explorerHref = $derived(`/priestory?${new URLSearchParams({ ...(query.trim() ? { q: query.trim() } : {}), ...(guests ? { guests: String(guests) } : {}), ...(floorplanOnly ? { floorplan: '1' } : {}), ...(bands.length ? { price: bands.join(',') } : {}), demo: demo ? '1' : '0', ...(en ? { lang: 'en' } : {}) })}`);
  function toggleBand(band: PriceBand) {
    bands = bands.includes(band) ? bands.filter(item => item !== band) : PRICE_BANDS.filter(item => item === band || bands.includes(item));
  }
  function distanceLabel(venue: PublicVenue): string | null {
    if (!rankCenter || !hasCoordinates(venue)) return null;
    return `${Math.round(distanceKm(rankCenter, { latitude: venue.latitude!, longitude: venue.longitude! }))} km`;
  }
  function openVenue(venue: PublicVenue) { if (venue.demo) preview.open(venue); else void goto(venueHref(venue)); }
  function search(event: SubmitEvent) {
    event.preventDefault();
    void goto(explorerHref);
  }
  function reset() {
    query = ''; guests = 0; floorplanOnly = false; bands = []; activeId = null;
    const url = new URL(window.location.href);
    url.searchParams.delete('q'); url.searchParams.delete('guests'); url.searchParams.delete('price');
    replaceState(url, {});
  }
</script>

{#snippet priceBandMark(band: PriceBand)}
<span class="price-band"><span class="sr-only">{priceBandLabel(band, en)}</span><span aria-hidden="true">{priceGlyphs(band)}<span class="price-band-rest">{priceGlyphs(3 - band)}</span></span></span>
{/snippet}

{#snippet priceTag(venue: PublicVenue)}
{#if venue.price_band}{@render priceBandMark(venue.price_band)}{/if}{#if venue.pricing_info}<small>{venue.pricing_info}</small>{:else if !venue.price_band}<span class="price-unstated">{en ? 'Price on request' : 'Cena na dopyt'}</span>{/if}
{/snippet}

{#snippet priceChips()}
<div class="occasion-filter price-filter" role="group" aria-label={en ? 'Price range' : 'Cenové rozpätie'}>
  <span class="filter-label">{en ? 'Price' : 'Cena'}</span>
  {#each PRICE_BANDS as band (band)}<button type="button" aria-pressed={bands.includes(band)} onclick={() => toggleBand(band)}><span class="sr-only">{priceBandLabel(band, en)}</span><span aria-hidden="true">{priceGlyphs(band)}</span></button>{/each}
  {#if bands.length}<button type="button" class="filter-clear" onclick={() => bands = []}>{en ? 'Any price' : 'Ľubovoľná cena'}</button>{/if}
</div>
{#if bands.length}<p class="price-filter-note">{en ? 'Only venues that stated a price range are shown.' : 'Zobrazujú sa len priestory s uvedenou cenovou úrovňou.'}{#if unstatedHidden}{' '}{en ? `${unstatedHidden} without a stated price ${unstatedHidden === 1 ? 'is' : 'are'} hidden.` : `${unstatedHidden} ${t.units.venues(unstatedHidden)} bez uvedenej ceny ${unstatedHidden === 1 ? 'je skrytý' : unstatedHidden <= 4 ? 'sú skryté' : 'je skrytých'}.`}{/if}</p>{/if}
{/snippet}

{#snippet venueCards(collection: PublicVenue[], highlight: boolean)}
<div class="venue-results">{#each collection as venue (venue.id)}<article class="venue-card" class:venue-active={active?.id === venue.id} class:venue-featured={highlight} use:listingImpression={venueListingRef(venue)}>
      <a class="venue-photo" href={venueHref(venue)} onclick={(event) => { if (venue.demo) { event.preventDefault(); preview.open(venue); } }}>{#if venue.cover_image_url && !failedCovers[venue.id]}<img src={venue.cover_image_url} srcset={imageSrcset(venue.cover_image_url)} sizes="(max-width: 600px) 100vw, 440px" alt={venue.name} loading="lazy" width="440" height="280" onerror={() => (failedCovers[venue.id] = true)}>{:else}<div class="no-photo"><img src="/Hallify.svg" alt="" width="45" height="45"><span>{en ? 'Explore venue details' : 'Spoznajte priestor'}</span></div>{/if}</a>
      <div class="venue-topline">{#if venue.demo || venue.address}<span class="venue-place">{venue.demo ? (en ? "Demo venue" : "Ukážkový priestor") : venue.address}</span>{/if}{#if venue.is_partner}<span class="partner-label">{en ? "Hallify partner" : "Partner Hallify"}</span>{:else if venue.has_floorplan}<span class="partner-label">{en ? 'Floorplan available' : 'S pôdorysom'}</span>{/if}</div>
      <h3><a href={venueHref(venue)} onclick={(event) => { if (venue.demo) { event.preventDefault(); preview.open(venue); } }}>{venue.name}</a></h3><p class="venue-meta">{en ? 'Up to' : 'Do'} {venue.max_people} {en ? 'guests' : 'hostí'}{#if distanceLabel(venue)}{' '}· {distanceLabel(venue)}{/if}</p>
      <div class="venue-bottom"><span class="venue-price">{@render priceTag(venue)}</span><a href={venueHref(venue)} onclick={(event) => { if (venue.demo) { event.preventDefault(); preview.open(venue); } }} aria-label={`${en ? 'View' : 'Zobraziť'} ${venue.name}`}><Icon /></a></div>
      {#if hasCoordinates(venue) || bookingHref(venue) || venue.contact}<div class="venue-card-actions">
        {#if hasCoordinates(venue)}<button class="show-on-map" type="button" onclick={() => { activeId = venue.id; selectionRevision += 1; document.getElementById('main')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); }}>{en ? 'Show on map' : 'Zobraziť na mape'}</button>{/if}
        {#if bookingHref(venue)}<a class="venue-book-link" href={bookingHref(venue)} aria-label={`${t.appHalls.bookOnVenueSite}: ${venue.name}`}>{t.appHalls.bookOnVenueSite} <Icon size={14} /></a>{:else}<VenueDirectLink {venue} class="venue-book-link" />{/if}
      </div>{/if}
    </article>{/each}</div>
{/snippet}


<section class="discovery-hero wrap">
  <div class="hero-copy">
    <p class="eyebrow">{en ? 'Discover event venues' : 'Sály a priestory na podujatia'}</p>
    <h1>{en ? 'Find a venue' : 'Nájdite priestor'}<br><span>{en ? 'for your event.' : 'pre svoju akciu.'}</span></h1>
    <p class="lead">{en ? 'Venues for weddings, celebrations and business events. Compare locations, capacity and amenities on the map.' : 'Priestory na svadby, oslavy a firemné podujatia. Porovnajte ich na mape podľa miesta, kapacity a vybavenia.'}</p>
    <form class="search-form" method="GET" action="/priestory" onsubmit={search}>
      {#if floorplanOnly}<input type="hidden" name="floorplan" value="1">{/if}
      {#if bands.length}<input type="hidden" name="price" value={bands.join(',')}>{/if}
      {#if DEMO_PINS}<input type="hidden" name="demo" value={demo ? '1' : '0'}>{/if}
      {#if en}<input type="hidden" name="lang" value="en">{/if}
      <div class="search-row">
        <label>{en ? 'Where are you planning your event?' : 'Kde plánujete akciu?'}<input name="q" type="search" bind:value={query} placeholder={en ? 'City or venue name' : 'Mesto alebo názov priestoru'} maxlength="150"></label>
        <label>{en ? 'Number of guests' : 'Počet hostí'}<span class="select-wrap"><select name="guests" bind:value={guests}><option value={0}>{en ? 'Any capacity' : 'Ľubovoľný'}</option>{#each [30,60,100,150,250] as n}<option value={n}>{n} {en ? 'guests' : 'hostí'}</option>{/each}{#if initialGuests > 0 && ![30,60,100,150,250].includes(initialGuests)}<option value={initialGuests}>{initialGuests} {en ? 'guests' : 'hostí'}</option>{/if}</select><Icon name="chevron" /></span></label>
      </div>
      <button class="primary search-submit" type="submit">{en ? 'Find a venue' : 'Nájsť priestor'} <span aria-hidden="true"><Icon /></span></button>
    </form>
    <div class="occasion-filter" role="group" aria-label={en ? 'Venue features' : 'Možnosti priestoru'}><button type="button" aria-pressed={!floorplanOnly} onclick={() => floorplanOnly = false}>{en ? 'Any venue type' : 'Bez filtra'}</button><button type="button" aria-pressed={floorplanOnly} onclick={() => floorplanOnly = true}>{en ? 'With a floorplan' : 'S pôdorysom'}</button></div>
    {@render priceChips()}
    {#if DEMO_PINS}<div class="discovery-demo-control"><button type="button" aria-pressed={demo} onclick={() => demo = !demo}>{demo ? (en ? 'Demo pins on' : 'Ukážkové body zapnuté') : (en ? 'Try demo pins' : 'Vyskúšať ukážkové body')}</button><span>{en ? 'Click a pin to explore the venue.' : 'Kliknite na bod a spoznajte priestor.'}</span></div>{/if}
  </div>
  <div class="map-panel" id="home-map" aria-label={en ? 'Venue locations' : 'Polohy priestorov'}>
    <VenueMap {points} {selectionRevision} selected={active?.id} onselect={(id) => { activeId = id; selectionRevision += 1; }} onlocation={() => query = ''} english={en} fitKey={query} areaCenter={rankCenter} areaLabel={nearLabel} {explorerHref} />
    {#if active}<SelectedVenue venue={active} english={en} onopen={openVenue} onclose={() => activeId = null} />{/if}
  </div>
</section>

<section use:reveal class="wrap venues-section" id="discover">
  <div class="section-heading"><p class="eyebrow">{en ? 'From an idea to a place' : 'Od nápadu k miestu'}</p><h2>{searching ? (en ? 'Your search results.' : 'Priestory vo vašom výbere.') : (en ? 'Find your kind of space.' : 'Vyberte si svoj priestor.')}</h2><p aria-live="polite">{visible.length} {t.units.venues(visible.length)} {en ? `${visible.length === 1 ? 'matches' : 'match'} your selection. Confirm dates and pricing with the operator.` : 'vo vašom výbere. Termín aj cenu potvrdí prevádzkovateľ.'}</p></div>
  {#if visible.length}
    {#if featured.length}
      <h3 class="discovery-group-heading">{nearLabel ? (en ? `Partners near ${nearLabel}` : `Partneri v okolí: ${nearLabel}`) : rankCenter ? (en ? 'Featured partners near you' : 'Partneri vo vašom okolí') : (en ? 'Featured Hallify partners' : 'Vybrané priestory partnerov Hallify')}</h3>
      {@render venueCards(featured,true)}
      {#if othersShown.length}<h3 class="discovery-group-heading secondary">{searching ? (en ? 'Other results' : 'Ďalšie výsledky') : (en ? 'More venues' : 'Ďalšie priestory')}</h3>{@render venueCards(othersShown,false)}{/if}
    {:else}{@render venueCards(othersShown,false)}{/if}
    {#if visible.length > featured.length + othersShown.length}<div class="venues-more"><a class="primary" href={explorerHref}>{t.appHalls.seeAllVenues(visible.length)} <Icon /></a></div>{/if}
    {#if visible.some(h => !hasCoordinates(h))}<p class="fine location-note">{en ? 'Some venues have not set their map location yet. They remain available in this list.' : 'Niektoré priestory zatiaľ nemajú nastavenú polohu na mape. Nájdete ich v tomto zozname.'}</p>{/if}
  {:else}
    <div class="empty-state"><h3>{halls.length ? (en ? 'No venues match this selection.' : 'Tomuto výberu zatiaľ nezodpovedá žiadny priestor.') : (en ? 'The first venues are on their way.' : 'Prvé priestory sú na ceste.')}</h3><p>{halls.length ? (en ? 'Try a different location or a smaller guest count.' : 'Skúste inú lokalitu alebo menší počet hostí.') : (en ? 'Run a venue? Publish it and help people find their next event space.' : 'Prevádzkujete sálu? Zverejnite ju a pomôžte ľuďom nájsť miesto na ich ďalšiu akciu.')}</p>{#if halls.length}<button class="primary" onclick={reset}>{en ? 'Reset search' : 'Obnoviť vyhľadávanie'}</button>{:else}<a class="primary" href="/pre-prevadzkovatelov">{en ? 'List your venue' : 'Predstaviť svoj priestor'} <Icon /></a>{/if}</div>
  {/if}
</section>

<section use:reveal class="wrap clarity-section"><div><h2>{en ? 'See more.' : 'Predstavte si viac.'}<br>{en ? 'Decide with confidence.' : 'Rozhodujte sa ľahšie.'}</h2><p>{en ? 'Find the details a single photograph cannot tell you.' : 'Na detaile priestoru nájdete to, čo sa z jednej fotografie nedozviete.'}</p></div><div class="clarity-list"><article><span aria-hidden="true"><Icon /></span><div><h3>{en ? 'A space that fits' : 'Priestor, ktorý sedí'}</h3><p>{en ? 'Capacity, amenities and available floorplans help you picture your event.' : 'Kapacita, vybavenie a dostupné pôdorysy vám pomôžu predstaviť si vlastnú akciu.'}</p></div></article><article><span aria-hidden="true">€</span><div><h3>{en ? 'A clearer idea of the price' : 'Jasnejšia predstava o cene'}</h3><p>{en ? 'Read the pricing information or ask the operator for an individual quote.' : 'Pozrite si cenové informácie alebo požiadajte prevádzkovateľa o individuálnu ponuku.'}</p></div></article><article><span aria-hidden="true">↔</span><div><h3>{en ? 'Agree on the details directly' : 'Detaily dohodnete priamo'}</h3><p>{en ? 'Review the venue, check its calendar and contact the people who know it best.' : 'Spoznajte priestor, pozrite kalendár a spojte sa s ľuďmi, ktorí ho poznajú najlepšie.'}</p></div></article></div></section>
<section use:reveal class="wrap bridge"><img src="/Hallify.svg" alt="" width="50" height="50"><div><h2>{en ? 'Your space could be next.' : 'Váš priestor môže byť ďalší.'}</h2><p>{en ? 'Show it to people planning their next gathering.' : 'Ukážte ho ľuďom, ktorí práve plánujú svoju akciu.'}</p></div><a href="/pre-prevadzkovatelov">{en ? 'Hallify for businesses' : 'Hallify pre prevádzkovateľov'} <Icon /></a></section>

<VenuePreview bind:this={preview} english={en} />
