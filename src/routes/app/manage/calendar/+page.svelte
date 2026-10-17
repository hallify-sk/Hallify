<script lang="ts">
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n.svelte';
	import SectionHeader from '$lib/components/SectionHeader.svelte';
	import type { PageData } from './$types';

	interface Props { data: PageData; }
	const { data }: Props = $props();

	type Ev = (typeof data.events)[number];
	type ViewMode = 'month' | 'week' | 'day' | 'agenda';

	// ── Status metadata ──
	const STATUS_ORDER = ['pending', 'waiting_payment', 'approved', 'planned', 'completed'];
	const STATUS_COLOR: Record<string, string> = {
		pending: 'var(--warning)', waiting_payment: 'var(--status-violet)', approved: 'var(--success)',
		planned: 'var(--status-blue)', completed: 'var(--text-muted)', cancelled: 'var(--danger)',
	};
	function statusLabel(s: string): string { return (t.status as Record<string, string>)[s] ?? s; }

	// ── Date helpers (string-keyed, timezone-safe) ──
	function parseISO(s: string): Date { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
	function iso(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
	function addDays(d: Date, n: number): Date { const r = new Date(d); r.setDate(d.getDate() + n); return r; }
	function mondayIndex(jsDay: number): number { return jsDay === 0 ? 6 : jsDay - 1; }
	const todayISO = iso(new Date());

	const anchor = $derived(parseISO(data.anchor));
	const view = $derived(data.view as ViewMode);

	// ── Filters (client-side, instant) ──
	let hiddenHalls = $state<Set<string>>(new Set());
	let hiddenStatuses = $state<Set<string>>(new Set());
	function toggleHall(id: string) { const s = new Set(hiddenHalls); s.has(id) ? s.delete(id) : s.add(id); hiddenHalls = s; }
	function toggleStatus(st: string) { const s = new Set(hiddenStatuses); s.has(st) ? s.delete(st) : s.add(st); hiddenStatuses = s; }

	const hallColor = $derived(Object.fromEntries(data.halls.map(h => [h.id, h.color ?? 'var(--status-blue)'])) as Record<string, string>);

	const visibleEvents = $derived(data.events.filter(e => !hiddenHalls.has(e.hall_id) && !hiddenStatuses.has(e.status)));

	const eventsByDay = $derived.by(() => {
		const m = new Map<string, Ev[]>();
		for (const e of visibleEvents) {
			const k = e.event_date.slice(0, 10);
			if (!m.has(k)) m.set(k, []);
			m.get(k)!.push(e);
		}
		return m;
	});

	// ── Blocked dates: a day is "blocked" when EVERY visible hall is blocked that day ──
	// A hall is blocked on a day if:
	//   • a date_range block covers it (filtered by days_of_week when present)
	//   • a weekly block matches the day-of-week
	//   • the hall's opening_hours marks that day as closed
	const DOW_KEY = ['sun','mon','tue','wed','thu','fri','sat'] as const;
	const visibleHallIds = $derived(data.halls.map(h => h.id).filter(id => !hiddenHalls.has(id)));
	const blockedDates = $derived.by(() => {
		const result = new Set<string>();
		if (visibleHallIds.length === 0) return result;
		const start = parseISO(data.rangeStart), end = parseISO(data.rangeEnd);
		for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
			const key = iso(d);
			const jsDow = d.getDay();
			const allBlocked = visibleHallIds.every(hid => {
				// Explicit blocks
				const hasBlock = data.blocks.some(b => b.hall_id === hid && (
					(b.block_type === 'date_range' && b.date_from && b.date_to &&
					 key >= b.date_from.slice(0, 10) && key <= b.date_to.slice(0, 10) &&
					 (b.days_of_week.length === 0 || (b.days_of_week as number[]).includes(jsDow))) ||
					(b.block_type === 'weekly' && (b.days_of_week as number[]).includes(jsDow))
				));
				if (hasBlock) return true;
				// Opening hours: day is closed
				const hall = data.halls.find(h => h.id === hid);
				if (!hall?.opening_hours) return false;
				try {
					const hours = typeof hall.opening_hours === 'string'
						? JSON.parse(hall.opening_hours) : hall.opening_hours;
					const dh = hours[DOW_KEY[jsDow]];
					return dh ? !dh.open : false;
				} catch { return false; }
			});
			if (allBlocked) result.add(key);
		}
		return result;
	});

	// ── Month grid ──
	const monthWeeks = $derived.by(() => {
		const start = parseISO(data.rangeStart), end = parseISO(data.rangeEnd);
		const weeks: { iso: string; day: number; inMonth: boolean; isToday: boolean; isWeekend: boolean }[][] = [];
		let week: typeof weeks[number] = [];
		for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
			const key = iso(d);
			week.push({ iso: key, day: d.getDate(), inMonth: d.getMonth() === anchor.getMonth(), isToday: key === todayISO, isWeekend: d.getDay() === 0 || d.getDay() === 6 });
			if (week.length === 7) { weeks.push(week); week = []; }
		}
		return weeks;
	});

	// ── Time-grid (week/day) ──
	const START_HOUR = 6, END_HOUR = 24, HOUR_H = 46;
	const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
	function parseMin(time: string | null): number | null {
		if (!time) return null;
		const m = /^(\d{1,2}):(\d{2})/.exec(time);
		if (!m) return null;
		return Number(m[1]) * 60 + Number(m[2]);
	}
	type Placed = { ev: Ev; top: number; height: number; lane: number; lanes: number };
	function layoutDay(dayKey: string): { timed: Placed[]; allDay: Ev[] } {
		const evs = eventsByDay.get(dayKey) ?? [];
		const allDay: Ev[] = [];
		const timedRaw: { ev: Ev; s: number; e: number }[] = [];
		for (const ev of evs) {
			const s = parseMin(ev.start_time);
			if (s === null) { allDay.push(ev); continue; }
			const e = parseMin(ev.end_time) ?? s + 60;
			timedRaw.push({ ev, s, e: Math.max(e, s + 30) });
		}
		timedRaw.sort((a, b) => a.s - b.s || a.e - b.e);
		const laneEnds: number[] = [];
		const withLane = timedRaw.map(item => {
			let lane = laneEnds.findIndex(end => end <= item.s);
			if (lane === -1) { lane = laneEnds.length; laneEnds.push(item.e); } else { laneEnds[lane] = item.e; }
			return { ...item, lane };
		});
		const lanes = Math.max(1, laneEnds.length);
		const timed: Placed[] = withLane.map(p => ({
			ev: p.ev, lane: p.lane, lanes,
			top: ((p.s - START_HOUR * 60) / 60) * HOUR_H,
			height: Math.max(((p.e - p.s) / 60) * HOUR_H - 2, 18),
		}));
		return { timed, allDay };
	}

	const weekDays = $derived.by(() => {
		const start = parseISO(data.rangeStart);
		return Array.from({ length: 7 }, (_, i) => {
			const d = addDays(start, i);
			return { iso: iso(d), date: d, isToday: iso(d) === todayISO, isWeekend: d.getDay() === 0 || d.getDay() === 6 };
		});
	});

	// ── Agenda ──
	const agendaGroups = $derived.by(() => {
		const groups = new Map<string, Ev[]>();
		for (const e of [...visibleEvents].sort((a, b) => (a.event_date + (a.start_time ?? '')).localeCompare(b.event_date + (b.start_time ?? '')))) {
			const k = e.event_date.slice(0, 10);
			if (!groups.has(k)) groups.set(k, []);
			groups.get(k)!.push(e);
		}
		return [...groups.entries()];
	});

	// ── Navigation ──
	function navTo(v: ViewMode, dateISO: string) { goto(`/app/manage/calendar?view=${v}&date=${dateISO}`, { noScroll: true }); }
	function setView(v: ViewMode) { navTo(v, data.anchor); }
	function goToday() { navTo(view, todayISO); }
	function shift(dir: number) {
		let d: Date;
		if (view === 'month') d = new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1);
		else if (view === 'week') d = addDays(anchor, 7 * dir);
		else if (view === 'day') d = addDays(anchor, dir);
		else d = addDays(anchor, 30 * dir);
		navTo(view, iso(d));
	}

	// ── Quick-create ──
	function quickCreate(dateISO: string) {
		const onlyHall = visibleHallIds.length === 1 ? `&hall=${visibleHallIds[0]}` : '';
		goto(`/app/reservation/new?date=${dateISO}${onlyHall}`);
	}

	// ── Event popover ──
	let active = $state<Ev | null>(null);

	// ── Labels ──
	const periodLabel = $derived.by(() => {
		const mo = t.monthNames[anchor.getMonth()];
		if (view === 'month') return `${mo} ${anchor.getFullYear()}`;
		if (view === 'day') return `${t.dayNamesFull[mondayIndex(anchor.getDay())]}, ${anchor.getDate()}. ${mo} ${anchor.getFullYear()}`;
		if (view === 'week') {
			const ws = parseISO(data.rangeStart), we = parseISO(data.rangeEnd);
			const sameMonth = ws.getMonth() === we.getMonth();
			return sameMonth
				? `${ws.getDate()} – ${we.getDate()}. ${t.monthNames[we.getMonth()]} ${we.getFullYear()}`
				: `${ws.getDate()}. ${t.monthNames[ws.getMonth()]} – ${we.getDate()}. ${t.monthNames[we.getMonth()]} ${we.getFullYear()}`;
		}
		return t.calendar.agenda;
	});

	const statusCountMap = $derived(Object.fromEntries(data.summary.statusCounts.map(s => [s.status, s.n])) as Record<string, number>);
	const monthTotal = $derived(data.summary.statusCounts.filter(s => s.status !== 'cancelled').reduce((a, s) => a + s.n, 0));

	const VIEWS: { id: ViewMode; label: string }[] = $derived([
		{ id: 'month', label: t.calendar.month }, { id: 'week', label: t.calendar.week },
		{ id: 'day', label: t.calendar.day }, { id: 'agenda', label: t.calendar.agenda },
	]);

	function fmtTime(s: string | null): string { return s ? s.slice(0, 5) : ''; }
	function bookerName(e: Ev): string { return [e.booker_first, e.booker_last].filter(Boolean).join(' '); }
</script>

<svelte:head><title>{t.calendar.title} – Hallify</title></svelte:head>

<div class="page wrap">
	<!-- ── Header ── -->
	<div class="head">
		<SectionHeader overline={t.halls.manage} title={t.calendar.title} />
		<div class="head-actions">
			<div class="seg">
				{#each VIEWS as v}
					<button class="seg-btn" class:active={view === v.id} onclick={() => setView(v.id)}>{v.label}</button>
				{/each}
			</div>
			<a href="/app/reservation/new" class="btn-action">
				<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
				{t.calendar.newEvent}
			</a>
		</div>
	</div>

	<!-- ── The calendar itself: nav + summary read as this section's head ── -->
	<section class="section section--lead cal-section">
	<div class="section-head section-head--row bar">
		<div class="nav">
			<button class="nav-btn" onclick={() => shift(-1)} aria-label={t.adminPages.previous}>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
			</button>
			<button class="today-btn" onclick={goToday}>{t.calendar.today}</button>
			<button class="nav-btn" onclick={() => shift(1)} aria-label={t.adminPages.next}>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
			</button>
			<h2 class="period">{periodLabel}</h2>
		</div>

		<div class="summary">
			<div class="sum-stat"><span class="sum-n">{monthTotal}</span><span class="sum-l">{t.calendar.totalEvents}</span></div>
			<div class="sum-pills">
				{#each STATUS_ORDER as st}
					{#if statusCountMap[st]}
						<span class="sum-pill" style="--c:{STATUS_COLOR[st]}">
							<span class="pill-dot"></span>{statusCountMap[st]} {statusLabel(st)}
						</span>
					{/if}
				{/each}
			</div>
			{#if data.summary.busiest}
				<div class="sum-stat busiest"><span class="sum-l">{t.calendar.busiestHall}</span><span class="sum-busiest">{data.summary.busiest.hall_name}</span></div>
			{/if}
		</div>
	</div>

	<!-- ── Filters ── -->
	{#if data.halls.length > 0}
		<div class="filters">
			<div class="filter-group">
				{#each data.halls as h}
					<button class="chip" class:off={hiddenHalls.has(h.id)} onclick={() => toggleHall(h.id)}>
						<span class="chip-dot" style="background:{hallColor[h.id]}"></span>{h.name}
					</button>
				{/each}
			</div>
			<div class="filter-divider"></div>
			<div class="filter-group">
				{#each STATUS_ORDER as st}
					<button class="chip" class:off={hiddenStatuses.has(st)} onclick={() => toggleStatus(st)}>
						<span class="chip-dot" style="background:{STATUS_COLOR[st]}"></span>{statusLabel(st)}
					</button>
				{/each}
			</div>
		</div>
	{/if}

	<!-- ── Views ── -->
	<div class="view-wrap">
		{#if view === 'month'}
			<div class="month">
				<div class="dow-row">
					{#each t.dayNames as name}<div class="dow">{name}</div>{/each}
				</div>
				<div class="weeks">
					{#each monthWeeks as week}
						<div class="week-row">
							{#each week as cell}
								{@const evs = eventsByDay.get(cell.iso) ?? []}
								<div class="mcell" class:out={!cell.inMonth} class:today={cell.isToday}
									class:weekend={cell.isWeekend} class:blocked={blockedDates.has(cell.iso)}
									ondblclick={() => quickCreate(cell.iso)} role="gridcell" tabindex="-1">
									<div class="mcell-head">
										<span class="mday">{cell.day}</span>
										<button class="add-day" title={t.calendar.newEvent} onclick={() => quickCreate(cell.iso)} aria-label={t.calendar.newEvent}>
											<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
										</button>
									</div>
									<div class="mcell-evs">
										{#each evs.slice(0, 3) as ev}
											<button class="chip-ev" class:past={ev.event_date.slice(0, 10) < todayISO} style="--hc:{hallColor[ev.hall_id]};--sc:{STATUS_COLOR[ev.status]}" onclick={() => active = ev}>
												<span class="ev-sdot"></span>
												{#if ev.start_time}<span class="ev-time">{fmtTime(ev.start_time)}</span>{/if}
												<span class="ev-title">{ev.title}</span>
											</button>
										{/each}
										{#if evs.length > 3}
											<button class="more" onclick={() => navTo('day', cell.iso)}>+{evs.length - 3} {t.calendar.moreEvents}</button>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					{/each}
				</div>
			</div>

		{:else if view === 'week' || view === 'day'}
			{@const days = view === 'day' ? [{ iso: data.anchor, date: anchor, isToday: data.anchor === todayISO, isWeekend: anchor.getDay() === 0 || anchor.getDay() === 6 }] : weekDays}
			<div class="tgrid" style="--cols:{days.length}">
				<!-- column headers -->
				<div class="tgrid-head">
					<div class="tg-gutter"></div>
					{#each days as d}
						<button class="tg-dayhead" class:today={d.isToday} class:weekend={d.isWeekend} onclick={() => navTo('day', d.iso)}>
							<span class="tg-dow">{t.dayNames[mondayIndex(d.date.getDay())]}</span>
							<span class="tg-dnum">{d.date.getDate()}</span>
						</button>
					{/each}
				</div>
				<!-- all-day row -->
				<div class="tgrid-allday">
					<div class="tg-gutter allday-label">{t.calendar.allDay}</div>
					{#each days as d}
						{@const ad = layoutDay(d.iso).allDay}
						<div class="allday-col" class:blocked={blockedDates.has(d.iso)}>
							{#each ad as ev}
								<button class="chip-ev allday-chip" class:past={ev.event_date.slice(0, 10) < todayISO} style="--hc:{hallColor[ev.hall_id]};--sc:{STATUS_COLOR[ev.status]}" onclick={() => active = ev}>
									<span class="ev-sdot"></span><span class="ev-title">{ev.title}</span>
								</button>
							{/each}
						</div>
					{/each}
				</div>
				<!-- scrollable time body -->
				<div class="tgrid-body" style="--hourh:{HOUR_H}px">
					<div class="tg-gutter hours-col">
						{#each hours as h}<div class="hour-label" style="height:{HOUR_H}px"><span>{String(h).padStart(2, '0')}:00</span></div>{/each}
					</div>
					{#each days as d}
						{@const placed = layoutDay(d.iso).timed}
						<div class="day-col" class:today={d.isToday} class:blocked={blockedDates.has(d.iso)} ondblclick={() => quickCreate(d.iso)} role="gridcell" tabindex="-1">
							{#each hours as h}<div class="hour-line" style="height:{HOUR_H}px"></div>{/each}
							{#each placed as p}
								<button class="tev" class:past={p.ev.event_date.slice(0, 10) < todayISO} style="top:{p.top}px;height:{p.height}px;left:calc({(p.lane * 100) / p.lanes}% + 2px);width:calc({100 / p.lanes}% - 4px);--hc:{hallColor[p.ev.hall_id]};--sc:{STATUS_COLOR[p.ev.status]}" onclick={() => active = p.ev}>
									<span class="tev-title">{p.ev.title}</span>
									<span class="tev-meta">{fmtTime(p.ev.start_time)}{#if p.ev.end_time}–{fmtTime(p.ev.end_time)}{/if} · {p.ev.hall_name}</span>
								</button>
							{/each}
						</div>
					{/each}
				</div>
			</div>

		{:else}
			<!-- Agenda -->
			<div class="agenda">
				{#if agendaGroups.length === 0}
					<div class="card--inset empty">
						<span class="icon-tile" aria-hidden="true">
							<svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
						</span>
						<h3 class="empty-t">{t.calendar.noEvents}</h3>
						<p class="empty-s">{t.calendar.noEventsHint}</p>
					</div>
				{:else}
					{#each agendaGroups as [dayKey, evs]}
						{@const d = parseISO(dayKey)}
						<div class="ag-row">
							<div class="ag-date" class:today={dayKey === todayISO}>
								<span class="ag-dnum">{d.getDate()}</span>
								<span class="ag-dmo">{t.monthNames[d.getMonth()].slice(0, 3)}</span>
								<span class="ag-dow">{t.dayNames[mondayIndex(d.getDay())]}</span>
							</div>
							<div class="ag-evs row-list">
								{#each evs as ev}
									<button class="row-item ag-ev" class:past={ev.event_date.slice(0, 10) < todayISO} style="--hc:{hallColor[ev.hall_id]};--sc:{STATUS_COLOR[ev.status]}" onclick={() => active = ev}>
										<span class="ag-bar"></span>
										<span class="ag-time">{ev.start_time ? `${fmtTime(ev.start_time)}${ev.end_time ? '–' + fmtTime(ev.end_time) : ''}` : t.calendar.allDay}</span>
										<span class="ag-title">{ev.title}</span>
										<span class="ag-hall">{ev.hall_name}</span>
										<span class="ag-status" style="--sc:{STATUS_COLOR[ev.status]}">{statusLabel(ev.status)}</span>
									</button>
								{/each}
							</div>
						</div>
					{/each}
				{/if}
			</div>
		{/if}
	</div>
	</section>
</div>

<!-- ── Event popover ── -->
{#if active}
	<button class="pop-backdrop" onclick={() => active = null} aria-label={t.adminPages.close}></button>
	<div class="card--raised pop" style="--hc:{hallColor[active.hall_id]};--sc:{STATUS_COLOR[active.status]}" role="dialog">
		<div class="pop-bar"></div>
		<div class="pop-body">
			<div class="pop-status"><span class="pop-sdot"></span>{statusLabel(active.status)}</div>
			<h3 class="pop-title">{active.title}</h3>
			<div class="pop-meta">
				<div class="pop-line">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
					<span>{active.hall_name}</span>
				</div>
				<div class="pop-line">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
					<span>{parseISO(active.event_date.slice(0, 10)).toLocaleDateString('sk-SK', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}{#if active.start_time} · {fmtTime(active.start_time)}{#if active.end_time}–{fmtTime(active.end_time)}{/if}{/if}</span>
				</div>
				{#if bookerName(active)}
					<div class="pop-line">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
						<span>{t.calendar.bookedBy}: {bookerName(active)}</span>
					</div>
				{/if}
			</div>
			<a href="/app/reservation/{active.id}" class="btn-action pop-open">
				{t.calendar.openReservation}
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
			</a>
		</div>
	</div>
{/if}

<style>
	/* warning / success / danger / text-muted carry four of the six states; "planned"
	   and "waiting payment" take --status-blue / --status-violet from app.css, which
	   keeps all six apart at dot size. */

	.page { padding-block: 22px; height: 100%; display: flex; flex-direction: column; overflow: hidden; box-sizing: border-box; }

	/* The calendar grid has to fill what is left of the viewport, so this one
	   section overrides the stock block padding and becomes the flex child. */
	.cal-section { flex: 1; min-height: 0; display: flex; flex-direction: column; padding: 10px 0 0; }

	/* ── Header ── */
	.head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
	.head :global(.section-header) { margin-bottom: 8px; }
	.head-actions { display: flex; align-items: center; gap: 10px; }

	.seg { display: inline-flex; background: var(--bg-panel2, var(--bg-base)); border: 1px solid var(--border); border-radius: var(--radius); padding: 2px; }
	.seg-btn { padding: 6px 13px; border: none; background: none; border-radius: calc(var(--radius) - 2px); font-size: 12.5px; font-weight: 600; color: var(--text-muted); cursor: pointer; font-family: inherit; transition: background .15s, color .15s; }
	.seg-btn.active { background: var(--bg-panel); color: var(--text-base); box-shadow: var(--shadow-xs); }
	.seg-btn:hover:not(.active) { color: var(--text-base); }

	/* ── Bar (nav + summary) — this section's head ── */
	.bar { align-items: center; }
	.nav { display: flex; align-items: center; gap: 8px; }
	.nav-btn { width: 32px; height: 32px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-panel); display: flex; align-items: center; justify-content: center; cursor: pointer; color: var(--text-muted); transition: background .15s, color .15s, border-color .15s; }
	.nav-btn:hover { background: var(--accent-dim); color: var(--accent-ink); border-color: var(--accent); }
	.today-btn { padding: 0 14px; height: 32px; border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--bg-panel); font-size: 12.5px; font-weight: 600; color: var(--text-base); cursor: pointer; font-family: inherit; transition: background .15s, color .15s, border-color .15s; }
	.today-btn:hover { border-color: var(--accent); color: var(--accent-ink); }
	.period { font-size: var(--h2-size); font-weight: 600; color: var(--text-base); margin-left: 8px; letter-spacing: -.03em; text-transform: capitalize; }

	.summary { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
	.sum-stat { display: flex; flex-direction: column; }
	.sum-n { font-size: 18px; font-weight: 650; color: var(--text-base); line-height: 1; letter-spacing: -.03em; }
	.sum-l { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .12em; color: var(--text-muted); margin-top: 3px; }
	.sum-busiest { font-size: 13px; font-weight: 600; color: var(--text-base); }
	.busiest { text-align: right; }
	.sum-pills { display: flex; gap: 6px; flex-wrap: wrap; }
	.sum-pill { display: inline-flex; align-items: center; gap: 5px; padding: 4px 9px; border-radius: 3px; font-size: 11px; font-weight: 600; color: var(--text-muted); background: color-mix(in srgb, var(--c) 12%, transparent); }
	.pill-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--c); }

	/* ── Filters ── */
	.filters { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
	.filter-group { display: flex; gap: 6px; flex-wrap: wrap; }
	.filter-divider { width: 1px; align-self: stretch; background: var(--border); }
	/* Geometry and colours come from the global .chip; only the "hidden" state
	   and the hall/status dot are specific to this screen. */
	.chip.off { opacity: .4; text-decoration: line-through; }
	.chip-dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }

	/* ── View wrap — the grid sits straight on the page, no panel around it ── */
	.view-wrap { flex: 1; min-height: 0; display: flex; border-top: 1px solid var(--border); overflow: hidden; }

	/* ── Month ── */
	.month { flex: 1; display: flex; flex-direction: column; min-height: 0; }
	.dow-row { display: grid; grid-template-columns: repeat(7, 1fr); border-bottom: 1px solid var(--border); }
	.dow { padding: 9px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .12em; color: var(--text-muted); text-align: center; }
	.dow:last-child { color: var(--danger); }
	.weeks { flex: 1; display: flex; flex-direction: column; overflow-y: auto; }
	.week-row { display: grid; grid-template-columns: repeat(7, 1fr); flex: 1; min-height: 96px; }
	.mcell { border-right: 1px solid var(--border-subtle, var(--border)); border-bottom: 1px solid var(--border-subtle, var(--border)); padding: 5px 5px 4px; display: flex; flex-direction: column; gap: 3px; min-height: 0; position: relative; }
	.mcell:nth-child(7n) { border-right: none; }
	.mcell.out { background: var(--bg-panel2); }
	.mcell.out .mday { color: var(--text-subtle); }
	.mcell.weekend:not(.out) { background: color-mix(in srgb, var(--bg-panel2) 50%, transparent); }
	.mcell.blocked { background-image: repeating-linear-gradient(45deg, transparent, transparent 6px, color-mix(in srgb, var(--danger) 7%, transparent) 6px, color-mix(in srgb, var(--danger) 7%, transparent) 12px); }
	.mcell.today { background: var(--accent-dim); }
	.mcell.today .mday { background: var(--accent); color: var(--accent-contrast); }
	.mcell-head { display: flex; align-items: center; justify-content: space-between; }
	.mday { font-size: 12px; font-weight: 600; color: var(--text-muted); width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; }
	.add-day { opacity: 0; width: 20px; height: 20px; border-radius: var(--radius-sm); border: none; background: var(--accent-dim); color: var(--accent-ink); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: opacity .15s; }
	.mcell:hover .add-day { opacity: 1; }
	.mcell-evs { display: flex; flex-direction: column; gap: 2px; overflow: hidden; }
	.chip-ev { display: flex; align-items: center; gap: 5px; padding: 2px 6px; border-radius: var(--radius-sm); font-size: 11px; font-weight: 500; border: none; cursor: pointer; font-family: inherit; text-align: left; width: 100%; background: color-mix(in srgb, var(--hc) 14%, transparent); color: color-mix(in srgb, var(--hc) 82%, var(--text-base)); }
	.chip-ev:hover { background: color-mix(in srgb, var(--hc) 24%, transparent); }
	/* Past events read as muted across all calendar views. */
	.chip-ev.past, .tev.past, .ag-ev.past { opacity: .5; }
	.chip-ev.past:hover, .tev.past:hover, .ag-ev.past:hover { opacity: .85; }
	.chip-ev.past .ev-title, .tev.past .tev-title, .ag-ev.past .ag-title { text-decoration: line-through; text-decoration-thickness: 1px; }
	.ev-sdot { width: 6px; height: 6px; border-radius: 50%; background: var(--sc); flex-shrink: 0; }
	.ev-time { font-weight: 600; font-variant-numeric: tabular-nums; flex-shrink: 0; }
	.ev-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.more { border: none; background: none; font-size: 10.5px; font-weight: 600; color: var(--text-muted); cursor: pointer; text-align: left; padding: 1px 6px; font-family: inherit; }
	.more:hover { color: var(--accent-ink); }

	/* ── Time grid (week/day) ── */
	.tgrid { flex: 1; display: flex; flex-direction: column; min-height: 0; --gutter: 56px; }
	.tgrid-head { display: grid; grid-template-columns: var(--gutter) repeat(var(--cols), 1fr); border-bottom: 1px solid var(--border); }
	.tg-gutter { width: var(--gutter); }
	.tg-dayhead { display: flex; flex-direction: column; align-items: center; gap: 1px; padding: 8px 4px; border-left: 1px solid var(--border-subtle, var(--border)); background: none; cursor: pointer; font-family: inherit; }
	.tg-dayhead:hover { background: var(--bg-panel2); }
	.tg-dow { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: .12em; color: var(--text-muted); }
	.tg-dnum { font-size: 16px; font-weight: 600; color: var(--text-base); width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 50%; letter-spacing: -.03em; }
	.tg-dayhead.today .tg-dnum { background: var(--accent); color: var(--accent-contrast); }
	.tg-dayhead.weekend .tg-dow { color: var(--danger); }

	.tgrid-allday { display: grid; grid-template-columns: var(--gutter) repeat(var(--cols), 1fr); border-bottom: 1px solid var(--border); max-height: 88px; overflow-y: auto; }
	.allday-label { font-size: 9.5px; font-weight: 600; text-transform: uppercase; letter-spacing: .12em; color: var(--text-muted); display: flex; align-items: center; justify-content: flex-end; padding: 4px 8px; }
	.allday-col { border-left: 1px solid var(--border-subtle, var(--border)); padding: 4px; display: flex; flex-direction: column; gap: 3px; min-height: 26px; }
	.allday-col.blocked { background-image: repeating-linear-gradient(45deg, transparent, transparent 6px, color-mix(in srgb, var(--danger) 7%, transparent) 6px, color-mix(in srgb, var(--danger) 7%, transparent) 12px); }
	.allday-chip { width: 100%; }

	.tgrid-body { flex: 1; display: grid; grid-template-columns: var(--gutter) repeat(var(--cols), 1fr); overflow-y: auto; position: relative; }
	.hours-col { display: flex; flex-direction: column; }
	.hour-label { display: flex; align-items: flex-start; justify-content: flex-end; padding: 2px 8px 0 0; position: relative; }
	.hour-label span { font-size: 10px; color: var(--text-muted); font-variant-numeric: tabular-nums; transform: translateY(-6px); }
	.day-col { position: relative; border-left: 1px solid var(--border-subtle, var(--border)); }
	.day-col.today { background: color-mix(in srgb, var(--accent-dim) 50%, transparent); }
	.day-col.blocked { background-image: repeating-linear-gradient(45deg, transparent, transparent 7px, color-mix(in srgb, var(--danger) 6%, transparent) 7px, color-mix(in srgb, var(--danger) 6%, transparent) 14px); }
	.hour-line { border-bottom: 1px solid var(--border-subtle, var(--border)); box-sizing: border-box; }
	.tev { position: absolute; border-radius: var(--radius-sm); padding: 3px 7px; border: none; border-left: 3px solid var(--sc); cursor: pointer; font-family: inherit; text-align: left; overflow: hidden; display: flex; flex-direction: column; gap: 1px; background: color-mix(in srgb, var(--hc) 18%, var(--bg-panel)); color: color-mix(in srgb, var(--hc) 80%, var(--text-base)); box-shadow: var(--shadow-xs); }
	.tev:hover { background: color-mix(in srgb, var(--hc) 28%, var(--bg-panel)); z-index: 5; }
	.tev-title { font-size: 11.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.tev-meta { font-size: 10px; opacity: .8; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

	/* ── Agenda ── */
	.agenda { flex: 1; overflow-y: auto; padding: 6px 0; }
	.ag-row { display: flex; gap: 16px; padding: 12px 20px; border-bottom: 1px solid var(--border-subtle, var(--border)); }
	.ag-row:last-child { border-bottom: none; }
	.ag-date { display: flex; flex-direction: column; align-items: center; width: 52px; flex-shrink: 0; padding-top: 4px; }
	.ag-dnum { font-size: 22px; font-weight: 650; color: var(--text-base); line-height: 1; letter-spacing: -.03em; }
	.ag-dmo { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .12em; color: var(--text-muted); margin-top: 2px; }
	.ag-dow { font-size: 10px; color: var(--text-muted); margin-top: 1px; }
	.ag-date.today .ag-dnum { color: var(--accent-ink); }
	.ag-evs { flex: 1; min-width: 0; }
	.ag-ev { gap: 12px; border: none; background: none; cursor: pointer; font-family: inherit; transition: background .15s; }
	.ag-bar { width: 4px; align-self: stretch; border-radius: 3px; background: var(--hc); flex-shrink: 0; }
	.ag-time { font-size: 12px; font-weight: 600; color: var(--text-muted); font-variant-numeric: tabular-nums; width: 92px; flex-shrink: 0; }
	.ag-title { font-size: 13.5px; font-weight: 600; color: var(--text-base); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.ag-hall { font-size: 12px; color: var(--text-muted); flex-shrink: 0; }
	.ag-status { font-size: 10.5px; font-weight: 600; padding: 3px 9px; border-radius: 3px; flex-shrink: 0; color: var(--sc); background: color-mix(in srgb, var(--sc) 13%, transparent); }

	.empty { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; margin: 20px; }
	.empty-t { font-size: var(--h3-size); font-weight: 600; letter-spacing: -.02em; color: var(--text-base); margin: 0; }
	.empty-s { font-size: var(--body-size); color: var(--text-muted); margin: 0; }

	/* ── Popover ── */
	.pop-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.32); border: none; cursor: default; z-index: 90; animation: fade .12s ease; }
	@keyframes fade { from { opacity: 0; } to { opacity: 1; } }
	/* A genuine floating surface, so it opts back into .card--raised; only the
	   placement and the full-bleed hall bar are local. */
	.pop { position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); width: min(420px, calc(100vw - 40px)); padding: 0; z-index: 91; overflow: hidden; animation: popIn .16s cubic-bezier(.22,1,.36,1); }
	@keyframes popIn { from { opacity: 0; transform: translate(-50%, -46%) scale(.97); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
	.pop-bar { height: 5px; background: var(--hc); }
	.pop-body { padding: 18px 20px 20px; }
	.pop-status { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; font-weight: 650; color: var(--sc); text-transform: uppercase; letter-spacing: .13em; }
	.pop-sdot { width: 7px; height: 7px; border-radius: 50%; background: var(--sc); }
	.pop-title { font-size: 18px; font-weight: 600; color: var(--text-base); margin: 8px 0 14px; letter-spacing: -.03em; }
	.pop-meta { display: flex; flex-direction: column; gap: 9px; margin-bottom: 18px; }
	.pop-line { display: flex; align-items: center; gap: 9px; font-size: 13px; color: var(--text-muted); }
	.pop-line svg { color: var(--text-subtle); flex-shrink: 0; }
	@media (max-width: 720px) {
		.bar { gap: 10px; }
		.summary { display: none; }
	}
</style>
