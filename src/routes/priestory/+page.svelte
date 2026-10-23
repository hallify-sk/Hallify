<script lang="ts">
  import { pageTitle } from '$lib/page-title';
  import { getLocale } from '$lib/i18n.svelte';
  import MarketingShell from '$lib/marketing/MarketingShell.svelte';
  import VenueExplorer from '$lib/marketing/VenueExplorer.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
  const en = $derived(getLocale() === 'en');
</script>
<svelte:head>
  <title>{pageTitle(en ? 'All venues' : 'Všetky priestory')}</title>
  <meta name="description" content={en ? 'Explore venues on the map. Search by location, guest count and venue features.' : 'Preskúmajte priestory na mape. Hľadajte podľa miesta, počtu hostí a možností priestoru.'}>
  <link rel="canonical" href={en ? data.canonicalEn : data.canonicalSk}>
  <link rel="alternate" hreflang="sk" href={data.canonicalSk}><link rel="alternate" hreflang="en" href={data.canonicalEn}><link rel="alternate" hreflang="x-default" href={data.canonicalSk}>
  <meta property="og:type" content="website"><meta property="og:title" content={en ? 'All venues | Hallify' : 'Všetky priestory | Hallify'}><meta property="og:url" content={en ? data.canonicalEn : data.canonicalSk}><meta property="og:image" content={data.ogImage}><meta name="twitter:card" content="summary_large_image">
</svelte:head>
<MarketingShell audience="customer" explorer>
  {#key `${data.q}:${data.guests}:${data.floorplan}`}<VenueExplorer halls={data.halls} initialQuery={data.q} initialGuests={data.guests} initialDemo={data.demo} initialFloorplan={data.floorplan} />{/key}
</MarketingShell>
