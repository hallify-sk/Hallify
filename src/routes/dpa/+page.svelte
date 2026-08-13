<script lang="ts">
  import LegalDocument from '$lib/components/LegalDocument.svelte';
  import { DPA } from '$lib/legal';
  import { getLocale } from '$lib/i18n.svelte';

  const { data } = $props();
  const doc = $derived(DPA[getLocale()]);
</script>

<svelte:head>
  <title>{doc.title} · Hallify</title>
  <meta name="description" content={doc.subtitle} />
  <link rel="canonical" href={getLocale() === 'en' ? data.canonicalEn : data.canonicalSk} />
  <link rel="alternate" hreflang="sk" href={data.canonicalSk} />
  <link rel="alternate" hreflang="en" href={data.canonicalEn} />
  <link rel="alternate" hreflang="x-default" href={data.canonicalSk} />
</svelte:head>

<LegalDocument {doc} kind="dpa" />
