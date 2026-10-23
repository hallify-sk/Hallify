<script lang="ts">
  import { page } from '$app/stores';
  import type { PageData } from './$types';
  import { statusLabel, statusClass, fmtDate } from '$lib/reservationStatus';
  import { reveal } from '$lib/reveal';
  import { t, getLocale } from '$lib/i18n.svelte';

  interface Props { data: PageData; }
  const { data }: Props = $props();

  // '?booked=approved' when the hall auto-approves: the booking is confirmed, and
  // saying "the venue will review it" was wrong.
  const bookedParam = $derived($page.url.searchParams.get('booked'));
  const justBooked = $derived(bookedParam === '1' || bookedParam === 'approved');
  const justConfirmed = $derived(bookedParam === 'approved');

  const today = new Date(); today.setHours(0, 0, 0, 0);
  function isPast(d: string) { return new Date(d + 'T00:00:00') < today; }

  type Filter = 'all' | 'upcoming' | 'past' | 'cancelled';
  let filter = $state<Filter>('all');

  const counts = $derived({
    all: data.reservations.length,
    upcoming: data.reservations.filter(r => r.status !== 'cancelled' && !isPast(r.event_date)).length,
    past: data.reservations.filter(r => r.status !== 'cancelled' && isPast(r.event_date)).length,
    cancelled: data.reservations.filter(r => r.status === 'cancelled').length,
  });

  const filtered = $derived(
    data.reservations.filter(r => {
      if (filter === 'upcoming') return r.status !== 'cancelled' && !isPast(r.event_date);
      if (filter === 'past') return r.status !== 'cancelled' && isPast(r.event_date);
      if (filter === 'cancelled') return r.status === 'cancelled';
      return true;
    })
  );

  const TABS: { id: Filter; label: () => string }[] = [
    { id: 'all', label: () => t.myRes.tabAll },
    { id: 'upcoming', label: () => t.myRes.tabUpcoming },
    { id: 'past', label: () => t.myRes.tabPast },
    { id: 'cancelled', label: () => t.myRes.tabCancelled },
  ];
</script>

<svelte:head><title>{t.myRes.title}</title></svelte:head>

<!-- ── Lead: the page heading and its one action ── -->
<section class="section section--lead" use:reveal>
  <div class="section-head section-head--row">
    <div>
      <p class="eyebrow">{t.nav.reservations}</p>
      <h1>{t.myRes.title}</h1>
    </div>
    <a href="/halls" class="btn-primary">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      {t.myRes.browseHalls}
    </a>
  </div>

  {#if justBooked}
    <div class="toast" role="status">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      {#if justConfirmed}
        {t.myRes.bookingConfirmed}
      {:else}
        {t.myRes.requestSent} {data.domainOrg.name} {t.myRes.requestSentTail}
      {/if}
    </div>
  {/if}
</section>

<!-- ── The reservations themselves: hairline rows, not cards ── -->
<section class="section" use:reveal>
  {#if data.reservations.length === 0}
    <div class="card--inset empty">
      <span class="icon-tile" aria-hidden="true">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      </span>
      <h2 class="empty-title">{t.myRes.emptyTitle}</h2>
      <p class="empty-sub">{t.myRes.emptySub}</p>
      <a href="/halls" class="btn-primary">{t.myRes.browseHalls}</a>
    </div>
  {:else}
    <div class="section-head section-head--row">
      <h2>{(TABS.find(tab => tab.id === filter) ?? TABS[0]).label()}</h2>
      <div class="tabs">
        {#each TABS as tab}
          <button type="button" class="tab" class:active={filter === tab.id} onclick={() => filter = tab.id}>
            {tab.label()}<span class="tab-count">{counts[tab.id]}</span>
          </button>
        {/each}
      </div>
    </div>

    {#if filtered.length === 0}
      <div class="empty-mini">{t.myRes.nothingHere}</div>
    {:else}
      <div class="row-list">
        {#each filtered as r}
          <a class="row-item res-row" href="/halls/my-reservations/{r.id}">
            <span class="accent" class:dim={r.status === 'cancelled'}></span>
            <div class="res-body">
              <div class="res-top">
                <div class="res-titles">
                  <div class="res-title">{r.title}</div>
                  <div class="res-sub">{r.hall_name}</div>
                </div>
                <div class="res-badges">
                  <span class="badge {statusClass(r.status)}">{statusLabel(r.status, getLocale())}</span>
                  {#if r.status !== 'cancelled' && isPast(r.event_date)}<span class="badge st-past">{t.event.past}</span>{/if}
                </div>
              </div>
              <div class="res-meta">
                <span class="meta-item">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                  {fmtDate(r.event_date, getLocale())}
                </span>
                {#if r.start_time}
                  <span class="meta-item">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
                    {r.start_time}{r.end_time ? ` – ${r.end_time}` : ''}
                  </span>
                {/if}
                {#if r.num_guests}
                  <span class="meta-item">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                    {r.num_guests} {t.myRes.guestsSuffix}
                  </span>
                {/if}
              </div>
            </div>
            <svg class="res-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </a>
        {/each}
      </div>
    {/if}
  {/if}
</section>

<style>
  /* The page title takes the density display scale, as every other page h1 does;
     app.css gives h1 its tracking but no size. */
  h1 { font-size: var(--display-size); margin: 0; }

  /* Primary action, so it writes in --accent-contrast on the fill and takes the lift. */
  .btn-primary {
    display: inline-flex; align-items: center; gap: 7px; flex-shrink: 0;
    padding: 10px 20px; border-radius: var(--radius-sm); background: var(--accent); color: var(--accent-contrast);
    font-size: 13px; font-weight: 650; border: none; cursor: pointer; text-decoration: none; transition: transform .2s, background .2s;
  }
  .btn-primary:hover { background: var(--accent-hover); transform: translateY(-2px); text-decoration: none; }
  .btn-primary:active { transform: translateY(0); }

  .toast {
    display: flex; align-items: center; gap: 9px; padding: 11px 15px; border-radius: var(--radius);
    font-size: 13px; font-weight: 600; color: var(--success);
    background: var(--success-dim); border: 1px solid color-mix(in srgb, var(--success) 30%, transparent);
  }
  .toast svg { flex-shrink: 0; }

  /* Wraps on a phone: four tabs with counts in one row made the page 476px wide. */
  .tabs { display: flex; flex-wrap: wrap; gap: 4px; min-width: 0; max-width: 100%; }
  .tab {
    display: inline-flex; align-items: center; gap: 7px; padding: 8px 13px;
    background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer;
    font-family: inherit; font-size: 13px; font-weight: 600; color: var(--text-muted); transition: color .12s, border-color .12s;
  }
  .tab:hover { color: var(--text-base); }
  /* The 2px rule underneath stays the accent fill; the label itself writes in --accent-ink. */
  .tab.active { color: var(--accent-ink); border-bottom-color: var(--accent); }
  .tab-count { font-size: 11px; font-weight: 650; padding: 0 6px; border-radius: 3px; line-height: 1.6; background: var(--bg-hover); color: var(--text-subtle); }
  .tab.active .tab-count { background: var(--accent-dim); color: var(--accent-ink); }

  /* ── Reservation rows ── */
  .res-row { align-items: stretch; gap: 0; }
  .accent { width: 3px; border-radius: 2px; background: var(--accent); flex-shrink: 0; }
  .accent.dim { background: var(--text-subtle); }
  .res-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; padding: 0 16px; }
  .res-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .res-titles { min-width: 0; }
  .res-title { font-size: 15px; font-weight: 600; color: var(--text-base); letter-spacing: -.03em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .res-sub { font-size: 12px; color: var(--text-muted); margin-top: 3px; }
  .res-meta { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12.5px; color: var(--text-muted); line-height: 1.5; }
  .meta-item { display: flex; align-items: center; gap: 5px; }
  .meta-item svg { color: var(--text-subtle); }
  .res-chev { align-self: center; color: var(--text-subtle); flex-shrink: 0; }

  .badge { padding: 3px 9px; border-radius: 3px; font-size: 11px; font-weight: 650; white-space: nowrap; flex-shrink: 0; }
  .st-warning { background: var(--warning-dim); color: var(--warning); }
  .st-success { background: var(--success-dim); color: var(--success); }
  /* Label on the accent tint, so --accent-ink rather than the fill colour. */
  .st-info    { background: var(--accent-dim); color: var(--accent-ink); }
  .st-muted   { background: var(--bg-hover); color: var(--text-muted); }
  .st-danger  { background: var(--danger-dim); color: var(--danger); }
  .st-past    { background: var(--bg-hover); color: var(--text-muted); border: 1px solid var(--border); }
  .res-badges { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }

  /* ── Empty states ── */
  .empty {
    display: flex; flex-direction: column; align-items: center; gap: 12px;
    text-align: center;
  }
  .empty-title { font-size: 16px; font-weight: 600; color: var(--text-base); letter-spacing: -.03em; margin: 4px 0 0; }
  .empty-sub { font-size: 13px; color: var(--text-muted); margin: 0 0 8px; max-width: 44ch; line-height: 1.75; }
  .empty-mini { padding: 36px; text-align: center; color: var(--text-subtle); font-size: 13px; }

  @media (prefers-reduced-motion: reduce) {
    .btn-primary:hover { transform: none; }
  }

  @media (max-width: 520px) {
    .tab { padding: 8px 9px; }
  }
</style>
