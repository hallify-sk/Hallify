<script lang="ts">
	import { t } from '$lib/i18n';

	interface Props {
		selectedDate?: string;
		events?: string[];
		blockedDates?: string[];
		onselect?: (date: string) => void;
		title?: string;
	}
	const { selectedDate, events = [], blockedDates = [], onselect, title }: Props = $props();

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

		const rows: { day: number; iso: string; inMonth: boolean; isToday: boolean; isSunday: boolean; hasEvent: boolean; isBlocked: boolean; isSelected: boolean }[][] = [];
		let row: typeof rows[0] = [];

		// Previous month fill
		const prevLast = new Date(viewYear, viewMonth, 0).getDate();
		for (let i = startDow - 1; i >= 0; i--) {
			const d = prevLast - i;
			const m = viewMonth === 0 ? 11 : viewMonth - 1;
			const y = viewMonth === 0 ? viewYear - 1 : viewYear;
			const iso = toIso(y, m, d);
			row.push({ day: d, iso, inMonth: false, isToday: false, isSunday: false, hasEvent: false, isBlocked: false, isSelected: false });
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
				const iso = toIso(y, m, nd);
				row.push({ day: nd, iso, inMonth: false, isToday: false, isSunday: new Date(y, m, nd).getDay() === 0, hasEvent: false, isBlocked: false, isSelected: false });
				nd++;
			}
			rows.push(row);
		}

		return rows;
	});

	function onDayClick(cell: (typeof cells)[0][0]) {
		if (!onselect) return;
		if (cell.isBlocked) return;
		onselect(cell.iso);
	}
</script>

<div class="mini-cal card">
	{#if title}
		<div class="cal-title">{title}</div>
	{/if}

	<div class="cal-nav">
		<div class="cal-month-display">
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2">
				<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
				<line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
			</svg>
			<span>{t.monthNames[viewMonth].toLowerCase()} {viewYear}</span>
		</div>
		<div class="cal-nav-btns">
			<button onclick={prevMonth} class="cal-arrow" aria-label="Previous month">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="5" y1="12" x2="19" y2="12"/></svg>
			</button>
			<button onclick={nextMonth} class="cal-arrow" aria-label="Next month">
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
								class="cal-day"
								class:out={!cell.inMonth}
								class:today={cell.isToday}
								class:sunday={cell.isSunday && cell.inMonth}
								class:blocked={cell.isBlocked}
								class:selected={cell.isSelected}
								class:clickable={!!onselect && cell.inMonth && !cell.isBlocked}
								onclick={() => cell.inMonth && onDayClick(cell)}
								disabled={cell.isBlocked && !!onselect}
							>
								{cell.day}
								{#if cell.hasEvent}
									<span class="event-dot"></span>
								{/if}
							</button>
						</td>
					{/each}
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.mini-cal {
		padding: 20px;
	}

	.cal-title {
		font-size: 15px;
		font-weight: 600;
		margin-bottom: 16px;
	}

	.cal-nav {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 16px;
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
		border-radius: 6px;
		border: 1px solid var(--border);
		background: var(--bg-panel);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		color: var(--text-muted);
		transition: background 0.12s;
	}

	.cal-arrow:hover {
		background: var(--bg-panel2);
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
		border-radius: 50%;
		font-size: 13px;
		font-weight: 500;
		color: var(--text-base);
		background: none;
		border: none;
		cursor: default;
		position: relative;
		margin: 0 auto;
		font-family: inherit;
	}

	.cal-day.out {
		color: var(--border);
	}

	.cal-day.today {
		background: var(--accent);
		color: #fff;
		font-weight: 700;
	}

	.cal-day.sunday:not(.today) {
		color: var(--danger);
	}

	.cal-day.blocked {
		color: var(--danger);
		text-decoration: line-through;
		opacity: 0.5;
	}

	.cal-day.selected:not(.today) {
		background: var(--accent-dim);
		color: var(--accent);
		font-weight: 700;
	}

	.cal-day.clickable {
		cursor: pointer;
	}

	.cal-day.clickable:hover:not(.today):not(.selected) {
		background: var(--bg-panel2);
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
</style>
