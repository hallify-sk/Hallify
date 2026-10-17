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

	function shortDate(d: Date | string) {
		return new Date(d).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short', year: 'numeric' });
	}
</script>

<svelte:head><title>{t.dashboard.eventOverview} – Hallify</title></svelte:head>

<div class="wrap">
	<div class="section section--lead page-top">
		<SectionHeader overline={t.dashboard.overview} title={t.dashboard.infoPanel} />
		<a href="/app/reservation/new" class="btn-action">
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
				<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
			</svg>
			{t.nav.createEvent}
		</a>
	</div>

	<section class="section stat-strip">
		<KpiCard label={t.dashboard.totalEvents} value={data.stats.total} />
		<KpiCard label={t.dashboard.upcomingEvents} value={data.stats.upcoming} />
		<KpiCard label={t.dashboard.finishedEvents} value={data.stats.finished} />
		<KpiCard label={t.dashboard.availableHalls} value={data.stats.halls} />
	</section>

	<!-- One section and one hairline for the pair, the same construction the admin
	     dashboard uses: `subgrid` hands both panes the parent's two rows — headings
	     in the first, bodies in the second — so the two headings sit on one line and
	     the list and the calendar start at the same y. The two columns used to be
	     two separate .sections side by side, which drew two half-width hairlines and
	     put the calendar's own 14px title where the other column had a 17px h2. -->
	<section class="section main-grid">
		<div class="pane">
			<div class="section-head">
				<h2>{t.dashboard.eventOverview}</h2>
			</div>
			<div class="pane-body">
				{#if data.reservations.length === 0}
					<div class="card--inset state-block">
						<span class="icon-tile" aria-hidden="true">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
								<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
								<line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
							</svg>
						</span>
						<h3>{t.dashboard.noEvents}</h3>
						<p>{t.dashboard.createFirst}</p>
						<!-- The label was t.dashboard.createFirst.split(' ').slice(0,3) — the
						     first three words of a whole sentence, which reads as "Vytvorte
						     svoju prvú" in Slovak and "Create your first" in English. A button
						     label needs its own key. -->
						<a href="/app/reservation/new" class="btn-action btn-sm">
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
								<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
							</svg>
							{t.nav.createEvent}
						</a>
					</div>
				{:else}
					<div class="row-list">
						<div class="row-item row-head" aria-hidden="true">
							<span class="col-name">{t.common.name}</span>
							<span class="col-hall">{t.dashboard.hall}</span>
							<span class="col-date">{t.common.date}</span>
							<span class="col-status">{t.common.status}</span>
						</div>
						{#each data.reservations as r}
							<button type="button" class="row-item row-item--bleed clickable-row" onclick={() => goto('/app/reservation/' + r.id)}>
								<span class="col-name row-link">{r.title}</span>
								<span class="col-hall text-muted">{r.hall_name}</span>
								<span class="col-date text-muted">{shortDate(r.event_date)}</span>
								<span class="col-status"><StatusBadge status={r.status} /></span>
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>

		<div class="pane">
			<div class="section-head">
				<h2>{t.dashboard.scheduledEvents}</h2>
			</div>
			<div class="pane-body">
				<!-- Without onselect the component renders every day as non-clickable, which
				     is why the dashboard calendar felt dead. The manage calendar already
				     accepts ?date=, so a day opens that day. -->
				<MiniCalendar
					events={data.eventDates}
					onselect={(iso) => goto(`/app/manage/calendar?date=${iso}`)}
				/>
			</div>
		</div>
	</section>
</div>

<style>
	/* flex-END, like the admin dashboard's header: the action sits on the title's
	   baseline rather than floating up beside the eyebrow. */
	.page-top {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 16px;
		flex-wrap: wrap;
	}
	/* SectionHeader carries its own 24px tail. Inside a .section that already pads
	   --section-pad below it, that put 24px more air under the page title than
	   under any other band on the page. */
	.page-top :global(.section-header) { margin-bottom: 0; }

	/* The KPI row as a stat strip: no boxes, just a hairline above it. */
	.stat-strip {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: var(--grid-gap);
		align-items: start;
	}

	.main-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 320px;
		grid-template-rows: auto 1fr;
		column-gap: calc(var(--grid-gap) * 1.6);
	}
	.pane {
		display: grid;
		grid-row: span 2;
		grid-template-rows: subgrid;
		min-width: 0;
	}
	.pane-body { min-width: 0; }

	/* One template for the header and the rows. Every track is an fr with a
	   floor, never `auto`: the header and each row are separate grids, so an
	   `auto` status column sized itself to the word "Status" in the header and to
	   whichever badge the row happened to carry — which is why the date and
	   status labels did not sit above their values. */
	.row-item {
		display: grid;
		grid-template-columns:
			minmax(0, 1.6fr) minmax(0, 1fr) minmax(0, 0.9fr) minmax(110px, 0.8fr);
		gap: 14px;
	}

	.row-item > span {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.clickable-row {
		font-size: var(--body-size);
		background: none;
		border: none;
		border-bottom: 1px solid var(--border-subtle);
		cursor: pointer;
	}

	.clickable-row:last-child { border-bottom: none; }

	.text-muted { color: var(--text-muted); }

	.row-link {
		font-weight: 600;
		color: var(--text-base);
	}

	.clickable-row:hover .row-link { color: var(--accent-ink); }

	@media (max-width: 900px) {
		.main-grid {
			grid-template-columns: minmax(0, 1fr);
			row-gap: var(--section-pad);
		}
		/* Stacked, the panes are one above the other, so there is nothing left to
		   level: drop the subgrid and let each one size itself. */
		.pane { grid-row: auto; grid-template-rows: auto; }
		.stat-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); }
		/* Two lines rather than a dropped column: the hall and the date stay
		   on the row, they just stack. Nothing a reservation carries is hidden. */
		.row-head { display: none; }
		.row-item {
			grid-template-columns: minmax(0, 1fr) auto;
			gap: 2px 12px;
			align-items: start;
		}
		.row-item .col-hall,
		.row-item .col-date { font-size: var(--meta-size); }
	}
</style>
