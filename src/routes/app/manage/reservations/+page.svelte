<script lang="ts">
	import { t } from '$lib/i18n.svelte';
	import type { PageData } from './$types';
	import type { ReservationStatus } from '$lib/db';

	interface Props { data: PageData; }
	const { data }: Props = $props();

	let filter = $state<'all' | ReservationStatus>('all');

	// An event whose date is before today (UTC) has passed.
	const todayISO = new Date().toISOString().slice(0, 10);
	const isPastEvent = (d: string) => d.slice(0, 10) < todayISO;

	const filtered = $derived(
		filter === 'all'
			? data.reservations
			: data.reservations.filter(r => r.status === filter)
	);

	const statusOptions: ReservationStatus[] = ['pending', 'waiting_payment', 'approved', 'planned', 'completed', 'cancelled'];

	function formatDate(d: Date | string) {
		const date = new Date(d);
		return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
	}

	function cnt(s: ReservationStatus) {
		return data.reservations.filter(r => r.status === s).length;
	}

	const STATUS_COLOR: Record<string, string> = {
		pending:         '--s-amber',
		waiting_payment: '--s-indigo',
		approved:        '--s-green',
		planned:         '--s-blue',
		completed:       '--s-slate',
		cancelled:       '--s-red',
	};
</script>

<svelte:head><title>{t.adminReservations.title} – Hallify</title></svelte:head>

<div class="page">

	<div class="page-header">
		<div class="page-header-left">
			<h1 class="page-title">{t.adminReservations.title}</h1>
			<span class="total-badge">{data.reservations.length}</span>
		</div>
	</div>

	<div class="filters">
		<button class="filter-btn" class:active={filter === 'all'} onclick={() => filter = 'all'}>
			All
			<span class="f-count">{data.reservations.length}</span>
		</button>
		{#each statusOptions as s}
			{@const c = cnt(s)}
			{#if c > 0}
				<button class="filter-btn" class:active={filter === s} onclick={() => filter = s}
					style:--sc={`var(${STATUS_COLOR[s] ?? '--s-slate'})`}>
					{(t.status as Record<string, string>)[s]}
					<span class="f-count">{c}</span>
				</button>
			{/if}
		{/each}
	</div>

	<div class="card table-wrap">
		{#if filtered.length === 0}
			<div class="empty-state">
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
				<span>{t.adminReservations.noReservations}</span>
			</div>
		{:else}
			<table>
				<thead>
					<tr>
						<th>{t.adminReservations.event}</th>
						<th>{t.adminReservations.user}</th>
						<th>{t.adminReservations.hall}</th>
						<th>{t.adminReservations.date}</th>
						<th>{t.adminReservations.status}</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each filtered as res}
						{@const sc = STATUS_COLOR[res.status] ?? '--s-slate'}
						<tr onclick={() => window.location.href = `/app/reservation/${res.id}`} class="res-row" class:is-past={isPastEvent(res.event_date) && res.status !== 'cancelled'}>
							<td class="td-title">
								<span class="res-title">{res.title}</span>
								{#if isPastEvent(res.event_date) && res.status !== 'cancelled'}<span class="past-tag">{t.event.past}</span>{/if}
							</td>
							<td class="td-user">
								<span class="user-name">{res.user_first_name} {res.user_last_name}</span>
								<span class="user-email">{res.user_email}</span>
							</td>
							<td class="td-hall">{res.hall_name}</td>
							<td class="td-date">{formatDate(res.event_date)}</td>
							<td class="td-status">
								<span class="status-pill" style:--sc={`var(${sc})`}>
									{(t.status as Record<string, string>)[res.status]}
								</span>
							</td>
							<td class="td-arrow">
								<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		{/if}
	</div>

</div>

<style>
	:root {
		--s-amber:  #f59e0b;
		--s-indigo: #6366f1;
		--s-green:  #22c55e;
		--s-blue:   #3b82f6;
		--s-slate:  #94a3b8;
		--s-red:    #ef4444;
	}

	@keyframes fadeSlideUp {
		from { opacity: 0; transform: translateY(10px); }
		to   { opacity: 1; transform: translateY(0); }
	}

	.page { padding: 24px 28px; animation: fadeSlideUp .2s ease both; }

	.page-header {
		display: flex; align-items: center; justify-content: space-between;
		margin-bottom: 18px;
	}
	.page-header-left { display: flex; align-items: center; gap: 10px; }
	.page-title { font-size: 18px; font-weight: 800; color: var(--text-base); letter-spacing: -.025em; }
	.total-badge {
		font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 99px;
		background: color-mix(in srgb, var(--accent) 10%, transparent);
		color: var(--accent);
	}

	/* ── Filter pills ── */
	.filters { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 16px; }

	.filter-btn {
		display: inline-flex; align-items: center; gap: 6px;
		padding: 5px 13px; border-radius: 99px; font-size: 12px; font-weight: 500;
		background: var(--bg-panel); border: 1px solid var(--border);
		color: var(--text-muted); cursor: pointer; font-family: inherit;
		transition: border-color .12s, color .12s, background .12s;
	}
	.filter-btn:hover { border-color: var(--accent); color: var(--text-base); }
	.filter-btn.active {
		background: color-mix(in srgb, var(--sc, var(--accent)) 10%, transparent);
		border-color: color-mix(in srgb, var(--sc, var(--accent)) 35%, transparent);
		color: var(--sc, var(--accent));
		font-weight: 600;
	}
	.f-count {
		font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 99px;
		background: var(--bg-panel2, var(--bg-base));
	}
	.filter-btn.active .f-count {
		background: color-mix(in srgb, var(--sc, var(--accent)) 15%, transparent);
	}

	/* ── Table card ── */
	.card {
		background: var(--bg-panel); border: 1px solid var(--border);
		border-radius: 12px; overflow: hidden;
	}
	.table-wrap { overflow-x: auto; }

	table { width: 100%; border-collapse: collapse; }

	thead { position: sticky; top: 0; z-index: 1; }
	th {
		padding: 10px 14px; text-align: left;
		font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em;
		color: var(--text-subtle); background: var(--bg-panel2, var(--bg-base));
		border-bottom: 1px solid var(--border); white-space: nowrap;
	}

	td { padding: 11px 14px; border-bottom: 1px solid var(--border-subtle, var(--border)); vertical-align: middle; }
	tbody tr:last-child td { border-bottom: none; }

	.res-row { cursor: pointer; transition: background .1s; }
	.res-row:hover td { background: var(--bg-hover); }
	.res-row.is-past td { opacity: .62; }
	.res-row.is-past:hover td { opacity: 1; }
	.past-tag {
		display: inline-block; margin-left: 8px; padding: 1px 7px; border-radius: 99px;
		font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em;
		color: var(--text-muted); background: var(--bg-hover); border: 1px solid var(--border); vertical-align: middle;
	}

	.td-title { max-width: 260px; }
	.res-title { font-size: 13px; font-weight: 600; color: var(--text-base); }

	.td-user { min-width: 160px; }
	.user-name  { display: block; font-size: 13px; font-weight: 500; color: var(--text-base); }
	.user-email { display: block; font-size: 11px; color: var(--text-subtle); margin-top: 1px; }

	.td-hall { font-size: 13px; color: var(--text-muted); white-space: nowrap; }
	.td-date  { font-size: 12px; font-weight: 600; color: var(--text-muted); white-space: nowrap; }

	.status-pill {
		display: inline-flex; align-items: center;
		padding: 3px 9px; border-radius: 99px; font-size: 11px; font-weight: 600; white-space: nowrap;
		background: color-mix(in srgb, var(--sc) 12%, transparent);
		color: var(--sc);
	}

	.td-arrow { width: 24px; color: var(--text-subtle); opacity: .4; }
	.res-row:hover .td-arrow { opacity: 1; color: var(--accent); }

	/* ── Empty state ── */
	.empty-state {
		display: flex; align-items: center; gap: 10px; justify-content: center;
		padding: 52px 20px; font-size: 13px; color: var(--text-subtle);
	}
</style>
