<script lang="ts">
  import { enhance } from '$app/forms';
  import type { PageData, ActionData } from './$types';
  import { t, getLocale } from '$lib/i18n.svelte';
  import { confirmFirst } from '$lib/forms';
  import { formatDate } from '$lib/format';
  let { data, form }: { data: PageData; form: ActionData } = $props();

  const TYPES = $derived([
    { id: 'all', label: t.platformMisc.filterAll },
    { id: 'organization', label: t.platformMisc.typeOrganization },
    { id: 'client', label: t.platformMisc.typeClient },
    { id: 'admin', label: t.platformMisc.colPlatformAdmin },
  ]);
</script>

<div class="wrap page">
  <section class="section section--lead">
    <div class="section-head section-head--row">
      <div class="head-text">
        <p class="eyebrow">{t.platformOrgs.platformAdmin}</p>
        <h1>{t.platformMisc.allUsersTitle}</h1>
      </div>
      <span class="count">{data.users.length} / {data.total} {t.platformMisc.total}</span>
    </div>

    <!-- A plain GET form: the filter lives in the URL, so it survives a reload and
         can be shared. -->
    <form method="GET" class="filters" role="search">
      <input type="search" name="q" value={data.q} class="search-input" placeholder={t.platformMisc.searchUsers} aria-label={t.platformMisc.searchUsers} />
      <select name="type" class="select-input" value={data.type} aria-label={t.platformMisc.colType}>
        {#each TYPES as ty (ty.id)}<option value={ty.id}>{ty.label}</option>{/each}
      </select>
      <button type="submit" class="btn-outline btn-sm">{t.platformMisc.filterApply}</button>
    </form>

    {#if form?.error}
      <div class="alert-error" role="alert">{form.error}</div>
    {/if}

    <div class="row-list user-rows" role="table">
      <div role="row" class="row-item row-head">
        <span role="columnheader">{t.platformMisc.colUserName}</span><span role="columnheader">{t.platformMisc.colEmail}</span><span role="columnheader">{t.platformMisc.colType}</span><span role="columnheader">{t.platformMisc.colOrgs}</span><span role="columnheader">{t.platformMisc.colJoined}</span><span role="columnheader">{t.platformMisc.colPlatformAdmin}</span><span role="columnheader"></span>
      </div>

      {#each data.users as user}
        <div role="row" class="row-item">
          <span role="cell" class="cell-name"><a class="user-link" href="/app/platform/users/{user.id}"><strong>{user.first_name} {user.last_name}</strong></a></span>
          <span role="cell" class="muted cell-email">{user.email}</span>
          <span role="cell" class="muted">
            {user.account_type === 'client' ? t.platformMisc.typeClient : t.platformMisc.typeOrganization}
            {#if user.client_of}<span class="client-of">{user.client_of}</span>{/if}
          </span>
          <span role="cell" class="muted">{user.org_count}</span>
          <span role="cell" class="muted">{formatDate(user.created_at, getLocale())}</span>
          <span role="cell">
            {#if user.is_platform_admin}
              <span class="badge badge-admin">{t.platformMisc.yes}</span>
            {:else}
              <span class="badge badge-no">{t.platformMisc.no}</span>
            {/if}
          </span>
          <span role="cell" class="row-actions">
            <a href="/app/platform/users/{user.id}" class="btn-outline btn-sm">{t.platformMisc.view}</a>
            {#if user.is_platform_admin}
              <!-- Your own row has no revoke button: the server refuses it anyway, and
                   the bare form used to fail silently with ?/action left in the URL. -->
              {#if user.id !== data.currentUserId}
                <form method="POST" action="?/revokePlatformAdmin" style="display:inline" use:enhance={confirmFirst(() => t.platformMisc.confirmRevokeAdmin(user.email))}>
                  <input type="hidden" name="id" value={user.id} />
                  <button type="submit" class="btn-danger btn-sm">{t.platformMisc.revokeAdmin}</button>
                </form>
              {/if}
            {:else}
              <form method="POST" action="?/grantPlatformAdmin" style="display:inline" use:enhance={confirmFirst(() => t.platformMisc.confirmGrantAdmin(user.email))}>
                <input type="hidden" name="id" value={user.id} />
                <button type="submit" class="btn-outline btn-sm">{t.platformMisc.makeAdmin}</button>
              </form>
            {/if}
          </span>
        </div>
      {/each}
    </div>
  </section>
</div>

<style>
  .page { padding-block: 24px; }
  h1 { font-size: var(--display-size); font-weight: 550; letter-spacing: -.055em; line-height: 1.08; margin: 0; }
  .head-text .eyebrow { display: block; margin-bottom: 12px; }
  .count { font-size: .875rem; color: var(--text-muted); }

  /* ── Hairline rows ── */
  .user-rows .row-item { display: grid; grid-template-columns: minmax(0,1.3fr) minmax(0,1.5fr) minmax(0,1fr) minmax(0,.5fr) minmax(0,.8fr) minmax(0,.7fr) 240px; gap: 12px; align-items: center; font-size: 13px; }
  .cell-email { overflow: hidden; text-overflow: ellipsis; }
  .client-of { display: block; font-size: 11px; color: var(--text-subtle); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .filters { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 0 0 16px; }
  .search-input, .select-input {
    height: 34px; box-sizing: border-box; padding: 0 11px; border: 1px solid var(--border); border-radius: var(--radius-sm);
    background: var(--bg-panel2); color: var(--text-base); font: inherit; font-size: 13px;
  }
  .search-input { flex: 1; min-width: 200px; max-width: 360px; }
  .row-head { font-size: 10px; font-weight: 650; color: var(--text-muted); text-transform: uppercase; letter-spacing: .13em; border-bottom-color: var(--border); padding-bottom: 9px; }
  .muted { color: var(--text-muted); }
  .user-link { color: var(--text-base); text-decoration: none; }
  .user-link:hover { color: var(--accent-ink); }
  .row-actions { display: flex; gap: 6px; align-items: center; justify-content: flex-end; flex-wrap: wrap; }
  .row-actions .btn-outline { text-decoration: none; }
  .badge { display: inline-block; padding: 2px 9px; border-radius: 3px; font-size: .7rem; font-weight: 650; letter-spacing: .03em; }
  .badge-admin { background: var(--accent-action-dim); color: var(--accent-ink); }
  .badge-no { background: var(--bg-panel2); color: var(--text-muted); }

  @media (max-width: 900px) {
    .user-rows .row-item { grid-template-columns: 1fr 1fr; row-gap: 8px; align-items: start; }
    .row-head { display: none; }
    .row-actions { grid-column: 1 / -1; justify-content: flex-start; }
  }
</style>
