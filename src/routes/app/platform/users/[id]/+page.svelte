<script lang="ts">
  import { pageTitle } from '$lib/page-title';
  import { enhance } from '$app/forms';
  import { planName } from '$lib/plans';
  import { t, getLocale } from '$lib/i18n.svelte';
  import { formatDate } from '$lib/format';
  import { orgRoleLabel } from '$lib/role-label';
  import type { PageData, ActionData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();

  const u = $derived(data.user);
  const isClient = $derived(u.account_type === 'client');

  function fmtDate(d: string) {
    return formatDate(d, getLocale());
  }
</script>

<svelte:head><title>{pageTitle(`${u.first_name} ${u.last_name}`, t.platformOrgs.platformAdmin)}</title></svelte:head>

<div class="wrap page">
  <a href="/app/platform/users" class="back">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
    {t.platformExtra.allUsers}
  </a>

  <section class="section section--lead">
    <div class="section-head section-head--row">
      <div class="head-text">
        <p class="eyebrow">{t.platformOrgs.platformAdmin}</p>
        <div class="identity">
          <div class="avatar">{(u.first_name?.[0] ?? '') + (u.last_name?.[0] ?? '')}</div>
          <div>
            <h1>{u.first_name} {u.last_name}</h1>
            <a href="mailto:{u.email}" class="email">{u.email}</a>
          </div>
        </div>
      </div>
      <div class="head-tags">
        <span class="tag tag-{isClient ? 'client' : 'business'}">{isClient ? t.platformExtra.clientAccount : t.platformExtra.businessAccount}</span>
        {#if u.is_platform_admin}<span class="tag tag-admin">{t.platformOrgs.platformAdmin}</span>{/if}
      </div>
    </div>

    {#if form?.error}<div class="alert-err">{form.error}</div>{/if}
  </section>

  <section class="section">
    <div class="section-head">
      <p class="eyebrow">{u.first_name} {u.last_name}</p>
      <h2>{t.platformExtra.account}</h2>
    </div>

    <div class="row-list">
      <div class="row-item kv"><span>{t.platformExtra.type}</span><b>{isClient ? t.platformExtra.typeClient : t.platformExtra.typeOrganization}</b></div>
      <div class="row-item kv"><span>{t.platformOrgs.platformAdmin}</span><b>{u.is_platform_admin ? t.platformExtra.yes : t.platformExtra.no}</b></div>
      <div class="row-item kv">
        <span>{t.identity.emailStatus}</span>
        <b class:unverified={!u.email_verified_at}>{u.email_verified_at ? t.identity.emailVerifiedYes : t.identity.emailNotVerified}</b>
      </div>
      <div class="row-item kv"><span>{t.platformExtra.reservationsMade}</span><b>{data.reservationCount}</b></div>
      <div class="row-item kv"><span>{t.platformExtra.joined}</span><b>{fmtDate(u.created_at)}</b></div>
      {#if isClient && data.clientOrg}
        <div class="row-item kv"><span>{t.platformExtra.belongsTo}</span><b><a href="/app/platform/orgs/{data.clientOrg.id}" class="link">{data.clientOrg.name}</a></b></div>
      {/if}
    </div>

    {#if form && 'verified' in form && form.verified}<div class="alert-ok" role="status">{t.identity.markedVerified}</div>{/if}
    <div class="admin-row">
      {#if !u.email_verified_at}
        <form method="POST" action="?/markVerified" use:enhance>
          <button type="submit" class="btn-outline">{t.identity.markVerified}</button>
        </form>
      {/if}
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

  <section class="section">
    <div class="section-head">
      <p class="eyebrow">{u.first_name} {u.last_name}</p>
      <h2>{t.platformOrgs.organizations} <span class="muted">({data.memberships.length})</span></h2>
    </div>

    {#if data.memberships.length === 0}
      <div class="card--inset empty-state">
        <div class="icon-tile">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M10 21v-6h4v6"/></svg>
        </div>
        <p class="empty">{isClient ? t.platformExtra.clientNotMember : t.platformExtra.notMemberOfAny}</p>
      </div>
    {:else}
      <ul class="row-list org-list">
        {#each data.memberships as m}
          <li class="row-item">
            <a href="/app/platform/orgs/{m.org_id}" class="org-name">{m.name}</a>
            <span class="org-meta">
              <span class="role role-{m.role}">{orgRoleLabel(m.role, t)}</span>
              <span class="plan-badge plan-{m.plan ?? 'free'}">{planName(m.plan)}</span>
              <span class="muted">{m.slug}</span>
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</div>

<style>
  .unverified { color: var(--warning); }
  .alert-ok { margin: 12px 0 0; padding: 9px 12px; border-radius: var(--radius-sm); font-size: 13px; background: var(--success-dim); color: var(--success); }

  .page { padding-block: 24px; max-width: 900px; }
  .back { display: inline-flex; align-items: center; gap: 5px; font-size: 13px; font-weight: 600; color: var(--text-muted); text-decoration: none; margin-bottom: 14px; }
  .back:hover { color: var(--accent-ink); }

  .head-text .eyebrow { display: block; margin-bottom: 12px; }
  .identity { display: flex; align-items: center; gap: 14px; }
  .avatar { width: 52px; height: 52px; border-radius: 50%; background: var(--accent); color: var(--accent-contrast); font-weight: 650; font-size: 18px; display: flex; align-items: center; justify-content: center; text-transform: uppercase; flex-shrink: 0; }
  h1 { font-size: var(--display-size); font-weight: 550; letter-spacing: -.055em; line-height: 1.08; margin: 0; }
  .email { font-size: 13px; color: var(--text-muted); text-decoration: none; }
  .email:hover { color: var(--accent-ink); }
  .head-tags { display: flex; gap: 6px; flex-wrap: wrap; }
  .tag { font-size: 11px; font-weight: 650; padding: 3px 10px; border-radius: 3px; text-transform: uppercase; letter-spacing: .03em; }
  .tag-business { background: var(--accent-dim); color: var(--accent-ink); }
  .tag-client { background: var(--bg-panel2); color: var(--text-muted); }
  .tag-admin { background: var(--warning-dim); color: var(--warning); }

  .muted { color: var(--text-muted); font-weight: 400; }

  /* ── Hairline key/value rows ── */
  .kv { justify-content: space-between; font-size: 13px; padding: 7px 0; }
  .kv > span { color: var(--text-muted); }
  .link { color: var(--accent-ink); text-decoration: none; }
  .link:hover { text-decoration: underline; }

  .admin-row { margin-top: 14px; }

  .empty-state { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; }
  .empty { font-size: 13px; color: var(--text-subtle); margin: 0; }

  .org-list { list-style: none; margin: 0; padding: 0; }
  .org-list .row-item { justify-content: space-between; }
  .org-name { font-size: 13px; font-weight: 600; color: var(--text-base); text-decoration: none; }
  .org-name:hover { color: var(--accent-ink); }
  .org-meta { display: flex; align-items: center; gap: 7px; }
  .role { font-size: 10.5px; font-weight: 650; text-transform: uppercase; letter-spacing: .03em; }
  .role-owner { color: var(--warning); }
  .role-admin { color: var(--accent-ink); }
  .role-member { color: var(--text-muted); }
  .plan-badge { font-size: 10px; font-weight: 650; padding: 1px 7px; border-radius: 3px; text-transform: uppercase; letter-spacing: .03em; }
  .plan-free { background: var(--bg-panel2); color: var(--text-muted); }
  .plan-starter { background: var(--accent-dim); color: var(--accent-ink); }
  .plan-professional { background: var(--warning-dim); color: var(--warning); }
  .plan-enterprise { background: var(--accent-action-dim); color: var(--accent-ink); }

  .btn-outline { padding: 10px 20px; border-radius: var(--radius-sm); font-size: 13px; font-weight: 600; background: var(--bg-panel); color: var(--text-base); border: 1px solid var(--border); cursor: pointer; font-family: inherit; transition: background .15s, border-color .15s; }
  .btn-outline:hover { background: var(--bg-hover); border-color: var(--text-subtle); }
  .alert-err { padding: 10px 14px; border-radius: var(--radius-sm); font-size: 13px; margin-top: 16px; color: var(--danger); background: var(--danger-dim); border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent); }
</style>
