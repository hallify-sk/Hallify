<script lang="ts">
  import { page } from '$app/stores';
  import type { PageData } from './$types';
  import { statusLabel, statusClass, fmtDate } from '$lib/reservationStatus';
  import { t } from '$lib/i18n.svelte';

  interface Props { data: PageData; }
  const { data }: Props = $props();

  const justBooked = $derived($page.url.searchParams.get('booked') === '1');

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

<div class="page">
  <div class="page-head">
    <h1>{t.myRes.title}</h1>
    <a href="/halls" class="btn-primary">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      {t.myRes.browseHalls}
    </a>
  </div>

  {#if justBooked}
    <div class="toast">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      {t.myRes.requestSent} {data.domainOrg.name} {t.myRes.requestSentTail}
    </div>
  {/if}

  {#if data.reservations.length === 0}
    <div class="empty">
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      <p class="empty-title">{t.myRes.emptyTitle}</p>
      <p class="empty-sub">{t.myRes.emptySub}</p>
      <a href="/halls" class="btn-primary">{t.myRes.browseHalls}</a>
    </div>
  {:else}
    <div class="tabs">
      {#each TABS as tab}
        <button type="button" class="tab" class:active={filter === tab.id} onclick={() => filter = tab.id}>
          {tab.label()}<span class="tab-count">{counts[tab.id]}</span>
        </button>
      {/each}
    </div>

    {#if filtered.length === 0}
      <div class="empty-mini">{t.myRes.nothingHere}</div>
    {:else}
      <div class="list">
        {#each filtered as r}
          <a class="card" href="/halls/my-reservations/{r.id}">
            <span class="accent" class:dim={r.status === 'cancelled'}></span>
            <div class="card-body">
              <div class="card-top">
                <div class="card-titles">
                  <div class="card-title">{r.title}</div>
                  <div class="card-sub">{r.hall_name}</div>
                </div>
                <div class="card-badges">
                  <span class="badge {statusClass(r.status)}">{statusLabel(r.status)}</span>
                  {#if r.status !== 'cancelled' && isPast(r.event_date)}<span class="badge st-past">{t.event.past}</span>{/if}
                </div>
              </div>
              <div class="card-meta">
                <span class="meta-item">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                  {fmtDate(r.event_date)}
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
            <svg class="card-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
          </a>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .page { display: flex; flex-direction: column; gap: 18px; }

  .page-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  h1 { font-size: 22px; font-weight: 800; color: var(--text-base); letter-spacing: -0.02em; margin: 0; }

  .btn-primary {
    display: inline-flex; align-items: center; gap: 7px; flex-shrink: 0;
    padding: 8px 16px; border-radius: var(--radius); background: var(--accent); color: #fff;
    font-size: 13px; font-weight: 600; border: none; cursor: pointer; text-decoration: none; transition: background .15s, opacity .12s;
  }
  .btn-primary:hover { opacity: .9; text-decoration: none; }

  .toast {
    display: flex; align-items: center; gap: 9px; padding: 11px 15px; border-radius: var(--radius);
    font-size: 13px; font-weight: 600; color: var(--success);
    background: var(--success-dim); border: 1px solid color-mix(in srgb, var(--success) 30%, transparent);
  }
  .toast svg { flex-shrink: 0; }

  .tabs { display: flex; gap: 4px; border-bottom: 1px solid var(--border); }
  .tab {
    display: inline-flex; align-items: center; gap: 7px; padding: 8px 13px; margin-bottom: -1px;
    background: none; border: none; border-bottom: 2px solid transparent; cursor: pointer;
    font-family: inherit; font-size: 13px; font-weight: 600; color: var(--text-muted); transition: color .12s, border-color .12s;
  }
  .tab:hover { color: var(--text-base); }
  .tab.active { color: var(--accent); border-bottom-color: var(--accent); }
  .tab-count { font-size: 11px; font-weight: 700; padding: 0 6px; border-radius: 99px; line-height: 1.6; background: var(--bg-hover); color: var(--text-subtle); }
  .tab.active .tab-count { background: var(--accent-dim); color: var(--accent); }

  .list { display: flex; flex-direction: column; gap: 11px; }
  .card {
    display: flex; align-items: stretch; overflow: hidden;
    border-radius: var(--radius-lg); background: var(--bg-panel); border: 1px solid var(--border);
    text-decoration: none; color: inherit; transition: border-color .12s, box-shadow .12s;
  }
  .card:hover { border-color: color-mix(in srgb, var(--accent) 40%, var(--border)); box-shadow: var(--shadow-sm); text-decoration: none; }
  .accent { width: 3px; background: var(--accent); flex-shrink: 0; }
  .accent.dim { background: var(--text-subtle); }
  .card-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 8px; padding: 14px 16px; }
  .card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  .card-titles { min-width: 0; }
  .card-title { font-size: 15px; font-weight: 600; color: var(--text-base); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .card-sub { font-size: 12px; color: var(--text-muted); margin-top: 2px; }
  .card-meta { display: flex; flex-wrap: wrap; gap: 14px; font-size: 12.5px; color: var(--text-muted); }
  .meta-item { display: flex; align-items: center; gap: 5px; }
  .meta-item svg { color: var(--text-subtle); }
  .card-chev { align-self: center; margin-right: 12px; color: var(--text-subtle); flex-shrink: 0; }

  .badge { padding: 3px 9px; border-radius: 99px; font-size: 11px; font-weight: 700; white-space: nowrap; flex-shrink: 0; }
  .st-warning { background: var(--warning-dim); color: var(--warning); }
  .st-success { background: var(--success-dim); color: var(--success); }
  .st-info    { background: var(--accent-dim); color: var(--accent); }
  .st-muted   { background: var(--bg-hover); color: var(--text-muted); }
  .st-danger  { background: var(--danger-dim); color: var(--danger); }
  .st-past    { background: var(--bg-hover); color: var(--text-muted); border: 1px solid var(--border); }
  .card-badges { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }

  .empty {
    display: flex; flex-direction: column; align-items: center; gap: 10px;
    padding: 52px 20px; text-align: center;
    background: var(--bg-panel); border: 1px dashed var(--border); border-radius: var(--radius-lg);
  }
  .empty svg { color: var(--text-subtle); opacity: .6; }
  .empty-title { font-size: 14px; font-weight: 700; color: var(--text-base); margin: 4px 0 0; }
  .empty-sub { font-size: 13px; color: var(--text-muted); margin: 0 0 6px; max-width: 44ch; }
  .empty-mini { padding: 32px; text-align: center; color: var(--text-subtle); font-size: 13px; }
</style>
