<script lang="ts">
  // The parts of /app/platform/listings: the venues not on Hallify, their bulk import,
  // and the listing figures of every venue in the directory.
  import { page } from '$app/state';
  import { t } from '$lib/i18n.svelte';
  const section = $derived(
    page.url.pathname.startsWith('/app/platform/listings/stats') ? 'stats'
      : page.url.pathname.startsWith('/app/platform/listings/import') ? 'import'
        : 'venues');
</script>

<nav class="chip-filters" aria-label={t.listings.title}>
  <a class="chip" aria-current={section === 'venues' ? 'page' : undefined} href="/app/platform/listings">{t.listings.tabVenues}</a>
  <a class="chip" aria-current={section === 'import' ? 'page' : undefined} href="/app/platform/listings/import">{t.listings.tabImport}</a>
  <a class="chip" aria-current={section === 'stats' ? 'page' : undefined} href="/app/platform/listings/stats">{t.listings.tabStats}</a>
</nav>

<style>
  /* The open part reads as chosen, like a pressed filter chip. */
  .chip[aria-current='page'] { background: var(--accent-dim); color: var(--accent-ink); border-color: var(--accent); }
</style>
