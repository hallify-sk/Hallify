<script lang="ts">
  import { pageTitle } from '$lib/page-title';
  import { enhance } from '$app/forms';
  import { planName } from '$lib/plans';
  import { t, getLocale } from '$lib/i18n.svelte';
  import { formatDate, parseDbTime } from '$lib/format';
  import { eur } from '$lib/extras';
  import { planTone, type Tone } from '$lib/platform-ui';
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

  const STATUS_TONE: Record<string, Tone> = {
    requested: 'warning', contacted: 'accent', scheduled: 'accent', in_progress: 'accent', delivered: 'success', cancelled: undefined,
  };
  const isDone = (status: string) => status === 'delivered' || status === 'cancelled';

  /** A cancellation is emailed to the venue at once; ask before sending it. Stopping
   *  the click stops the submit itself, so enhance never sees it. */
  function confirmCancel(e: MouseEvent) {
    if (!confirm(t.floorplanService.confirmCancelRequest)) e.preventDefault();
  }

  /** Days since the request came in — the number that decides what to work on. */
  function waiting(created: string): number {
    return Math.max(0, Math.floor((Date.now() - (parseDbTime(created)?.getTime() ?? Date.now())) / 86_400_000));
  }
</script>

<svelte:head><title>{pageTitle(t.floorplanService.queueTitle, t.platformOrgs.platformAdmin)}</title></svelte:head>

<div class="wrap page">
  <header class="page-header">
    <div>
      <p class="eyebrow">{t.platformOrgs.platformAdmin}</p>
      <div class="page-header-left">
        <h1 class="page-title">{t.floorplanService.queueTitle}</h1>
        <span class="total-badge">{data.openCount} {t.units.openItems(data.openCount)}</span>
      </div>
      <p class="page-lead">{t.floorplanService.queueLead}</p>
    </div>
  </header>

  {#if form?.saved}<div class="alert-success" role="status">{t.settingsPages.changesSaved}</div>{/if}
  {#if form?.error}<div class="alert-error" role="alert">{form.error}</div>{/if}

  <section class="section section--lead">
    {#if data.requests.length === 0}
      <div class="card--inset state-block">
        <span class="icon-tile" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
        </span>
        <h2>{t.floorplanService.noRequests}</h2>
      </div>
    {:else}
      <div class="row-list pf-table" role="table" aria-label={t.floorplanService.queueTitle}>
        <div class="row-item row-head fp-row" role="row">
          <span role="columnheader">{t.floorplanService.colVenue}</span>
          <span role="columnheader">{t.floorplanService.colOrg}</span>
          <span role="columnheader">{t.floorplanService.colPlan}</span>
          <span role="columnheader" class="num">{t.floorplanService.colCapacity}</span>
          <span role="columnheader" class="num">{t.floorplanService.colWaiting}</span>
          <span role="columnheader">{t.floorplanService.colStatus}</span>
          <span role="columnheader"><span class="sr-only">{t.floorplanService.open}</span></span>
        </div>

        {#each data.requests as r (r.id)}
          <div class="row-item fp-row" class:is-dim={isDone(r.status)} role="row">
            <span role="cell" class="cell-main c-venue">
              <span class="cell-title">{r.hall_name}</span>
              {#if r.has_floorplan}
                <!-- They already have a plan: this is a refit or a second room,
                     not a first mapping, which changes what we quote. -->
                <span class="cell-sub has-plan">{t.floorplanService.hasPlan}</span>
              {/if}
            </span>
            <span role="cell" class="cell-main c-org"><a class="org-link ellipsis" href="/app/platform/orgs/{r.org_id}">{r.org_name}</a></span>
            <span role="cell" class="c-plan"><span class="pf-tag" data-tone={planTone(r.plan)}>{planName(r.plan)}</span></span>
            <span role="cell" class="num c-cap"><span class="m-label">{t.floorplanService.colCapacity}:{' '}</span>{r.max_people}</span>
            <span role="cell" class="num nowrap c-wait" class:is-late={!isDone(r.status) && waiting(r.created_at) >= 7}>{waiting(r.created_at)} {t.units.days(waiting(r.created_at))}</span>
            <span role="cell" class="c-status"><span class="pf-tag" data-tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status] ?? r.status}</span></span>
            <span role="cell" class="row-actions c-actions">
              <button type="button" class="btn-outline btn-sm" aria-expanded={openId === r.id} onclick={() => toggle(r.id)}>
                {openId === r.id ? t.platformMisc.hide : t.floorplanService.open}
              </button>
            </span>
          </div>

          {#if openId === r.id}
            <div class="detail" role="row">
              <div class="detail-body" role="cell">
                <dl class="detail-meta">
                  <div><dt>{t.floorplanService.requestedBy}</dt><dd>{r.requester_first_name} {r.requester_last_name} · {r.requester_email ?? '—'}</dd></div>
                  <div><dt>{t.floorplanService.requestedOn}</dt><dd>{fmt(r.created_at)}</dd></div>
                  <div><dt>{t.floorplanService.lastUpdate}</dt><dd>{fmt(r.updated_at)}</dd></div>
                  {#if r.hall_address}<div><dt>{t.floorplanService.address}</dt><dd>{r.hall_address}</dd></div>{/if}
                </dl>

                {#if r.note}
                  <h3 class="detail-heading">{t.floorplanService.theirNote}</h3>
                  <p class="note">{r.note}</p>
                {/if}

                {#if r.reply_note}
                  <h3 class="detail-heading">{t.hallAdmin.mappingReplyLabel}</h3>
                  <p class="note">{r.reply_note}</p>
                {/if}

                <h3 class="detail-heading">{t.floorplanService.moveTo}</h3>
                <!-- Every change is emailed to the venue with the message (M25); a
                     delivery needs the plan drawn in the editor or a file here. -->
                <form method="POST" action="?/setStatus" class="move-form" enctype="multipart/form-data" use:enhance>
                  <input type="hidden" name="id" value={r.id} />
                  <label class="field-label" for="reply-{r.id}">{t.floorplanService.replyLabel}</label>
                  <textarea id="reply-{r.id}" name="reply" rows="2" maxlength="2000" class="field-input" placeholder={t.floorplanService.replyPlaceholder}></textarea>
                  <label class="field-label" for="file-{r.id}">{t.floorplanService.deliveryFileLabel}</label>
                  <input id="file-{r.id}" type="file" name="file" accept="application/pdf,image/jpeg,image/png,image/webp" />
                  <p class="quote-note">
                    {t.floorplanService.deliveryFileHint}
                    {#if r.delivery_file_name}<br />{t.floorplanService.deliveryFileCurrent(r.delivery_file_name)}{/if}
                  </p>
                  <div class="status-form">
                    {#each data.statuses as s}
                      <button
                        type="submit" name="status" value={s}
                        class={s === 'cancelled' ? 'btn-danger btn-sm' : 'btn-outline btn-sm'} class:is-current={r.status === s}
                        aria-current={r.status === s ? 'true' : undefined}
                        onclick={s === 'cancelled' && r.status !== 'cancelled' ? confirmCancel : undefined}
                      >{STATUS_LABEL[s] ?? s}</button>
                    {/each}
                  </div>
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
    <div class="section-head">
      <h2>{t.setupService.queueTitle} <span class="total-badge">{data.setupOpenCount} {t.units.openItems(data.setupOpenCount)}</span></h2>
      <p>{t.setupService.queueLead}</p>
    </div>

    {#if data.setupRequests.length === 0}
      <div class="card--inset state-block">
        <span class="icon-tile" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><polyline points="20 6 9 17 4 12"/></svg>
        </span>
        <h3>{t.floorplanService.noRequests}</h3>
      </div>
    {:else}
      <div class="row-list pf-table" role="table" aria-label={t.setupService.queueTitle}>
        <div class="row-item row-head su-row" role="row">
          <span role="columnheader">{t.floorplanService.colOrg}</span>
          <span role="columnheader">{t.floorplanService.colPlan}</span>
          <span role="columnheader" class="num">{t.setupService.colPrice}</span>
          <span role="columnheader" class="num">{t.floorplanService.colWaiting}</span>
          <span role="columnheader">{t.floorplanService.colStatus}</span>
          <span role="columnheader"><span class="sr-only">{t.floorplanService.open}</span></span>
        </div>

        {#each data.setupRequests as r (r.id)}
          <div class="row-item su-row" class:is-dim={isDone(r.status)} role="row">
            <span role="cell" class="cell-main c-venue">
              <a class="cell-title" href="/app/platform/orgs/{r.org_id}">{r.org_name}</a>
              <span class="cell-sub">{r.hall_count} {t.units.venues(r.hall_count)}</span>
            </span>
            <span role="cell" class="c-plan"><span class="pf-tag" data-tone={planTone(r.plan)}>{planName(r.plan)}</span></span>
            <span role="cell" class="num nowrap c-cap">{eur(r.price_cents, getLocale())}</span>
            <span role="cell" class="num nowrap c-wait" class:is-late={!isDone(r.status) && waiting(r.created_at) >= 7}>{waiting(r.created_at)} {t.units.days(waiting(r.created_at))}</span>
            <span role="cell" class="c-status"><span class="pf-tag" data-tone={STATUS_TONE[r.status]}>{SETUP_STATUS_LABEL[r.status] ?? r.status}</span></span>
            <span role="cell" class="row-actions c-actions">
              <button type="button" class="btn-outline btn-sm" aria-expanded={openSetupId === r.id} onclick={() => toggleSetup(r.id)}>
                {openSetupId === r.id ? t.platformMisc.hide : t.floorplanService.open}
              </button>
            </span>
          </div>

          {#if openSetupId === r.id}
            <div class="detail" role="row">
              <div class="detail-body" role="cell">
                <dl class="detail-meta">
                  <div><dt>{t.floorplanService.requestedBy}</dt><dd>{r.requester_first_name} {r.requester_last_name} · {r.requester_email ?? '—'}</dd></div>
                  <div><dt>{t.floorplanService.requestedOn}</dt><dd>{fmt(r.created_at)}</dd></div>
                  <div><dt>{t.floorplanService.lastUpdate}</dt><dd>{fmt(r.updated_at)}</dd></div>
                </dl>

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
  .fp-row { display: grid; grid-template-columns: minmax(160px, 1.6fr) minmax(130px, 1.2fr) 120px 80px 80px 120px 100px; gap: 14px; align-items: center; }
  .su-row { display: grid; grid-template-columns: minmax(180px, 2fr) 120px 100px 80px 120px 100px; gap: 14px; align-items: center; }
  .has-plan { color: var(--accent-ink); }
  .org-link { display: block; color: var(--text-base); text-decoration: none; }
  .org-link:hover { color: var(--accent-ink); }
  .is-late { color: var(--warning); font-weight: 600; }

  .detail { padding: 6px 0 22px; border-bottom: 1px solid var(--border-subtle); }
  .detail-meta { display: flex; flex-wrap: wrap; gap: 12px 28px; margin: 0; }
  .detail-meta dt { font-size: var(--meta-size); font-weight: 600; text-transform: uppercase; letter-spacing: .08em; color: var(--text-muted); margin-bottom: 3px; }
  .detail-meta dd { margin: 0; font-size: 12.5px; overflow-wrap: anywhere; }
  .detail-heading { font-size: 12px; font-weight: 650; text-transform: uppercase; letter-spacing: .08em; color: var(--text-muted); margin: 18px 0 8px; }
  .note { font-size: var(--body-size); line-height: 1.7; color: var(--text-muted); white-space: pre-line; margin: 0; max-width: 640px; }

  .status-form { display: flex; flex-wrap: wrap; gap: 6px; }
  .move-form { display: grid; gap: 6px; max-width: 640px; }
  .move-form .quote-note { margin: 2px 0 8px; }
  .field-label { font-size: 12px; font-weight: 600; color: var(--text-base); margin: 4px 0 0; }
  .status-form .is-current { border-color: var(--accent); color: var(--accent-ink); background: var(--accent-dim); }

  /* There is no price here on purpose: the add-on is quoted after a consultation,
     so nothing in this screen should look like a chargeable amount. */
  .quote-note { font-size: 11.5px; color: var(--text-muted); margin: 14px 0 16px; line-height: 1.6; }

  @container (max-width: 800px) {
    .fp-row.row-head, .su-row.row-head { display: none; }
    .fp-row, .su-row { grid-template-columns: minmax(0, 1fr) auto; row-gap: 6px; }
    .c-venue { grid-column: 1; grid-row: 1; }
    .c-status { grid-column: 2; grid-row: 1; justify-self: end; }
    .c-org { grid-column: 1 / -1; grid-row: 2; }
    .c-plan { grid-column: 1; grid-row: 3; }
    .c-wait { grid-column: 2; grid-row: 3; }
    .c-cap { grid-column: 1 / -1; grid-row: 4; text-align: left; }
    .c-actions { grid-column: 1 / -1; grid-row: 5; justify-content: flex-start; }
    .fp-row .m-label { display: inline; }
  }
</style>
