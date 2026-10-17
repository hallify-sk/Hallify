<script lang="ts">
	import { t } from '$lib/i18n.svelte';

	interface Props {
		startDate?: string;
		endDate?: string;
		onchange?: (start: string, end: string) => void;
		blockedDates?: string[];
		eventDates?: string[];
	}
	const { startDate = '', endDate = '', onchange, blockedDates = [], eventDates = [] }: Props = $props();

	let viewYear = $state(new Date().getFullYear());
	let viewMonth = $state(new Date().getMonth());
	let selStart = $state(startDate);
	let selEnd = $state(endDate);
	let hoveredDate = $state('');

	const today = new Date();
	const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

	function prevMonth() {
		if (viewMonth === 0) { viewMonth = 11; viewYear--; }
		else viewMonth--;
	}
	function nextMonth() {
		if (viewMonth === 11) { viewMonth = 0; viewYear++; }
		else viewMonth++;
	}

	function toIso(y: number, m: number, d: number) {
		return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
	}

	function isInRange(iso: string): boolean {
		const start = selStart;
		const end = selEnd || hoveredDate;
		if (!start || !end) return false;
		const lo = start < end ? start : end;
		const hi = start < end ? end : start;
		return iso >= lo && iso <= hi;
	}

	function isRangeStart(iso: string): boolean {
		if (!selStart) return false;
		const end = selEnd || hoveredDate;
		if (!end) return iso === selStart;
		return iso === (selStart < end ? selStart : end);
	}

	function isRangeEnd(iso: string): boolean {
		const end = selEnd || hoveredDate;
		if (!selStart || !end) return false;
		return iso === (selStart < end ? end : selStart);
	}

	const cells = $derived.by(() => {
		const firstDay = new Date(viewYear, viewMonth, 1);
		const lastDay = new Date(viewYear, viewMonth + 1, 0);
		const daysInMonth = lastDay.getDate();

		let startDow = firstDay.getDay() - 1;
		if (startDow < 0) startDow = 6;

		const rows: { day: number; iso: string; inMonth: boolean; isToday: boolean; isSunday: boolean; isBlocked: boolean; isPast: boolean; hasEvent: boolean }[][] = [];
		let row: typeof rows[0] = [];

		const prevLast = new Date(viewYear, viewMonth, 0).getDate();
		for (let i = startDow - 1; i >= 0; i--) {
			const d = prevLast - i;
			const m = viewMonth === 0 ? 11 : viewMonth - 1;
			const y = viewMonth === 0 ? viewYear - 1 : viewYear;
			const iso = toIso(y, m, d);
			row.push({ day: d, iso, inMonth: false, isToday: false, isSunday: false, isBlocked: false, isPast: false, hasEvent: false });
		}

		for (let d = 1; d <= daysInMonth; d++) {
			const iso = toIso(viewYear, viewMonth, d);
			const dow = new Date(viewYear, viewMonth, d).getDay();
			row.push({
				day: d,
				iso,
				inMonth: true,
				isToday: iso === todayStr,
				isSunday: dow === 0,
				isBlocked: blockedDates.includes(iso),
				isPast: iso < todayStr,
				hasEvent: eventDates.includes(iso),
			});
			if (row.length === 7) { rows.push(row); row = []; }
		}

		if (row.length > 0) {
			let nd = 1;
			while (row.length < 7) {
				const m = viewMonth === 11 ? 0 : viewMonth + 1;
				const y = viewMonth === 11 ? viewYear + 1 : viewYear;
				const iso = toIso(y, m, nd);
				row.push({ day: nd, iso, inMonth: false, isToday: false, isSunday: new Date(y, m, nd).getDay() === 0, isBlocked: false, isPast: false, hasEvent: false });
				nd++;
			}
			rows.push(row);
		}

		return rows;
	});

	function onDayClick(cell: (typeof cells)[0][0]) {
		if (!cell.inMonth || cell.isBlocked || cell.isPast) return;

		if (!selStart || selEnd) {
			selStart = cell.iso;
			selEnd = '';
		} else {
			if (cell.iso < selStart) {
				selEnd = selStart;
				selStart = cell.iso;
			} else {
				selEnd = cell.iso;
			}
			onchange?.(selStart, selEnd);
		}
	}

	function formatDate(iso: string): string {
		if (!iso) return '';
		const d = new Date(iso + 'T00:00:00');
		return d.toLocaleDateString('sk-SK', { day: 'numeric', month: 'short', year: 'numeric' });
	}
</script>

<div class="range-picker card card--raised">
	<div class="rp-nav">
		<div class="rp-month">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2">
				<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
				<line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
			</svg>
			<span>{t.monthNames[viewMonth].toLowerCase()} {viewYear}</span>
		</div>
		<div class="rp-nav-btns">
			<button onclick={prevMonth} class="rp-arrow" type="button" aria-label={t.components.prevMonth}>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
			</button>
			<button onclick={nextMonth} class="rp-arrow" type="button" aria-label={t.components.nextMonth}>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 6 15 12 9 18"/></svg>
			</button>
		</div>
	</div>

	<table class="rp-grid">
		<thead>
			<tr>
				{#each t.dayNames as dn}
					<th>{dn}</th>
				{/each}
			</tr>
		</thead>
		<tbody>
			{#each cells as row}
				<tr>
					{#each row as cell}
						<td
							class:in-range={cell.inMonth && isInRange(cell.iso) && !isRangeStart(cell.iso) && !isRangeEnd(cell.iso)}
							class:range-start={cell.inMonth && isInRange(cell.iso) && isRangeStart(cell.iso) && !isRangeEnd(cell.iso)}
							class:range-end={cell.inMonth && isInRange(cell.iso) && isRangeEnd(cell.iso) && !isRangeStart(cell.iso)}
							class:range-single={cell.inMonth && isRangeStart(cell.iso) && isRangeEnd(cell.iso)}
						>
							<button
								class="rp-day"
								class:out={!cell.inMonth}
								class:today={cell.isToday}
								class:sunday={cell.isSunday && cell.inMonth}
								class:blocked={cell.isBlocked}
								class:past={cell.isPast}
								class:has-event={cell.hasEvent && cell.inMonth}
								class:selected={cell.inMonth && (cell.iso === selStart || cell.iso === selEnd)}
								class:clickable={cell.inMonth && !cell.isBlocked && !cell.isPast}
								type="button"
								onclick={() => onDayClick(cell)}
								onmouseenter={() => { if (selStart && !selEnd && cell.inMonth && !cell.isPast) hoveredDate = cell.iso; }}
								onmouseleave={() => { hoveredDate = ''; }}
								disabled={cell.isBlocked || cell.isPast}
							>
								{cell.day}
								{#if cell.hasEvent && cell.inMonth}
									<span class="event-dot"></span>
								{/if}
							</button>
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>

	{#if selStart}
		<div class="rp-selection row-item">
			<span class="rp-sel-label">{formatDate(selStart)}</span>
			{#if selEnd}
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
				<span class="rp-sel-label">{formatDate(selEnd)}</span>
			{:else}
				<span class="rp-sel-hint">{t.halls.dateTo}…</span>
			{/if}
			<button class="rp-clear" type="button" onclick={() => { selStart = ''; selEnd = ''; }}>
				<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
			</button>
		</div>
	{/if}
</div>

<style>
	/* A picker genuinely floats above the page it edits, so this one keeps a
	   surface — .card--raised supplies it. No local chrome. */

	.rp-nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--grid-gap);
	}

	.rp-month {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
		font-weight: 500;
		color: var(--text-base);
	}

	.rp-nav-btns {
		display: flex;
		gap: 4px;
	}

	.rp-arrow {
		width: 30px;
		height: 30px;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: var(--bg-panel);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		color: var(--text-muted);
		transition: background .15s, color .15s;
	}
	.rp-arrow:hover { background: var(--bg-hover); color: var(--text-base); }

	.rp-grid {
		width: 100%;
		border-collapse: collapse;
	}

	.rp-grid th {
		font-size: 11px;
		font-weight: 600;
		color: var(--text-muted);
		text-align: center;
		padding: 0 0 8px;
		letter-spacing: 0;
	}

	.rp-grid td {
		text-align: center;
		padding: 1px 0;
	}

	/* Range band — flat rectangle, no border-radius */
	.rp-grid td.in-range {
		background: var(--accent-dim);
	}
	.rp-grid td.range-start {
		background: linear-gradient(to right, transparent 50%, var(--accent-dim) 50%);
	}
	.rp-grid td.range-end {
		background: linear-gradient(to left, transparent 50%, var(--accent-dim) 50%);
	}
	.rp-grid td.range-single {
		background: none;
	}

	.rp-day {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		font-size: 12px;
		font-weight: 500;
		color: var(--text-base);
		background: none;
		border: none;
		cursor: default;
		margin: 0 auto;
		font-family: inherit;
		transition: background .15s, box-shadow .15s, color .15s;
		position: relative;
	}

	.rp-day.out { color: var(--border); }
	/* Today: ring outline (not filled) so it's distinct from selected. The ring is
	   an accent FILL; the numeral on paper has to be the accent ink. */
	.rp-day.today:not(.selected) { box-shadow: inset 0 0 0 2px var(--accent); color: var(--accent-ink); font-weight: 650; }
	/* Selected (range bounds): filled accent — white fails on it, so the label
	   takes --accent-contrast. */
	.rp-day.selected { background: var(--accent); color: var(--accent-contrast); font-weight: 650; }
	.rp-day.sunday:not(.today):not(.selected) { color: var(--danger); }
	.rp-day.blocked { color: var(--danger); text-decoration: line-through; opacity: 0.5; }
	.rp-day.past { color: var(--text-muted); opacity: 0.4; }
	.rp-day.clickable { cursor: pointer; }
	.rp-day.clickable:hover:not(.today):not(.selected) { background: var(--bg-hover); }

	.event-dot {
		position: absolute;
		bottom: 2px;
		left: 50%;
		transform: translateX(-50%);
		width: 4px;
		height: 4px;
		border-radius: 50%;
		background: var(--warning);
	}
	/* On a selected endpoint the dot sits ON the accent fill, where the warning
	   amber drops to 1.7:1. A mark on a fill takes --accent-contrast. */
	.rp-day.selected .event-dot { background: var(--accent-contrast); }

	/* The chosen range reads as a hairline row under the grid, not a sub-panel. */
	.rp-selection {
		gap: 8px;
		margin-top: 12px;
		border-top: 1px solid var(--border-subtle);
		font-size: 13px;
		color: var(--text-base);
	}

	.rp-sel-label { font-weight: 600; }
	.rp-sel-hint { color: var(--text-muted); font-style: italic; }

	.rp-clear {
		margin-left: auto;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		border: none;
		background: none;
		color: var(--text-muted);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background .15s, color .15s;
	}
	.rp-clear:hover { background: var(--bg-hover); color: var(--text-base); }
</style>
