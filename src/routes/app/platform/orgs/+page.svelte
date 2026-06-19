<script lang="ts">
  import { t } from '$lib/i18n.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();

  const SEARCH_THRESHOLD = 8;
  let search = $state('');
  const filtered = $derived.by(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data.orgs;
    return data.orgs.filter(o =>
      o.name.toLowerCase().includes(q) || (o.slug ?? '').toLowerCase().includes(q)
    );
  });
</script>

<div class="page-wrap">
  <div class="page-header">
    <h1>{t.platformOrgs.organizations}</h1>
    <span class="count">{data.orgs.length} {t.platformOrgs.total}</span>
    {#if data.orgs.length > SEARCH_THRESHOLD}
      <div class="search-wrap">
        <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input class="search-input" type="text" placeholder={t.platformOrgs.searchPlaceholder} bind:value={search} autocomplete="off" spellcheck="false" />
        {#if search}
          <button class="search-clear" type="button" onclick={() => search = ''} aria-label={t.platformOrgs.clearSearch}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        {/if}
      </div>
    {/if}
  </div>

  <div class="card">
    <table class="table">
      <thead>
        <tr>
          <th>{t.platformOrgs.colName}</th><th>{t.platformOrgs.colSlug}</th><th>{t.platformOrgs.colPlan}</th><th>{t.platformOrgs.colMembers}</th>
          <th>{t.platformOrgs.colCreated}</th><th>{t.platformOrgs.colStatus}</th><th></th>
        </tr>
      </thead>
      <tbody>
        {#each filtered as org}
          <tr class:suspended={!!org.suspended_at}>
            <td><a class="org-link" href="/app/platform/orgs/{org.id}"><strong>{org.name}</strong></a></td>
            <td class="muted">{org.slug}</td>
            <td><span class="badge badge-{org.plan ?? 'free'}">{org.plan ?? 'free'}</span></td>
            <td class="muted">{org.member_count}</td>
            <td class="muted">{new Date(org.created_at).toLocaleDateString()}</td>
            <td>
              {#if org.suspended_at}
                <span class="badge badge-suspended">{t.platformOrgs.suspended}</span>
              {:else}
                <span class="badge badge-active">{t.platformOrgs.active}</span>
              {/if}
            </td>
            <td class="actions">
              <a href="/app/platform/orgs/{org.id}" class="btn-outline btn-sm">{t.platformOrgs.manage}</a>
              {#if org.suspended_at}
                <form method="POST" action="?/unsuspend" style="display:inline">
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
                <form method="POST" action="?/suspend" style="display:inline">
                  <input type="hidden" name="id" value={org.id} />
                  <button type="submit" class="btn-danger btn-sm"
                    onclick={(e) => { if (!confirm(t.platformOrgs.confirmSuspend)) e.preventDefault(); }}>{t.platformOrgs.suspend}</button>
                </form>
              {/if}
            </td>
          </tr>
        {/each}
        {#if filtered.length === 0}
          <tr><td colspan="7" class="empty">{t.platformOrgs.noMatchPrefix} “{search}”.</td></tr>
        {/if}
      </tbody>
    </table>
  </div>
</div>

<style>
  .page-wrap { padding: 2rem; }
  .page-header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem; }
  h1 { font-size: 1.4rem; margin: 0; }
  .count { font-size: .875rem; color: var(--text-muted); }

  .search-wrap { position: relative; display: flex; align-items: center; margin-left: auto; min-width: 240px; max-width: 360px; flex: 1; }
  .search-icon { position: absolute; left: 11px; color: var(--text-subtle); pointer-events: none; }
  .search-input { width: 100%; padding: 8px 32px 8px 32px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg-panel); color: var(--text-base); font-size: 13px; font-family: inherit; outline: none; transition: border-color .12s, box-shadow .12s; }
  .search-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 12%, transparent); }
  .search-clear { position: absolute; right: 9px; width: 17px; height: 17px; border-radius: 50%; background: var(--text-subtle); border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--bg-panel); }
  .search-clear:hover { background: var(--text-muted); }

  .table { width: 100%; border-collapse: collapse; font-size: .875rem; }
  .table th { text-align: left; padding: .6rem 1rem; font-size: .75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: .04em; border-bottom: 1px solid var(--border); }
  .table td { padding: .75rem 1rem; border-bottom: 1px solid var(--border); }
  .table tr:last-child td { border-bottom: none; }
  .table tr.suspended td { opacity: .5; }
  .muted { color: var(--text-muted); }
  .org-link { color: var(--text-base); text-decoration: none; }
  .org-link:hover { color: var(--accent); }
  .actions { display: flex; gap: 6px; align-items: center; }
  .empty { text-align: center; color: var(--text-subtle); padding: 2rem; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: .7rem; font-weight: 700; text-transform: uppercase; }
  .badge-free { background: var(--bg-panel2); color: var(--text-muted); }
  .badge-starter { background: var(--accent-dim); color: var(--accent); }
  .badge-professional { background: #fef3c7; color: #92400e; }
  .badge-enterprise { background: var(--accent-action-dim); color: var(--accent-action); }
  .badge-active { background: #dcfce7; color: #166534; }
  .badge-suspended { background: #fee2e2; color: #991b1b; }
  .btn-viewas { display: inline-flex; align-items: center; gap: 5px; padding: 5px 11px; border-radius: var(--radius-sm); font-size: 12px; font-weight: 600; background: var(--accent); color: #fff; border: none; cursor: pointer; font-family: inherit; }
  .btn-viewas:hover { background: var(--accent-hover); }
</style>
