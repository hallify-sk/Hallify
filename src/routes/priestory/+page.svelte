<script lang="ts">
  import { getLocale } from '$lib/i18n.svelte';
  import MarketingShell from '$lib/marketing/MarketingShell.svelte';
  import VenueExplorer from '$lib/marketing/VenueExplorer.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
  const en = $derived(getLocale() === 'en');
</script>
<svelte:head>
  <title>{en ? 'All venues | Hallify' : 'Všetky priestory | Hallify'}</title>
  <meta name="description" content={en ? 'Explore venues on the map. Search by location, guest count and venue features.' : 'Preskúmajte priestory na mape. Hľadajte podľa miesta, počtu hostí a možností priestoru.'}>
  <link rel="canonical" href={en ? data.canonicalEn : data.canonicalSk}>
  <link rel="alternate" hreflang="sk" href={data.canonicalSk}><link rel="alternate" hreflang="en" href={data.canonicalEn}>
</svelte:head>
<MarketingShell audience="customer" explorer>
  {#key `${data.q}:${data.guests}:${data.floorplan}`}<VenueExplorer halls={data.halls} initialQuery={data.q} initialGuests={data.guests} initialDemo={data.demo} initialFloorplan={data.floorplan} />{/key}
</MarketingShell>
