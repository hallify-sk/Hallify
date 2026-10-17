<script lang="ts">
	import { t } from '$lib/i18n.svelte';

	interface Props {
		selectedDate?: string;
		events?: string[];           // soft markers (dots)
		blockedDates?: string[];     // unavailable by hall rules (hatch)
		takenDates?: string[];       // already booked (filled, non-selectable)
		heldDates?: string[];        // held by someone else right now (amber, non-selectable)
		minDate?: string;            // earliest selectable day (YYYY-MM-DD); earlier days are disabled
		showLegend?: boolean;
		onselect?: (date: string) => void;
	}
	const {
		selectedDate, events = [], blockedDates = [], takenDates = [], heldDates = [],
		minDate, showLegend = false, onselect,
	}: Props = $props();

	let viewYear = $state(new Date().getFullYear());
	let viewMonth = $state(new Date().getMonth());

	const today = new Date();
	const todayStr = $derived(
		`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
	);

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

	const cells = $derived.by(() => {
		const firstDay = new Date(viewYear, viewMonth, 1);
		const lastDay = new Date(viewYear, viewMonth + 1, 0);
		const daysInMonth = lastDay.getDate();

		// Monday = 0, Sunday = 6
		let startDow = firstDay.getDay() - 1;
		if (startDow < 0) startDow = 6;

		type Cell = { day: number; iso: string; inMonth: boolean; isToday: boolean; isSunday: boolean; hasEvent: boolean; isBlocked: boolean; isTaken: boolean; isHeld: boolean; isPast: boolean; isSelected: boolean };
		const rows: Cell[][] = [];
		let row: Cell[] = [];
		const fill = (day: number, iso: string, isSunday: boolean): Cell => ({ day, iso, inMonth: false, isToday: false, isSunday, hasEvent: false, isBlocked: false, isTaken: false, isHeld: false, isPast: false, isSelected: false });

		// Previous month fill
		const prevLast = new Date(viewYear, viewMonth, 0).getDate();
		for (let i = startDow - 1; i >= 0; i--) {
			const d = prevLast - i;
			const m = viewMonth === 0 ? 11 : viewMonth - 1;
			const y = viewMonth === 0 ? viewYear - 1 : viewYear;
			row.push(fill(d, toIso(y, m, d), false));
		}

		// Current month
		for (let d = 1; d <= daysInMonth; d++) {
			const iso = toIso(viewYear, viewMonth, d);
			const dow = new Date(viewYear, viewMonth, d).getDay();
			row.push({
				day: d,
				iso,
				inMonth: true,
				isToday: iso === todayStr,
				isSunday: dow === 0,
				hasEvent: events.includes(iso),
				isBlocked: blockedDates.includes(iso),
				isTaken: takenDates.includes(iso),
				isHeld: heldDates.includes(iso),
				isPast: !!minDate && iso < minDate,
				isSelected: iso === selectedDate,
			});
			if (row.length === 7) { rows.push(row); row = []; }
		}

		// Next month fill
		if (row.length > 0) {
			let nd = 1;
			while (row.length < 7) {
				const m = viewMonth === 11 ? 0 : viewMonth + 1;
				const y = viewMonth === 11 ? viewYear + 1 : viewYear;
				row.push(fill(nd, toIso(y, m, nd), new Date(y, m, nd).getDay() === 0));
				nd++;
			}
			rows.push(row);
		}

		return rows;
	});

	function isLocked(cell: { isBlocked: boolean; isTaken: boolean; isHeld: boolean; isPast: boolean }) {
		return cell.isBlocked || cell.isTaken || cell.isHeld || cell.isPast;
	}

	function onDayClick(cell: (typeof cells)[0][0]) {
		if (!onselect || !cell.inMonth || isLocked(cell)) return;
		onselect(cell.iso);
	}
</script>

<div class="mini-cal">
	<div class="cal-nav">
		<div class="cal-month-display">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2">
				<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
				<line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
			</svg>
			<span>{t.monthNames[viewMonth]} {viewYear}</span>
		</div>
		<div class="cal-nav-btns">
			<button type="button" onclick={prevMonth} class="cal-arrow" aria-label={t.components.prevMonth}>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>
			</button>
			<button type="button" onclick={nextMonth} class="cal-arrow" aria-label={t.components.nextMonth}>
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
			</button>
		</div>
	</div>

	<table class="cal-grid">
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
						<td>
							<button
								type="button"
								class="cal-day"
								class:out={!cell.inMonth}
								class:today={cell.isToday}
								class:sunday={cell.isSunday && cell.inMonth}
								class:blocked={cell.isBlocked}
								class:taken={cell.isTaken}
								class:held={cell.isHeld}
								class:past={cell.isPast && cell.inMonth}
								class:selected={cell.isSelected}
								class:clickable={!!onselect && cell.inMonth && !isLocked(cell)}
								onclick={() => onDayClick(cell)}
								disabled={!onselect || !cell.inMonth || isLocked(cell)}
								title={cell.isTaken ? t.components.calBooked : cell.isHeld ? t.components.calBeingBooked : cell.isBlocked ? t.components.calUnavailable : ''}
							>
								{cell.day}
								{#if cell.hasEvent && !cell.isTaken}
									<span class="event-dot"></span>
								{/if}
							</button>
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>

	{#if showLegend}
		<div class="cal-legend">
			<span class="lg"><span class="lg-dot lg-taken"></span>{t.components.calBooked}</span>
			<span class="lg"><span class="lg-dot lg-held"></span>{t.components.legendOnHold}</span>
			<span class="lg"><span class="lg-dot lg-blocked"></span>{t.components.calUnavailable}</span>
		</div>
	{/if}
</div>

<style>
	/* No box and no padding of its own: the calendar sits in whatever section or
	   field holds it, and takes its rhythm from the density. */
	.mini-cal { min-width: 0; }

	.cal-nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: var(--grid-gap);
	}

	.cal-month-display {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 14px;
		font-weight: 500;
		color: var(--text-base);
	}

	.cal-nav-btns {
		display: flex;
		gap: 4px;
	}

	.cal-arrow {
		width: 32px;
		height: 32px;
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

	.cal-arrow:hover {
		background: var(--bg-hover);
		color: var(--text-base);
	}

	.cal-grid {
		width: 100%;
		border-collapse: collapse;
	}

	.cal-grid th {
		font-size: 12px;
		font-weight: 600;
		color: var(--text-muted);
		text-transform: none;
		text-align: center;
		padding: 0 0 10px;
		letter-spacing: 0;
	}

	.cal-grid td {
		text-align: center;
		padding: 2px;
	}

	.cal-day {
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		/* Square, like every other surface in this language. The round cell was the
		   last leftover of the old design here. */
		border-radius: var(--radius-sm);
		font-size: 13px;
		font-weight: 500;
		color: var(--text-base);
		background: none;
		border: none;
		cursor: default;
		position: relative;
		margin: 0 auto;
		font-family: inherit;
		transition: background .15s, color .15s;
	}

	.cal-day.out {
		color: var(--border);
	}

	/* Today is an accent FILL, so its numeral takes --accent-contrast; white on
	   the accent only reaches 3.1:1. */
	.cal-day.today {
		background: var(--accent);
		color: var(--accent-contrast);
		font-weight: 650;
	}

	.cal-day.sunday:not(.today) {
		color: var(--danger);
	}

	.cal-day.blocked {
		color: var(--danger);
		text-decoration: line-through;
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* Already booked — solid filled + struck through so it's unmistakable in any
	   theme (the old faint tint was invisible in dark mode). No PII: only that
	   the day is taken, never by whom. */
	.cal-day.taken:not(.today) {
		background: color-mix(in srgb, var(--text-muted) 34%, var(--bg-panel));
		color: var(--text-subtle);
		text-decoration: line-through;
		text-decoration-color: color-mix(in srgb, var(--text-muted) 55%, transparent);
		cursor: not-allowed;
	}

	/* Held by someone else right now */
	.cal-day.held:not(.today) {
		background: color-mix(in srgb, var(--warning) 32%, var(--bg-panel));
		color: color-mix(in srgb, var(--warning) 70%, var(--text-base));
		cursor: not-allowed;
	}

	/* Past / before min-advance */
	.cal-day.past {
		color: var(--border);
		cursor: not-allowed;
	}
	.cal-day.past.sunday { color: var(--border); }

	/* Selected day: soft accent wash, so the label is the accent INK, not the fill. */
	.cal-day.selected:not(.today) {
		background: var(--accent-dim);
		color: var(--accent-ink);
		font-weight: 650;
	}

	.cal-day.clickable {
		cursor: pointer;
	}

	.cal-day.clickable:hover:not(.today):not(.selected) {
		background: var(--bg-hover);
	}

	.event-dot {
		position: absolute;
		bottom: 2px;
		left: 50%;
		transform: translateX(-50%);
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--accent);
	}
	/* On the today cell the dot sits ON an accent fill, where accent-on-accent
	   disappears — a mark on a fill takes --accent-contrast. */
	.cal-day.today .event-dot { background: var(--accent-contrast); }
	/* Same problem one step lighter: on the selected day's --accent-dim wash an
	   accent dot is 2.6:1. The ink is 6.2:1. */
	.cal-day.selected:not(.today) .event-dot { background: var(--accent-ink); }

	.cal-legend {
		display: flex;
		gap: 14px;
		flex-wrap: wrap;
		margin-top: 14px;
		padding-top: 12px;
		border-top: 1px solid var(--border-subtle);
	}
	.lg { display: inline-flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text-muted); }
	.lg-dot { width: 10px; height: 10px; border-radius: 50%; }
	.lg-taken { background: color-mix(in srgb, var(--text-muted) 45%, transparent); }
	.lg-held { background: color-mix(in srgb, var(--warning) 60%, transparent); }
	.lg-blocked { background: color-mix(in srgb, var(--danger) 55%, transparent); }
</style>
