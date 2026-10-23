<script lang="ts">
  /**
   * Canonical and sharing tags for a venue's own site: its hall list and each hall
   * page. Those pages set a title and a description but nothing else, so a link
   * shared to a chat showed no picture, and nothing told a search engine which
   * address was the real one when the same page answered on a subdomain and a
   * custom domain. Signed-in pages (reservations, messages, booking) get none.
   */
  import { page } from '$app/state';
  import { absoluteUrl, metaDescription } from './venue-seo';

  let { orgName }: { orgName: string } = $props();

  const PRIVATE = new Set(['messages', 'my-reservations']);
  const match = $derived(/^\/halls(?:\/([^/]+))?\/?$/.exec(page.url.pathname));
  const indexable = $derived(!!match && !PRIVATE.has(match[1] ?? '') && page.status === 200);
  const hall = $derived((page.data as { hall?: { name?: string; description?: string | null; cover_image_url?: string | null } }).hall);
  const canonical = $derived(`${page.url.origin}${page.url.pathname.replace(/\/$/, '') || '/halls'}`);
  const title = $derived(match?.[1] && hall?.name ? `${hall.name} – ${orgName}` : orgName);
  const description = $derived(match?.[1] && hall ? metaDescription(hall.description, hall.name ?? orgName) : '');
  const image = $derived(match?.[1] ? absoluteUrl(hall?.cover_image_url, page.url.origin) : null);
</script>

<svelte:head>
  {#if indexable}
    <link rel="canonical" href={canonical}>
    <meta property="og:type" content="website">
    <meta property="og:site_name" content={orgName}>
    <meta property="og:title" content={title}>
    {#if description}<meta property="og:description" content={description}>{/if}
    <meta property="og:url" content={canonical}>
    {#if image}<meta property="og:image" content={image}><meta name="twitter:card" content="summary_large_image">{:else}<meta name="twitter:card" content="summary">{/if}
  {/if}
</svelte:head>
