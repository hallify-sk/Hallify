<script lang="ts">
  import { pageTitle } from '$lib/page-title';
  import { planName } from '$lib/plans';
  import { t, getLocale } from '$lib/i18n.svelte';
  import { formatDate, formatNumber } from '$lib/format';
  import { statusLabel } from '$lib/reservationStatus';
  import { planRank, planTone } from '$lib/platform-ui';
  import StatusBadge from '$lib/components/StatusBadge.svelte';
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
  const pct = (r: number) => `${formatNumber(r, getLocale(), r % 1 === 0 ? 0 : 1)} %`;
  /** Below 90% is an outage in progress, not a blip. */
  const rateTone = (r: number, failed: number) => (failed === 0 ? 'ok' : r < 90 ? 'bad' : 'warn');

  const plans = $derived([...data.plans].sort((a, b) => planRank(a.plan) - planRank(b.plan)));
  const pipeline = $derived([...data.reservationStatus].sort((a, b) => b.count - a.count));

  const attention = $derived([
    { label: t.floorplanService.queueTitle, n: data.queues.floorplan, href: '/app/platform/floorplan-requests' },
    { label: t.setupService.queueTitle, n: data.queues.setup, href: '/app/platform/floorplan-requests' },
    { label: t.platformExtra.suspendedOrgsLabel, n: s.suspendedOrgs, href: '/app/platform/orgs?status=suspended' },
    { label: t.platformExtra.failedEmails24h, n: h.emailFailed, href: '/app/platform/email' },
  ]);
</script>

<svelte:head><title>{pageTitle(t.platformExtra.overviewTitle)}</title></svelte:head>

<div class="wrap page">
  <header class="page-header">
    <div>
      <p class="eyebrow">{t.platformOrgs.platformAdmin}</p>
      <h1 class="page-title">{t.platformExtra.overviewTitle}</h1>
    </div>
    <div class="page-actions">
      <a class="btn-outline btn-sm" href="/app/platform/audit">{t.platformExtra.auditLink}</a>
    </div>
  </header>

  <section class="section section--lead">
    <div class="stat-strip">
      <a class="stat" href="/app/platform/orgs">
        <span class="kpi-label">{t.platformOrgs.organizations}</span>
        <span class="kpi-value">{s.totalOrgs}</span>
        <span class="kpi-sub">{t.platformExtra.suspendedCount(s.suspendedOrgs)} · {t.platformExtra.closedCount(s.closedOrgs)}</span>
      </a>
      <a class="stat" href="/app/platform/users">
        <span class="kpi-label">{t.platformExtra.users}</span>
        <span class="kpi-value">{s.totalUsers}</span>
        <span class="kpi-sub">{t.platformExtra.adminsCount(s.platformAdmins)}</span>
      </a>
      <div class="stat">
        <span class="kpi-label">{t.platformExtra.paidSubscriptions}</span>
        <span class="kpi-value">{s.activeSubscriptions}</span>
        <span class="kpi-sub">{t.platformExtra.manualPlans(s.manualPlans)} · {t.platformExtra.partnersCount(s.partners)}</span>
      </div>
      <div class="stat">
        <span class="kpi-label">{t.platformExtra.totalReservations}</span>
        <span class="kpi-value">{s.totalReservations}</span>
        <span class="kpi-sub">+{s.reservations30d} / {t.platformExtra.last30d}</span>
      </div>
    </div>
  </section>

  <!-- What is waiting on the platform team: every number links to its queue. -->
  <section class="section">
    <div class="section-head">
      <p class="eyebrow">{t.platformExtra.needsAttention}</p>
      <h2>{t.platformExtra.needsAttentionSub}</h2>
    </div>
    <div class="attention">
      {#each attention as a}
        <a class="att" class:is-hot={a.n > 0} href={a.href}>
          <span class="kpi-label">{a.label}</span>
          <span class="att-value">{a.n}</span>
          <span class="kpi-sub">{t.platformExtra.openItemsSub(a.n)} →</span>
        </a>
      {/each}
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
          <span class="health-value" data-tone={rateTone(emailRate, h.emailFailed)}>{pct(emailRate)}</span>
          <span class="kpi-sub">{h.emailFailed > 0 ? t.platformExtra.failedCount(h.emailFailed) : t.platformExtra.allDelivered}</span>
        {/if}
      </div>

      <div class="health-card">
        <span class="kpi-label">{t.platformExtra.webhookDelivery}</span>
        {#if webhookRate === null}
          <span class="health-value is-idle">{t.platformExtra.noneIn24h}</span>
        {:else}
          <span class="health-value" data-tone={rateTone(webhookRate, h.webhooksFailed)}>{pct(webhookRate)}</span>
          <span class="kpi-sub">{h.webhooksFailed > 0 ? t.platformExtra.failedCount(h.webhooksFailed) : t.platformExtra.allDelivered}{#if h.webhooksPending > 0}{' '}· {t.platformExtra.pendingCount(h.webhooksPending)}{/if}</span>
        {/if}
      </div>

      <div class="health-card">
        <span class="kpi-label">{t.platformExtra.slaTarget}</span>
        <span class="health-value is-plain">{data.slaTarget}</span>
        <span class="kpi-sub">{t.platformExtra.slaMeasuredExternally}</span>
      </div>

      <div class="health-card">
        <span class="kpi-label">{t.platformExtra.schema}</span>
        <span class="health-value is-plain">{data.migrations.applied}</span>
        <span class="kpi-sub mono">{data.migrations.latest ?? '—'}</span>
      </div>
    </div>
    {#if data.emailHealth.down}
      <p class="alert-error config-warning" role="alert">{t.platformExtra.emailOutage} {data.emailHealth.lastError ?? 'BREVO_API_KEY'}</p>
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
        <div class="config-item">
          <span class="config-key mono">{c.key}</span>
          {#if c.set}
            <StatusBadge status="set" label={t.platformExtra.configSet} />
          {:else if c.critical}
            <span class="pf-tag" data-tone="danger">{t.platformExtra.configMissing}</span>
          {:else}
            <StatusBadge status="unset" label={t.platformExtra.configMissing} />
          {/if}
        </div>
      {/each}
    </div>
    {#if missingCritical.length > 0}
      <p class="alert-warning config-warning">{t.platformExtra.missingCritical} {missingCritical.map((c) => c.key).join(', ')}</p>
    {/if}
  </section>

  <!-- Growth -->
  <section class="section">
    <div class="section-head">
      <p class="eyebrow">{t.platformExtra.growth}</p>
      <h2>{t.platformExtra.growthSub}</h2>
    </div>
    <div class="row-list growth" role="table" aria-label={t.platformExtra.growth}>
      <div role="row" class="row-item row-head growth-row">
        <span role="columnheader"><span class="sr-only">{t.platformExtra.growth}</span></span>
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
          {#each plans as p}
            <div class="row-item mini-row">
              <span class="pf-tag" data-tone={planTone(p.plan)}>{planName(p.plan)}</span>
              <span class="num">{p.count}</span>
            </div>
          {/each}
        </div>
      </div>
      <div>
        <div class="section-head"><p class="eyebrow">{t.platformExtra.reservationPipeline}</p></div>
        <div class="row-list">
          {#each pipeline as r}
            <div class="row-item mini-row">
              <span>{statusLabel(r.status, getLocale())}</span>
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
    <div class="row-list pf-table" role="table" aria-label={t.platformExtra.platformAdmins}>
      {#each data.admins as a (a.id)}
        <a role="row" href="/app/platform/users/{a.id}" class="row-item row-item--bleed admin-row">
          <span role="cell" class="cell-title ellipsis">{a.first_name} {a.last_name}</span>
          <span role="cell" class="muted ellipsis">{a.email}</span>
          <span role="cell" class="muted num nowrap">{formatDate(a.created_at, getLocale())}</span>
        </a>
      {/each}
    </div>
  </section>

  <section class="section">
    <div class="section-head section-head--row">
      <div>
        <p class="eyebrow">{t.platformOrgs.organizations}</p>
        <h2>{t.platformExtra.recentOrganizations}</h2>
      </div>
      <a class="lf-clear" href="/app/platform/orgs">{t.platformOrgs.allOrganizations} →</a>
    </div>

    <div class="row-list pf-table" role="table" aria-label={t.platformExtra.recentOrganizations}>
      <div role="row" class="row-item row-head org-row">
        <span role="columnheader">{t.platformOrgs.colName}</span>
        <span role="columnheader">{t.platformOrgs.colPlan}</span>
        <span role="columnheader" class="num">{t.platformOrgs.colCreated}</span>
      </div>
      {#each data.recentOrgs as org (org.id)}
        <a role="row" href="/app/platform/orgs/{org.id}" class="row-item row-item--bleed org-row">
          <span role="cell" class="cell-main">
            <span class="cell-title">{org.name}</span>
            <span class="cell-sub">{org.slug}</span>
          </span>
          <span role="cell"><span class="pf-tag" data-tone={planTone(org.plan)}>{planName(org.plan)}</span></span>
          <span role="cell" class="muted num nowrap">{formatDate(org.created_at, getLocale())}</span>
        </a>
      {/each}
    </div>
  </section>
</div>

<style>
  /* ── Stat strip: numbers on the page, no boxes ── */
  .stat-strip, .attention { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .stat, .att { padding: 0 20px; border-left: 1px solid var(--border-subtle); color: inherit; text-decoration: none; min-width: 0; }
  .stat:first-child, .att:first-child { padding-left: 0; border-left: none; }
  a.stat:hover .kpi-value, .att:hover .att-value { color: var(--accent-ink); }
  .kpi-label { display: block; font-size: var(--meta-size); font-weight: 650; text-transform: uppercase; letter-spacing: .1em; color: var(--text-muted); margin-bottom: 8px; }
  .kpi-value { font-size: 28px; font-weight: 650; letter-spacing: -.045em; line-height: 1; color: var(--text-base); font-variant-numeric: tabular-nums; }
  .kpi-sub { display: block; font-size: 11px; color: var(--text-muted); margin-top: 7px; line-height: 1.5; }

  .att-value { display: block; font-size: 24px; font-weight: 650; letter-spacing: -.04em; line-height: 1; color: var(--text-subtle); font-variant-numeric: tabular-nums; }
  .att.is-hot .att-value { color: var(--warning); }
  .att:hover { text-decoration: none; }

  /* Health */
  .health-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
  .health-card { padding: 0 20px; border-left: 1px solid var(--border-subtle); min-width: 0; }
  .health-card:first-child { padding-left: 0; border-left: none; }
  .health-value { display: block; font-size: 24px; font-weight: 650; letter-spacing: -.04em; line-height: 1; color: var(--success); font-variant-numeric: tabular-nums; }
  .health-value[data-tone='warn'] { color: var(--warning); }
  .health-value[data-tone='bad'] { color: var(--danger); }
  .health-value.is-plain { color: var(--text-base); }
  .health-value.is-idle { color: var(--text-subtle); font-size: 15px; font-weight: 600; }
  .health-card .mono { overflow-wrap: anywhere; }

  /* Configuration */
  .config-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 0 24px; }
  .config-item { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--border-subtle); min-width: 0; }
  .config-key { color: var(--text-muted); overflow-wrap: anywhere; }
  .config-warning { margin: 14px 0 0; }

  /* Small tables */
  .growth-row { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr); gap: 14px; align-items: center; }
  .admin-row { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1.6fr) 110px; gap: 14px; align-items: center; color: inherit; text-decoration: none; }
  .org-row { display: grid; grid-template-columns: minmax(0, 2fr) 140px 110px; gap: 14px; align-items: center; color: inherit; text-decoration: none; }
  .mini-row { justify-content: space-between; }
  .split { display: grid; grid-template-columns: 1fr 1fr; gap: 36px; }

  @media (max-width: 860px) {
    .stat-strip, .attention, .health-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); row-gap: 22px; }
    .stat:nth-child(odd), .att:nth-child(odd), .health-card:nth-child(odd) { padding-left: 0; border-left: none; }
    .split { grid-template-columns: 1fr; gap: 24px; }
  }
  @container (max-width: 520px) {
    .admin-row { grid-template-columns: minmax(0, 1fr) auto; }
    .admin-row > :nth-child(2) { grid-row: 2; }
    .admin-row > :nth-child(3) { grid-column: 2; grid-row: 1 / span 2; }
    .org-row.row-head { display: none; }
    .org-row { grid-template-columns: minmax(0, 1fr) auto; }
    .org-row > :nth-child(3) { grid-column: 1 / -1; text-align: left; font-size: 11.5px; }
  }
</style>
