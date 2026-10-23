<script lang="ts">
  import { getLocale } from '$lib/i18n.svelte';
  import MarketingShell from '$lib/marketing/MarketingShell.svelte';
  import BusinessLanding from '$lib/marketing/BusinessLanding.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
  const en = $derived(getLocale() === 'en');
  const title = $derived(en ? 'Hallify for businesses | Venue management' : 'Hallify pre prevádzkovateľov | Správa priestorov');
  const description = $derived(en ? 'Put your venue on the map. Manage bookings, room layouts and conversations in one place.' : 'Ukážte svoj priestor na mape. Rezervácie, rozloženie sály a komunikáciu majte na jednom mieste.');
</script>
<svelte:head>
  <title>{title}</title><meta name="description" content={description}>
  <link rel="canonical" href={en ? data.canonicalEn : data.canonicalSk}>
  <link rel="alternate" hreflang="sk" href={data.canonicalSk}><link rel="alternate" hreflang="en" href={data.canonicalEn}><link rel="alternate" hreflang="x-default" href={data.canonicalSk}>
  <meta property="og:title" content={title}><meta property="og:description" content={description}><meta property="og:type" content="website">
  <meta property="og:url" content={en ? data.canonicalEn : data.canonicalSk}><meta property="og:image" content={data.ogImage}><meta name="twitter:card" content="summary_large_image">
</svelte:head>
<MarketingShell audience="business"><BusinessLanding /></MarketingShell>
