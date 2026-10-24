<script lang="ts">
  import { imageSrcset } from '$lib/image-variants';
  import { pageTitle } from '$lib/page-title';
  import { enhance } from '$app/forms';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
  import { t, getLocale } from '$lib/i18n.svelte';
  import { formatDate } from '$lib/format';
  import type { PageData, ActionData, SubmitFunction } from './$types';

  interface Props { data: PageData; form: ActionData; }
  const { data, form }: Props = $props();

  // One action, no inline form: the server creates the hall and redirects to its
  // detail page, where the name and every other field are filled in. The button
  // only has to stay honest about being in flight.
  let creating = $state(false);
  const createHall: SubmitFunction = () => {
    creating = true;
    return async ({ update }) => {
      await update();
      creating = false;
    };
  };

  /** A hall colour reaches the DOM as a CSS value. Anything that is not a plain
   *  6-digit hex falls back to the brand accent instead of being passed through. */
  const BRAND_ACCENT = '#f05ca1';
  const hallColor = (c: string | null | undefined) =>
    typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c : BRAND_ACCENT;

  // created_at / archived_at are UTC without a zone: formatDate reads them as UTC.
  const fmtDate = (d: Date | string) => formatDate(d, getLocale());

  // Archived halls are kept for their history but are not part of the working set:
  // they sit in their own section below and do not count toward the plan.
  const activeHalls = $derived(data.halls.filter(h => !h.archived_at));
  const archivedHalls = $derived(data.halls.filter(h => h.archived_at));

  const maxRes = $derived(Math.max(...activeHalls.map(h => Number(h.reservation_count)), 1));
  // At the plan's limit the create button cannot succeed, so it says so and offers
  // the way up instead of failing after the click (B153, I14).
  const atLimit = $derived(data.hallLimit !== -1 && data.activeHalls >= data.hallLimit);
  const limitNote = $derived(
    data.hallLimit === -1
      ? ''
      : t.hallAdmin.planLimitNote
          .replace('{used}', String(data.activeHalls))
          .replace('{limit}', String(data.hallLimit))
  );
</script>

<svelte:head><title>{pageTitle(t.halls.manageHalls)}</title></svelte:head>

{#snippet createButton()}
  <form method="POST" action="?/create" use:enhance={createHall}>
    <button class="btn-primary" type="submit" disabled={creating || atLimit}
      title={atLimit ? t.hallAdmin.hallLimitReachedNote(data.hallLimit) : undefined}>
      {creating ? t.hallAdmin.creatingHall : t.halls.createHall}
    </button>
  </form>
{/snippet}

<div class="wrap page">

  <!-- ─── Header ────────────────────────────────────────────────────────────── -->
  <div class="page-head">
    <div class="page-head-text">
      <p class="eyebrow">{t.nav.halls}</p>
      <h1 class="page-title">{data.canManage ? t.halls.manageHalls : t.nav.halls}</h1>
      <p class="page-sub">{data.canManage ? t.hallAdmin.createOpensProfile : t.accessUi.hallsReadOnly}</p>
    </div>
    {#if data.canManage}{@render createButton()}{/if}
  </div>

  {#if atLimit && data.canManage}
    <p class="limit-note" role="note">
      {t.hallAdmin.hallLimitReachedNote(data.hallLimit)}
      <a href="/app/billing">{t.hallAdmin.upgrade}</a>
    </p>
  {/if}

  {#if data.deleted}
    <p class="form-success" role="status">{t.hallAdmin.hallDeletedNotice}</p>
  {/if}

  {#if form?.error}
    <p class="form-error" role="alert">{form.error}</p>
  {/if}

  <!-- ─── Empty state ───────────────────────────────────────────────────────── -->
  {#if activeHalls.length === 0}
    <section class="section section--lead">
      <div class="card--inset empty-state">
        <span class="icon-tile">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>
          </svg>
        </span>
        <h2 class="empty-title">{t.hallAdmin.noHallsYet}</h2>
        {#if data.canManage}
          <p class="empty-sub">{t.hallAdmin.noHallsSub}</p>
          {@render createButton()}
        {:else}
          <p class="empty-sub">{t.accessUi.noHallsYet}</p>
        {/if}
      </div>
    </section>

  <!-- ─── Halls ─────────────────────────────────────────────────────────────── -->
  {:else}
    <section class="section section--lead">
      <div class="section-head section-head--row">
        <h2>{t.halls.hallOverview}</h2>
        <p class="footer-note">
          {t.hallAdmin.hallsConfigured(activeHalls.length)}{#if limitNote}{` · ${limitNote}`}{/if}
          · <a href="/app/manage/halls/visibility">{t.listings.consoleLink} →</a>
        </p>
      </div>

      <div class="media-grid">
        {#each activeHalls as h (h.id)}
          <article class="media-card hall-card">
            <a href="/app/manage/halls/{h.id}" class="media-photo" aria-label={h.name}>
              {#if h.cover_image_url}
                <img src={h.cover_image_url} srcset={imageSrcset(h.cover_image_url)} sizes="(max-width: 600px) 100vw, 400px" alt="" loading="lazy" />
              {:else}
                <span class="photo-blank" style:--hall={hallColor(h.color)}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>
                  </svg>
                  <span class="photo-blank-label">{t.hallAdmin.noCoverImage}</span>
                </span>
              {/if}
            </a>

            <div class="media-topline">
              <span class="halls-cap" aria-label="{t.common.capacity} {h.max_people}">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                {h.max_people}
              </span>
              <span class="halls-created">{t.common.created} {fmtDate(h.created_at)}</span>
            </div>

            <h3><a href="/app/manage/halls/{h.id}">{h.name}</a></h3>
            {#if h.description}<p class="media-meta">{h.description}</p>{/if}

            {#if h.plan_locked || !h.is_public || !h.allow_reservations}
              <div class="hall-flags">
                {#if h.plan_locked}
                  <StatusBadge status="cancelled" label={t.hallAdmin.suspendedBadge} />
                {:else if !h.is_public}
                  <StatusBadge status="unset" label={t.hallAdmin.notListed} />
                {/if}
                {#if h.booking_mode === 'external'}
                  <StatusBadge status="unset" label={t.listings.chipExternal} />
                {:else if !h.allow_reservations}
                  <StatusBadge status="closed" label={t.hallAdmin.bookingsClosed} />
                {/if}
              </div>
            {/if}

            <div class="halls-bar-cell">
              <span class="halls-bar-label">{t.hallAdmin.allTimeBookings}</span>
              <span class="halls-bar-count">{h.reservation_count}</span>
              <div class="halls-bar-track">
                <div class="halls-bar-fill"
                  style:width="{Math.round(Number(h.reservation_count) / maxRes * 100)}%"
                  style:background={hallColor(h.color)}></div>
              </div>
            </div>

            <div class="media-bottom">
              <a href="/app/manage/halls/{h.id}" class="btn-manage">{data.canManage ? t.hallAdmin.manageAction : t.accessUi.viewAction}</a>
            </div>
          </article>
        {/each}
      </div>
    </section>
  {/if}

  <!-- ─── Archived ──────────────────────────────────────────────────────────── -->
  {#if archivedHalls.length > 0}
    <section class="section">
      <details class="archived">
        <summary class="archived-summary">
          <span>{t.hallAdmin.archivedHalls}</span>
          <span class="archived-count">{archivedHalls.length}</span>
        </summary>
        <p class="archived-hint">{t.hallAdmin.archivedHallsHint}</p>
        <ul class="archived-list">
          {#each archivedHalls as h (h.id)}
            <li>
              <a href="/app/manage/halls/{h.id}" class="archived-row">
                <span class="archived-name">{h.name}</span>
                <span class="archived-meta">
                  {t.hallAdmin.archivedOn} {fmtDate(h.archived_at!)} · {h.reservation_count} {t.hallAdmin.allTimeBookings.toLowerCase()}
                </span>
              </a>
            </li>
          {/each}
        </ul>
      </details>
    </section>
  {/if}

</div>

<style>
  .page { padding-block: 24px; }

  /* ── Header ── */
  .page-head {
    display: flex; align-items: flex-end; justify-content: space-between;
    gap: 16px; flex-wrap: wrap;
  }
  .page-head-text { min-width: 0; }
  .page-title {
    font-size: var(--display-size); font-weight: 550; color: var(--text-base);
    letter-spacing: -.055em; line-height: 1.08; margin: 0;
  }
  .page-sub {
    font-size: var(--body-size); color: var(--text-muted);
    line-height: var(--body-leading); margin: 8px 0 0; max-width: 46ch;
  }

  /* ── Buttons ── */
  .btn-primary {
    padding: 10px 20px; border-radius: var(--radius-sm); font-size: 13px; font-weight: 650;
    background: var(--accent); color: var(--accent-contrast); border: none; cursor: pointer;
    font-family: inherit; transition: transform .2s, background .2s; white-space: nowrap;
    text-decoration: none; display: inline-flex; align-items: center;
  }
  .btn-primary:hover { background: var(--accent-hover); transform: translateY(-2px); }
  .btn-primary:active { transform: translateY(0); }
  .btn-primary:disabled {
    opacity: .55; cursor: default; transform: none; background: var(--accent);
  }

  .limit-note {
    margin: 18px 0 0; padding: 10px 14px; background: var(--warning-dim);
    border: 1px solid color-mix(in srgb, var(--warning) 25%, transparent);
    border-radius: var(--radius-sm); font-size: 13px; color: var(--text-muted); line-height: 1.5;
  }
  .limit-note a { color: var(--accent-ink); font-weight: 600; margin-left: 4px; }
  .form-success {
    margin: 18px 0 0; padding: 10px 14px; background: var(--success-dim);
    border: 1px solid color-mix(in srgb, var(--success) 25%, transparent);
    border-radius: var(--radius-sm); font-size: 13px; color: var(--success);
  }

  .form-error {
    margin: 18px 0 0; padding: 10px 14px; background: var(--danger-dim);
    border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent);
    border-radius: var(--radius-sm); font-size: 13px; color: var(--danger);
  }

  /* ── Hall cards ── */
  .hall-card h3 a { color: inherit; text-decoration: none; }
  .hall-card h3 a:hover { color: var(--accent-ink); }
  .hall-card .media-meta {
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 10px;
  }

  /* A venue with no cover says so — a blank tile reads as a failed image. */
  .hall-card .photo-blank {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 8px; width: 100%; height: 100%; text-align: center; padding: 10px;
    background: color-mix(in srgb, var(--hall) 12%, var(--bg-hover));
    color: var(--text-muted);
  }
  .hall-card .photo-blank svg { opacity: .6; }
  .photo-blank-label {
    font-size: var(--meta-size); text-transform: uppercase; letter-spacing: .12em;
  }

  .hall-flags { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 12px; }

  .halls-cap { display: inline-flex; align-items: center; gap: 5px; }
  .halls-cap svg { flex-shrink: 0; }
  .halls-created { white-space: nowrap; }

  .halls-bar-cell {
    display: flex; align-items: center; gap: 8px; margin-bottom: 14px;
  }
  .halls-bar-label {
    font-size: var(--meta-size); color: var(--text-muted);
    text-transform: uppercase; letter-spacing: .12em; white-space: nowrap;
  }
  .halls-bar-count {
    font-size: 13px; font-weight: 650; color: var(--text-base);
    min-width: 20px; text-align: right; flex-shrink: 0;
  }
  .halls-bar-track {
    flex: 1; height: 6px; background: var(--border); border-radius: 99px; overflow: hidden;
  }
  .halls-bar-fill { height: 6px; border-radius: 99px; transition: width .4s ease; }

  .btn-manage {
    padding: 5px 12px; border-radius: var(--radius-sm); font-size: 12px; font-weight: 500;
    border: 1px solid var(--border); background: var(--bg-panel);
    color: var(--text-muted); text-decoration: none; white-space: nowrap;
    transition: color .15s, border-color .15s;
  }
  .btn-manage:hover { color: var(--accent-ink); border-color: var(--accent); }

  /* ── Archived ── */
  .archived-summary {
    display: inline-flex; align-items: center; gap: 8px; cursor: pointer;
    font-size: 13px; font-weight: 600; color: var(--text-muted); list-style: none;
  }
  .archived-summary::-webkit-details-marker { display: none; }
  .archived-summary::before {
    content: ''; width: 6px; height: 6px; border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor;
    transform: rotate(-45deg); transition: transform .15s;
  }
  .archived[open] .archived-summary::before { transform: rotate(45deg); }
  .archived-summary:hover { color: var(--text-base); }
  .archived-count {
    font-size: 11px; padding: 1px 7px; border-radius: 99px;
    background: var(--bg-hover); color: var(--text-muted);
  }
  .archived-hint { font-size: 12px; color: var(--text-muted); margin: 10px 0 12px; max-width: 60ch; line-height: 1.5; }
  .archived-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
  .archived-row {
    display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap;
    padding: 10px 14px; border: 1px solid var(--border); border-radius: var(--radius-sm);
    text-decoration: none; color: inherit; transition: border-color .15s;
  }
  .archived-row:hover { border-color: var(--accent); }
  .archived-name { font-size: 13px; font-weight: 600; color: var(--text-base); }
  .archived-meta { font-size: 12px; color: var(--text-muted); }

  /* ── Empty state ── */
  .empty-state {
    display: flex; flex-direction: column; align-items: center; gap: 10px;
    padding: 48px 40px; text-align: center;
  }
  .empty-title { font-size: 15px; font-weight: 600; letter-spacing: -.03em; color: var(--text-base); margin: 4px 0 0; }
  .empty-sub { font-size: 13px; color: var(--text-muted); margin: 0 0 6px; max-width: 280px; line-height: 1.5; }

  /* ── Footer ── */
  .footer-note { font-size: 11px; color: var(--text-muted); margin: 0; }

  @media (prefers-reduced-motion: reduce) {
    .btn-primary:hover { transform: none; }
  }
</style>
