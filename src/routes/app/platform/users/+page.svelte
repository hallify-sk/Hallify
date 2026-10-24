<script lang="ts">
  import { pageTitle } from '$lib/page-title';
  import { enhance } from '$app/forms';
  import type { PageData, ActionData } from './$types';
  import { t, getLocale } from '$lib/i18n.svelte';
  import { confirmFirst } from '$lib/forms';
  import { formatDate } from '$lib/format';
  let { data, form }: { data: PageData; form: ActionData } = $props();

  /** The server returns at most this many rows (see +page.server.ts). */
  const LIMIT = 500;

  const TYPES = $derived([
    { id: 'all', label: t.platformMisc.filterAll },
    { id: 'organization', label: t.platformMisc.typeOrganization },
    { id: 'client', label: t.platformMisc.typeClient },
    { id: 'admin', label: t.platformMisc.colPlatformAdmin },
  ]);
  const filtering = $derived(!!data.q || data.type !== 'all');

  function autoSubmit(e: Event) {
    (e.currentTarget as HTMLSelectElement).form?.requestSubmit();
  }
</script>

<svelte:head><title>{pageTitle(t.platformMisc.allUsersTitle, t.platformOrgs.platformAdmin)}</title></svelte:head>

<div class="wrap page">
  <header class="page-header">
    <div>
      <p class="eyebrow">{t.platformOrgs.platformAdmin}</p>
      <div class="page-header-left">
        <h1 class="page-title">{t.platformMisc.allUsersTitle}</h1>
        <span class="total-badge">{data.total}</span>
      </div>
    </div>
  </header>

  <section class="section section--lead">
    <!-- A plain GET form: the filter lives in the URL, so it survives a reload and
         can be shared. -->
    <form method="GET" class="list-filters" role="search" data-sveltekit-keepfocus data-sveltekit-noscroll>
      <label class="sr-only" for="u-q">{t.platformMisc.searchUsers}</label>
      <input id="u-q" type="search" name="q" value={data.q} class="lf-search" placeholder={t.platformMisc.searchUsers} maxlength="100" />
      <label class="sr-only" for="u-type">{t.platformMisc.colType}</label>
      <select id="u-type" name="type" value={data.type} onchange={autoSubmit}>
        {#each TYPES as ty (ty.id)}<option value={ty.id}>{ty.label}</option>{/each}
      </select>
      <button type="submit" class="btn-outline btn-sm">{t.platformMisc.filterApply}</button>
      {#if filtering}<a class="lf-clear" href="?">{t.platformOrgs.clearFilters}</a>{/if}
      <span class="lf-count">{filtering ? t.platformOrgs.shownOf(data.users.length, data.total) : `${data.total} ${t.platformMisc.total}`}</span>
    </form>

    {#if form?.error}
      <div class="alert-error" role="alert">{form.error}</div>
    {/if}

    {#if data.users.length === 0}
      <div class="card--inset state-block">
        <span class="icon-tile" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
        </span>
        <h2>{t.platformMisc.noUsersMatch}</h2>
        {#if filtering}<a class="btn-outline btn-sm" href="?">{t.platformOrgs.clearFilters}</a>{/if}
      </div>
    {:else}
      <div class="pf-table row-list" role="table" aria-label={t.platformMisc.allUsersTitle}>
        <div role="row" class="row-item row-head user-row">
          <span role="columnheader">{t.platformMisc.colUserName}</span>
          <span role="columnheader">{t.platformMisc.colType}</span>
          <span role="columnheader" class="num">{t.platformMisc.colOrgs}</span>
          <span role="columnheader">{t.platformMisc.colJoined}</span>
          <span role="columnheader">{t.platformMisc.colPlatformAdmin}</span>
          <span role="columnheader"><span class="sr-only">{t.platformMisc.view}</span></span>
        </div>

        {#each data.users as user (user.id)}
          <div role="row" class="row-item user-row">
            <span role="cell" class="cell-main c-name">
              <a class="cell-title" href="/app/platform/users/{user.id}">{user.first_name} {user.last_name}</a>
              <span class="cell-sub" title={user.email}>{user.email}</span>
            </span>
            <span role="cell" class="cell-main c-type">
              <span class="muted">{user.account_type === 'client' ? t.platformMisc.typeClient : t.platformMisc.typeOrganization}</span>
              {#if user.client_of}<span class="cell-sub" title={user.client_of}>{user.client_of}</span>{/if}
            </span>
            <span role="cell" class="num c-orgs"><span class="m-label">{t.platformMisc.colOrgs}:{' '}</span>{user.org_count}</span>
            <span role="cell" class="muted nowrap c-joined">{formatDate(user.created_at, getLocale())}</span>
            <span role="cell" class="c-admin">
              {#if user.is_platform_admin}<span class="pf-tag" data-tone="accent">{t.platformOrgs.platformAdmin}</span>{:else}<span class="muted" aria-label={t.platformMisc.no}>—</span>{/if}
            </span>
            <span role="cell" class="row-actions c-actions">
              {#if user.is_platform_admin}
                <!-- Your own row has no revoke button: the server refuses it anyway, and
                     the bare form used to fail silently with ?/action left in the URL. -->
                {#if user.id !== data.currentUserId}
                  <form method="POST" action="?/revokePlatformAdmin" use:enhance={confirmFirst(() => t.platformMisc.confirmRevokeAdmin(user.email))}>
                    <input type="hidden" name="id" value={user.id} />
                    <button type="submit" class="btn-danger btn-sm">{t.platformMisc.revokeAdmin}</button>
                  </form>
                {/if}
              {:else}
                <form method="POST" action="?/grantPlatformAdmin" use:enhance={confirmFirst(() => t.platformMisc.confirmGrantAdmin(user.email))}>
                  <input type="hidden" name="id" value={user.id} />
                  <button type="submit" class="btn-outline btn-sm">{t.platformMisc.makeAdmin}</button>
                </form>
              {/if}
            </span>
          </div>
        {/each}
      </div>
      {#if data.users.length >= LIMIT}<p class="table-note">{t.platformMisc.usersCapped(LIMIT)}</p>{/if}
    {/if}
  </section>
</div>

<style>
  .user-row {
    display: grid;
    grid-template-columns: minmax(200px, 2fr) minmax(130px, 1.1fr) 110px 110px 170px 160px;
    gap: 14px; align-items: center;
  }

  @container (max-width: 760px) {
    .user-row.row-head { display: none; }
    .user-row { grid-template-columns: minmax(0, 1fr) auto; row-gap: 6px; }
    .c-name { grid-column: 1; grid-row: 1; }
    .c-admin { grid-column: 2; grid-row: 1; justify-self: end; }
    .c-type { grid-column: 1; grid-row: 2; }
    .c-orgs { grid-column: 2; grid-row: 2; }
    .c-joined { display: none; }
    .c-actions { grid-column: 1 / -1; justify-content: flex-start; }
    .c-actions:empty { display: none; }
    .user-row .m-label { display: inline; }
  }
</style>
