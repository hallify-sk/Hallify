<script lang="ts">
	import { goto } from '$app/navigation';
	import { t } from '$lib/i18n.svelte';
	import SectionHeader from '$lib/components/SectionHeader.svelte';
	import MiniCalendar from '$lib/components/MiniCalendar.svelte';
	import KpiCard from '$lib/components/KpiCard.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import type { PageData } from './$types';

	interface Props { data: PageData; }
	const { data }: Props = $props();

	function formatDate(d: Date | string) {
		return new Date(d).toLocaleDateString('sk-SK', {
			weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
		});
	}

	function shortDate(d: Date | string) {
		return new Date(d).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short', year: 'numeric' });
	}
</script>

<svelte:head><title>{t.dashboard.eventOverview} – Hallify</title></svelte:head>

<div class="page">
	<div class="page-top">
		<SectionHeader overline={t.dashboard.overview} title={t.dashboard.infoPanel} />
		<a href="/app/reservation/new" class="btn-primary">
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
				<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
			</svg>
			{t.nav.createEvent}
		</a>
	</div>

	<div class="kpi-row">
		<div style="animation-delay: 0ms" class="kpi-item">
			<KpiCard label={t.dashboard.totalEvents} value={data.stats.total} />
		</div>
		<div style="animation-delay: 80ms" class="kpi-item">
			<KpiCard label={t.dashboard.upcomingEvents} value={data.stats.upcoming} />
		</div>
		<div style="animation-delay: 160ms" class="kpi-item">
			<KpiCard label={t.dashboard.finishedEvents} value={data.stats.finished} />
		</div>
		<div style="animation-delay: 240ms" class="kpi-item">
			<KpiCard label={t.dashboard.availableHalls} value={data.stats.halls} />
		</div>
	</div>

	<div class="main-grid">
		<div class="card table-card">
			<h2>{t.dashboard.eventOverview}</h2>
			{#if data.reservations.length === 0}
				<div class="empty-state">
					<div class="empty-icon-wrap">
						<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
							<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
							<line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
						</svg>
					</div>
					<p class="empty-title">{t.dashboard.noEvents}</p>
					<p class="empty-sub">{t.dashboard.createFirst}</p>
					<a href="/app/reservation/new" class="btn-primary" style="margin-top: 16px">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
							<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
						</svg>
						{t.dashboard.createFirst.split(' ').slice(0, 3).join(' ')}
					</a>
				</div>
			{:else}
				<div class="table-wrap">
					<table>
						<thead>
							<tr>
								<th>{t.common.name}</th>
								<th>{t.dashboard.hall}</th>
								<th>{t.common.date}</th>
								<th>{t.common.status}</th>
							</tr>
						</thead>
						<tbody>
							{#each data.reservations as r}
								<tr class="clickable-row" onclick={() => goto('/app/reservation/' + r.id)}>
									<td>
										<span class="row-link">{r.title}</span>
									</td>
									<td class="text-muted">{r.hall_name}</td>
									<td class="text-muted">{shortDate(r.event_date)}</td>
									<td><StatusBadge status={r.status} /></td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>

		<div class="cal-col">
			<MiniCalendar
				title={t.dashboard.scheduledEvents}
				events={data.eventDates}
			/>
		</div>
	</div>
</div>

<style>
	@keyframes pageFadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	@keyframes fadeSlideUp {
		from {
			opacity: 0;
			transform: translateY(12px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.page {
		padding: 32px 40px;
		animation: pageFadeIn 0.1s ease both;
	}

	.page-top {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 24px;
	}

	.btn-primary {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		padding: 9px 18px;
		background: var(--accent);
		color: #fff;
		font-size: 13px;
		font-weight: 600;
		border-radius: 8px;
		text-decoration: none;
		letter-spacing: 0.01em;
		transition: opacity 0.15s ease, box-shadow 0.15s ease;
		box-shadow: 0 2px 12px var(--accent-dim, rgba(79, 110, 247, 0.35));
		white-space: nowrap;
		flex-shrink: 0;
	}

	.btn-primary:hover {
		opacity: 0.88;
		box-shadow: 0 4px 20px var(--accent-dim, rgba(79, 110, 247, 0.45));
	}

	.kpi-row {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 16px;
		margin-bottom: 24px;
	}

	.kpi-item {
		animation: fadeSlideUp 0.4s ease both;
	}

	.kpi-item > :global(*) {
		height: 100%;
	}

	.main-grid {
		display: grid;
		grid-template-columns: 1fr 320px;
		gap: 20px;
	}

	.table-card {
		animation: fadeSlideUp 0.4s ease both;
		animation-delay: 320ms;
	}

	.cal-col {
		animation: fadeSlideUp 0.4s ease both;
		animation-delay: 400ms;
	}

	.table-card h2 {
		font-size: 15px;
		font-weight: 600;
		color: var(--text-base);
		margin-bottom: 16px;
	}

	.table-wrap {
		overflow-x: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
	}

	thead tr {
		background: linear-gradient(to right, var(--bg-panel2), transparent);
	}

	th {
		text-align: left;
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
		padding: 10px 14px;
		border-bottom: 1px solid var(--border);
	}

	th:first-child { border-radius: 8px 0 0 0; }
	th:last-child { border-radius: 0 8px 0 0; }

	td {
		padding: 12px 14px;
		font-size: 14px;
		border-bottom: 1px solid var(--border);
	}

	tr:last-child td { border-bottom: none; }

	.clickable-row { cursor: pointer; }
	.clickable-row:hover td { background: var(--bg-panel2); }

	.text-muted { color: var(--text-muted); }

	.row-link {
		font-weight: 600;
		color: var(--text-base);
	}

	.clickable-row:hover .row-link { color: var(--accent); }

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding: 64px 40px;
		text-align: center;
	}

	.empty-icon-wrap {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 64px;
		height: 64px;
		border-radius: 16px;
		background: var(--bg-panel2);
		border: 1px solid var(--border);
		color: var(--text-subtle);
		margin-bottom: 4px;
	}

	.empty-title {
		font-size: 16px;
		font-weight: 600;
		color: var(--text-base);
		margin: 0;
	}

	.empty-sub {
		font-size: 13px;
		color: var(--text-muted);
		margin: 0;
		max-width: 280px;
		line-height: 1.5;
	}
</style>
