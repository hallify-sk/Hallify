<script lang="ts">
  import type { PageData } from './$types';
  import { planName } from '$lib/plans';
  import { t, getLocale } from '$lib/i18n.svelte';
  import { formatDate } from '$lib/format';
  import { orgRoleLabel } from '$lib/role-label';
  import { statusLabel } from '$lib/reservationStatus';
  let { data }: { data: PageData } = $props();

  let openId = $state<string | null>(null);
  function toggle(id: string) { openId = openId === id ? null : id; }

  const REASON: Record<string, string> = $derived({
    owner_closed: t.platformMisc.reasonOwnerClosed, auto_empty: t.platformMisc.reasonAutoEmptied, user_deleted: t.platformMisc.reasonUserDeleted,
  });
  function fmt(d: string | null) { return d ? formatDate(d, getLocale()) : '—'; }
</script>

<div class="wrap page">
  <section class="section section--lead">
    <div class="section-head section-head--row">
      <div class="head-text">
        <p class="eyebrow">{t.platformOrgs.platformAdmin}</p>
        <h1>{t.platformMisc.closedOrgsTitle}</h1>
        <p>{t.platformMisc.closedOrgsLead}</p>
      </div>
      <span class="count">{data.closedOrgs.length} {t.platformMisc.archived}</span>
    </div>

    {#if data.closedOrgs.length === 0}
      <div class="card--inset empty-state">
        <div class="icon-tile">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="2" y="4" width="20" height="5" rx="1"/><path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/><line x1="10" y1="13" x2="14" y2="13"/></svg>
        </div>
        <p class="empty">{t.platformMisc.noClosedOrgs}</p>
      </div>
    {:else}
      <div class="row-list closed-rows" role="table">
        <div class="row-item row-head" role="row">
          <span role="columnheader">{t.platformMisc.colName}</span><span role="columnheader">{t.platformMisc.colPlan}</span><span role="columnheader">{t.platformMisc.colMembers}</span><span role="columnheader">{t.platformMisc.colReservations}</span><span role="columnheader">{t.platformMisc.colClosed}</span><span role="columnheader">{t.platformMisc.colReason}</span><span role="columnheader"></span>
        </div>

        {#each data.closedOrgs as o}
          <div class="row-item" role="row">
            <span role="cell"><strong>{o.name}</strong>{#if o.slug}<span class="muted"> · {o.slug}</span>{/if}</span>
            <span role="cell"><span class="badge">{planName(o.plan)}</span></span>
            <span role="cell" class="muted">{o.member_count}</span>
            <span role="cell" class="muted">{o.reservation_count}</span>
            <span role="cell" class="muted">{fmt(o.closed_at)}</span>
            <span role="cell" class="muted">{REASON[o.closed_reason ?? ''] ?? o.closed_reason ?? '—'}</span>
            <span role="cell" class="row-actions"><button class="btn-outline btn-sm" aria-expanded={openId === o.id} onclick={() => toggle(o.id)}>{openId === o.id ? t.platformMisc.hide : t.platformMisc.viewRecord}</button></span>
          </div>
          {#if openId === o.id}
            <div class="detail" role="row">
              <div class="detail-body" role="cell">
                <div class="detail-meta">
                  <span><b>{t.platformMisc.orgIdLabel}</b> {o.org_id}</span>
                  <span><b>{t.platformMisc.createdLabel}</b> {fmt(o.org_created_at)}</span>
                  <span><b>{t.platformMisc.closedByLabel}</b> {o.closed_by_email ?? '—'}</span>
                  {#if o.stripe_customer_id}<span><b>{t.platformMisc.stripeCustomerLabel}</b> {o.stripe_customer_id}</span>{/if}
                  {#if o.stripe_subscription_id}<span><b>{t.platformMisc.stripeSubscriptionLabel}</b> {o.stripe_subscription_id}</span>{/if}
                </div>

                <h2 class="detail-heading">{t.platformMisc.membersHeading} ({o.snapshot.members?.length ?? 0})</h2>
                {#if o.snapshot.members?.length}
                  <div class="row-list sub-rows member-rows" role="table">
                    <div role="row" class="row-item row-head"><span role="columnheader">{t.platformMisc.colName}</span><span role="columnheader">{t.platformMisc.colEmail}</span><span role="columnheader">{t.platformMisc.colRole}</span><span role="columnheader">{t.platformMisc.colJoined}</span></div>
                    {#each o.snapshot.members as m}
                      <div role="row" class="row-item"><span role="cell">{m.first_name} {m.last_name}</span><span role="cell" class="muted">{m.email}</span><span role="cell" class="muted">{orgRoleLabel(m.role, t)}</span><span role="cell" class="muted">{fmt(m.joined_at)}</span></div>
                    {/each}
                  </div>
                {:else}<p class="muted small">{t.platformMisc.noMembersRecorded}</p>{/if}

                <h2 class="detail-heading">{t.platformMisc.reservationsHeading} ({o.snapshot.reservations?.length ?? 0})</h2>
                {#if o.snapshot.reservations?.length}
                  <div class="row-list sub-rows reservation-rows" role="table">
                    <div role="row" class="row-item row-head"><span role="columnheader">{t.platformMisc.colTitle}</span><span role="columnheader">{t.platformMisc.colDate}</span><span role="columnheader">{t.platformMisc.colHall}</span><span role="columnheader">{t.platformMisc.colGuests}</span><span role="columnheader">{t.platformMisc.colStatus}</span></div>
                    {#each o.snapshot.reservations as r}
                      <div role="row" class="row-item"><span role="cell">{r.title}</span><span role="cell" class="muted">{fmt(r.event_date)}</span><span role="cell" class="muted">{r.hall_name ?? '—'}</span><span role="cell" class="muted">{r.num_guests ?? '—'}</span><span role="cell" class="muted">{statusLabel(r.status, getLocale())}</span></div>
                    {/each}
                  </div>
                {:else}<p class="muted small">{t.platformMisc.noReservationsRecorded}</p>{/if}
              </div>
            </div>
          {/if}
        {/each}
      </div>
    {/if}
  </section>
</div>

<style>
  .page { padding-block: 24px; }
  h1 { font-size: var(--display-size); font-weight: 550; letter-spacing: -.055em; line-height: 1.08; margin: 0; }
  .head-text .eyebrow { display: block; margin-bottom: 12px; }
  .count { font-size: .875rem; color: var(--text-muted); white-space: nowrap; }

  /* ── Hairline rows ── */
  .closed-rows > .row-item { display: grid; grid-template-columns: minmax(0,1.6fr) minmax(0,.7fr) minmax(0,.7fr) minmax(0,.8fr) minmax(0,.9fr) minmax(0,1.1fr) 150px; gap: 12px; align-items: center; font-size: 13px; }
  .row-head { font-size: 10px; font-weight: 650; color: var(--text-muted); text-transform: uppercase; letter-spacing: .13em; border-bottom-color: var(--border); padding-bottom: 9px; }
  .row-actions { display: flex; justify-content: flex-end; }
  .muted { color: var(--text-muted); }
  .small { font-size: .8rem; }
  .badge { display: inline-block; padding: 2px 9px; border-radius: 3px; font-size: .7rem; font-weight: 650; text-transform: uppercase; letter-spacing: .03em; background: var(--bg-panel2); color: var(--text-muted); }

  /* ── Expanded record ── */
  .detail { padding: 14px 0 18px; border-bottom: 1px solid var(--border-subtle); }
  .detail-meta { display: flex; flex-wrap: wrap; gap: 16px; font-size: .8rem; color: var(--text-muted); margin-bottom: 1rem; }
  .detail-heading { font-size: 10px; font-weight: 650; text-transform: uppercase; letter-spacing: .13em; line-height: 1.7; color: var(--text-muted); margin: 1rem 0 .25rem; }
  .sub-rows .row-item { display: grid; gap: 12px; align-items: center; font-size: .8rem; padding: 8px 0; }
  .member-rows .row-item { grid-template-columns: 1.2fr 1.6fr .8fr .8fr; }
  .reservation-rows .row-item { grid-template-columns: 1.4fr .9fr 1.1fr .6fr .8fr; }

  .empty-state { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; }
  .empty { font-size: 13px; color: var(--text-subtle); margin: 0; }

  @media (max-width: 980px) {
    .closed-rows > .row-item { grid-template-columns: 1fr 1fr; row-gap: 8px; align-items: start; }
    .closed-rows > .row-head { display: none; }
    .row-actions { grid-column: 1 / -1; justify-content: flex-start; }
    .sub-rows .row-item { grid-template-columns: 1fr 1fr; }
  }
</style>
