<script lang="ts">
  import { enhance } from '$app/forms';
  import { t, getLocale } from '$lib/i18n.svelte';
  import { confirmFirst } from '$lib/forms';
  import { formatDate } from '$lib/format';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();

  const SEARCH_THRESHOLD = 8;
  let search = $state('');
  let planFilter = $state('all');
  let statusFilter = $state<'all' | 'active' | 'suspended'>('all');
  const PLANS = ['free', 'starter', 'professional', 'enterprise'];
  const filtered = $derived.by(() => {
    const q = search.trim().toLowerCase();
    return data.orgs.filter(o =>
      (!q || o.name.toLowerCase().includes(q) || (o.slug ?? '').toLowerCase().includes(q)) &&
      (planFilter === 'all' || (o.plan ?? 'free') === planFilter) &&
      (statusFilter === 'all' || (statusFilter === 'suspended') === !!o.suspended_at)
    );
  });
</script>

<div class="wrap page">
  <section class="section section--lead">
    <div class="section-head section-head--row">
      <div class="head-text">
        <p class="eyebrow">{t.platformOrgs.platformAdmin}</p>
        <h1>{t.platformOrgs.organizations}</h1>
      </div>
      <div class="head-aside">
        <span class="count">{filtered.length === data.orgs.length ? data.orgs.length : `${filtered.length} / ${data.orgs.length}`} {t.platformOrgs.total}</span>
        <select class="filter-select" bind:value={planFilter} aria-label={t.platformOrgs.colPlan}>
          <option value="all">{t.platformOrgs.filterAllPlans}</option>
          {#each PLANS as p}<option value={p}>{p}</option>{/each}
        </select>
        <select class="filter-select" bind:value={statusFilter} aria-label={t.platformOrgs.colStatus}>
          <option value="all">{t.platformOrgs.filterAllStatuses}</option>
          <option value="active">{t.platformOrgs.active}</option>
          <option value="suspended">{t.platformOrgs.suspended}</option>
        </select>
        {#if data.orgs.length > SEARCH_THRESHOLD}
          <div class="search-wrap">
            <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input class="search-input" type="text" placeholder={t.platformOrgs.searchPlaceholder} aria-label={t.platformOrgs.searchPlaceholder} bind:value={search} autocomplete="off" spellcheck="false" />
            {#if search}
              <button class="search-clear" type="button" onclick={() => search = ''} aria-label={t.platformOrgs.clearSearch}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <div class="row-list org-rows" role="table">
      <div role="row" class="row-item row-head">
        <span role="columnheader">{t.platformOrgs.colName}</span><span role="columnheader">{t.platformOrgs.colSlug}</span><span role="columnheader">{t.platformOrgs.colPlan}</span><span role="columnheader">{t.platformOrgs.colMembers}</span>
        <span role="columnheader">{t.platformOrgs.colCreated}</span><span role="columnheader">{t.platformOrgs.colStatus}</span><span role="columnheader"></span>
      </div>

      {#each filtered as org}
        <div role="row" class="row-item" class:suspended={!!org.suspended_at}>
          <span role="cell" class="cell-name"><a class="org-link" href="/app/platform/orgs/{org.id}"><strong>{org.name}</strong></a></span>
          <span role="cell" class="muted">{org.slug}</span>
          <span role="cell"><span class="badge badge-{org.plan ?? 'free'}">{org.plan ?? 'free'}</span></span>
          <span role="cell" class="muted">{org.member_count}</span>
          <span role="cell" class="muted">{formatDate(org.created_at, getLocale())}</span>
          <span role="cell">
            {#if org.suspended_at}
              <span class="badge badge-suspended">{t.platformOrgs.suspended}</span>
            {:else}
              <span class="badge badge-active">{t.platformOrgs.active}</span>
            {/if}
          </span>
          <span role="cell" class="actions">
            <a href="/app/platform/orgs/{org.id}" class="btn-outline btn-sm">{t.platformOrgs.manage}</a>
            {#if org.suspended_at}
              <form method="POST" action="?/unsuspend" style="display:inline" use:enhance>
                <input type="hidden" name="id" value={org.id} />
                <button type="submit" class="btn-outline btn-sm">{t.platformOrgs.unsuspend}</button>
              </form>
            {:else}
              <form method="POST" action="/app/org/switch" style="display:inline">
                <input type="hidden" name="org_id" value={org.id} />
                <input type="hidden" name="return_to" value="/app/manage" />
                <button type="submit" class="btn-viewas btn-sm" title={t.platformOrgs.viewAsTooltip}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  {t.platformOrgs.viewAs}
                </button>
              </form>
              <form method="POST" action="?/suspend" style="display:inline" use:enhance={confirmFirst(() => t.platformOrgs.confirmSuspend)}>
                <input type="hidden" name="id" value={org.id} />
                <button type="submit" class="btn-danger btn-sm">{t.platformOrgs.suspend}</button>
              </form>
            {/if}
          </span>
        </div>
      {/each}
    </div>

    {#if filtered.length === 0}
      <div class="card--inset empty-state">
        <div class="icon-tile">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </div>
        <p class="empty">{search ? `${t.platformOrgs.noMatchPrefix} “${search}”.` : t.platformOrgs.noMatchFilters}</p>
      </div>
    {/if}
  </section>
</div>

<style>
  .page { padding-block: 24px; }
  h1 { font-size: var(--display-size); font-weight: 550; letter-spacing: -.055em; line-height: 1.08; margin: 0; }
  .head-text .eyebrow { display: block; margin-bottom: 12px; }
  .head-aside { display: flex; align-items: center; gap: 1rem; flex: 1; justify-content: flex-end; }
  .count { font-size: .875rem; color: var(--text-muted); white-space: nowrap; }
  .head-aside { flex-wrap: wrap; }
  .filter-select { height: 34px; box-sizing: border-box; padding: 0 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-panel2); color: var(--text-base); font: inherit; font-size: 13px; }

  .search-wrap { position: relative; display: flex; align-items: center; min-width: 240px; max-width: 360px; flex: 1; }
  .search-icon { position: absolute; left: 11px; color: var(--text-subtle); pointer-events: none; }
  .search-input { width: 100%; padding: 8px 32px 8px 32px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-panel2); color: var(--text-base); font-size: 13px; font-family: inherit; outline: none; transition: border-color .15s, box-shadow .15s; }
  .search-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
  .search-clear { position: absolute; right: 9px; width: 17px; height: 17px; border-radius: 50%; background: var(--text-subtle); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--bg-panel); }
  .search-clear:hover { background: var(--text-muted); }

  /* ── Hairline rows ── */
  .org-rows .row-item { display: grid; grid-template-columns: minmax(0,1.6fr) minmax(0,1.1fr) minmax(0,.8fr) minmax(0,.7fr) minmax(0,.9fr) minmax(0,.9fr) 340px; gap: 12px; align-items: center; font-size: 13px; }
  .row-head { font-size: 10px; font-weight: 650; color: var(--text-muted); text-transform: uppercase; letter-spacing: .13em; border-bottom-color: var(--border); padding-bottom: 9px; }
  .org-rows .row-item.suspended { opacity: .5; }
  .muted { color: var(--text-muted); }
  .org-link { color: var(--text-base); text-decoration: none; }
  .org-link:hover { color: var(--accent-ink); }
  .actions { display: flex; gap: 6px; align-items: center; justify-content: flex-end; flex-wrap: wrap; }
  .actions .btn-outline { text-decoration: none; }

  .empty-state { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; margin-top: 14px; }
  .empty { font-size: 13px; color: var(--text-subtle); margin: 0; }

  .badge { display: inline-block; padding: 2px 9px; border-radius: 3px; font-size: .7rem; font-weight: 650; text-transform: uppercase; letter-spacing: .03em; }
  .badge-free { background: var(--bg-panel2); color: var(--text-muted); }
  .badge-starter { background: var(--accent-dim); color: var(--accent-ink); }
  .badge-professional { background: var(--warning-dim); color: var(--warning); }
  .badge-enterprise { background: var(--accent-action-dim); color: var(--accent-ink); }
  .badge-active { background: var(--success-dim); color: var(--success); }
  .badge-suspended { background: var(--danger-dim); color: var(--danger); }
  .btn-viewas { display: inline-flex; align-items: center; gap: 5px; padding: 5px 11px; border-radius: var(--radius-sm); font-size: 12px; font-weight: 600; background: var(--accent); color: var(--accent-contrast); border: none; cursor: pointer; font-family: inherit; transition: transform .2s, background .2s; }
  .btn-viewas:hover { background: var(--accent-hover); transform: translateY(-2px); }
  .btn-viewas:active { transform: translateY(0); }

  @media (max-width: 980px) {
    .org-rows .row-item { grid-template-columns: 1fr 1fr; row-gap: 8px; align-items: start; }
    .row-head { display: none; }
    .actions { grid-column: 1 / -1; justify-content: flex-start; }
  }

  @media (prefers-reduced-motion: reduce) {
    .btn-viewas:hover { transform: none; }
  }
</style>
