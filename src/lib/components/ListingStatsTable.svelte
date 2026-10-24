<script lang="ts">
  /**
   * Directory listing figures, one row per hall: impressions, page views, contact
   * clicks and the click-through rate, with a totals row. The platform's listings
   * report shows the venue and listing type too; a venue's console does not need them.
   * A wide table scrolls inside its own box on a phone.
   */
  import { getLocale, t } from '$lib/i18n.svelte';
  import type { ListingType } from '$lib/listings';

  interface Row {
    hall_id: string; hall_name: string; org_name?: string; listing_type?: ListingType; booking_mode?: string;
    impressions: number; detail_views: number; website_clicks: number; phone_clicks: number; email_clicks: number;
    ctr: number | null;
    href?: string | null;
  }
  interface Totals { impressions: number; detail_views: number; website_clicks: number; phone_clicks: number; email_clicks: number; ctr: number | null }

  let { rows, totals, showVenue = false, label }: { rows: Row[]; totals: Totals; showVenue?: boolean; label: string } = $props();

  const nf = $derived(new Intl.NumberFormat(getLocale() === 'en' ? 'en-GB' : 'sk-SK'));
  const pct = $derived(new Intl.NumberFormat(getLocale() === 'en' ? 'en-GB' : 'sk-SK', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 }));
  const rate = (v: number | null) => (v === null ? '–' : pct.format(v));
  const typeLabel = (k: ListingType | undefined) =>
    k === 'partner' ? t.listings.typePartner : k === 'external' ? t.listings.typeExternal : t.listings.typeBasic;
</script>

<div class="ls-scroll">
  <table class="ls-table" aria-label={label}>
    <thead>
      <tr>
        <th scope="col">{t.listings.colHall}</th>
        {#if showVenue}<th scope="col">{t.listings.colType}</th>{/if}
        <th scope="col" class="num">{t.listings.colImpressions}</th>
        <th scope="col" class="num">{t.listings.colViews}</th>
        <th scope="col" class="num">{t.listings.colWebsite}</th>
        <th scope="col" class="num">{t.listings.colPhone}</th>
        <th scope="col" class="num">{t.listings.colEmail}</th>
        <th scope="col" class="num" title={t.listings.ctrHint}>{t.listings.colCtr}</th>
      </tr>
    </thead>
    <tbody>
      {#each rows as r (r.hall_id)}
        <tr>
          <th scope="row" class="ls-name">
            {#if r.href}<a href={r.href}>{r.hall_name}</a>{:else}{r.hall_name}{/if}
            {#if showVenue && r.org_name && r.org_name !== r.hall_name}<small>{r.org_name}</small>{/if}
            {#if r.booking_mode === 'external'}<small class="ls-mode">{t.listings.modeExternal}</small>{/if}
          </th>
          {#if showVenue}<td><span class="ls-tag" data-type={r.listing_type}>{typeLabel(r.listing_type)}</span></td>{/if}
          <td class="num">{nf.format(r.impressions)}</td>
          <td class="num">{nf.format(r.detail_views)}</td>
          <td class="num">{nf.format(r.website_clicks)}</td>
          <td class="num">{nf.format(r.phone_clicks)}</td>
          <td class="num">{nf.format(r.email_clicks)}</td>
          <td class="num">{rate(r.ctr)}</td>
        </tr>
      {/each}
    </tbody>
    <tfoot>
      <tr>
        <th scope="row">{t.listings.totalRow}</th>
        {#if showVenue}<td></td>{/if}
        <td class="num">{nf.format(totals.impressions)}</td>
        <td class="num">{nf.format(totals.detail_views)}</td>
        <td class="num">{nf.format(totals.website_clicks)}</td>
        <td class="num">{nf.format(totals.phone_clicks)}</td>
        <td class="num">{nf.format(totals.email_clicks)}</td>
        <td class="num">{rate(totals.ctr)}</td>
      </tr>
    </tfoot>
  </table>
</div>

<style>
  .ls-scroll { overflow-x: auto; overscroll-behavior-x: contain; }
  .ls-table { width: 100%; border-collapse: collapse; font-size: 13px; min-width: 640px; }
  .ls-table th, .ls-table td { padding: 9px 10px; border-bottom: 1px solid var(--border-subtle); text-align: left; vertical-align: top; }
  .ls-table thead th { font-size: 11px; font-weight: 650; color: var(--text-muted); white-space: nowrap; }
  .ls-table tbody th { font-weight: 600; color: var(--text-base); }
  .ls-table tfoot th, .ls-table tfoot td { font-weight: 650; border-bottom: 0; border-top: 1px solid var(--border); }
  .num { text-align: right !important; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .ls-name a { color: var(--text-base); text-decoration: none; }
  .ls-name a:hover { color: var(--accent-ink); }
  .ls-name small { display: block; font-size: 11.5px; font-weight: 500; color: var(--text-muted); }
  .ls-name .ls-mode { color: var(--accent-ink); }
  .ls-tag {
    --c: var(--text-muted);
    display: inline-flex; padding: 3px 9px; border-radius: var(--radius-sm); font-size: 11px; font-weight: 650; white-space: nowrap;
    background: color-mix(in srgb, var(--c) 12%, transparent); color: var(--c);
  }
  .ls-tag[data-type='partner'] { --c: var(--accent-ink); }
  .ls-tag[data-type='external'] { --c: var(--warning); }
</style>
