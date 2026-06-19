<script lang="ts">
  import type { PageData } from './$types';
  import { t } from '$lib/i18n.svelte';
  let { data }: { data: PageData } = $props();

  let openId = $state<string | null>(null);
  function toggle(id: string) { openId = openId === id ? null : id; }

  const REASON: Record<string, string> = $derived({
    owner_closed: t.platformMisc.reasonOwnerClosed, auto_empty: t.platformMisc.reasonAutoEmptied, user_deleted: t.platformMisc.reasonUserDeleted,
  });
  function fmt(d: string | null) { return d ? new Date(d).toLocaleDateString() : '—'; }
</script>

<div class="page-wrap">
  <div class="page-header">
    <h1>{t.platformMisc.closedOrgsTitle}</h1>
    <span class="count">{data.closedOrgs.length} {t.platformMisc.archived}</span>
  </div>
  <p class="lead">{t.platformMisc.closedOrgsLead}</p>

  {#if data.closedOrgs.length === 0}
    <div class="empty">{t.platformMisc.noClosedOrgs}</div>
  {:else}
    <div class="card">
      <table class="table">
        <thead>
          <tr><th>{t.platformMisc.colName}</th><th>{t.platformMisc.colPlan}</th><th>{t.platformMisc.colMembers}</th><th>{t.platformMisc.colReservations}</th><th>{t.platformMisc.colClosed}</th><th>{t.platformMisc.colReason}</th><th></th></tr>
        </thead>
        <tbody>
          {#each data.closedOrgs as o}
            <tr>
              <td><strong>{o.name}</strong>{#if o.slug}<span class="muted"> · {o.slug}</span>{/if}</td>
              <td><span class="badge">{o.plan ?? 'free'}</span></td>
              <td class="muted">{o.member_count}</td>
              <td class="muted">{o.reservation_count}</td>
              <td class="muted">{fmt(o.closed_at)}</td>
              <td class="muted">{REASON[o.closed_reason ?? ''] ?? o.closed_reason ?? '—'}</td>
              <td><button class="btn-outline btn-sm" onclick={() => toggle(o.id)}>{openId === o.id ? t.platformMisc.hide : t.platformMisc.viewRecord}</button></td>
            </tr>
            {#if openId === o.id}
              <tr class="detail-row">
                <td colspan="7">
                  <div class="detail">
                    <div class="detail-meta">
                      <span><b>{t.platformMisc.orgIdLabel}</b> {o.org_id}</span>
                      <span><b>{t.platformMisc.createdLabel}</b> {fmt(o.org_created_at)}</span>
                      <span><b>{t.platformMisc.closedByLabel}</b> {o.closed_by_email ?? '—'}</span>
                      {#if o.stripe_customer_id}<span><b>{t.platformMisc.stripeCustomerLabel}</b> {o.stripe_customer_id}</span>{/if}
                      {#if o.stripe_subscription_id}<span><b>{t.platformMisc.stripeSubscriptionLabel}</b> {o.stripe_subscription_id}</span>{/if}
                    </div>

                    <h4>{t.platformMisc.membersHeading} ({o.snapshot.members?.length ?? 0})</h4>
                    {#if o.snapshot.members?.length}
                      <table class="sub-table">
                        <thead><tr><th>{t.platformMisc.colName}</th><th>{t.platformMisc.colEmail}</th><th>{t.platformMisc.colRole}</th><th>{t.platformMisc.colJoined}</th></tr></thead>
                        <tbody>
                          {#each o.snapshot.members as m}
                            <tr><td>{m.first_name} {m.last_name}</td><td class="muted">{m.email}</td><td class="muted">{m.role}</td><td class="muted">{fmt(m.joined_at)}</td></tr>
                          {/each}
                        </tbody>
                      </table>
                    {:else}<p class="muted small">{t.platformMisc.noMembersRecorded}</p>{/if}

                    <h4>{t.platformMisc.reservationsHeading} ({o.snapshot.reservations?.length ?? 0})</h4>
                    {#if o.snapshot.reservations?.length}
                      <table class="sub-table">
                        <thead><tr><th>{t.platformMisc.colTitle}</th><th>{t.platformMisc.colDate}</th><th>{t.platformMisc.colHall}</th><th>{t.platformMisc.colGuests}</th><th>{t.platformMisc.colStatus}</th></tr></thead>
                        <tbody>
                          {#each o.snapshot.reservations as r}
                            <tr><td>{r.title}</td><td class="muted">{fmt(r.event_date)}</td><td class="muted">{r.hall_name ?? '—'}</td><td class="muted">{r.num_guests ?? '—'}</td><td class="muted">{r.status}</td></tr>
                          {/each}
                        </tbody>
                      </table>
                    {:else}<p class="muted small">{t.platformMisc.noReservationsRecorded}</p>{/if}
                  </div>
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>

<style>
  .page-wrap { padding: 2rem; }
  .page-header { display: flex; align-items: center; gap: 1rem; }
  h1 { font-size: 1.4rem; margin: 0; }
  .count { font-size: .875rem; color: var(--text-muted); }
  .lead { color: var(--text-muted); font-size: .85rem; margin: .5rem 0 1.5rem; max-width: 70ch; }
  .empty { padding: 3rem; text-align: center; color: var(--text-subtle); border: 1px dashed var(--border); border-radius: 12px; }
  .table { width: 100%; border-collapse: collapse; font-size: .875rem; }
  .table th { text-align: left; padding: .6rem 1rem; font-size: .75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; border-bottom: 1px solid var(--border); }
  .table td { padding: .75rem 1rem; border-bottom: 1px solid var(--border); }
  .muted { color: var(--text-muted); }
  .small { font-size: .8rem; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: .7rem; font-weight: 700; text-transform: uppercase; background: var(--bg-panel2); color: var(--text-muted); }
  .detail-row td { background: var(--bg-panel2, var(--bg-base)); }
  .detail { padding: .5rem 0; }
  .detail-meta { display: flex; flex-wrap: wrap; gap: 16px; font-size: .8rem; color: var(--text-muted); margin-bottom: 1rem; }
  .detail h4 { font-size: .8rem; text-transform: uppercase; letter-spacing: .04em; color: var(--text-muted); margin: 1rem 0 .5rem; }
  .sub-table { width: 100%; border-collapse: collapse; font-size: .8rem; background: var(--bg-panel); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  .sub-table th { text-align: left; padding: .4rem .75rem; font-size: .7rem; color: var(--text-subtle); border-bottom: 1px solid var(--border); }
  .sub-table td { padding: .4rem .75rem; border-bottom: 1px solid var(--border-subtle, var(--border)); }
  .sub-table tr:last-child td { border-bottom: none; }
</style>
