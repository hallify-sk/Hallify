<script lang="ts">
  import { pageTitle } from '$lib/page-title';
  import { enhance } from '$app/forms';
  import { planName } from '$lib/plans';
  import { t, getLocale } from '$lib/i18n.svelte';
  import { confirmFirst } from '$lib/forms';
  import { formatDate } from '$lib/format';
  import { orgRoleLabel } from '$lib/role-label';
  import { planTone } from '$lib/platform-ui';
  import type { PageData, ActionData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();

  const u = $derived(data.user);
  const isClient = $derived(u.account_type === 'client');
  const fullName = $derived(`${u.first_name ?? ''} ${u.last_name ?? ''}`.trim() || u.email);
  const isSelf = $derived(u.id === data.currentUserId);
</script>

<svelte:head><title>{pageTitle(fullName, t.platformOrgs.platformAdmin)}</title></svelte:head>

<div class="wrap page">
  <a href="/app/platform/users" class="back">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
    {t.platformExtra.allUsers}
  </a>

  <header class="page-header">
    <div class="identity">
      <span class="avatar" aria-hidden="true">{(u.first_name?.[0] ?? '') + (u.last_name?.[0] ?? '')}</span>
      <div class="cell-main">
        <p class="eyebrow">{t.platformOrgs.platformAdmin}</p>
        <div class="page-header-left">
          <h1 class="page-title">{fullName}</h1>
          <span class="pf-tag" data-tone={isClient ? undefined : 'accent'}>{isClient ? t.platformExtra.clientAccount : t.platformExtra.businessAccount}</span>
          {#if u.is_platform_admin}<span class="pf-tag" data-tone="warning">{t.platformOrgs.platformAdmin}</span>{/if}
        </div>
        <a href="mailto:{u.email}" class="email">{u.email}</a>
      </div>
    </div>
  </header>

  {#if form?.error}<div class="alert-error" role="alert">{form.error}</div>{/if}
  {#if form && 'verified' in form && form.verified}<div class="alert-success" role="status">{t.identity.markedVerified}</div>{/if}

  <section class="section section--lead">
    <div class="section-head"><h2>{t.platformExtra.account}</h2></div>

    <div class="row-list">
      <div class="row-item kv"><span class="k">{t.platformExtra.type}</span><span class="v">{isClient ? t.platformExtra.typeClient : t.platformExtra.typeOrganization}</span></div>
      <div class="row-item kv"><span class="k">{t.platformOrgs.platformAdmin}</span><span class="v">{u.is_platform_admin ? t.platformExtra.yes : t.platformExtra.no}</span></div>
      <div class="row-item kv">
        <span class="k">{t.identity.emailStatus}</span>
        <span class="v">
          {#if u.email_verified_at}<span class="pf-tag" data-tone="success">{t.identity.emailVerifiedYes}</span>{:else}<span class="pf-tag" data-tone="warning">{t.identity.emailNotVerified}</span>{/if}
        </span>
      </div>
      <div class="row-item kv"><span class="k">{t.platformExtra.reservationsMade}</span><span class="v num">{data.reservationCount}</span></div>
      <div class="row-item kv"><span class="k">{t.platformExtra.joined}</span><span class="v">{formatDate(u.created_at, getLocale())}</span></div>
      {#if isClient && data.clientOrg}
        <div class="row-item kv"><span class="k">{t.platformExtra.belongsTo}</span><span class="v"><a href="/app/platform/orgs/{data.clientOrg.id}">{data.clientOrg.name}</a></span></div>
      {/if}
    </div>

    <div class="actions">
      {#if !u.email_verified_at}
        <form method="POST" action="?/markVerified" use:enhance>
          <button type="submit" class="btn-outline btn-sm">{t.identity.markVerified}</button>
        </form>
      {/if}
      {#if u.is_platform_admin}
        <!-- The server refuses to revoke your own rights; no button that can only fail. -->
        {#if !isSelf}
          <form method="POST" action="?/revokePlatformAdmin" use:enhance={confirmFirst(() => t.platformMisc.confirmRevokeAdmin(u.email))}>
            <button type="submit" class="btn-danger btn-sm">{t.platformExtra.revokePlatformAdmin}</button>
          </form>
        {/if}
      {:else}
        <form method="POST" action="?/grantPlatformAdmin" use:enhance={confirmFirst(() => t.platformMisc.confirmGrantAdmin(u.email))}>
          <button type="submit" class="btn-outline btn-sm">{t.platformExtra.makePlatformAdmin}</button>
        </form>
      {/if}
    </div>
  </section>

  <section class="section">
    <div class="section-head">
      <h2>{t.platformOrgs.organizations} <span class="total-badge">{data.memberships.length}</span></h2>
    </div>

    {#if data.memberships.length === 0}
      <div class="card--inset state-block">
        <span class="icon-tile" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M10 21v-6h4v6"/></svg>
        </span>
        <h3>{isClient ? t.platformExtra.clientNotMember : t.platformExtra.notMemberOfAny}</h3>
      </div>
    {:else}
      <div class="row-list pf-table" role="table" aria-label={t.platformOrgs.organizations}>
        <div role="row" class="row-item row-head mem-row">
          <span role="columnheader">{t.platformOrgs.colName}</span>
          <span role="columnheader">{t.platformMisc.colRole}</span>
          <span role="columnheader">{t.platformOrgs.colPlan}</span>
        </div>
        {#each data.memberships as m (m.org_id)}
          <a role="row" href="/app/platform/orgs/{m.org_id}" class="row-item row-item--bleed mem-row">
            <span role="cell" class="cell-main">
              <span class="cell-title">{m.name}</span>
              <span class="cell-sub">{m.slug}</span>
            </span>
            <span role="cell" class="muted">{orgRoleLabel(m.role, t)}</span>
            <span role="cell"><span class="pf-tag" data-tone={planTone(m.plan)}>{planName(m.plan)}</span></span>
          </a>
        {/each}
      </div>
    {/if}
  </section>
</div>

<style>
  .identity { display: flex; align-items: center; gap: 16px; min-width: 0; }
  .avatar {
    width: 52px; height: 52px; border-radius: 50%; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    background: var(--accent-dim); color: var(--accent-ink);
    font-weight: 650; font-size: 18px; text-transform: uppercase;
  }
  .email { display: inline-block; margin-top: 6px; font-size: 13px; color: var(--text-muted); text-decoration: none; overflow-wrap: anywhere; }
  .email:hover { color: var(--accent-ink); }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 16px; }

  .mem-row { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) 130px; gap: 14px; align-items: center; color: inherit; text-decoration: none; }
  @container (max-width: 520px) {
    .mem-row.row-head { display: none; }
    .mem-row { grid-template-columns: minmax(0, 1fr) auto; row-gap: 4px; }
    .mem-row > :nth-child(2) { grid-row: 2; }
    .mem-row > :nth-child(3) { grid-column: 2; grid-row: 1 / span 2; }
  }
  @media (max-width: 520px) { .avatar { display: none; } }
</style>
