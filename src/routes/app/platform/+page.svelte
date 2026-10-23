<script lang="ts">
  import { t } from '$lib/i18n.svelte';
  import type { PageData } from './$types';
  let { data }: { data: PageData } = $props();
  const s = $derived(data.stats);
  const h = $derived(data.health);

  /** Share of attempts that succeeded, or null when nothing was attempted —
   *  "0%" and "nothing happened" must not look the same. */
  function rate(ok: number, bad: number): number | null {
    const total = ok + bad;
    return total === 0 ? null : Math.round((ok / total) * 1000) / 10;
  }
  const emailRate = $derived(rate(h.emailSent, h.emailFailed));
  const webhookRate = $derived(rate(h.webhooksDelivered, h.webhooksFailed));
  const missingCritical = $derived(data.config.filter((c) => c.critical && !c.set));
</script>

<div class="wrap page">
  <section class="section section--lead">
    <div class="section-head">
      <p class="eyebrow">{t.platformOrgs.platformAdmin}</p>
      <h1>{t.platformExtra.overviewTitle}</h1>
      <p><a href="/app/platform/audit">{t.platformExtra.auditLink}</a></p>
    </div>

    <div class="stat-strip">
      <div class="stat">
        <span class="kpi-label">{t.platformOrgs.organizations}</span>
        <span class="kpi-value">{s.totalOrgs}</span>
        <span class="kpi-sub">{s.suspendedOrgs} {t.platformExtra.suspendedOrgs} / {s.closedOrgs} {t.platformExtra.closedOrgs}</span>
      </div>
      <div class="stat">
        <span class="kpi-label">{t.platformExtra.users}</span>
        <span class="kpi-value">{s.totalUsers}</span>
        <span class="kpi-sub">{s.platformAdmins} {t.platformExtra.platformAdmins}</span>
      </div>
      <div class="stat">
        <span class="kpi-label">{t.platformExtra.paidSubscriptions}</span>
        <span class="kpi-value">{s.activeSubscriptions}</span>
        <span class="kpi-sub">{t.platformExtra.manualPlans(s.manualPlans)} · {s.partners} {t.platformExtra.partners}</span>
      </div>
      <div class="stat">
        <span class="kpi-label">{t.platformExtra.totalReservations}</span>
        <span class="kpi-value">{s.totalReservations}</span>
        <span class="kpi-sub">+{s.reservations30d} / {t.platformExtra.last30d}</span>
      </div>
    </div>
  </section>

  <!-- System health -->
  <section class="section">
    <div class="section-head">
      <p class="eyebrow">{t.platformExtra.systemHealth}</p>
      <h2>{t.platformExtra.healthSub}</h2>
    </div>

    <div class="health-grid">
      <div class="health-card">
        <span class="kpi-label">{t.platformExtra.emailDelivery}</span>
        {#if emailRate === null}
          <span class="health-value is-idle">{t.platformExtra.noneIn24h}</span>
        {:else}
          <span class="health-value" class:bad={h.emailFailed > 0}>{emailRate}%</span>
          <span class="kpi-sub">{h.emailFailed > 0 ? t.platformExtra.failedCount(h.emailFailed) : t.platformExtra.allDelivered}</span>
        {/if}
      </div>

      <div class="health-card">
        <span class="kpi-label">{t.platformExtra.webhookDelivery}</span>
        {#if webhookRate === null}
          <span class="health-value is-idle">{t.platformExtra.noneIn24h}</span>
        {:else}
          <span class="health-value" class:bad={h.webhooksFailed > 0}>{webhookRate}%</span>
          <span class="kpi-sub">{h.webhooksFailed > 0 ? t.platformExtra.failedCount(h.webhooksFailed) : t.platformExtra.allDelivered}</span>
        {/if}
      </div>

      <div class="health-card">
        <span class="kpi-label">{t.platformExtra.slaTarget}</span>
        <span class="health-value">{data.slaTarget}</span>
        <span class="kpi-sub">{t.platformExtra.slaMeasuredExternally}</span>
      </div>

      <div class="health-card">
        <span class="kpi-label">{t.platformExtra.schema}</span>
        <span class="health-value">{data.migrations.applied}</span>
        <span class="kpi-sub">{data.migrations.latest ?? '-'}</span>
      </div>
    </div>
    {#if data.emailHealth.down}
      <p class="alert-warning config-warning" role="alert">{t.platformExtra.emailOutage} {data.emailHealth.lastError ?? 'BREVO_API_KEY'}</p>
    {/if}
  </section>

  <!-- Configuration -->
  <section class="section">
    <div class="section-head">
      <p class="eyebrow">{t.platformExtra.configuration}</p>
      <h2>{t.platformExtra.configSub}</h2>
    </div>
    <div class="config-grid">
      {#each data.config as c}
        <div class="config-item" class:critical-missing={c.critical && !c.set}>
          <span class="config-key">{c.key}</span>
          <span class="config-state" class:is-set={c.set}>{c.set ? t.platformExtra.configSet : t.platformExtra.configMissing}</span>
        </div>
      {/each}
    </div>
    {#if missingCritical.length > 0}
      <p class="alert-warning config-warning">{missingCritical.map((c) => c.key).join(', ')}</p>
    {/if}
  </section>

  <!-- Growth -->
  <section class="section">
    <div class="section-head">
      <p class="eyebrow">{t.platformExtra.growth}</p>
      <h2>{t.platformExtra.growthSub}</h2>
    </div>
    <div class="row-list" role="table">
      <div role="row" class="row-item growth-row row-head">
        <span role="columnheader"></span>
        <span role="columnheader" class="num">{t.platformExtra.last7d}</span>
        <span role="columnheader" class="num">{t.platformExtra.last30d}</span>
      </div>
      <div role="row" class="row-item growth-row">
        <span role="cell">{t.platformOrgs.organizations}</span>
        <span role="cell" class="num">+{s.orgs7d}</span>
        <span role="cell" class="num">+{s.orgs30d}</span>
      </div>
      <div role="row" class="row-item growth-row">
        <span role="cell">{t.platformExtra.users}</span>
        <span role="cell" class="num">+{s.users7d}</span>
        <span role="cell" class="num">+{s.users30d}</span>
      </div>
      <div role="row" class="row-item growth-row">
        <span role="cell">{t.platformExtra.totalReservations}</span>
        <span role="cell" class="num">+{s.reservations7d}</span>
        <span role="cell" class="num">+{s.reservations30d}</span>
      </div>
    </div>
  </section>

  <!-- Plans and reservation pipeline -->
  <section class="section">
    <div class="split">
      <div>
        <div class="section-head"><p class="eyebrow">{t.platformExtra.planDistribution}</p></div>
        <div class="row-list">
          {#each data.plans as p}
            <div class="row-item mini-row">
              <span class="badge badge-{p.plan}">{p.plan}</span>
              <span class="num">{p.count}</span>
            </div>
          {/each}
        </div>
      </div>
      <div>
        <div class="section-head"><p class="eyebrow">{t.platformExtra.reservationPipeline}</p></div>
        <div class="row-list">
          {#each data.reservationStatus as r}
            <div class="row-item mini-row">
              <span class="muted">{r.status}</span>
              <span class="num">{r.count}</span>
            </div>
          {/each}
        </div>
      </div>
    </div>
  </section>

  <!-- Platform administrators -->
  <section class="section">
    <div class="section-head">
      <p class="eyebrow">{t.platformExtra.platformAdmins}</p>
      <h2>{t.platformExtra.platformAdminsSub}</h2>
    </div>
    <div class="row-list" role="table">
      {#each data.admins as a}
        <div role="row" class="row-item admin-row">
          <span role="cell"><strong>{a.first_name} {a.last_name}</strong></span>
          <span role="cell" class="muted">{a.email}</span>
          <span role="cell" class="muted num">{new Date(a.created_at).toLocaleDateString()}</span>
        </div>
      {/each}
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
  .kpi-sub { display: block; font-size: 10px; color: var(--text-muted); margin-top: 7px; line-height: 1.5; }

  /* Health */
  .health-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0; }
  .health-card { padding: 0 20px; border-left: 1px solid var(--border-subtle); }
  .health-card:first-child { padding-left: 0; border-left: none; }
  .health-value { display: block; font-size: 24px; font-weight: 650; letter-spacing: -.04em; line-height: 1; color: var(--success); }
  .health-value.bad { color: var(--warning); }
  .health-value.is-idle { color: var(--text-subtle); font-size: 15px; font-weight: 600; }

  /* Configuration */
  .config-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 0 18px; }
  .config-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--border-subtle); }
  .config-key { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; color: var(--text-muted); }
  .config-state { font-size: 10px; font-weight: 650; text-transform: uppercase; letter-spacing: .08em; color: var(--text-subtle); }
  .config-state.is-set { color: var(--success); }
  .config-item.critical-missing .config-state { color: var(--danger); }
  .config-warning { margin-top: 14px; }

  /* Small tables */
  .growth-row { display: grid; grid-template-columns: minmax(0,2fr) minmax(0,1fr) minmax(0,1fr); gap: 14px; align-items: center; font-size: 13px; }
  .admin-row { display: grid; grid-template-columns: minmax(0,1.2fr) minmax(0,1.6fr) minmax(0,.8fr); gap: 14px; align-items: center; font-size: 13px; }
  .mini-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; font-size: 13px; }
  .num { font-variant-numeric: tabular-nums; text-align: right; }
  .split { display: grid; grid-template-columns: 1fr 1fr; gap: 36px; }
  @media (max-width: 760px) {
    .split { grid-template-columns: 1fr; gap: 24px; }
    .health-card { padding-left: 0; border-left: none; }
  }
  @media (max-width: 760px) {
    .stat-strip { grid-template-columns: repeat(2, 1fr); row-gap: 20px; }
    .stat:nth-child(odd) { padding-left: 0; border-left: none; }
  }

  /* ── Hairline rows ── */
  .org-rows .row-item { display: grid; grid-template-columns: minmax(0,2fr) minmax(0,1.4fr) minmax(0,.8fr) minmax(0,1fr); gap: 14px; align-items: center; font-size: 13px; }
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
