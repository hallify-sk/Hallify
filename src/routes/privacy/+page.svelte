<script lang="ts">
  import { pageTitle } from '$lib/page-title';
  import LegalDocument from '$lib/components/LegalDocument.svelte';
  import { PRIVACY } from '$lib/legal';
  import { getLocale } from '$lib/i18n.svelte';

  const { data } = $props();
  const doc = $derived(PRIVACY[getLocale()]);
</script>

<svelte:head>
  <title>{pageTitle(doc.title)}</title>
  <meta name="description" content={doc.subtitle} />
  <link rel="canonical" href={getLocale() === 'en' ? data.canonicalEn : data.canonicalSk} />
  <link rel="alternate" hreflang="sk" href={data.canonicalSk} />
  <link rel="alternate" hreflang="en" href={data.canonicalEn} />
  <link rel="alternate" hreflang="x-default" href={data.canonicalSk} />
</svelte:head>

<LegalDocument {doc} kind="privacy" />
