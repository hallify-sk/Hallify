<script lang="ts">
  import { t, getLocale } from '$lib/i18n.svelte';
  import { formatDate, timeAgo as relTime } from '$lib/format';
  import KpiCard from '$lib/components/KpiCard.svelte';
  import type { PageData } from './$types';

  interface Props { data: PageData; }
  const { data }: Props = $props();

  // Dates and month names follow the active locale. The server pre-renders the
  // month buckets with English labels; the ISO key travels with them, so the
  // page can label them in whichever language the operator is reading.
  const dateLocale = $derived(getLocale() === 'en' ? 'en-GB' : 'sk-SK');

  // ── Bar chart ─────────────────────────────────────────────────────────────
  const BAR_H = 120;
  const BAR_W = 80;
  const BAR_GAP = 28;
  // $derived, not a plain const: read once at init it would keep the first
  // page's bucket count after a client-side org switch re-loads `data`.
  const CHART_W = $derived((BAR_W + BAR_GAP) * data.monthly.length - BAR_GAP);
  const maxCount  = $derived(Math.max(...data.monthly.map(m => m.count), 1));
  const maxHallRes = $derived(Math.max(...data.halls.map(h => h.reservation_count), 1));
  const monthly = $derived(data.monthly.map(m => ({
    ...m,
    label: new Date(`${m.month_iso}-01T00:00:00`).toLocaleDateString(dateLocale, { month: 'short' }),
  })));

  // ── Donut ─────────────────────────────────────────────────────────────────
  const DONUT_R = 38;
  const DONUT_CIRC = 2 * Math.PI * DONUT_R; // ~238.76
  const STATUS_COLORS: Record<string, string> = {
    pending:         'var(--warning)',
    approved:        'var(--accent-ink)',
    planned:         'var(--status-blue)',
    completed:       'var(--success)',
    cancelled:       'var(--text-muted)',
    waiting_payment: 'var(--status-violet)',
  };
  const STATUS_LABELS: Record<string, string> = $derived({
    pending:         t.status.pending,
    approved:        t.status.approved,
    planned:         t.status.planned,
    completed:       t.status.completed,
    cancelled:       t.status.cancelled,
    waiting_payment: t.status.waiting_payment,
  });
  const totalReservations = $derived(data.byStatus.reduce((s, r) => s + r.count, 0) || 1);
  const donutSegments = $derived(() => {
    let offset = 0;
    return data.byStatus.map(s => {
      const dash = (s.count / totalReservations) * DONUT_CIRC;
      const seg = { ...s, dash, offset, color: STATUS_COLORS[s.status] ?? 'var(--border)' };
      offset += dash;
      return seg;
    });
  });

  // ── Helpers ───────────────────────────────────────────────────────────────
  function fmtDateFull(d: string) {
    return formatDate(d, getLocale());
  }

  // created_at is UTC without a zone: read it as UTC (it showed "2 h" for new items).
  function timeAgo(d: string) {
    return relTime(d, getLocale());
  }

  const STATUS_DOT: Record<string, string> = {
    pending:         'var(--warning)',
    approved:        'var(--accent-ink)',
    planned:         'var(--status-blue)',
    completed:       'var(--success)',
    cancelled:       'var(--text-muted)',
    waiting_payment: 'var(--status-violet)',
  };

  function dotColor(status: string) {
    return STATUS_DOT[status] ?? 'var(--text-muted)';
  }

  const today = new Date();
  function daysUntil(d: string) {
    // event_date is a plain day: read it as local midnight, like today.
    const diff = new Date(`${d.slice(0, 10)}T00:00:00`).getTime() - new Date(today).setHours(0,0,0,0);
    const days = Math.round(diff / 86400000);
    if (days === 0) return t.adminPages.today;
    if (days === 1) return t.adminPages.tomorrow;
    return `${t.adminPages.inDaysPrefix}${days}${t.adminPages.inDaysSuffix}`;
  }
</script>

<svelte:head><title>{t.nav.dashboard} – Hallify</title></svelte:head>

<div class="page wrap">

  <!-- ─── Header ────────────────────────────────────────────────────────── -->
  <div class="section section--lead section--flush dash-header">
    <div>
      <p class="eyebrow">{t.adminReservations.manage}</p>
      <h1 class="dash-title">{t.nav.dashboard}</h1>
    </div>
    <div class="header-actions">
      <a href="/app/manage/reservations" class="btn-action">+ {t.adminPages.newReservation}</a>
    </div>
  </div>

  <!-- Picking up an abandoned first run. One line, dismissible by finishing it,
       and gone for good once the org is a month old. -->
  {#if data.resumeOnboarding}
    <a class="resume-ob" href="/app/welcome">
      <span class="icon-tile">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </span>
      <span class="resume-copy">
        <strong>{t.onboarding.resumeTitle}</strong>
        <span>{t.onboarding.resumeBody}</span>
      </span>
    </a>
  {/if}

  <!-- ─── KPI row ───────────────────────────────────────────────────────── -->
  <!-- Four even columns of one component, so the tiles, the numbers and the
       labels each sit on one line across the strip. -->
  <section class="section kpi-strip">
    <KpiCard value={data.stats.total_reservations} label={t.adminPages.totalReservations} tone="accent">
      {#snippet icon()}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      {/snippet}
    </KpiCard>

    <KpiCard
      value={data.stats.pending}
      label={t.adminPages.awaitingApproval}
      tone="warning"
      actionHref={parseInt(data.stats.pending) > 0 ? '/app/manage/reservations?status=pending' : undefined}
      actionLabel={parseInt(data.stats.pending) > 0 ? `${t.adminPages.review} →` : undefined}
    >
      {#snippet icon()}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      {/snippet}
    </KpiCard>

    <KpiCard value={data.stats.upcoming_7d} label={t.adminPages.upcomingThisWeek} tone="success">
      {#snippet icon()}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      {/snippet}
    </KpiCard>

    <KpiCard
      value={data.stats.open_tickets}
      label={t.adminPages.openSupportThreads}
      tone="danger"
      actionHref={parseInt(data.stats.open_tickets) > 0 ? '/app/manage/messages' : undefined}
      actionLabel={parseInt(data.stats.open_tickets) > 0 ? `${t.adminPages.view} →` : undefined}
    >
      {#snippet icon()}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      {/snippet}
    </KpiCard>
  </section>

  <!-- ─── Middle row: bar chart + donut ─────────────────────────────────── -->
  <!-- One section, one hairline, two panes on a subgrid: the two headings sit
       on one line and the two bodies start at the same y, whichever of them
       is taller. -->
  <section class="section split-grid split-grid--chart">
    <div class="pane">
      <div class="section-head">
        <p class="eyebrow">{t.dashboard.overview}</p>
        <h2>{t.adminPages.reservationsByMonth}</h2>
        <p>{t.adminPages.last6MonthsExclCancelled}</p>
      </div>
      <div class="pane-body">
        {#if data.monthly.every(m => m.count === 0)}
          <div class="card--inset state-block">
            <span class="icon-tile" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            </span>
            <h3>{t.adminPages.noReservationData}</h3>
          </div>
        {:else}
          <div class="bar-chart-wrap">
            <!-- The viewBox starts at -24 to make room for the axis labels, which
                 are drawn at x="-2" anchored to their end. .bar-chart-wrap is a
                 scroll container, so anything left of x=0 was simply clipped away
                 and the grid lines had no numbers on them. -->
            <svg
              viewBox="-24 0 {CHART_W + 24} {BAR_H + 28}"
              width="100%"
              class="bar-svg"
              role="img"
              aria-label={t.adminPages.monthlyReservationsChart}
            >
              <!-- Horizontal grid lines -->
              {#each [0.25, 0.5, 0.75, 1] as frac}
                {@const y = BAR_H - frac * BAR_H}
                <line x1="0" y1={y} x2={CHART_W} y2={y} stroke="var(--border)" stroke-width="1" stroke-dasharray="3 3" opacity="0.6" />
                <text x="-2" y={y + 3.5} text-anchor="end" font-size="8" fill="var(--text-muted)">{Math.round(frac * maxCount)}</text>
              {/each}

              {#each monthly as m, i}
                {@const barH = Math.max(Math.round((m.count / maxCount) * BAR_H), m.count > 0 ? 3 : 0)}
                {@const x = i * (BAR_W + BAR_GAP)}
                {@const isLast = i === monthly.length - 1}

                <!-- Bar -->
                <rect
                  x={x} y={BAR_H - barH} width={BAR_W} height={barH}
                  fill={isLast ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 45%, var(--bg-panel))'}
                  rx="3"
                  class="bar-rect"
                />

                <!-- Count label above bar -->
                {#if m.count > 0}
                  <text x={x + BAR_W / 2} y={BAR_H - barH - 4} text-anchor="middle" font-size="9" fill="var(--text-muted)" font-weight="600">{m.count}</text>
                {/if}

                <!-- Month label -->
                <text x={x + BAR_W / 2} y={BAR_H + 16} text-anchor="middle" font-size="10" fill={isLast ? 'var(--text-base)' : 'var(--text-muted)'} font-weight={isLast ? '600' : '400'}>{m.label}</text>
              {/each}
            </svg>
          </div>
        {/if}
      </div>
    </div>

    <div class="pane">
      <div class="section-head">
        <p class="eyebrow">{t.nav.reservations}</p>
        <h2>{t.adminPages.byStatus}</h2>
      </div>
      <div class="pane-body">
        {#if data.byStatus.length === 0}
          <div class="card--inset state-block">
            <span class="icon-tile" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 3v9l6.4 6.4"/></svg>
            </span>
            <h3>{t.common.noData}</h3>
          </div>
        {:else}
          <div class="donut-wrap">
            <svg viewBox="0 0 100 100" class="donut-svg">
              <!-- Track -->
              <circle cx="50" cy="50" r={DONUT_R} fill="none" stroke="var(--border)" stroke-width="14" />
              <!-- Segments -->
              {#each donutSegments() as seg}
                <circle
                  cx="50" cy="50" r={DONUT_R}
                  fill="none"
                  stroke={seg.color}
                  stroke-width="14"
                  stroke-dasharray="{seg.dash} {DONUT_CIRC - seg.dash}"
                  stroke-dashoffset={-seg.offset}
                  transform="rotate(-90 50 50)"
                  class="donut-seg"
                />
              {/each}
              <!-- Center label -->
              <text x="50" y="47" text-anchor="middle" font-size="13" font-weight="650" fill="var(--text-base)">{data.stats.total_reservations}</text>
              <text x="50" y="57" text-anchor="middle" font-size="7" fill="var(--text-muted)">{t.adminPages.total}</text>
            </svg>

            <div class="donut-legend row-list">
              {#each data.byStatus as s}
                <div class="row-item legend-row">
                  <span class="legend-dot" style="background:{STATUS_COLORS[s.status] ?? 'var(--border)'}"></span>
                  <span class="legend-label">{STATUS_LABELS[s.status] ?? s.status}</span>
                  <span class="legend-count">{s.count}</span>
                  <span class="legend-pct">{Math.round(s.count / totalReservations * 100)}%</span>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </div>
  </section>

  <!-- ─── Bottom row: recent + upcoming ──────────────────────────────────── -->
  <section class="section split-grid split-grid--even">
    <div class="pane">
      <div class="section-head section-head--row">
        <div>
          <p class="eyebrow">{t.adminReservations.manage}</p>
          <h2>{t.adminPages.recentReservations}</h2>
        </div>
        <a href="/app/manage/reservations" class="head-link">{t.adminPages.viewAll}</a>
      </div>
      <div class="pane-body">
        {#if data.recent.length === 0}
          <div class="card--inset state-block">
            <span class="icon-tile" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </span>
            <h3>{t.adminReservations.noReservations}</h3>
          </div>
        {:else}
          <div class="activity-list row-list">
            {#each data.recent as r}
              <a href="/app/reservation/{r.id}" class="row-item row-item--bleed activity-row">
                <span class="activity-dot" style="background:{r.hall_color}"></span>
                <div class="activity-info">
                  <span class="activity-title">{r.title}</span>
                  <span class="activity-meta">{r.hall_name} · {fmtDateFull(r.event_date)}</span>
                </div>
                <div class="activity-right">
                  <span class="status-chip" style="background:color-mix(in srgb,{dotColor(r.status)} 12%,transparent);color:{dotColor(r.status)}">{STATUS_LABELS[r.status] ?? r.status}</span>
                  <span class="activity-age">{timeAgo(r.created_at)}</span>
                </div>
              </a>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <div class="pane">
      <div class="section-head section-head--row">
        <div>
          <p class="eyebrow">{t.nav.dashboard}</p>
          <h2>{t.adminPages.upcoming14Days}</h2>
        </div>
        <span class="kpi-badge">{data.upcoming.length}</span>
      </div>
      <div class="pane-body">
        {#if data.upcoming.length === 0}
          <div class="card--inset state-block">
            <span class="icon-tile" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </span>
            <h3>{t.adminPages.noEventsNext14Days}</h3>
          </div>
        {:else}
          <div class="upcoming-list row-list">
            {#each data.upcoming as ev}
              <a href="/app/reservation/{ev.id}" class="row-item row-item--bleed upcoming-row">
                <div class="upcoming-date-col">
                  <span class="upcoming-day">{formatDate(ev.event_date, getLocale(), { day: 'numeric', month: 'short' }).replace(' ', '\n')}</span>
                </div>
                <div class="upcoming-bar" style="background:{ev.hall_color}"></div>
                <div class="upcoming-info">
                  <span class="upcoming-title">{ev.title}</span>
                  <span class="upcoming-sub">{ev.hall_name}{ev.start_time ? ' · ' + ev.start_time.slice(0,5) : ''}</span>
                </div>
                <span class="upcoming-when">{daysUntil(ev.event_date)}</span>
              </a>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </section>

  <!-- ─── Halls overview ─────────────────────────────────────────────────── -->
  <section class="section">
    <div class="section-head section-head--row">
      <div>
        <p class="eyebrow">{t.halls.manage}</p>
        <h2>{t.nav.halls}</h2>
      </div>
      <a href="/app/manage/halls" class="head-link">{t.hallAdmin.manageAction}</a>
    </div>
    {#if data.halls.length === 0}
      <div class="card--inset state-block">
        <span class="icon-tile" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
        </span>
        <h3>{t.adminPages.noHallsConfigured}</h3>
        <p><a href="/app/manage/halls/new" class="inline-link">{t.adminPages.addOne} →</a></p>
      </div>
    {:else}
      <!-- The colour strip is a column of the grid rather than something tucked
           inside the name cell, which is what used to push every name 14px to
           the right of its own header. -->
      <div class="halls-table row-list">
        <div class="halls-head row-head" aria-hidden="true">
          <span></span>
          <span>{t.dashboard.hall}</span>
          <span>{t.common.capacity}</span>
          <span>{t.hallAdmin.allTimeBookings}</span>
          <span class="num">{t.hallAdmin.upcoming}</span>
          <span></span>
        </div>
        {#each data.halls as h}
          <a href="/app/manage/halls/{h.id}" class="row-item row-item--bleed halls-row">
            <span class="halls-color-strip" style="background:{h.color}"></span>
            <span class="halls-name-text">{h.name}</span>
            <span class="halls-cap-cell">{h.max_people} {t.common.people}</span>
            <span class="halls-bar-cell">
              <span class="halls-bar-count">{h.reservation_count}</span>
              <span class="halls-bar-track">
                <span class="halls-bar-fill" style="width:{Math.round(h.reservation_count / maxHallRes * 100)}%;background:{h.color}"></span>
              </span>
            </span>
            <span class="halls-upcoming-cell">
              {#if h.upcoming_count > 0}
                <span class="halls-upcoming-badge">{h.upcoming_count}</span>
              {:else}
                <span class="halls-upcoming-none">—</span>
              {/if}
            </span>
            <span class="halls-arrow">→</span>
          </a>
        {/each}
      </div>
    {/if}
  </section>

  <!-- ─── Secondary stats footer ─────────────────────────────────────────── -->
  <div class="section footer-stats">
    <div class="footer-stat">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
      <span><strong>{data.stats.total_halls}</strong> {t.adminPages.hallsLower}</span>
    </div>
    <div class="footer-sep"></div>
    <div class="footer-stat">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
      <span><strong>{data.stats.total_members}</strong> {t.adminPages.teamMembers}</span>
    </div>
    <div class="footer-sep"></div>
    <div class="footer-stat">
      <span class="online-dot-sm"></span>
      <span><strong>{data.onlineCount}</strong> {t.adminPages.onlineNow}</span>
    </div>
    <div class="footer-sep"></div>
    <div class="footer-stat">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>
      <span><strong>{data.stats.completed}</strong> {t.adminPages.completedEvents}</span>
    </div>
  </div>

</div>

<style>
  /* "planned" and "waiting payment" use --status-blue / --status-violet from
     app.css — blue is planned, violet is waiting payment. They used to be declared
     locally here and again on the calendar and reservations screens; they now live
     in the token layer so the three cannot drift apart. */

  @keyframes pageFadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes fadeSlideUp {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .page {
    padding-block: 24px;
    animation: pageFadeIn 0.15s ease both;
  }

  /* ── Staggered entrance ── */
  /* Every band of the page is a .section, so the stagger rides the sections
     instead of a different hand-named class per band.
     :nth-CHILD, not :nth-of-type — the bands are a mix of <div> and <section>
     elements, so nth-of-type counted two separate sequences: the header matched
     "1" alongside the KPI strip and the footer matched "2" alongside the chart
     row, which overrode the footer's own 460ms and collapsed the stagger. */
  .page > .section { animation: fadeSlideUp 0.35s ease both; }
  .page > .section:nth-child(2) { animation-delay:  80ms; }
  .page > .section:nth-child(3) { animation-delay: 180ms; }
  .page > .section:nth-child(4) { animation-delay: 280ms; }
  .page > .section:nth-child(5) { animation-delay: 380ms; }
  .page > .section:nth-child(6) { animation-delay: 460ms; }

  /* ── Header ── */
  .dash-header {
    display: flex; align-items: flex-end; justify-content: space-between;
    gap: 16px; flex-wrap: wrap;
  }
  .dash-title {
    font-size: var(--display-size); font-weight: 550; color: var(--text-base); letter-spacing: -.055em;
    line-height: 1.08; margin-top: 4px;
  }
  /* The wrapper had no rule at all, so it was a block box around an inline-flex
     button: its height was the LINE box, a few pixels taller than the button, and
     flex-end then hung the button above the title's baseline. */
  .header-actions { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }

  /* ── KPI strip ── */
  .kpi-strip {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--grid-gap);
    align-items: start;
  }

  .kpi-badge {
    font-size: 10px; font-weight: 650; padding: 2px 8px; border-radius: var(--radius-sm);
    background: var(--accent-dim); color: var(--accent-ink);
    flex-shrink: 0;
  }

  /* The action that sits on the right of a .section-head--row. */
  .head-link {
    font-size: 12px; font-weight: 600; color: var(--accent-ink); text-decoration: none; flex-shrink: 0;
  }
  .head-link:hover { text-decoration: underline; }

  /* ── Two-pane sections ── */
  /* One hairline and one section padding for the pair; `subgrid` is what
     actually levels them, by handing both panes the same two rows — headings
     in the first, bodies in the second — instead of letting each column
     measure itself. */
  .split-grid {
    display: grid;
    grid-template-rows: auto 1fr;
    column-gap: calc(var(--grid-gap) * 1.6);
  }
  .split-grid--chart { grid-template-columns: minmax(0, 1fr) 280px; }
  .split-grid--even  { grid-template-columns: repeat(2, minmax(0, 1fr)); }

  .pane {
    display: grid;
    grid-row: span 2;
    grid-template-rows: subgrid;
    min-width: 0;
  }
  .pane-body { min-width: 0; }

  /* Bar chart */
  .bar-chart-wrap { overflow-x: auto; }
  /* width="100%" with a viewBox would otherwise scale the height to the
     available width (huge on wide screens) — cap it to a sane chart size. */
  .bar-svg { display: block; overflow: visible; width: 100%; max-width: 920px; height: auto; max-height: 230px; margin: 0 auto; }
  .bar-rect { transition: opacity .15s; }
  .bar-rect:hover { opacity: .8; }

  /* Donut */
  .donut-wrap { display: flex; flex-direction: column; align-items: center; gap: 12px; }
  .donut-svg { width: 120px; height: 120px; }
  .donut-seg { transition: opacity .15s; }
  .donut-seg:hover { opacity: .8; }

  .donut-legend { width: 100%; }
  /* Keep the row inset: overriding the padding to `7px 0` left .row-item's
     negative margin in place, so the whole legend hung 10px left of the donut
     and of every heading in the pane. */
  .legend-row { gap: 7px; font-size: 12px; padding: 7px var(--row-inset, 10px); }
  .legend-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .legend-label { flex: 1; color: var(--text-muted); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .legend-count { font-weight: 600; color: var(--text-base); font-variant-numeric: tabular-nums; }
  .legend-pct { color: var(--text-muted); font-size: 11px; min-width: 30px; text-align: right; font-variant-numeric: tabular-nums; }

  /* Activity list */
  .activity-row { gap: 10px; color: var(--text-base); }
  .activity-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .activity-info { flex: 1; min-width: 0; }
  .activity-title { display: block; font-size: 13px; font-weight: 500; color: var(--text-base); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .activity-meta  { display: block; font-size: 11px; color: var(--text-muted); margin-top: 1px; }
  .activity-right { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; flex-shrink: 0; }

  /* Same geometry as StatusBadge, so a status reads the same on every screen. */
  .status-chip {
    font-size: 11px; font-weight: 650; border-radius: var(--radius-sm); padding: 3px 9px;
    letter-spacing: .01em; white-space: nowrap;
  }
  .activity-age { font-size: 10px; color: var(--text-muted); }

  .inline-link { color: var(--accent-ink); text-decoration: none; }
  .inline-link:hover { text-decoration: underline; }

  /* Upcoming list */
  .upcoming-row { gap: 10px; color: var(--text-base); }
  .upcoming-date-col { width: 32px; flex-shrink: 0; text-align: center; }
  .upcoming-day {
    display: block; font-size: 11px; font-weight: 600; color: var(--text-base);
    white-space: pre-line; line-height: 1.3;
  }
  .upcoming-bar { width: 3px; height: 30px; border-radius: 3px; flex-shrink: 0; }
  .upcoming-info { flex: 1; min-width: 0; }
  .upcoming-title { display: block; font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .upcoming-sub   { display: block; font-size: 11px; color: var(--text-muted); margin-top: 1px; }
  .upcoming-when  {
    flex-shrink: 0; font-size: 11px; font-weight: 600; color: var(--accent-ink);
  }

  /* ── Halls table ── */
  /* One template for the header and the rows, declared once. The 4px lead
     column is the colour strip, so "Hall" sits exactly above the hall name,
     and the bookings column is a fixed width so the bar does not grow and
     shrink with the viewport. */
  .halls-table {
    --halls-cols: 4px minmax(0, 1fr) 96px 180px 80px 16px;
  }
  .halls-head,
  .halls-row {
    display: grid;
    grid-template-columns: var(--halls-cols);
    gap: 12px;
    align-items: center;
  }
  /* The header carries the global .row-head as well, which supplies the shared
     column-label type AND the same horizontal inset as the .row-item rows below
     it — so the header rule is the same width as the row rules and each label
     sits exactly over its values. Only the grid is local. */
  .halls-head .num { text-align: right; }

  .halls-row { color: var(--text-base); }

  .halls-color-strip { height: 28px; border-radius: 2px; }
  .halls-name-text {
    font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  .halls-cap-cell { font-size: 12px; color: var(--text-muted); font-variant-numeric: tabular-nums; }

  .halls-bar-cell { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .halls-bar-count {
    font-size: 13px; font-weight: 650; color: var(--text-base);
    min-width: 2.4ch; flex-shrink: 0; font-variant-numeric: tabular-nums;
  }
  .halls-bar-track {
    flex: 1; height: 6px; background: var(--border); border-radius: 99px; overflow: hidden;
  }
  .halls-bar-fill { display: block; height: 6px; border-radius: 99px; transition: width .4s ease; }

  .halls-upcoming-cell { justify-self: end; }
  .halls-upcoming-badge {
    display: inline-flex; align-items: center; justify-content: center;
    background: var(--success-dim);
    color: var(--success); font-size: 12px; font-weight: 650;
    border-radius: var(--radius-sm); padding: 2px 10px;
  }
  .halls-upcoming-none { font-size: 12px; color: var(--text-muted); }

  .halls-arrow { font-size: 13px; color: var(--text-subtle); text-align: right; }

  /* ── Footer stats ── */
  .footer-stats {
    display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
    font-size: 12px; color: var(--text-muted);
  }
  .footer-stat { display: flex; align-items: center; gap: 5px; }
  .footer-stat svg { color: var(--text-subtle); flex-shrink: 0; }
  .footer-stat strong { color: var(--text-base); font-weight: 650; }
  .footer-sep { width: 1px; height: 14px; background: var(--border); }

  .online-dot-sm {
    width: 7px; height: 7px; border-radius: 50%;
    background: var(--success); flex-shrink: 0;
  }

  /* ── Responsive ── */
  @media (max-width: 1100px) {
    .halls-table { --halls-cols: 4px minmax(0, 1fr) 92px 140px 72px 16px; }
  }
  @media (max-width: 900px) {
    .kpi-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); row-gap: calc(var(--grid-gap) * 1.4); }
    .split-grid { grid-template-columns: minmax(0, 1fr); row-gap: var(--section-pad); }
    /* Stacked, the panes are one above the other, so there is nothing left to
       level: drop the subgrid and let each one size itself. */
    .pane { grid-row: auto; grid-template-rows: auto; }
  }
  @media (max-width: 640px) {
    .halls-head { display: none; }
    .halls-table { --halls-cols: 4px minmax(0, 1fr) auto; }
    .halls-row { row-gap: 8px; }
    .halls-color-strip { grid-row: 1 / -1; height: 100%; min-height: 34px; }
    .halls-name-text     { grid-column: 2; grid-row: 1; }
    .halls-cap-cell      { grid-column: 3; grid-row: 1; justify-self: end; }
    .halls-bar-cell      { grid-column: 2; grid-row: 2; }
    .halls-upcoming-cell { grid-column: 3; grid-row: 2; }
    .halls-arrow { display: none; }
  }
  /* ── Resume first run ──────────────────────── */
  .resume-ob {
    display: flex; align-items: center; gap: 13px;
    padding: 13px 16px; margin-bottom: 18px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--bg-panel);
    text-decoration: none; color: inherit;
    transition: border-color .15s, background .15s;
  }
  .resume-ob:hover { border-color: var(--accent); background: var(--accent-dim); text-decoration: none; }
  .resume-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .resume-copy strong { font-size: 13.5px; font-weight: 600; }
  .resume-copy span { font-size: var(--meta-size); color: var(--text-muted); line-height: 1.6; }
</style>
