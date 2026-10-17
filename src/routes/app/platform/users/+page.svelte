<script lang="ts">
  import type { PageData } from './$types';
  import { t } from '$lib/i18n.svelte';
  let { data }: { data: PageData } = $props();
</script>

<div class="wrap page">
  <section class="section section--lead">
    <div class="section-head section-head--row">
      <div class="head-text">
        <p class="eyebrow">{t.platformOrgs.platformAdmin}</p>
        <h1>{t.platformMisc.allUsersTitle}</h1>
      </div>
      <span class="count">{data.users.length} {t.platformMisc.total}</span>
    </div>

    <div class="row-list user-rows" role="table">
      <div role="row" class="row-item row-head">
        <span role="columnheader">{t.platformMisc.colUserName}</span><span role="columnheader">{t.platformMisc.colEmail}</span><span role="columnheader">{t.platformMisc.colOrgs}</span><span role="columnheader">{t.platformMisc.colJoined}</span><span role="columnheader">{t.platformMisc.colPlatformAdmin}</span><span role="columnheader"></span>
      </div>

      {#each data.users as user}
        <div role="row" class="row-item">
          <span role="cell" class="cell-name"><a class="user-link" href="/app/platform/users/{user.id}"><strong>{user.first_name} {user.last_name}</strong></a></span>
          <span role="cell" class="muted">{user.email}</span>
          <span role="cell" class="muted">{user.org_count}</span>
          <span role="cell" class="muted">{new Date(user.created_at).toLocaleDateString()}</span>
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
              <form method="POST" action="?/revokePlatformAdmin" style="display:inline">
                <input type="hidden" name="id" value={user.id} />
                <button type="submit" class="btn-danger btn-sm">{t.platformMisc.revokeAdmin}</button>
              </form>
            {:else}
              <form method="POST" action="?/grantPlatformAdmin" style="display:inline">
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
  .user-rows .row-item { display: grid; grid-template-columns: 1.4fr 1.6fr .6fr .9fr .8fr auto; gap: 12px; align-items: center; font-size: 13px; }
  .row-head { font-size: 10px; font-weight: 650; color: var(--text-muted); text-transform: uppercase; letter-spacing: .13em; border-bottom-color: var(--border); padding-bottom: 9px; }
  .muted { color: var(--text-muted); }
  .user-link { color: var(--text-base); text-decoration: none; }
  .user-link:hover { color: var(--accent-ink); }
  .row-actions { display: flex; gap: 6px; align-items: center; justify-content: flex-end; }
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
