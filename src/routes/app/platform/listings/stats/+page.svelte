<script lang="ts">
  import { pageTitle } from '$lib/page-title';
  import { goto } from '$app/navigation';
  import { t, getLocale } from '$lib/i18n.svelte';
  import { formatDate } from '$lib/format';
  import ListingStatsTable from '$lib/components/ListingStatsTable.svelte';
  import ListingNav from '../ListingNav.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();

  const monthLabel = (m: string) => formatDate(`${m}-01`, getLocale(), { month: 'long', year: 'numeric' });
  const query = (period: string, scope: string) => {
    const q = new URLSearchParams();
    if (period !== '30d') q.set('period', period);
    if (scope !== 'all') q.set('scope', scope);
    return q.toString();
  };
  const csvHref = $derived(`/app/platform/listings/stats/csv?${new URLSearchParams({ period: data.period.key, scope: data.scope })}`);
  function choose(period: string, scope: string) {
    const qs = query(period, scope);
    void goto(`/app/platform/listings/stats${qs ? `?${qs}` : ''}`, { keepFocus: true, noScroll: true, replaceState: true });
  }
</script>

<svelte:head><title>{pageTitle(t.listings.tabStats, t.listings.title)}</title></svelte:head>

<div class="wrap page">
  <header class="page-header">
    <div>
      <p class="eyebrow">{t.platformOrgs.platformAdmin}</p>
      <div class="page-header-left">
        <h1 class="page-title">{t.listings.statsTitle}</h1>
        <span class="total-badge">{data.rows.length}</span>
      </div>
      <p class="page-lead">{t.listings.statsLead}</p>
    </div>
    <div class="page-actions">
      <a class="btn-outline btn-sm" href={csvHref} download>{t.listings.exportCsv}</a>
    </div>
  </header>

  <ListingNav />

  <section class="section section--lead">
    <div class="list-filters">
      <label class="sr-only" for="ls-scope">{t.listings.scopeLabel}</label>
      <select id="ls-scope" value={data.scope} onchange={(e) => choose(data.period.key, e.currentTarget.value)}>
        <option value="all">{t.listings.filterAll}</option>
        <option value="listing">{t.listings.filterListing}</option>
        <option value="partner">{t.listings.filterPartner}</option>
      </select>
      <label class="sr-only" for="ls-period">{t.listings.periodLabel}</label>
      <select id="ls-period" value={data.period.key} onchange={(e) => choose(e.currentTarget.value, data.scope)}>
        <option value="30d">{t.listings.last30}</option>
        <option value="90d">{t.listings.last90}</option>
        {#each data.months as m (m)}<option value={m}>{monthLabel(m)}</option>{/each}
      </select>
      <span class="lf-count">{formatDate(data.period.from, getLocale())} – {formatDate(data.period.to, getLocale())}</span>
    </div>

    {#if data.rows.length === 0}
      <div class="card--inset state-block"><h2>{t.listings.noRows}</h2></div>
    {:else}
      <ListingStatsTable rows={data.rows} totals={data.totals} showVenue label={t.listings.statsTitle} />
    {/if}
    <p class="table-note">{t.listings.privacyNote}</p>
  </section>
</div>
