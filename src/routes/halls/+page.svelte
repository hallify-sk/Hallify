<script lang="ts">
  import { onMount } from 'svelte';
  import { booking } from '$lib/analytics';
  import { t } from '$lib/i18n.svelte';
  import SiteSections from '$lib/site/SiteSections.svelte';
  import { visibleSections } from '$lib/site-sections';
  import type { PageData } from './$types';

  interface Props { data: PageData; }
  const { data }: Props = $props();

  onMount(() => booking.viewHallList((data.halls ?? []).length));

  function parseArr(v: unknown): string[] {
    if (!v) return [];
    if (Array.isArray(v)) return v as string[];
    if (typeof v === 'string') {
      try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch { return []; }
    }
    return [];
  }

  const halls = $derived((data.halls ?? []).map((h) => ({ ...h, amenities: parseArr(h.amenities) })));

  const AMENITY_LABELS = $derived<Record<string, string>>({
    parking: t.hallDir.amenityParking, catering: t.hallDir.amenityCatering, av: t.hallDir.amenityAv,
    wifi: t.hallDir.amenityWifi, ac: t.hallDir.amenityAc, accessible: t.hallDir.amenityAccessible,
    outdoor: t.hallDir.amenityOutdoor, stage: t.hallDir.amenityStage,
    dancefloor: t.hallDir.amenityDancefloor, bar: t.hallDir.amenityBar
  });

  // A section with nothing to put in it is hidden rather than published as a
  // heading over blank space.
  const sections = $derived(
    visibleSections(data.site.sections, {
      hallCount: halls.length,
      hasContact: halls.some((h) => h.contact_phone || h.contact_email || h.contact_website || h.address),
      hasIntro: !!data.site.intro
    })
  );

  const labels = $derived({
    guests: t.hallDir.guests,
    viewVenue: t.hallDir.viewVenue,
    allVenues: t.nav.halls,
    about: t.hallDir.aboutHeading,
    amenities: t.hallProfile.amenities,
    contact: t.hallDir.contactHeading,
    ctaTitle: t.hallDir.ctaTitle,
    ctaBody: t.hallDir.ctaBody,
    ctaButton: t.hallDir.viewVenue,
    searchPlaceholder: t.hallDir.searchPlaceholder,
    minGuests: t.hallDir.minGuests,
    noMatches: t.hallDir.noHallsMatch
  });
</script>

<svelte:head><title>{data.domainOrg.name}</title></svelte:head>

{#if data.domainOrg.logoUrl}
  <img class="site-logo" src={data.domainOrg.logoUrl} alt={data.domainOrg.name} width="56" height="56" />
{/if}

<SiteSections
  {sections}
  org={{ name: data.domainOrg.name, logoUrl: data.domainOrg.logoUrl }}
  {halls}
  tagline={data.site.tagline}
  intro={data.site.intro}
  amenityLabels={AMENITY_LABELS}
  {labels}
/>

<style>
  .site-logo { display: block; width: 56px; height: 56px; object-fit: contain; margin-bottom: 4px; }
</style>
