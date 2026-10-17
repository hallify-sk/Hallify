<script lang="ts">
  import { t } from '$lib/i18n.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
  const s = $derived(data.stats);
</script>

<div class="wrap page">
  <section class="section section--lead">
    <div class="section-head">
      <p class="eyebrow">{t.platformOrgs.platformAdmin}</p>
      <h1>{t.platformExtra.overviewTitle}</h1>
    </div>

    <div class="stat-strip">
      <div class="stat">
        <span class="kpi-label">{t.platformOrgs.organizations}</span>
        <span class="kpi-value">{s.total_orgs}</span>
      </div>
      <div class="stat">
        <span class="kpi-label">{t.platformExtra.users}</span>
        <span class="kpi-value">{s.total_users}</span>
      </div>
      <div class="stat">
        <span class="kpi-label">{t.platformExtra.paidSubscriptions}</span>
        <span class="kpi-value">{s.active_subscriptions}</span>
      </div>
      <div class="stat">
        <span class="kpi-label">{t.platformExtra.totalReservations}</span>
        <span class="kpi-value">{s.total_reservations}</span>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="section-head">
      <p class="eyebrow">{t.platformOrgs.organizations}</p>
      <h2>{t.platformExtra.recentOrganizations}</h2>
    </div>

    <div class="row-list org-rows" role="table">
      <div role="row" class="row-item row-head">
        <span role="columnheader">{t.platformOrgs.colName}</span>
        <span role="columnheader">{t.platformOrgs.colSlug}</span>
        <span role="columnheader">{t.platformOrgs.colPlan}</span>
        <span role="columnheader">{t.platformOrgs.colCreated}</span>
      </div>
      {#each data.recentOrgs as org}
        <div role="row" class="row-item">
          <span role="cell" class="cell-name"><a href="/app/platform/orgs/{org.id}">{org.name}</a></span>
          <span role="cell" class="muted">{org.slug}</span>
          <span role="cell"><span class="badge badge-{org.plan ?? 'free'}">{org.plan ?? 'free'}</span></span>
          <span role="cell" class="muted">{new Date(org.created_at).toLocaleDateString()}</span>
        </div>
      {/each}
    </div>
  </section>
</div>

<style>
  .page { padding-block: 24px; }
  h1 { font-size: var(--display-size); font-weight: 550; letter-spacing: -.055em; line-height: 1.08; margin: 0; }

  /* ── Stat strip: numbers on the page, no boxes ── */
  .stat-strip { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0; }
  .stat { padding: 0 20px; border-left: 1px solid var(--border-subtle); }
  .stat:first-child { padding-left: 0; border-left: none; }
  .kpi-label { display: block; font-size: 10px; font-weight: 650; text-transform: uppercase; letter-spacing: .13em; color: var(--text-muted); margin-bottom: 8px; }
  .kpi-value { font-size: 28px; font-weight: 650; letter-spacing: -.045em; line-height: 1; color: var(--text-base); }
  @media (max-width: 760px) {
    .stat-strip { grid-template-columns: repeat(2, 1fr); row-gap: 20px; }
    .stat:nth-child(odd) { padding-left: 0; border-left: none; }
  }

  /* ── Hairline rows ── */
  .org-rows .row-item { display: grid; grid-template-columns: 2fr 1.4fr .8fr 1fr; gap: 14px; align-items: center; font-size: 13px; }
  .row-head { font-size: 10px; font-weight: 650; color: var(--text-muted); text-transform: uppercase; letter-spacing: .13em; border-bottom-color: var(--border); padding-bottom: 9px; }
  .cell-name a { color: var(--accent-ink); text-decoration: none; font-weight: 600; }
  .muted { color: var(--text-muted); }
  .badge { display: inline-block; padding: 2px 9px; border-radius: 3px; font-size: .7rem; font-weight: 650; text-transform: uppercase; letter-spacing: .03em; }
  .badge-free { background: var(--bg-panel2); color: var(--text-muted); }
  .badge-starter { background: var(--accent-dim); color: var(--accent-ink); }
  .badge-professional { background: var(--warning-dim); color: var(--warning); }
  .badge-enterprise { background: var(--accent-action-dim); color: var(--accent-ink); }

  @media (max-width: 680px) {
    .org-rows .row-item { grid-template-columns: 1fr 1fr; }
  }
</style>
