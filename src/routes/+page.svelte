<script lang="ts">
  import { getLocale } from '$lib/i18n.svelte';
  import MarketingShell from '$lib/marketing/MarketingShell.svelte';
  import CustomerLanding from '$lib/marketing/CustomerLanding.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
  const en = $derived(getLocale() === 'en');
  const title = $derived(en ? 'Hallify | Find the right venue for your event' : 'Hallify | Nájdite správny priestor pre svoju akciu');
  const description = $derived(en ? 'Explore venues on the map, compare capacity and discover the space for your next gathering.' : 'Preskúmajte priestory na mape, porovnajte kapacitu a nájdite miesto pre svoju ďalšiu akciu.');
</script>
<svelte:head>
  <title>{title}</title><meta name="description" content={description}>
  <link rel="canonical" href={en ? data.canonicalEn : data.canonicalSk}>
  <link rel="alternate" hreflang="sk" href={data.canonicalSk}><link rel="alternate" hreflang="en" href={data.canonicalEn}><link rel="alternate" hreflang="x-default" href={data.canonicalSk}>
  <meta property="og:title" content={title}><meta property="og:description" content={description}><meta property="og:type" content="website">
  <meta property="og:url" content={en ? data.canonicalEn : data.canonicalSk}><meta property="og:image" content={data.ogImage}><meta name="twitter:card" content="summary_large_image">
</svelte:head>
<MarketingShell audience="customer">
  {#key `${data.q}:${data.guests}`}<CustomerLanding halls={data.halls} initialQuery={data.q} initialGuests={data.guests} initialDemo={data.demo} />{/key}
</MarketingShell>
