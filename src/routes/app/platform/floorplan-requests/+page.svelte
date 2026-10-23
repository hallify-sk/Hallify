<script lang="ts">
  import { pageTitle } from '$lib/page-title';
  import { enhance } from '$app/forms';
  import { planName } from '$lib/plans';
  import { t, getLocale } from '$lib/i18n.svelte';
  import { formatDate, parseDbTime } from '$lib/format';
  import { eur } from '$lib/extras';
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let openId = $state<string | null>(null);
  const toggle = (id: string) => (openId = openId === id ? null : id);

  const STATUS_LABEL: Record<string, string> = $derived({
    requested: t.floorplanService.statusRequested,
    contacted: t.floorplanService.statusContacted,
    scheduled: t.floorplanService.statusScheduled,
    delivered: t.floorplanService.statusDelivered,
    cancelled: t.floorplanService.statusCancelled
  });

  const fmt = (d: string | null) => (d ? formatDate(d, getLocale()) : '—');

  let openSetupId = $state<string | null>(null);
  const toggleSetup = (id: string) => (openSetupId = openSetupId === id ? null : id);

  const SETUP_STATUS_LABEL: Record<string, string> = $derived({
    requested: t.floorplanService.statusRequested,
    contacted: t.floorplanService.statusContacted,
    in_progress: t.setupService.statusInProgress,
    delivered: t.floorplanService.statusDelivered,
    cancelled: t.floorplanService.statusCancelled
  });

  /** Days since the request came in — the number that decides what to work on. */
  function waiting(created: string): number {
    return Math.max(0, Math.floor((Date.now() - (parseDbTime(created)?.getTime() ?? Date.now())) / 86_400_000));
  }
</script>

<svelte:head><title>{pageTitle(t.floorplanService.queueTitle)}</title></svelte:head>

<div class="wrap page">
  <section class="section section--lead">
    <div class="section-head section-head--row">
      <div class="head-text">
        <p class="eyebrow">{t.platformOrgs.platformAdmin}</p>
        <h1>{t.floorplanService.queueTitle}</h1>
        <p>{t.floorplanService.queueLead}</p>
      </div>
      <span class="count">{data.openCount} {t.units.openItems(data.openCount)}</span>
    </div>

    {#if form?.saved}<div class="alert-success">{t.settingsPages.changesSaved}</div>{/if}
    {#if form?.error}<div class="alert-error">{form.error}</div>{/if}

    {#if data.requests.length === 0}
      <div class="card--inset empty-state">
        <div class="icon-tile">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
        </div>
        <p class="empty">{t.floorplanService.noRequests}</p>
      </div>
    {:else}
      <div class="row-list fp-rows" role="table">
        <div class="row-item row-head" role="row">
          <span role="columnheader">{t.floorplanService.colVenue}</span>
          <span role="columnheader">{t.floorplanService.colOrg}</span>
          <span role="columnheader">{t.floorplanService.colPlan}</span>
          <span role="columnheader">{t.floorplanService.colCapacity}</span>
          <span role="columnheader">{t.floorplanService.colWaiting}</span>
          <span role="columnheader">{t.floorplanService.colStatus}</span>
          <span role="columnheader"></span>
        </div>

        {#each data.requests as r (r.id)}
          <div class="row-item" class:is-done={r.status === 'delivered' || r.status === 'cancelled'} role="row">
            <span role="cell">
              <strong>{r.hall_name}</strong>
              {#if r.has_floorplan}
                <!-- They already have a plan: this is a refit or a second room,
                     not a first mapping, which changes what we quote. -->
                <span class="tag">{t.floorplanService.hasPlan}</span>
              {/if}
            </span>
            <span role="cell" class="muted">{r.org_name}</span>
            <span role="cell"><span class="badge">{planName(r.plan)}</span></span>
            <span role="cell" class="muted">{r.max_people}</span>
            <span role="cell" class="muted">{waiting(r.created_at)} {t.units.days(waiting(r.created_at))}</span>
            <span role="cell"><span class="badge badge--{r.status}">{STATUS_LABEL[r.status] ?? r.status}</span></span>
            <span role="cell" class="row-actions">
              <button class="btn-outline btn-sm" aria-expanded={openId === r.id} onclick={() => toggle(r.id)}>
                {openId === r.id ? t.platformMisc.hide : t.floorplanService.open}
              </button>
            </span>
          </div>

          {#if openId === r.id}
            <div class="detail" role="row">
              <div class="detail-body" role="cell">
                <div class="detail-meta">
                  <span><b>{t.floorplanService.requestedBy}</b> {r.requester_first_name} {r.requester_last_name} · {r.requester_email ?? '—'}</span>
                  <span><b>{t.floorplanService.requestedOn}</b> {fmt(r.created_at)}</span>
                  <span><b>{t.floorplanService.lastUpdate}</b> {fmt(r.updated_at)}</span>
                  {#if r.hall_address}<span><b>{t.floorplanService.address}</b> {r.hall_address}</span>{/if}
                </div>

                {#if r.note}
                  <h2 class="detail-heading">{t.floorplanService.theirNote}</h2>
                  <p class="note">{r.note}</p>
                {/if}

                <h2 class="detail-heading">{t.floorplanService.moveTo}</h2>
                <form method="POST" action="?/setStatus" class="status-form" use:enhance>
                  <input type="hidden" name="id" value={r.id} />
                  {#each data.statuses as s}
                    <button
                      type="submit" name="status" value={s}
                      class="btn-outline btn-sm" class:is-current={r.status === s}
                      disabled={r.status === s}
                    >{STATUS_LABEL[s] ?? s}</button>
                  {/each}
                </form>

                <p class="quote-note">{t.floorplanService.quoteReminder}</p>

                <!-- The hall belongs to another organisation: open it through View as,
                     or /app/manage resolves it in the admin's own org and 404s. -->
                <form method="POST" action="/app/org/switch" class="open-venue">
                  <input type="hidden" name="org_id" value={r.org_id} />
                  <input type="hidden" name="return_to" value="/app/manage/halls/{r.hall_id}" />
                  <button type="submit" class="btn-outline btn-sm">{t.floorplanService.openVenue}</button>
                </form>
              </div>
            </div>
          {/if}
        {/each}
      </div>
    {/if}
  </section>
  <!-- The fixed-price setup service. A separate queue because it is a separate
       product: this one has a price on it and excludes the floorplan. -->
  <section class="section">
    <div class="section-head section-head--row">
      <div class="head-text">
        <h2>{t.setupService.queueTitle}</h2>
        <p>{t.setupService.queueLead}</p>
      </div>
      <span class="count">{data.setupOpenCount} {t.units.openItems(data.setupOpenCount)}</span>
    </div>

    {#if data.setupRequests.length === 0}
      <div class="card--inset empty-state">
        <div class="icon-tile">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <p class="empty">{t.floorplanService.noRequests}</p>
      </div>
    {:else}
      <div class="row-list su-rows" role="table">
        <div class="row-item row-head" role="row">
          <span role="columnheader">{t.floorplanService.colOrg}</span>
          <span role="columnheader">{t.floorplanService.colPlan}</span>
          <span role="columnheader">{t.setupService.colPrice}</span>
          <span role="columnheader">{t.floorplanService.colWaiting}</span>
          <span role="columnheader">{t.floorplanService.colStatus}</span>
          <span role="columnheader"></span>
        </div>

        {#each data.setupRequests as r (r.id)}
          <div class="row-item" class:is-done={r.status === 'delivered' || r.status === 'cancelled'} role="row">
            <span role="cell">
              <strong>{r.org_name}</strong>
              <span class="muted"> · {r.hall_count} {t.units.venues(r.hall_count)}</span>
            </span>
            <span role="cell"><span class="badge">{planName(r.plan)}</span></span>
            <span role="cell" class="muted">{eur(r.price_cents, getLocale())}</span>
            <span role="cell" class="muted">{waiting(r.created_at)} {t.units.days(waiting(r.created_at))}</span>
            <span role="cell"><span class="badge badge--{r.status}">{SETUP_STATUS_LABEL[r.status] ?? r.status}</span></span>
            <span role="cell" class="row-actions">
              <button class="btn-outline btn-sm" aria-expanded={openSetupId === r.id} onclick={() => toggleSetup(r.id)}>
                {openSetupId === r.id ? t.platformMisc.hide : t.floorplanService.open}
              </button>
            </span>
          </div>

          {#if openSetupId === r.id}
            <div class="detail" role="row">
              <div class="detail-body" role="cell">
                <div class="detail-meta">
                  <span><b>{t.floorplanService.requestedBy}</b> {r.requester_first_name} {r.requester_last_name} · {r.requester_email ?? '—'}</span>
                  <span><b>{t.floorplanService.requestedOn}</b> {fmt(r.created_at)}</span>
                  <span><b>{t.floorplanService.lastUpdate}</b> {fmt(r.updated_at)}</span>
                </div>

                {#if r.note}
                  <h3 class="detail-heading">{t.floorplanService.theirNote}</h3>
                  <p class="note">{r.note}</p>
                {/if}

                <h3 class="detail-heading">{t.floorplanService.moveTo}</h3>
                <form method="POST" action="?/setSetupStatus" class="status-form" use:enhance>
                  <input type="hidden" name="id" value={r.id} />
                  {#each data.setupStatuses as st2}
                    <button
                      type="submit" name="status" value={st2}
                      class="btn-outline btn-sm" class:is-current={r.status === st2}
                      disabled={r.status === st2}
                    >{SETUP_STATUS_LABEL[st2] ?? st2}</button>
                  {/each}
                </form>
              </div>
            </div>
          {/if}
        {/each}
      </div>
    {/if}
  </section>
</div>

<style>
  .fp-rows > .row-item {
    display: grid;
    grid-template-columns: minmax(0,1.6fr) minmax(0,1.2fr) minmax(0,.6fr) minmax(0,.6fr) minmax(0,.7fr) minmax(0,.9fr) 110px;
    gap: 12px; align-items: center; font-size: 13px;
  }
  /* Finished work stays in the list but recedes, so the queue reads as a worklist. */
  .fp-rows > .row-item.is-done { opacity: .55; }

  .tag {
    margin-left: 7px; font-size: 9px; font-weight: 650; text-transform: uppercase;
    letter-spacing: .09em; color: var(--accent-ink);
  }

  .badge--requested { background: var(--warning-dim); color: var(--warning); }
  .badge--contacted,
  .badge--scheduled { background: var(--accent-dim); color: var(--accent-ink); }
  .badge--delivered { background: var(--success-dim); color: var(--success); }
  .badge--cancelled { background: var(--bg-hover); color: var(--text-subtle); }

  .detail-body { padding: 16px 14px 18px; }
  .detail-meta { display: flex; flex-wrap: wrap; gap: 6px 22px; font-size: var(--meta-size); color: var(--text-muted); }
  .detail-meta b { color: var(--text-base); font-weight: 600; }
  .detail-heading { font-size: 11px; font-weight: 650; text-transform: uppercase; letter-spacing: .08em; color: var(--text-subtle); margin: 18px 0 8px; }
  .note { font-size: var(--body-size); line-height: 1.7; color: var(--text-muted); white-space: pre-line; margin: 0; max-width: 640px; }

  .status-form { display: flex; flex-wrap: wrap; gap: 6px; }
  .status-form .is-current { border-color: var(--accent); color: var(--accent-ink); }

  /* There is no price here on purpose: the add-on is quoted after a consultation,
     so nothing in this screen should look like a chargeable amount. */
  .quote-note { font-size: var(--meta-size); color: var(--text-subtle); margin: 14px 0 16px; }

  @media (max-width: 900px) {
    .fp-rows > .row-item { grid-template-columns: 1fr 1fr; row-gap: 8px; align-items: start; }
    .fp-rows > .row-head { display: none; }
  }
  .su-rows > .row-item {
    display: grid;
    grid-template-columns: minmax(0,1.6fr) minmax(0,.6fr) minmax(0,.6fr) minmax(0,.7fr) minmax(0,.9fr) 110px;
    gap: 12px; align-items: center; font-size: 13px;
  }
  .su-rows > .row-item.is-done { opacity: .55; }
  .badge--in_progress { background: var(--accent-dim); color: var(--accent-ink); }

  @media (max-width: 900px) {
    .su-rows > .row-item { grid-template-columns: 1fr 1fr; row-gap: 8px; align-items: start; }
    .su-rows > .row-head { display: none; }
  }
</style>
