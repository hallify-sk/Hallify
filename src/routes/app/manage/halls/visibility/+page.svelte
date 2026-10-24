<script lang="ts">
  import { pageTitle } from '$lib/page-title';
  import { goto } from '$app/navigation';
  import { t, getLocale } from '$lib/i18n.svelte';
  import { formatDate } from '$lib/format';
  import ListingStatsTable from '$lib/components/ListingStatsTable.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  const monthLabel = (m: string) => formatDate(`${m}-01`, getLocale(), { month: 'long', year: 'numeric' });
  const nf = $derived(new Intl.NumberFormat(getLocale() === 'en' ? 'en-GB' : 'sk-SK'));
  const pct = $derived(new Intl.NumberFormat(getLocale() === 'en' ? 'en-GB' : 'sk-SK', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }));
  const clicksOf = (m: { website_clicks: number; phone_clicks: number; email_clicks: number }) => m.website_clicks + m.phone_clicks + m.email_clicks;

  function choosePeriod(value: string) {
    const url = new URL(location.href);
    if (value === '30d') url.searchParams.delete('period'); else url.searchParams.set('period', value);
    void goto(url, { keepFocus: true, noScroll: true, replaceState: true });
  }
</script>

<svelte:head><title>{pageTitle(t.listings.statsTitle, t.nav.halls)}</title></svelte:head>

<div class="wrap page">
  <a class="back" href="/app/manage/halls">← {t.nav.halls}</a>

  <section class="section section--lead">
    <div class="section-head section-head--row">
      <div>
        <h1 class="vis-title">{t.listings.statsTitle}</h1>
        <p>{t.listings.consoleLead}</p>
      </div>
      <label class="vis-period">
        <span class="sr-only">{t.listings.periodLabel}</span>
        <select value={data.period.key} onchange={(e) => choosePeriod(e.currentTarget.value)}>
          <option value="30d">{t.listings.last30}</option>
          <option value="90d">{t.listings.last90}</option>
          {#each data.months as m (m)}<option value={m}>{monthLabel(m)}</option>{/each}
        </select>
      </label>
    </div>

    {#if data.rows.length === 0}
      <p class="vis-empty">{t.listings.noHalls}</p>
    {:else}
      <ListingStatsTable rows={data.rows} totals={data.totals} label={t.listings.statsTitle} />
      {#if data.totals.impressions === 0 && data.totals.detail_views === 0}
        <p class="vis-note">{t.listings.noStats}</p>
      {/if}
    {/if}
    <p class="vis-note">{t.listings.privacyNote}</p>
  </section>

  {#if data.monthly.length}
    <section class="section">
      <div class="section-head"><h2>{t.listings.byMonth}</h2></div>
      <div class="vis-scroll">
        <table class="vis-months">
          <thead>
            <tr>
              <th scope="col">{t.listings.colMonth}</th>
              <th scope="col" class="num">{t.listings.colImpressions}</th>
              <th scope="col" class="num">{t.listings.colViews}</th>
              <th scope="col" class="num">{t.listings.colClicks}</th>
              <th scope="col" class="num">{t.listings.colCtr}</th>
            </tr>
          </thead>
          <tbody>
            {#each data.monthly as m (m.month)}
              <tr>
                <th scope="row">{monthLabel(m.month)}</th>
                <td class="num">{nf.format(m.impressions)}</td>
                <td class="num">{nf.format(m.detail_views)}</td>
                <td class="num">{nf.format(clicksOf(m))}</td>
                <td class="num">{m.detail_views ? pct.format(clicksOf(m) / m.detail_views) : '–'}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    </section>
  {/if}
</div>

<style>
  .back { display: inline-flex; gap: 6px; margin: 12px 0 14px; font-size: 12.5px; font-weight: 600; color: var(--text-muted); text-decoration: none; }
  .back:hover { color: var(--accent-ink); }
  .vis-title { font-size: var(--display-size); font-weight: 550; letter-spacing: -.055em; line-height: 1.08; margin: 0 0 6px; }
  .vis-period select {
    font: inherit; font-size: 12.5px; padding: 6px 9px; border: 1px solid var(--border);
    border-radius: var(--radius-sm); background: var(--bg-panel); color: var(--text-base);
  }
  .vis-empty, .vis-note { font-size: 12px; color: var(--text-muted); margin: 12px 0 0; max-width: 72ch; line-height: 1.6; }
  .vis-scroll { overflow-x: auto; }
  .vis-months { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 420px; }
  .vis-months th, .vis-months td { padding: 9px 10px; border-bottom: 1px solid var(--border-subtle); text-align: left; }
  .vis-months thead th { font-size: 11px; font-weight: 650; color: var(--text-muted); }
  .vis-months tbody th { font-weight: 600; text-transform: capitalize; }
  .num { text-align: right !important; font-variant-numeric: tabular-nums; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
</style>
