<script lang="ts">
  import { imageSrcset } from '$lib/image-variants';
  import { pageTitle } from '$lib/page-title';
  import { DOW_KEYS } from '$lib/availability';
  import { getLocale, t } from '$lib/i18n.svelte';
  import { safeHref } from '$lib/safe-url';
  import Lightbox from '$lib/components/Lightbox.svelte';
  import MarketingShell from '$lib/marketing/MarketingShell.svelte';
  import VenueMap from '$lib/marketing/VenueMap.svelte';
  import Icon from '$lib/marketing/Icon.svelte';
  import { amenityLabels } from '$lib/marketing/amenities';
  import { priceBandLabel, priceGlyphs } from '$lib/marketing/types';
  import { absoluteUrl, metaDescription, venueJsonLd } from '$lib/marketing/venue-seo';
  import { hasCoordinates } from '$lib/venue-location';
  import { onMount } from 'svelte';
  import { trackListingClick, trackListingView } from '$lib/listing-tracker';
  import { mailHref, telHref } from '$lib/listings';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  const hall = $derived(data.hall);
  const en = $derived(getLocale() === 'en');

  const amenities = $derived(amenityLabels(hall.amenities, getLocale(), data.customAmenities));
  const website = $derived(safeHref(hall.contact_website));
  const canonical = $derived(en ? data.canonicalEn : data.canonicalSk);
  const description = $derived(metaDescription(hall.description, t.appHalls.metaFallback(hall.name, hall.max_people)));
  const title = $derived(pageTitle(hall.name, hall.address ? (hall.address.split(',').at(-1)?.trim() || hall.address) : null));
  const images = $derived([hall.cover_image_url, ...hall.gallery_images]
    .map(src => absoluteUrl(src, data.origin)).filter((src): src is string => !!src));
  const jsonLd = $derived(venueJsonLd({
    name: hall.name, description: hall.description, url: data.canonicalSk, images,
    address: hall.address, latitude: hall.latitude, longitude: hall.longitude, maxPeople: hall.max_people,
    telephone: hall.contact_phone, email: hall.contact_email, website: data.siteHref ?? website, amenities,
  }));
  const point = $derived(hasCoordinates(hall)
    ? [{ id: hall.id, name: hall.name, latitude: hall.latitude!, longitude: hall.longitude!, label: hall.name }]
    : []);

  // Monday first, as a Slovak week is read; DOW_KEYS is indexed by JS getDay().
  const WEEK = [1, 2, 3, 4, 5, 6, 0];
  const dayNames = $derived([t.appHalls.daySunday, t.appHalls.dayMonday, t.appHalls.dayTuesday, t.appHalls.dayWednesday, t.appHalls.dayThursday, t.appHalls.dayFriday, t.appHalls.daySaturday]);
  const hours = $derived(hall.opening_hours ?? {});
  const hasHours = $derived(WEEK.some(day => hours[DOW_KEYS[day]] ?? hours[String(day)]));

  onMount(() => trackListingView(data.listingRef));

  let activeIndex = $state<number | null>(null);
  let coverFailed = $state(false);
  let failedThumbs = $state<string[]>([]);
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description}>
  <link rel="canonical" href={canonical}>
  <link rel="alternate" hreflang="sk" href={data.canonicalSk}><link rel="alternate" hreflang="en" href={data.canonicalEn}><link rel="alternate" hreflang="x-default" href={data.canonicalSk}>
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Hallify">
  <meta property="og:title" content={hall.name}>
  <meta property="og:description" content={description}>
  <meta property="og:url" content={canonical}>
  <meta property="og:locale" content={en ? 'en_GB' : 'sk_SK'}>
  {#if images[0]}<meta property="og:image" content={images[0]}><meta property="og:image:alt" content={hall.name}><meta name="twitter:card" content="summary_large_image">{:else}<meta name="twitter:card" content="summary">{/if}
  {@html `<script type="application/ld+json">${jsonLd}</script>`}
</svelte:head>

<Lightbox images={hall.gallery_images} index={activeIndex} alt={hall.name} onclose={() => (activeIndex = null)} onindex={(i) => (activeIndex = i)} />

<MarketingShell audience="customer">
  <article class="wrap venue-page">
    <a class="venue-page-back" href={en ? '/priestory?lang=en' : '/priestory'}><Icon name="back" /> {t.appHalls.backToDirectory}</a>

    <header class="venue-page-hero">
      <div class="venue-page-intro">
        <!-- A venue not on Hallify is its own organisation: its name would only repeat. -->
        {#if !data.org.listingOnly}<p class="eyebrow">{data.org.name}{#if hall.is_partner}{' '}· {t.appHalls.partnerBadge}{/if}</p>{/if}
        <h1>{hall.name}</h1>
        <ul class="venue-page-facts">
          {#if hall.address}<li><Icon name="pin" size={15} /> {hall.address}</li>{/if}
          <li><Icon name="users" size={15} /> {t.appHalls.upTo} {hall.max_people} {t.appHalls.guestsWord}</li>
          {#if hall.price_band}<li><span class="price-band"><span class="sr-only">{priceBandLabel(hall.price_band, en)}</span><span aria-hidden="true">{priceGlyphs(hall.price_band)}<span class="price-band-rest">{priceGlyphs(3 - hall.price_band)}</span></span></span></li>{/if}
          {#if hall.has_floorplan}<li><Icon name="map" size={15} /> {t.appHalls.floorplanAvailable}</li>{/if}
        </ul>
      </div>
      <div class="venue-page-cover">
        {#if hall.cover_image_url && !coverFailed}
          <img src={hall.cover_image_url} srcset={imageSrcset(hall.cover_image_url)} sizes="(max-width: 900px) 100vw, 720px" alt={hall.name} width="720" height="460" onerror={() => (coverFailed = true)}>
        {:else}
          <div class="venue-page-no-photo" style:--hall-color={hall.color}><img src="/Hallify.svg" alt="" width="48" height="48"></div>
        {/if}
      </div>
    </header>

    <div class="venue-page-layout">
      <div class="venue-page-main">
        {#if hall.description}
          <section><h2>{t.appHalls.about}</h2><p class="venue-page-text">{hall.description}</p></section>
        {/if}

        {#if hall.gallery_images.length}
          <section>
            <h2>{t.appHalls.gallery}</h2>
            <div class="venue-page-gallery">
              {#each hall.gallery_images as src, i (src)}
                {#if !failedThumbs.includes(src)}
                  <button type="button" onclick={() => (activeIndex = i)} aria-label={`${t.appHalls.gallery} ${i + 1}/${hall.gallery_images.length}`}>
                    <img {src} srcset={imageSrcset(src)} sizes="(max-width: 900px) 50vw, 320px" alt="" loading="lazy" width="320" height="240" onerror={() => (failedThumbs = [...failedThumbs, src])}>
                  </button>
                {/if}
              {/each}
            </div>
          </section>
        {/if}

        {#if amenities.length}
          <section>
            <h2>{t.appHalls.amenities}</h2>
            <ul class="venue-page-chips">{#each amenities as label (label)}<li>{label}</li>{/each}</ul>
          </section>
        {/if}

        {#if hasHours}
          <section>
            <h2>{t.appHalls.openingHours}</h2>
            <dl class="venue-page-hours">
              {#each WEEK as day (day)}
                {@const entry = hours[DOW_KEYS[day]] ?? hours[String(day)]}
                {#if entry}<div><dt>{dayNames[day]}</dt><dd>{entry.open ? `${entry.from} – ${entry.to}` : t.appHalls.closed}</dd></div>{/if}
              {/each}
            </dl>
          </section>
        {/if}

        {#if point.length}
          <section>
            <h2>{t.appHalls.locationHeading}</h2>
            <div class="venue-page-map"><VenueMap points={point} selected={hall.id} english={en} fitKey={hall.id} /></div>
          </section>
        {/if}
      </div>

      <aside class="venue-page-aside">
        <div class="venue-page-book">
          {#if data.bookHref}
            <p>{t.appHalls.bookOnVenueSiteHint}</p>
            <a class="primary" href={data.bookHref}>{t.appHalls.bookOnVenueSite} <Icon /></a>
          {:else if data.direct}
            <!-- Booked directly with the venue: its own ways in, counted per click. -->
            <h2>{t.listings.bookDirectTitle}</h2>
            <p>{t.listings.bookDirectHint}</p>
            {#if data.direct.website}<a class="primary" href={data.direct.website} target="_blank" rel="noopener nofollow" onclick={() => trackListingClick(data.listingRef, 'website')}>{t.listings.visitWebsite} <Icon /></a>{/if}
            {#if data.direct.phone}<a class="venue-page-direct" href={telHref(data.direct.phone)} onclick={() => trackListingClick(data.listingRef, 'phone')}>{t.listings.call}: {data.direct.phone}</a>{/if}
            {#if data.direct.email}<a class="venue-page-direct" href={mailHref(data.direct.email)} onclick={() => trackListingClick(data.listingRef, 'email')}><Icon name="mail" size={15} /> {data.direct.email}</a>{/if}
            {#if data.org.listingOnly}<p class="venue-page-note">{t.listings.notOnHallify}</p>{/if}
          {:else}
            <h2>{t.appHalls.notBookableTitle}</h2>
            <p>{t.appHalls.notBookableHint}</p>
          {/if}
          {#if data.siteHref}<a class="venue-page-site" href={data.siteHref}>{t.appHalls.visitVenueSite} <Icon /></a>{/if}
        </div>

        {#if hall.pricing_info}
          <section><h2>{t.appHalls.pricing}</h2><p class="venue-page-text">{hall.pricing_info}</p></section>
        {/if}

        {#if hall.contact_phone || hall.contact_email || website}
          <section>
            <h2>{t.appHalls.contact}</h2>
            <ul class="venue-page-contact">
              {#if hall.contact_phone}<li><a href={telHref(hall.contact_phone)} onclick={() => trackListingClick(data.listingRef, 'phone')}>{hall.contact_phone}</a></li>{/if}
              {#if hall.contact_email}<li><a href={mailHref(hall.contact_email)} onclick={() => trackListingClick(data.listingRef, 'email')}><Icon name="mail" size={15} /> {hall.contact_email}</a></li>{/if}
              {#if website}<li><a href={website} target="_blank" rel="noopener nofollow" onclick={() => trackListingClick(data.listingRef, 'website')}>{hall.contact_website}</a></li>{/if}
            </ul>
          </section>
        {/if}
      </aside>
    </div>
  </article>
</MarketingShell>

<style>
  .venue-page { padding: 18px 0 90px; }
  .venue-page-back { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; color: var(--muted); margin-bottom: 26px; }
  .venue-page-back:hover { color: var(--accent-ink); }

  .venue-page-hero { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.1fr); gap: 48px; align-items: center; padding-bottom: 46px; border-bottom: 1px solid var(--line); }
  .venue-page-intro h1 { margin-bottom: 22px; overflow-wrap: anywhere; }
  .venue-page-intro .eyebrow { margin-bottom: 16px; }
  .venue-page-facts { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; color: var(--muted); font-size: 14px; line-height: 1.5; }
  .venue-page-facts li { display: flex; align-items: center; gap: 9px; }
  .venue-page-cover { border-radius: var(--radius); overflow: hidden; background: var(--subtle); aspect-ratio: 16 / 10; }
  .venue-page-cover img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .venue-page-no-photo { width: 100%; height: 100%; display: grid; place-items: center; background: linear-gradient(135deg, color-mix(in srgb, var(--hall-color, var(--accent)) 30%, var(--subtle)), var(--subtle)); }

  .venue-page-layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 56px; align-items: start; padding-top: 40px; }
  .venue-page-main { display: grid; gap: 44px; min-width: 0; }
  .venue-page section h2 { font-size: 22px; letter-spacing: -.045em; margin: 0 0 16px; }
  .venue-page-text { margin: 0; color: var(--muted); font-size: 14px; line-height: 1.85; white-space: pre-wrap; overflow-wrap: anywhere; }

  .venue-page-gallery { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .venue-page-gallery button { padding: 0; border: 0; border-radius: 10px; overflow: hidden; aspect-ratio: 4 / 3; background: var(--subtle); }
  .venue-page-gallery img { width: 100%; height: 100%; object-fit: cover; display: block; }

  .venue-page-chips { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 8px; }
  .venue-page-chips li { padding: 8px 13px; border: 1px solid var(--line); border-radius: 24px; font-size: 12px; color: var(--ink); }

  .venue-page-hours { margin: 0; display: grid; gap: 0; max-width: 420px; }
  .venue-page-hours div { display: flex; justify-content: space-between; gap: 20px; padding: 10px 0; border-bottom: 1px solid var(--line); font-size: 13px; }
  .venue-page-hours dt { color: var(--ink); font-weight: 550; }
  .venue-page-hours dd { margin: 0; color: var(--muted); }

  .venue-page-map { position: relative; height: 340px; border-radius: var(--radius); overflow: hidden; isolation: isolate; }

  .venue-page-aside { position: sticky; top: 24px; display: grid; gap: 30px; }
  .venue-page-aside section h2 { font-size: 17px; margin-bottom: 10px; }
  .venue-page-book { display: grid; gap: 14px; padding: 22px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); }
  .venue-page-book h2 { font-size: 17px; letter-spacing: -.04em; margin: 0; }
  .venue-page-book p { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.7; }
  .venue-page-book .primary { justify-content: space-between; }
  .venue-page-direct { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 600; color: var(--ink); overflow-wrap: anywhere; }
  .venue-page-direct:hover { color: var(--accent-ink); }
  .venue-page-book .venue-page-note { font-size: 12px; }
  .venue-page-site { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 650; color: var(--accent-ink); }
  .venue-page-contact { list-style: none; padding: 0; margin: 0; display: grid; gap: 9px; font-size: 13px; }
  .venue-page-contact a { display: inline-flex; align-items: center; gap: 7px; color: var(--ink); overflow-wrap: anywhere; }
  .venue-page-contact a:hover { color: var(--accent-ink); }

  @media (max-width: 900px) {
    .venue-page-hero { grid-template-columns: 1fr; gap: 28px; }
    .venue-page-cover { order: -1; }
    .venue-page-layout { grid-template-columns: 1fr; gap: 40px; }
    .venue-page-aside { position: static; }
  }
  @media (max-width: 600px) {
    .venue-page { padding-top: 6px; }
    .venue-page-gallery { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .venue-page-map { height: 260px; }
  }
</style>
