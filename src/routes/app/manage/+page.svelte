<script lang="ts">
  import { t } from '$lib/i18n.svelte';
  import type { PageData } from './$types';

  interface Props { data: PageData; }
  const { data }: Props = $props();

  // ── Bar chart ─────────────────────────────────────────────────────────────
  const BAR_H = 120;
  const BAR_W = 80;
  const BAR_GAP = 28;
  const CHART_W = (BAR_W + BAR_GAP) * data.monthly.length - BAR_GAP;
  const maxCount  = $derived(Math.max(...data.monthly.map(m => m.count), 1));
  const maxHallRes = $derived(Math.max(...data.halls.map(h => h.reservation_count), 1));

  // ── Donut ─────────────────────────────────────────────────────────────────
  const DONUT_R = 38;
  const DONUT_CIRC = 2 * Math.PI * DONUT_R; // ~238.76
  const STATUS_COLORS: Record<string, string> = {
    pending:         'var(--warning)',
    approved:        'var(--accent)',
    planned:         '#8b5cf6',
    completed:       'var(--success)',
    cancelled:       'var(--text-subtle)',
    waiting_payment: '#f97316',
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
  function fmtDate(d: Date | string) {
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }

  function fmtDateFull(d: Date | string) {
    return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function timeAgo(d: Date | string) {
    const diff = Date.now() - new Date(d).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t.settingsPages.justNow;
    if (mins < 60) return `${mins}${t.settingsPages.minutesAgo}`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}${t.settingsPages.hoursAgo}`;
    return `${Math.floor(hrs / 24)}${t.settingsPages.daysAgo}`;
  }

  const STATUS_DOT: Record<string, string> = {
    pending:         'var(--warning)',
    approved:        'var(--accent)',
    planned:         '#8b5cf6',
    completed:       'var(--success)',
    cancelled:       'var(--text-subtle)',
    waiting_payment: '#f97316',
  };

  function dotColor(status: string) {
    return STATUS_DOT[status] ?? 'var(--text-subtle)';
  }

  const today = new Date();
  function daysUntil(d: Date | string) {
    const diff = new Date(d).setHours(0,0,0,0) - today.setHours(0,0,0,0);
    const days = Math.round(diff / 86400000);
    if (days === 0) return t.adminPages.today;
    if (days === 1) return t.adminPages.tomorrow;
    return `${t.adminPages.inDaysPrefix}${days}${t.adminPages.inDaysSuffix}`;
  }
</script>

<svelte:head><title>{t.nav.dashboard} – Hallify</title></svelte:head>

<div class="page">

  <!-- ─── Header ────────────────────────────────────────────────────────── -->
  <div class="dash-header">
    <div>
      <p class="dash-overline">{t.adminReservations.manage}</p>
      <h1 class="dash-title">{t.nav.dashboard}</h1>
    </div>
    <div class="header-actions">
      <a href="/app/manage/reservations" class="btn-primary">+ {t.adminPages.newReservation}</a>
    </div>
  </div>

  <!-- ─── KPI row ───────────────────────────────────────────────────────── -->
  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-icon kpi-icon-blue">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
      </div>
      <div class="kpi-body">
        <span class="kpi-value">{data.stats.total_reservations}</span>
        <span class="kpi-label">{t.adminPages.totalReservations}</span>
      </div>
    </div>

    <div class="kpi-card">
      <div class="kpi-icon kpi-icon-amber">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      </div>
      <div class="kpi-body">
        <span class="kpi-value">{data.stats.pending}</span>
        <span class="kpi-label">{t.adminPages.awaitingApproval}</span>
      </div>
      {#if parseInt(data.stats.pending) > 0}
        <a href="/app/manage/reservations?status=pending" class="kpi-link">{t.adminPages.review} →</a>
      {/if}
    </div>

    <div class="kpi-card">
      <div class="kpi-icon kpi-icon-green">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      </div>
      <div class="kpi-body">
        <span class="kpi-value">{data.stats.upcoming_7d}</span>
        <span class="kpi-label">{t.adminPages.upcomingThisWeek}</span>
      </div>
    </div>

    <div class="kpi-card">
      <div class="kpi-icon kpi-icon-red">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      </div>
      <div class="kpi-body">
        <span class="kpi-value">{data.stats.open_tickets}</span>
        <span class="kpi-label">{t.adminPages.openSupportThreads}</span>
      </div>
      {#if parseInt(data.stats.open_tickets) > 0}
        <a href="/app/manage/messages" class="kpi-link">{t.adminPages.view} →</a>
      {/if}
    </div>
  </div>

  <!-- ─── Middle row: bar chart + donut ─────────────────────────────────── -->
  <div class="mid-grid">

    <!-- Monthly bar chart -->
    <div class="card chart-card">
      <div class="card-header">
        <div>
          <h2 class="card-title">{t.adminPages.reservationsByMonth}</h2>
          <p class="card-sub">{t.adminPages.last6MonthsExclCancelled}</p>
        </div>
      </div>
      {#if data.monthly.every(m => m.count === 0)}
        <div class="chart-empty">{t.adminPages.noReservationData}</div>
      {:else}
        <div class="bar-chart-wrap">
          <svg
            viewBox="0 0 {CHART_W} {BAR_H + 28}"
            width="100%"
            class="bar-svg"
            role="img"
            aria-label={t.adminPages.monthlyReservationsChart}
          >
            <!-- Horizontal grid lines -->
            {#each [0.25, 0.5, 0.75, 1] as frac}
              {@const y = BAR_H - frac * BAR_H}
              <line x1="0" y1={y} x2={CHART_W} y2={y} stroke="var(--border)" stroke-width="1" stroke-dasharray="3 3" opacity="0.6" />
              <text x="-2" y={y + 3.5} text-anchor="end" font-size="8" fill="var(--text-subtle)">{Math.round(frac * maxCount)}</text>
            {/each}

            {#each data.monthly as m, i}
              {@const barH = Math.max(Math.round((m.count / maxCount) * BAR_H), m.count > 0 ? 3 : 0)}
              {@const x = i * (BAR_W + BAR_GAP)}
              {@const isLast = i === data.monthly.length - 1}

              <!-- Bar -->
              <rect
                x={x} y={BAR_H - barH} width={BAR_W} height={barH}
                fill={isLast ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 45%, var(--bg-panel))'}
                rx="4"
                class="bar-rect"
              />

              <!-- Count label above bar -->
              {#if m.count > 0}
                <text x={x + BAR_W / 2} y={BAR_H - barH - 4} text-anchor="middle" font-size="9" fill="var(--text-muted)" font-weight="600">{m.count}</text>
              {/if}

              <!-- Month label -->
              <text x={x + BAR_W / 2} y={BAR_H + 16} text-anchor="middle" font-size="10" fill={isLast ? 'var(--text-base)' : 'var(--text-subtle)'} font-weight={isLast ? '600' : '400'}>{m.month_label}</text>
            {/each}
          </svg>
        </div>
      {/if}
    </div>

    <!-- Status donut -->
    <div class="card donut-card">
      <div class="card-header">
        <h2 class="card-title">{t.adminPages.byStatus}</h2>
      </div>
      {#if data.byStatus.length === 0}
        <div class="chart-empty">{t.common.noData}</div>
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
            <text x="50" y="47" text-anchor="middle" font-size="13" font-weight="700" fill="var(--text-base)">{data.stats.total_reservations}</text>
            <text x="50" y="57" text-anchor="middle" font-size="7" fill="var(--text-subtle)">{t.adminPages.total}</text>
          </svg>

          <div class="donut-legend">
            {#each data.byStatus as s}
              <div class="legend-row">
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

  <!-- ─── Bottom row: recent + upcoming + halls ──────────────────────────── -->
  <div class="bottom-grid">

    <!-- Recent activity -->
    <div class="card activity-card">
      <div class="card-header">
        <h2 class="card-title">{t.adminPages.recentReservations}</h2>
        <a href="/app/manage/reservations" class="card-link">{t.adminPages.viewAll}</a>
      </div>
      {#if data.recent.length === 0}
        <div class="list-empty">{t.adminReservations.noReservations}</div>
      {:else}
        <div class="activity-list">
          {#each data.recent as r}
            <a href="/app/reservation/{r.id}" class="activity-row">
              <span class="activity-dot" style="background:{r.hall_color}"></span>
              <div class="activity-info">
                <span class="activity-title">{r.title}</span>
                <span class="activity-meta">{r.hall_name} · {fmtDateFull(r.event_date)}</span>
              </div>
              <div class="activity-right">
                <span class="status-chip" style="background:color-mix(in srgb,{dotColor(r.status)} 12%,transparent);color:{dotColor(r.status)}">{r.status}</span>
                <span class="activity-age">{timeAgo(r.created_at)}</span>
              </div>
            </a>
          {/each}
        </div>
      {/if}
    </div>

    <!-- Upcoming events -->
    <div class="card upcoming-card">
      <div class="card-header">
        <h2 class="card-title">{t.adminPages.upcoming14Days}</h2>
        <span class="kpi-badge">{data.upcoming.length}</span>
      </div>
      {#if data.upcoming.length === 0}
        <div class="list-empty">{t.adminPages.noEventsNext14Days}</div>
      {:else}
        <div class="upcoming-list">
          {#each data.upcoming as ev}
            <a href="/app/reservation/{ev.id}" class="upcoming-row">
              <div class="upcoming-date-col">
                <span class="upcoming-day">{new Date(ev.event_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).replace(' ', '\n')}</span>
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

  <!-- ─── Halls overview ─────────────────────────────────────────────────── -->
  <div class="card halls-card">
    <div class="card-header">
      <h2 class="card-title">{t.nav.halls}</h2>
      <a href="/app/manage/halls" class="card-link">{t.hallAdmin.manageAction}</a>
    </div>
    {#if data.halls.length === 0}
      <div class="list-empty">{t.adminPages.noHallsConfigured} <a href="/app/manage/halls/new" class="inline-link">{t.adminPages.addOne} →</a></div>
    {:else}
      <div class="halls-table">
        <div class="halls-thead">
          <span>{t.dashboard.hall}</span>
          <span>{t.common.capacity}</span>
          <span>{t.hallAdmin.allTimeBookings}</span>
          <span>{t.hallAdmin.upcoming}</span>
          <span></span>
        </div>
        {#each data.halls as h}
          <a href="/app/manage/halls/{h.id}" class="halls-row">
            <div class="halls-row-name">
              <span class="halls-color-strip" style="background:{h.color}"></span>
              <span class="halls-name-text">{h.name}</span>
            </div>
            <span class="halls-cap-cell">{h.max_people} {t.common.people}</span>
            <div class="halls-bar-cell">
              <span class="halls-bar-count">{h.reservation_count}</span>
              <div class="halls-bar-track">
                <div class="halls-bar-fill" style="width:{Math.round(h.reservation_count / maxHallRes * 100)}%;background:{h.color}"></div>
              </div>
            </div>
            <div class="halls-upcoming-cell">
              {#if h.upcoming_count > 0}
                <span class="halls-upcoming-badge">{h.upcoming_count}</span>
              {:else}
                <span class="halls-upcoming-none">—</span>
              {/if}
            </div>
            <span class="halls-arrow">→</span>
          </a>
        {/each}
      </div>
    {/if}
  </div>

  <!-- ─── Secondary stats footer ─────────────────────────────────────────── -->
  <div class="footer-stats">
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
  @keyframes pageFadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes fadeSlideUp {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .page {
    padding: 24px 28px;
    animation: pageFadeIn 0.15s ease both;
  }

  /* ── Staggered entrance ── */
  .dash-header   { animation: fadeSlideUp 0.35s ease both; animation-delay:   0ms; }

  .kpi-grid .kpi-card              { animation: fadeSlideUp 0.35s ease both; }
  .kpi-grid .kpi-card:nth-child(1) { animation-delay:  60ms; }
  .kpi-grid .kpi-card:nth-child(2) { animation-delay: 120ms; }
  .kpi-grid .kpi-card:nth-child(3) { animation-delay: 180ms; }
  .kpi-grid .kpi-card:nth-child(4) { animation-delay: 240ms; }

  .chart-card    { animation: fadeSlideUp 0.35s ease both; animation-delay: 280ms; }
  .donut-card    { animation: fadeSlideUp 0.35s ease both; animation-delay: 340ms; }
  .activity-card { animation: fadeSlideUp 0.35s ease both; animation-delay: 380ms; }
  .upcoming-card { animation: fadeSlideUp 0.35s ease both; animation-delay: 440ms; }
  .halls-card    { animation: fadeSlideUp 0.35s ease both; animation-delay: 500ms; }
  .footer-stats  { animation: fadeSlideUp 0.35s ease both; animation-delay: 560ms; }

  /* ── Header ── */
  .dash-header {
    display: flex; align-items: flex-end; justify-content: space-between;
    margin-bottom: 22px;
  }
  .dash-overline {
    font-size: 10px; font-weight: 700; text-transform: uppercase;
    letter-spacing: .08em; color: var(--text-subtle); margin-bottom: 3px;
  }
  .dash-title {
    font-size: 22px; font-weight: 800; color: var(--text-base); letter-spacing: -.02em;
  }
  .btn-primary {
    padding: 8px 18px; border-radius: 8px; font-size: 13px; font-weight: 600;
    background: var(--accent); color: #fff; text-decoration: none; white-space: nowrap;
    transition: opacity .12s;
  }
  .btn-primary:hover { opacity: .88; }

  /* ── KPI cards ── */
  .kpi-grid {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;
    margin-bottom: 16px;
  }
  .kpi-card {
    background: var(--bg-panel); border: 1px solid var(--border); border-radius: 12px;
    padding: 16px; display: flex; align-items: center; gap: 12px; position: relative;
    transition: box-shadow .12s;
  }
  .kpi-card:hover { box-shadow: var(--shadow-sm); }

  .kpi-icon {
    width: 38px; height: 38px; border-radius: 10px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
  }
  .kpi-icon-blue  { background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent); }
  .kpi-icon-amber { background: color-mix(in srgb, var(--warning) 14%, transparent); color: var(--warning); }
  .kpi-icon-green { background: color-mix(in srgb, var(--success) 12%, transparent); color: var(--success); }
  .kpi-icon-red   { background: color-mix(in srgb, var(--danger) 12%, transparent); color: var(--danger); }

  .kpi-body { flex: 1; min-width: 0; }
  .kpi-value { display: block; font-size: 22px; font-weight: 800; color: var(--text-base); line-height: 1.1; }
  .kpi-label { display: block; font-size: 11px; color: var(--text-subtle); margin-top: 2px; }
  .kpi-badge {
    font-size: 10px; font-weight: 700; padding: 1px 7px; border-radius: 99px;
    background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent);
    flex-shrink: 0;
  }

  .kpi-link {
    position: absolute; top: 12px; right: 14px;
    font-size: 11px; font-weight: 600; color: var(--accent); text-decoration: none;
  }
  .kpi-link:hover { text-decoration: underline; }

  /* ── Card shell ── */
  .card {
    background: var(--bg-panel); border: 1px solid var(--border);
    border-radius: 12px; overflow: hidden;
  }
  .card-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 18px 10px; gap: 10px;
  }
  .card-title { font-size: 13px; font-weight: 700; color: var(--text-base); }
  .card-sub   { font-size: 11px; color: var(--text-subtle); margin-top: 1px; }
  .card-link  {
    font-size: 12px; font-weight: 600; color: var(--accent); text-decoration: none; flex-shrink: 0;
  }
  .card-link:hover { text-decoration: underline; }

  /* ── Mid row: bar + donut ── */
  .mid-grid {
    display: grid; grid-template-columns: 1fr 280px; gap: 12px; margin-bottom: 12px;
  }

  /* Bar chart */
  .chart-card { padding-bottom: 16px; }
  .bar-chart-wrap { padding: 4px 18px 0; overflow-x: auto; }
  /* width="100%" with a viewBox would otherwise scale the height to the card
     width (huge on wide screens) — cap it to a sane chart size. */
  .bar-svg { display: block; overflow: visible; width: 100%; max-width: 920px; height: auto; max-height: 230px; margin: 0 auto; }
  .bar-rect { transition: opacity .12s; }
  .bar-rect:hover { opacity: .8; }
  .chart-empty { padding: 40px 18px; text-align: center; font-size: 13px; color: var(--text-subtle); }

  /* Donut */
  .donut-card { display: flex; flex-direction: column; }
  .donut-wrap { display: flex; flex-direction: column; align-items: center; padding: 6px 18px 16px; gap: 12px; }
  .donut-svg { width: 120px; height: 120px; }
  .donut-seg { transition: opacity .12s; }
  .donut-seg:hover { opacity: .8; }

  .donut-legend { width: 100%; display: flex; flex-direction: column; gap: 6px; }
  .legend-row {
    display: flex; align-items: center; gap: 7px; font-size: 12px;
  }
  .legend-dot { width: 8px; height: 8px; border-radius: 3px; flex-shrink: 0; }
  .legend-label { flex: 1; color: var(--text-muted); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .legend-count { font-weight: 600; color: var(--text-base); }
  .legend-pct { color: var(--text-subtle); font-size: 11px; min-width: 30px; text-align: right; }

  /* ── Bottom row ── */
  .bottom-grid {
    display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;
  }

  /* Activity list */
  .activity-list { display: flex; flex-direction: column; }
  .activity-row {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 18px; text-decoration: none; color: var(--text-base);
    border-bottom: 1px solid var(--border-subtle, var(--border));
    transition: background .1s;
  }
  .activity-row:last-child { border-bottom: none; }
  .activity-row:hover { background: var(--bg-hover); }

  .activity-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
  .activity-info { flex: 1; min-width: 0; }
  .activity-title { display: block; font-size: 13px; font-weight: 500; color: var(--text-base); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .activity-meta  { display: block; font-size: 11px; color: var(--text-subtle); margin-top: 1px; }
  .activity-right { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; flex-shrink: 0; }

  .status-chip {
    font-size: 10px; font-weight: 600; border-radius: 99px; padding: 2px 7px;
    text-transform: capitalize; white-space: nowrap;
  }
  .activity-age { font-size: 10px; color: var(--text-subtle); }

  .list-empty {
    padding: 32px 18px; text-align: center; font-size: 13px; color: var(--text-subtle);
  }
  .inline-link { color: var(--accent); text-decoration: none; }
  .inline-link:hover { text-decoration: underline; }

  /* Upcoming list */
  .upcoming-list { display: flex; flex-direction: column; }
  .upcoming-row {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 18px; text-decoration: none; color: var(--text-base);
    border-bottom: 1px solid var(--border-subtle, var(--border));
    transition: background .1s;
  }
  .upcoming-row:last-child { border-bottom: none; }
  .upcoming-row:hover { background: var(--bg-hover); }

  .upcoming-date-col { width: 32px; flex-shrink: 0; text-align: center; }
  .upcoming-day {
    display: block; font-size: 11px; font-weight: 600; color: var(--text-base);
    white-space: pre-line; line-height: 1.3;
  }
  .upcoming-bar { width: 3px; height: 30px; border-radius: 2px; flex-shrink: 0; }
  .upcoming-info { flex: 1; min-width: 0; }
  .upcoming-title { display: block; font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .upcoming-sub   { display: block; font-size: 11px; color: var(--text-subtle); margin-top: 1px; }
  .upcoming-when  {
    flex-shrink: 0; font-size: 11px; font-weight: 600; color: var(--accent);
  }

  /* ── Halls table ── */
  .halls-card { margin-bottom: 12px; }

  .halls-thead {
    display: grid;
    grid-template-columns: 2fr 100px 1fr 90px 24px;
    gap: 12px;
    padding: 7px 18px;
    font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em;
    color: var(--text-subtle);
    background: var(--bg-panel2);
    border-top: 1px solid var(--border);
    border-bottom: 1px solid var(--border);
  }

  .halls-row {
    display: grid;
    grid-template-columns: 2fr 100px 1fr 90px 24px;
    gap: 12px;
    align-items: center;
    padding: 11px 18px;
    text-decoration: none; color: var(--text-base);
    border-bottom: 1px solid var(--border-subtle, var(--border));
    transition: background .1s;
  }
  .halls-row:last-child { border-bottom: none; }
  .halls-row:hover { background: var(--bg-hover); }

  .halls-row-name {
    display: flex; align-items: center; gap: 10px; min-width: 0;
  }
  .halls-color-strip {
    width: 4px; height: 32px; border-radius: 2px; flex-shrink: 0;
  }
  .halls-name-text {
    font-size: 13px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }

  .halls-cap-cell { font-size: 12px; color: var(--text-muted); }

  .halls-bar-cell {
    display: flex; align-items: center; gap: 10px;
  }
  .halls-bar-count {
    font-size: 13px; font-weight: 700; color: var(--text-base);
    min-width: 24px; text-align: right; flex-shrink: 0;
  }
  .halls-bar-track {
    flex: 1; height: 6px; background: var(--border); border-radius: 3px; overflow: hidden;
  }
  .halls-bar-fill { height: 6px; border-radius: 3px; transition: width .4s ease; }

  .halls-upcoming-cell { display: flex; align-items: center; }
  .halls-upcoming-badge {
    display: inline-flex; align-items: center; justify-content: center;
    background: color-mix(in srgb, var(--success) 12%, transparent);
    color: var(--success); font-size: 12px; font-weight: 700;
    border-radius: 99px; padding: 2px 10px;
  }
  .halls-upcoming-none { font-size: 12px; color: var(--text-subtle); }

  .halls-arrow { font-size: 13px; color: var(--text-subtle); text-align: right; }

  /* ── Footer stats ── */
  .footer-stats {
    display: flex; align-items: center; gap: 16px;
    padding: 12px 0 4px;
    font-size: 12px; color: var(--text-muted);
  }
  .footer-stat { display: flex; align-items: center; gap: 5px; }
  .footer-stat svg { color: var(--text-subtle); flex-shrink: 0; }
  .footer-stat strong { color: var(--text-base); }
  .footer-sep { width: 1px; height: 14px; background: var(--border); }

  .online-dot-sm {
    width: 7px; height: 7px; border-radius: 50%;
    background: var(--success); flex-shrink: 0;
  }

  /* ── Responsive ── */
  @media (max-width: 900px) {
    .kpi-grid { grid-template-columns: repeat(2, 1fr); }
    .mid-grid  { grid-template-columns: 1fr; }
    .bottom-grid { grid-template-columns: 1fr; }
  }
  @media (max-width: 600px) {
    .page { padding: 16px; }
    .kpi-grid { grid-template-columns: 1fr 1fr; }
  }
</style>
