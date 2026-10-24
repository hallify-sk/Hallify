<script lang="ts">
  import { pageTitle } from '$lib/page-title';
  import { enhance } from '$app/forms';
  import { planName } from '$lib/plans';
  import { t, getLocale } from '$lib/i18n.svelte';
  import { confirmFirst } from '$lib/forms';
  import { formatDate } from '$lib/format';
  import { PLAN_ORDER, planTone } from '$lib/platform-ui';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();

  let search = $state('');
  let planFilter = $state('all');
  let statusFilter = $state<'all' | 'active' | 'suspended'>('all');
  const filtered = $derived.by(() => {
    const q = search.trim().toLowerCase();
    return data.orgs.filter(o =>
      (!q || o.name.toLowerCase().includes(q) || (o.slug ?? '').toLowerCase().includes(q)) &&
      (planFilter === 'all' || (o.plan ?? 'free') === planFilter) &&
      (statusFilter === 'all' || (statusFilter === 'suspended') === !!o.suspended_at)
    );
  });
  const filtering = $derived(!!search.trim() || planFilter !== 'all' || statusFilter !== 'all');
  function clearFilters() { search = ''; planFilter = 'all'; statusFilter = 'all'; }
</script>

<svelte:head><title>{pageTitle(t.platformOrgs.organizations, t.platformOrgs.platformAdmin)}</title></svelte:head>

<div class="wrap page">
  <header class="page-header">
    <div>
      <p class="eyebrow">{t.platformOrgs.platformAdmin}</p>
      <div class="page-header-left">
        <h1 class="page-title">{t.platformOrgs.organizations}</h1>
        <span class="total-badge">{data.orgs.length}</span>
      </div>
    </div>
  </header>

  <section class="section section--lead">
    <div class="list-filters" role="search">
      <label class="sr-only" for="o-q">{t.platformOrgs.searchPlaceholder}</label>
      <input id="o-q" class="lf-search" type="search" placeholder={t.platformOrgs.searchPlaceholder} bind:value={search} autocomplete="off" spellcheck="false" />
      <label class="sr-only" for="o-plan">{t.platformOrgs.colPlan}</label>
      <select id="o-plan" bind:value={planFilter}>
        <option value="all">{t.platformOrgs.filterAllPlans}</option>
        {#each PLAN_ORDER as p}<option value={p}>{planName(p)}</option>{/each}
      </select>
      <label class="sr-only" for="o-status">{t.platformOrgs.colStatus}</label>
      <select id="o-status" bind:value={statusFilter}>
        <option value="all">{t.platformOrgs.filterAllStatuses}</option>
        <option value="active">{t.platformOrgs.active}</option>
        <option value="suspended">{t.platformOrgs.suspended}</option>
      </select>
      {#if filtering}<button type="button" class="lf-clear" onclick={clearFilters}>{t.platformOrgs.clearFilters}</button>{/if}
      <span class="lf-count" aria-live="polite">{filtering ? t.platformOrgs.shownOf(filtered.length, data.orgs.length) : `${data.orgs.length} ${t.platformOrgs.total}`}</span>
    </div>

    {#if filtered.length === 0}
      <div class="card--inset state-block">
        <span class="icon-tile" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </span>
        <h2>{data.orgs.length === 0 ? t.platformMisc.noOrgsYet : search.trim() ? `${t.platformOrgs.noMatchPrefix} „${search.trim()}“.` : t.platformOrgs.noMatchFilters}</h2>
        {#if filtering}<button type="button" class="btn-outline btn-sm" onclick={clearFilters}>{t.platformOrgs.clearFilters}</button>{/if}
      </div>
    {:else}
      <div class="pf-table row-list" role="table" aria-label={t.platformOrgs.organizations}>
        <div role="row" class="row-item row-head org-row">
          <span role="columnheader">{t.platformOrgs.colName}</span>
          <span role="columnheader">{t.platformOrgs.colPlan}</span>
          <span role="columnheader" class="num">{t.platformOrgs.colMembers}</span>
          <span role="columnheader">{t.platformOrgs.colCreated}</span>
          <span role="columnheader">{t.platformOrgs.colStatus}</span>
          <span role="columnheader"><span class="sr-only">{t.platformOrgs.manage}</span></span>
        </div>

        {#each filtered as org (org.id)}
          <div role="row" class="row-item org-row" class:is-dim={!!org.suspended_at}>
            <span role="cell" class="cell-main c-name">
              <a class="cell-title" href="/app/platform/orgs/{org.id}">{org.name}</a>
              <span class="cell-sub">{org.slug}</span>
            </span>
            <span role="cell" class="c-plan"><span class="pf-tag" data-tone={planTone(org.plan)}>{planName(org.plan)}</span></span>
            <span role="cell" class="num c-members"><span class="m-label">{t.platformOrgs.colMembers}:{' '}</span>{org.member_count}</span>
            <span role="cell" class="muted nowrap c-created">{formatDate(org.created_at, getLocale())}</span>
            <span role="cell" class="c-status">
              {#if org.suspended_at}
                <span class="pf-tag" data-tone="danger">{t.platformOrgs.suspended}</span>
              {:else}
                <span class="pf-tag" data-tone="success">{t.platformOrgs.active}</span>
              {/if}
            </span>
            <span role="cell" class="row-actions c-actions">
              {#if org.suspended_at}
                <form method="POST" action="?/unsuspend" use:enhance>
                  <input type="hidden" name="id" value={org.id} />
                  <button type="submit" class="btn-outline btn-sm">{t.platformOrgs.unsuspend}</button>
                </form>
              {:else}
                <form method="POST" action="/app/org/switch">
                  <input type="hidden" name="org_id" value={org.id} />
                  <input type="hidden" name="return_to" value="/app/manage" />
                  <button type="submit" class="btn-outline btn-sm view-as" title={t.platformOrgs.viewAsTooltip}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    {t.platformOrgs.viewAs}
                  </button>
                </form>
                <form method="POST" action="?/suspend" use:enhance={confirmFirst(() => `${t.platformOrgs.confirmSuspend} (${org.name})`)}>
                  <input type="hidden" name="id" value={org.id} />
                  <button type="submit" class="btn-danger btn-sm">{t.platformOrgs.suspend}</button>
                </form>
              {/if}
            </span>
          </div>
        {/each}
      </div>
    {/if}
  </section>
</div>

<style>
  .org-row {
    display: grid;
    grid-template-columns: minmax(180px, 2fr) 120px 80px 110px 110px 230px;
    gap: 14px; align-items: center;
  }
  .view-as { display: inline-flex; align-items: center; gap: 5px; }

  @container (max-width: 760px) {
    .org-row.row-head { display: none; }
    .org-row { grid-template-columns: minmax(0, 1fr) auto; row-gap: 6px; }
    .c-name { grid-column: 1; grid-row: 1; }
    .c-status { grid-column: 2; grid-row: 1; justify-self: end; }
    .c-plan, .c-members, .c-created { grid-row: 2; }
    .c-plan { grid-column: 1; display: flex; gap: 10px; align-items: center; }
    .c-members { grid-column: 2; }
    .c-created { display: none; }
    .c-actions { grid-column: 1 / -1; justify-content: flex-start; }
    .org-row .m-label { display: inline; }
  }
</style>
