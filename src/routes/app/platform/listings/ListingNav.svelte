<script lang="ts">
  // The two halves of /app/platform/listings: the venues not on Hallify, and the
  // listing figures of every venue in the directory.
  import { page } from '$app/state';
  import { t } from '$lib/i18n.svelte';
  const onStats = $derived(page.url.pathname.startsWith('/app/platform/listings/stats'));
</script>

<nav class="chip-filters" aria-label={t.listings.title}>
  <a class="chip" class:chip-success={!onStats} aria-current={!onStats ? 'page' : undefined} href="/app/platform/listings">{t.listings.tabVenues}</a>
  <a class="chip" class:chip-success={onStats} aria-current={onStats ? 'page' : undefined} href="/app/platform/listings/stats">{t.listings.tabStats}</a>
</nav>
