<script lang="ts">
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n';
	import SectionHeader from '$lib/components/SectionHeader.svelte';
	import type { PageData } from './$types';

	interface Props { data: PageData; }
	const { data }: Props = $props();

	// Use hall colors from DB
	const hallColor = $derived(
		Object.fromEntries(data.halls.map(h => [h.id, h.color ?? '#3b82f6']))
	);

	// Monday-start week: shift Sunday (0) to end
	function mondayIndex(jsDay: number) {
		return jsDay === 0 ? 6 : jsDay - 1;
	}

	const firstDayOfMonth = $derived(mondayIndex(new Date(data.year, data.month - 1, 1).getDay()));
	const daysInMonth = $derived(new Date(data.year, data.month, 0).getDate());

	const calendarCells = $derived.by(() => {
		const cells: (number | null)[] = Array(firstDayOfMonth).fill(null);
		for (let d = 1; d <= daysInMonth; d++) cells.push(d);
		while (cells.length % 7 !== 0) cells.push(null);
		return cells;
	});

	type CalEvent = (typeof data.events)[number];
	const eventsByDay = $derived.by(() => {
		const year = data.year, month = data.month;
		const map = new Map<number, CalEvent[]>();
		for (const ev of data.events) {
			const d = new Date(ev.event_date);
			if (d.getFullYear() === year && d.getMonth() + 1 === month) {
				const day = d.getDate();
				if (!map.has(day)) map.set(day, [] as CalEvent[]);
				map.get(day)!.push(ev);
			}
		}
		return map;
	});

	function prevMonth() {
		const d = new Date(data.year, data.month - 2, 1);
		goto(`/admin/calendar?year=${d.getFullYear()}&month=${d.getMonth()+1}`);
	}

	function nextMonth() {
		const d = new Date(data.year, data.month, 1);
		goto(`/admin/calendar?year=${d.getFullYear()}&month=${d.getMonth()+1}`);
	}

	const today = new Date();
	const todayDay = $derived(today.getDate());
	const isCurrentMonth = $derived(today.getFullYear() === data.year && today.getMonth() + 1 === data.month);

	// Check if a day is Sunday (column index 6 in Monday-start)
	function isSunday(cellIndex: number) {
		return cellIndex % 7 === 6;
	}
</script>

<svelte:head><title>{t.calendar.title} – Hallify</title></svelte:head>

<div class="page">
	<div class="cal-top">
		<SectionHeader overline={t.halls.manage} title={t.calendar.title} />
		<div class="nav-row">
			<button onclick={prevMonth} class="nav-btn" aria-label="Previous month">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<polyline points="15 18 9 12 15 6"/>
				</svg>
			</button>
			<span class="month-label">{t.monthNames[data.month - 1]} {data.year}</span>
			<button onclick={nextMonth} class="nav-btn" aria-label="Next month">
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
					<polyline points="9 18 15 12 9 6"/>
				</svg>
			</button>
		</div>
	</div>

	<!-- Hall legend -->
	{#if data.halls.length > 0}
		<div class="legend">
			{#each data.halls as h}
				<div class="legend-item">
					<span class="legend-dot" style="background:{hallColor[h.id]}"></span>
					<span>{h.name}</span>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Calendar grid -->
	<div class="calendar">
		<div class="day-headers">
			{#each t.dayNames as name}
				<div class="day-name">{name}</div>
			{/each}
		</div>
		<div class="grid">
			{#each calendarCells as cell, idx}
				<div class="cell"
					class:today={isCurrentMonth && cell === todayDay}
					class:empty={cell === null}
					class:sunday={isSunday(idx) && cell !== null}>
					{#if cell !== null}
						<span class="cell-num">{cell}</span>
						<div class="cell-events">
							{#each (eventsByDay.get(cell) ?? ([] as CalEvent[])) as ev}
								<a href="/app/reservation/{ev.id}" class="ev-chip"
									style="background:{hallColor[ev.hall_id]}22;color:{hallColor[ev.hall_id]};border-color:{hallColor[ev.hall_id]}44">
									{ev.title}
								</a>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</div>
</div>

<style>
	.page { padding: 24px 32px; height: 100%; display: flex; flex-direction: column; overflow: hidden; box-sizing: border-box; }

	.cal-top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		margin-bottom: 14px;
	}

	.nav-row {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.nav-btn {
		width: 32px;
		height: 32px;
		border-radius: 8px;
		border: 1px solid var(--border);
		background: var(--bg-panel);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		color: var(--text-muted);
	}

	.nav-btn:hover { background: var(--accent-dim); color: var(--accent); border-color: var(--accent); }

	.month-label { font-size: 15px; font-weight: 600; min-width: 160px; text-align: center; }

	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 14px;
		margin-bottom: 14px;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: var(--text-muted);
	}

	.legend-dot {
		width: 10px;
		height: 10px;
		border-radius: 3px;
	}

	.calendar {
		flex: 1;
		display: flex;
		flex-direction: column;
		background: var(--bg-panel);
		border: 1px solid var(--border);
		border-radius: 12px;
		overflow: hidden;
	}

	.day-headers {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		background: var(--bg-panel2);
		border-bottom: 1px solid var(--border);
	}

	.day-name {
		padding: 8px;
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
		text-align: center;
	}

	/* Sunday header (last column) */
	.day-name:last-child { color: var(--danger); }

	.grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		flex: 1;
		overflow-y: auto;
	}

	.cell {
		border-right: 1px solid var(--border);
		border-bottom: 1px solid var(--border);
		padding: 6px;
		min-height: 80px;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.cell:nth-child(7n) { border-right: none; }
	.cell.empty { background: var(--bg-panel2); }
	.cell.today { background: var(--accent-dim); }
	.cell.today .cell-num { color: var(--accent); font-weight: 700; }
	.cell.sunday .cell-num { color: var(--danger); }

	.cell-num {
		font-size: 12px;
		color: var(--text-muted);
		align-self: flex-start;
	}

	.cell-events { display: flex; flex-direction: column; gap: 2px; }

	.ev-chip {
		display: block;
		padding: 2px 6px;
		border-radius: 4px;
		font-size: 11px;
		font-weight: 500;
		border: 1px solid transparent;
		text-decoration: none;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.ev-chip:hover { opacity: 0.85; }
</style>
