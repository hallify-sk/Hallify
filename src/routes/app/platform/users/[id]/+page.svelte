<script lang="ts">
  import { enhance } from '$app/forms';
  import { t } from '$lib/i18n.svelte';
  import type { PageData, ActionData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();

  const u = $derived(data.user);
  const isClient = $derived(u.account_type === 'client');

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
</script>

<svelte:head><title>{u.first_name} {u.last_name} — {t.platformOrgs.platformAdmin}</title></svelte:head>

<div class="page-wrap">
  <a href="/app/platform/users" class="back">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
    {t.platformExtra.allUsers}
  </a>

  <div class="head">
    <div class="avatar">{(u.first_name?.[0] ?? '') + (u.last_name?.[0] ?? '')}</div>
    <div>
      <h1>{u.first_name} {u.last_name}</h1>
      <a href="mailto:{u.email}" class="email">{u.email}</a>
    </div>
    <div class="head-tags">
      <span class="tag tag-{isClient ? 'client' : 'business'}">{isClient ? t.platformExtra.clientAccount : t.platformExtra.businessAccount}</span>
      {#if u.is_platform_admin}<span class="tag tag-admin">{t.platformOrgs.platformAdmin}</span>{/if}
    </div>
  </div>

  {#if form?.error}<div class="alert-err">{form.error}</div>{/if}

  <div class="grid">
    <section class="card">
      <h2>{t.platformExtra.account}</h2>
      <div class="kv"><span>{t.platformExtra.type}</span><b>{isClient ? t.platformExtra.typeClient : t.platformExtra.typeOrganization}</b></div>
      <div class="kv"><span>{t.platformOrgs.platformAdmin}</span><b>{u.is_platform_admin ? t.platformExtra.yes : t.platformExtra.no}</b></div>
      <div class="kv"><span>{t.platformExtra.reservationsMade}</span><b>{data.reservationCount}</b></div>
      <div class="kv"><span>{t.platformExtra.joined}</span><b>{fmtDate(u.created_at)}</b></div>
      {#if isClient && data.clientOrg}
        <div class="kv"><span>{t.platformExtra.belongsTo}</span><b><a href="/app/platform/orgs/{data.clientOrg.id}" class="link">{data.clientOrg.name}</a></b></div>
      {/if}

      <div class="admin-row">
        {#if u.is_platform_admin}
          <form method="POST" action="?/revokePlatformAdmin" use:enhance>
            <button type="submit" class="btn-outline">{t.platformExtra.revokePlatformAdmin}</button>
          </form>
        {:else}
          <form method="POST" action="?/grantPlatformAdmin" use:enhance>
            <button type="submit" class="btn-outline">{t.platformExtra.makePlatformAdmin}</button>
          </form>
        {/if}
      </div>
    </section>

    <section class="card">
      <h2>{t.platformOrgs.organizations} <span class="muted">({data.memberships.length})</span></h2>
      {#if data.memberships.length === 0}
        <p class="empty">{isClient ? t.platformExtra.clientNotMember : t.platformExtra.notMemberOfAny}</p>
      {:else}
        <ul class="org-list">
          {#each data.memberships as m}
            <li>
              <a href="/app/platform/orgs/{m.org_id}" class="org-name">{m.name}</a>
              <span class="org-meta">
                <span class="role role-{m.role}">{m.role}</span>
                <span class="plan-badge plan-{m.plan ?? 'free'}">{m.plan ?? 'free'}</span>
                <span class="muted">{m.slug}</span>
              </span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  </div>
</div>

<style>
  .page-wrap { padding: 2rem; max-width: 900px; }
  .back { display: inline-flex; align-items: center; gap: 5px; font-size: 13px; font-weight: 600; color: var(--text-muted); text-decoration: none; margin-bottom: 14px; }
  .back:hover { color: var(--accent); }

  .head { display: flex; align-items: center; gap: 14px; margin-bottom: 18px; }
  .avatar { width: 52px; height: 52px; border-radius: 50%; background: var(--accent); color: #fff; font-weight: 800; font-size: 18px; display: flex; align-items: center; justify-content: center; text-transform: uppercase; flex-shrink: 0; }
  .head h1 { font-size: 1.4rem; margin: 0; }
  .email { font-size: 13px; color: var(--text-muted); text-decoration: none; }
  .email:hover { color: var(--accent); }
  .head-tags { margin-left: auto; display: flex; gap: 6px; flex-wrap: wrap; }
  .tag { font-size: 11px; font-weight: 700; padding: 3px 10px; border-radius: 99px; text-transform: uppercase; letter-spacing: .03em; }
  .tag-business { background: var(--accent-dim); color: var(--accent); }
  .tag-client { background: #e0e7ff; color: #3730a3; }
  .tag-admin { background: #fef3c7; color: #92400e; }

  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  @media (max-width: 740px) { .grid { grid-template-columns: 1fr; } }

  .card { background: var(--bg-panel); border: 1px solid var(--border); border-radius: 14px; padding: 18px 20px; }
  .card h2 { font-size: 14px; font-weight: 700; margin: 0 0 12px; }
  .muted { color: var(--text-muted); font-weight: 400; }

  .kv { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 6px 0; font-size: 13px; border-bottom: 1px solid var(--border-subtle, var(--border)); }
  .kv:last-of-type { border-bottom: none; }
  .kv span { color: var(--text-muted); }
  .link { color: var(--accent); text-decoration: none; }
  .link:hover { text-decoration: underline; }

  .admin-row { margin-top: 14px; }
  .empty { font-size: 13px; color: var(--text-subtle); }

  .org-list { list-style: none; display: flex; flex-direction: column; gap: 10px; }
  .org-list li { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding-bottom: 9px; border-bottom: 1px solid var(--border-subtle, var(--border)); }
  .org-list li:last-child { border-bottom: none; padding-bottom: 0; }
  .org-name { font-size: 13px; font-weight: 600; color: var(--text-base); text-decoration: none; }
  .org-name:hover { color: var(--accent); }
  .org-meta { display: flex; align-items: center; gap: 7px; }
  .role { font-size: 10.5px; font-weight: 700; text-transform: uppercase; }
  .role-owner { color: #b45309; }
  .role-admin { color: var(--accent); }
  .role-member { color: var(--text-muted); }
  .plan-badge { font-size: 10px; font-weight: 700; padding: 1px 7px; border-radius: 99px; text-transform: uppercase; }
  .plan-free { background: var(--bg-panel2); color: var(--text-muted); }
  .plan-starter { background: var(--accent-dim); color: var(--accent); }
  .plan-professional { background: #fef3c7; color: #92400e; }
  .plan-enterprise { background: var(--accent-action-dim); color: var(--accent-action); }

  .btn-outline { padding: 8px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; background: var(--bg-panel); color: var(--text-base); border: 1px solid var(--border); cursor: pointer; font-family: inherit; }
  .btn-outline:hover { border-color: var(--accent); color: var(--accent); }
  .alert-err { padding: 10px 14px; border-radius: 9px; font-size: 13px; margin-bottom: 16px; color: #dc2626; background: color-mix(in srgb, #ef4444 10%, transparent); border: 1px solid color-mix(in srgb, #ef4444 26%, transparent); }
</style>
