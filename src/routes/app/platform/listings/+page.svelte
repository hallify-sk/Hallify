<script lang="ts">
  import { pageTitle } from '$lib/page-title';
  import { t } from '$lib/i18n.svelte';
  import { venuePagePath } from '$lib/marketing/types';
  import ListingNav from './ListingNav.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();

  let search = $state('');
  const filtered = $derived.by(() => {
    const q = search.trim().toLowerCase();
    return q ? data.venues.filter((v) => v.name.toLowerCase().includes(q) || (v.address ?? '').toLowerCase().includes(q)) : data.venues;
  });
</script>

<svelte:head><title>{pageTitle(t.listings.title, t.platformOrgs.platformAdmin)}</title></svelte:head>

<div class="wrap page">
  <header class="page-header">
    <div>
      <p class="eyebrow">{t.platformOrgs.platformAdmin}</p>
      <div class="page-header-left">
        <h1 class="page-title">{t.listings.title}</h1>
        <span class="total-badge">{data.venues.length}</span>
      </div>
      <p class="page-lead">{t.listings.lead}</p>
    </div>
    <div class="page-actions">
      <a class="btn-action btn-sm" href="/app/platform/listings/new">{t.listings.addVenue}</a>
    </div>
  </header>

  <ListingNav />

  {#if data.created}<p class="lv-ok" role="status">{t.listings.created}</p>{/if}
  {#if data.deleted}<p class="lv-ok" role="status">{t.listings.deleted}</p>{/if}

  <section class="section section--lead">
    {#if data.venues.length === 0}
      <div class="card--inset state-block">
        <span class="icon-tile" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        </span>
        <h2>{t.listings.empty}</h2>
        <p class="muted">{t.listings.emptyHint}</p>
        <a class="btn-action btn-sm" href="/app/platform/listings/new">{t.listings.addVenue}</a>
      </div>
    {:else}
      <div class="list-filters" role="search">
        <label class="sr-only" for="l-q">{t.listings.searchPlaceholder}</label>
        <input id="l-q" class="lf-search" type="search" placeholder={t.listings.searchPlaceholder} bind:value={search} autocomplete="off" spellcheck="false" />
        <span class="lf-count" aria-live="polite">{filtered.length} / {data.venues.length}</span>
      </div>

      <div class="pf-table row-list" role="table" aria-label={t.listings.title}>
        <div role="row" class="row-item row-head lv-row">
          <span role="columnheader">{t.listings.colVenue}</span>
          <span role="columnheader">{t.listings.colContact}</span>
          <span role="columnheader" class="num">{t.listings.colImpressions30}</span>
          <span role="columnheader" class="num">{t.listings.colClicks30}</span>
          <span role="columnheader">{t.listings.colStatus}</span>
          <span role="columnheader"><span class="sr-only">{t.listings.editVenue}</span></span>
        </div>
        {#each filtered as v (v.hall_id)}
          <div role="row" class="row-item lv-row" class:is-dim={!v.is_public}>
            <span role="cell" class="cell-main">
              <a class="cell-title" href="/app/platform/listings/{v.hall_id}">{v.name}</a>
              <span class="cell-sub">{v.address ?? '—'} · {t.listings.capacityShort(v.max_people)}</span>
            </span>
            <span role="cell" class="cell-main">
              <span class="cell-sub">{[v.website, v.phone, v.email].filter(Boolean).join(' · ') || '—'}</span>
            </span>
            <span role="cell" class="num"><span class="m-label">{t.listings.colImpressions30}:{' '}</span>{v.stats?.impressions ?? 0}</span>
            <span role="cell" class="num"><span class="m-label">{t.listings.colClicks30}:{' '}</span>{v.stats?.clicks ?? 0}</span>
            <span role="cell">
              {#if v.is_public}<span class="pf-tag" data-tone="success">{t.listings.listed}</span>{:else}<span class="pf-tag">{t.listings.hidden}</span>{/if}
            </span>
            <span role="cell" class="row-actions">
              {#if v.is_public && v.slug}<a class="btn-outline btn-sm" href={venuePagePath(v.org_slug, v.slug)} target="_blank" rel="noopener">{t.listings.viewPage}</a>{/if}
              <a class="btn-outline btn-sm" href="/app/platform/listings/{v.hall_id}">{t.listings.editVenue}</a>
            </span>
          </div>
        {/each}
      </div>
    {/if}
  </section>
</div>

<style>
  .lv-row {
    display: grid;
    grid-template-columns: minmax(170px, 2fr) minmax(140px, 1.5fr) 130px 120px 100px 210px;
    gap: 14px; align-items: center;
  }
  .lv-ok { margin: 0 0 12px; font-size: 13px; color: var(--success); }
  @container (max-width: 760px) {
    .lv-row.row-head { display: none; }
    .lv-row { grid-template-columns: minmax(0, 1fr) auto; row-gap: 6px; }
    .lv-row > :first-child { grid-column: 1 / -1; }
    .lv-row .row-actions { grid-column: 1 / -1; justify-content: flex-start; }
    .lv-row :global(.m-label) { display: inline; }
  }
</style>
