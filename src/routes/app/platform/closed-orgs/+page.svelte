<script lang="ts">
  import { pageTitle } from '$lib/page-title';
  import type { PageData } from './$types';
  import { planName } from '$lib/plans';
  import { t, getLocale } from '$lib/i18n.svelte';
  import { formatDate } from '$lib/format';
  import { orgRoleLabel } from '$lib/role-label';
  import { statusLabel } from '$lib/reservationStatus';
  import { planTone } from '$lib/platform-ui';
  let { data }: { data: PageData } = $props();

  let openId = $state<string | null>(null);
  function toggle(id: string) { openId = openId === id ? null : id; }

  let search = $state('');
  const filtered = $derived.by(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data.closedOrgs;
    return data.closedOrgs.filter((o) => o.name.toLowerCase().includes(q) || (o.slug ?? '').toLowerCase().includes(q) || (o.closed_by_email ?? '').toLowerCase().includes(q));
  });

  const REASON: Record<string, string> = $derived({
    owner_closed: t.platformMisc.reasonOwnerClosed, auto_empty: t.platformMisc.reasonAutoEmptied, user_deleted: t.platformMisc.reasonUserDeleted,
  });
  function fmt(d: string | null) { return d ? formatDate(d, getLocale()) : '—'; }
</script>

<svelte:head><title>{pageTitle(t.platformMisc.closedOrgsTitle, t.platformOrgs.platformAdmin)}</title></svelte:head>

<div class="wrap page">
  <header class="page-header">
    <div>
      <p class="eyebrow">{t.platformOrgs.platformAdmin}</p>
      <div class="page-header-left">
        <h1 class="page-title">{t.platformMisc.closedOrgsTitle}</h1>
        <span class="total-badge" title="{data.closedOrgs.length} {t.platformMisc.archived(data.closedOrgs.length)}">{data.closedOrgs.length}</span>
      </div>
      <p class="page-lead">{t.platformMisc.closedOrgsLead}</p>
    </div>
  </header>

  <section class="section section--lead">
    {#if data.closedOrgs.length === 0}
      <div class="card--inset state-block">
        <span class="icon-tile" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="4" width="20" height="5" rx="1"/><path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/><line x1="10" y1="13" x2="14" y2="13"/></svg>
        </span>
        <h2>{t.platformMisc.noClosedOrgs}</h2>
      </div>
    {:else}
      <div class="list-filters" role="search">
        <label class="sr-only" for="c-q">{t.platformOrgs.searchPlaceholder}</label>
        <input id="c-q" class="lf-search" type="search" placeholder={t.platformOrgs.searchPlaceholder} bind:value={search} autocomplete="off" spellcheck="false" />
        {#if search}<button type="button" class="lf-clear" onclick={() => (search = '')}>{t.platformOrgs.clearSearch}</button>{/if}
        <span class="lf-count">{search.trim() ? t.platformOrgs.shownOf(filtered.length, data.closedOrgs.length) : `${data.closedOrgs.length} ${t.platformMisc.archived(data.closedOrgs.length)}`}</span>
      </div>

      {#if filtered.length === 0}
        <div class="card--inset state-block"><h2>{t.platformOrgs.noMatchPrefix} „{search.trim()}“.</h2></div>
      {:else}
        <div class="row-list pf-table" role="table" aria-label={t.platformMisc.closedOrgsTitle}>
          <div class="row-item row-head closed-row" role="row">
            <span role="columnheader">{t.platformMisc.colName}</span>
            <span role="columnheader">{t.platformMisc.colPlan}</span>
            <span role="columnheader" class="num">{t.platformMisc.colMembers}</span>
            <span role="columnheader" class="num">{t.platformMisc.colReservations}</span>
            <span role="columnheader">{t.platformMisc.colClosed}</span>
            <span role="columnheader">{t.platformMisc.colReason}</span>
            <span role="columnheader"><span class="sr-only">{t.platformMisc.viewRecord}</span></span>
          </div>

          {#each filtered as o (o.id)}
            <div class="row-item closed-row" role="row">
              <span role="cell" class="cell-main c-name">
                <span class="cell-title">{o.name}</span>
                {#if o.slug}<span class="cell-sub">{o.slug}</span>{/if}
              </span>
              <span role="cell" class="c-plan"><span class="pf-tag" data-tone={planTone(o.plan)}>{planName(o.plan)}</span></span>
              <span role="cell" class="num c-members"><span class="m-label">{t.platformMisc.colMembers}:{' '}</span>{o.member_count}</span>
              <span role="cell" class="num c-res"><span class="m-label">{t.platformMisc.colReservations}:{' '}</span>{o.reservation_count}</span>
              <span role="cell" class="muted nowrap c-closed">{fmt(o.closed_at)}</span>
              <span role="cell" class="muted c-reason">{REASON[o.closed_reason ?? ''] ?? o.closed_reason ?? '—'}</span>
              <span role="cell" class="row-actions c-actions">
                <button type="button" class="btn-outline btn-sm" aria-expanded={openId === o.id} onclick={() => toggle(o.id)}>{openId === o.id ? t.platformMisc.hide : t.platformMisc.viewRecord}</button>
              </span>
            </div>
            {#if openId === o.id}
              <div class="detail" role="row">
                <div class="detail-body" role="cell">
                  <dl class="detail-meta">
                    <div><dt>{t.platformMisc.orgIdLabel}</dt><dd class="mono">{o.org_id}</dd></div>
                    <div><dt>{t.platformMisc.createdLabel}</dt><dd>{fmt(o.org_created_at)}</dd></div>
                    <div><dt>{t.platformMisc.closedByLabel}</dt><dd>{o.closed_by_email ?? '—'}</dd></div>
                    {#if o.stripe_customer_id}<div><dt>{t.platformMisc.stripeCustomerLabel}</dt><dd class="mono">{o.stripe_customer_id}</dd></div>{/if}
                    {#if o.stripe_subscription_id}<div><dt>{t.platformMisc.stripeSubscriptionLabel}</dt><dd class="mono">{o.stripe_subscription_id}</dd></div>{/if}
                  </dl>

                  <h3 class="detail-heading">{t.platformMisc.membersHeading} <span class="total-badge">{o.snapshot.members?.length ?? 0}</span></h3>
                  {#if o.snapshot.members?.length}
                    <div class="table-scroll">
                      <div class="row-list sub-table" role="table" aria-label={t.platformMisc.membersHeading}>
                        <div role="row" class="row-item row-head member-row"><span role="columnheader">{t.platformMisc.colName}</span><span role="columnheader">{t.platformMisc.colEmail}</span><span role="columnheader">{t.platformMisc.colRole}</span><span role="columnheader">{t.platformMisc.colJoined}</span></div>
                        {#each o.snapshot.members as m}
                          <div role="row" class="row-item member-row"><span role="cell" class="ellipsis">{m.first_name} {m.last_name}</span><span role="cell" class="muted ellipsis">{m.email}</span><span role="cell" class="muted">{orgRoleLabel(m.role, t)}</span><span role="cell" class="muted nowrap">{fmt(m.joined_at)}</span></div>
                        {/each}
                      </div>
                    </div>
                  {:else}<p class="muted small">{t.platformMisc.noMembersRecorded}</p>{/if}

                  <h3 class="detail-heading">{t.platformMisc.reservationsHeading} <span class="total-badge">{o.snapshot.reservations?.length ?? 0}</span></h3>
                  {#if o.snapshot.reservations?.length}
                    <div class="table-scroll">
                      <div class="row-list sub-table" role="table" aria-label={t.platformMisc.reservationsHeading}>
                        <div role="row" class="row-item row-head reservation-row"><span role="columnheader">{t.platformMisc.colTitle}</span><span role="columnheader">{t.platformMisc.colDate}</span><span role="columnheader">{t.platformMisc.colHall}</span><span role="columnheader" class="num">{t.platformMisc.colGuests}</span><span role="columnheader">{t.platformMisc.colStatus}</span></div>
                        {#each o.snapshot.reservations as r}
                          <div role="row" class="row-item reservation-row"><span role="cell" class="ellipsis">{r.title}</span><span role="cell" class="muted nowrap">{fmt(r.event_date)}</span><span role="cell" class="muted ellipsis">{r.hall_name ?? '—'}</span><span role="cell" class="muted num">{r.num_guests ?? '—'}</span><span role="cell" class="muted">{statusLabel(r.status, getLocale())}</span></div>
                        {/each}
                      </div>
                    </div>
                  {:else}<p class="muted small">{t.platformMisc.noReservationsRecorded}</p>{/if}
                </div>
              </div>
            {/if}
          {/each}
        </div>
      {/if}
    {/if}
  </section>
</div>

<style>
  .closed-row { display: grid; grid-template-columns: minmax(180px, 2fr) 120px 80px 90px 110px minmax(120px, 1.2fr) 150px; gap: 14px; align-items: center; }

  /* ── Expanded record ── */
  .detail { padding: 6px 0 22px; border-bottom: 1px solid var(--border-subtle); }
  .detail-meta { display: flex; flex-wrap: wrap; gap: 12px 28px; margin: 0 0 6px; }
  .detail-meta dt { font-size: var(--meta-size); font-weight: 600; text-transform: uppercase; letter-spacing: .08em; color: var(--text-muted); margin-bottom: 3px; }
  .detail-meta dd { margin: 0; font-size: 12.5px; overflow-wrap: anywhere; }
  .detail-heading { font-size: 12px; font-weight: 650; text-transform: uppercase; letter-spacing: .08em; color: var(--text-muted); margin: 18px 0 6px; display: flex; align-items: center; gap: 6px; }
  .sub-table { min-width: 560px; }
  .sub-table .row-item { padding-block: 8px; font-size: 12.5px; }
  .member-row { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1.6fr) 110px 110px; gap: 12px; align-items: center; }
  .reservation-row { display: grid; grid-template-columns: minmax(0, 1.4fr) 110px minmax(0, 1fr) 70px 120px; gap: 12px; align-items: center; }
  .small { font-size: 12px; margin: 0; }

  @container (max-width: 800px) {
    .closed-row.row-head { display: none; }
    .closed-row { grid-template-columns: minmax(0, 1fr) auto; row-gap: 6px; }
    .c-name { grid-column: 1; grid-row: 1; }
    .c-plan { grid-column: 2; grid-row: 1; justify-self: end; }
    .c-closed { grid-column: 1; grid-row: 2; }
    .c-reason { grid-column: 2; grid-row: 2; text-align: right; }
    .c-members, .c-res { grid-row: 3; text-align: left; }
    .c-members { grid-column: 1; }
    .c-res { grid-column: 2; text-align: right; }
    .c-actions { grid-column: 1 / -1; justify-content: flex-start; }
    .closed-row .m-label { display: inline; }
  }
</style>
