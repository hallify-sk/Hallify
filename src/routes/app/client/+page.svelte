<script lang="ts">
	import { pageTitle } from '$lib/page-title';
	import { reveal } from '$lib/reveal';
	import { t, getLocale } from '$lib/i18n.svelte';
	import { statusLabel } from '$lib/reservationStatus';
	import { formatDate as fmtLocaleDate } from '$lib/format';
	import type { PageData } from './$types';

	interface Props { data: PageData; }
	const { data }: Props = $props();

	const STATUS_CLASS: Record<string, string> = {
		pending: 'badge-warning',
		waiting_payment: 'badge-warning',
		approved: 'badge-success',
		planned: 'badge-info',
		completed: 'badge-muted',
		cancelled: 'badge-danger',
	};

	function fmtDate(d: Date | string) {
		return fmtLocaleDate(typeof d === 'string' ? d.slice(0, 10) : d, getLocale());
	}
</script>

<svelte:head><title>{pageTitle(t.nav.dashboard)}</title></svelte:head>

<div class="page">

	<section class="section section--lead section--flush">
		<div class="section-head greeting">
			<h1>{t.clientArea.welcome(data.user.first_name)}</h1>
			{#if data.upcomingCount > 0}
				<p>{t.clientArea.upcomingPre} <strong>{data.upcomingCount}</strong> {t.clientArea.upcomingWord(data.upcomingCount)}.</p>
			{:else}
				<p>{t.clientArea.noUpcoming}</p>
			{/if}
		</div>

		<a href="/app/halls" class="card--inset browse-cta">
			<span class="icon-tile cta-icon" aria-hidden="true">
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
					<path d="M3 21h18"/>
					<path d="M5 21V7l7-4 7 4v14"/>
					<path d="M9 21v-4h6v4"/>
					<rect x="9" y="9" width="2" height="2"/>
					<rect x="13" y="9" width="2" height="2"/>
					<rect x="9" y="13" width="2" height="2"/>
					<rect x="13" y="13" width="2" height="2"/>
				</svg>
			</span>
			<div>
				<strong>{t.clientArea.browseHalls}</strong>
				<span>{t.clientArea.browseHallsSub}</span>
			</div>
			<span class="cta-arrow">→</span>
		</a>
	</section>

	{#if data.reservations.length > 0}
		<section class="section" use:reveal>
			<div class="section-head section-head--row">
				<h2>{t.clientArea.myReservations}</h2>
				<a href="/app/client/reservations">{t.clientArea.viewAll} →</a>
			</div>
			<div class="row-list reservation-list">
				{#each data.reservations as r}
					<div class="row-item res-row">
						<div class="res-main">
							<span class="res-title">{r.title}</span>
							<span class="res-hall">{r.hall_name} · {r.org_name}</span>
						</div>
						<span class="res-date">{fmtDate(r.event_date)}</span>
						<span class="badge {STATUS_CLASS[r.status] ?? 'badge-muted'}">{statusLabel(r.status, getLocale())}</span>
					</div>
				{/each}
			</div>
		</section>
	{:else}
		<section class="section" use:reveal>
			<div class="card--inset empty">
				<span class="icon-tile" aria-hidden="true">
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
				</span>
				<p>{t.clientArea.noReservations}</p>
			</div>
		</section>
	{/if}
</div>

<style>
	.greeting h1 {
		font-size: var(--display-size);
		font-weight: 550;
		letter-spacing: -.055em;
		line-height: 1.08;
		color: var(--text-base);
		margin: 0 0 8px;
	}

	.browse-cta {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 20px 22px;
		background: var(--accent-dim);
		text-decoration: none;
		color: var(--text-base);
		transition: transform .2s, background .15s;
	}
	.browse-cta:hover { background: color-mix(in srgb, var(--accent) 16%, var(--bg-panel)); transform: translateY(-2px); text-decoration: none; }
	.browse-cta:active { transform: translateY(0); }

	.cta-icon { background: transparent; }

	.browse-cta div {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.browse-cta strong { font-size: 15px; font-weight: 600; letter-spacing: -.03em; }
	.browse-cta span:not(.cta-arrow):not(.cta-icon) { font-size: 13px; color: var(--text-muted); }
	.cta-arrow { font-size: 18px; color: var(--accent-ink); font-weight: 650; }

	.section-head a { font-size: 13px; color: var(--accent-ink); text-decoration: none; font-weight: 600; }

	.res-main { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
	.res-title { font-size: 14px; font-weight: 600; color: var(--text-base); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.res-hall { font-size: 12px; color: var(--text-muted); }
	.res-date { font-size: 13px; color: var(--text-muted); white-space: nowrap; }

	.badge {
		padding: 4px 10px;
		border-radius: var(--radius-sm);
		font-size: 11px;
		font-weight: 600;
		white-space: nowrap;
	}
	.badge-warning { background: var(--warning-dim); color: var(--warning); }
	.badge-success { background: var(--success-dim); color: var(--success); }
	.badge-info { background: color-mix(in srgb, var(--text-base) 12%, transparent); color: var(--text-base); }
	.badge-muted { background: var(--bg-hover); color: var(--text-muted); }
	.badge-danger { background: var(--danger-dim); color: var(--danger); }

	.empty {
		display: flex; flex-direction: column; align-items: center; gap: 12px;
		padding: 48px 24px; text-align: center;
		color: var(--text-muted); font-size: 14px; line-height: 1.75;
	}
	.empty p { margin: 0; }

	@media (prefers-reduced-motion: reduce) {
		.browse-cta:hover { transform: none; }
	}
</style>
