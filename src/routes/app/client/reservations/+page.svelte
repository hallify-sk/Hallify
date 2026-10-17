<script lang="ts">
	import { reveal } from '$lib/reveal';
	import type { PageData } from './$types';

	interface Props { data: PageData; }
	const { data }: Props = $props();

	const STATUS_LABEL: Record<string, string> = {
		pending: 'Pending',
		waiting_payment: 'Awaiting payment',
		approved: 'Approved',
		planned: 'Planned',
		completed: 'Completed',
		cancelled: 'Cancelled',
	};
	const STATUS_CLASS: Record<string, string> = {
		pending: 'badge-warning',
		waiting_payment: 'badge-warning',
		approved: 'badge-success',
		planned: 'badge-info',
		completed: 'badge-muted',
		cancelled: 'badge-danger',
	};

	function fmtDate(d: Date | string) {
		return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
	}
</script>

<svelte:head><title>My reservations – Hallify</title></svelte:head>

<div class="page">
	<section class="section section--lead section--flush">
		<div class="section-head section-head--row">
			<h1>My reservations</h1>
			<a href="/app/halls" class="browse-link">Browse halls →</a>
		</div>
	</section>

	<section class="section" use:reveal>
		{#if data.reservations.length === 0}
			<div class="card--inset empty">
				<span class="icon-tile" aria-hidden="true">
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
				</span>
				<p>No reservations yet. <a href="/app/halls">Browse halls</a> to make your first booking.</p>
			</div>
		{:else}
			<div class="row-list list">
				{#each data.reservations as r}
					<div class="row-item res-item">
						<div class="card-top">
							<div>
								<div class="card-title">{r.title}</div>
								<div class="card-sub">{r.hall_name} · {r.org_name}</div>
							</div>
							<span class="badge {STATUS_CLASS[r.status] ?? 'badge-muted'}">{STATUS_LABEL[r.status] ?? r.status}</span>
						</div>
						<div class="card-meta">
							<span class="meta-item">
								<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
								{fmtDate(r.event_date)}
							</span>
							{#if r.start_time}
								<span class="meta-item">
									<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
									{r.start_time}{r.end_time ? ` – ${r.end_time}` : ''}
								</span>
							{/if}
						</div>
						{#if r.description}
							<p class="card-desc">{r.description}</p>
						{/if}
					</div>
				{/each}
			</div>
		{/if}
	</section>
</div>

<style>
	.section-head h1 {
		font-size: var(--display-size);
		font-weight: 550;
		letter-spacing: -.055em;
		line-height: 1.08;
		color: var(--text-base);
		margin: 0;
	}
	.browse-link { font-size: 13px; color: var(--accent-ink); font-weight: 600; text-decoration: none; }

	/* A reservation is a multi-line record, so the hairline row stacks. */
	.res-item {
		flex-direction: column;
		align-items: stretch;
		gap: 8px;
		padding: 18px 0;
	}

	.card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
	.card-title { font-size: 16px; font-weight: 600; letter-spacing: -.03em; color: var(--text-base); }
	.card-sub { font-size: 12px; color: var(--text-muted); margin-top: 3px; }

	.card-meta { display: flex; gap: 14px; font-size: 13px; color: var(--text-muted); }
	.meta-item { display: flex; align-items: center; gap: 5px; }
	.card-desc { font-size: 13px; color: var(--text-muted); line-height: 1.75; margin: 0; }

	.badge { padding: 4px 10px; border-radius: var(--radius-sm); font-size: 11px; font-weight: 600; white-space: nowrap; }
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
	.empty a { color: var(--accent-ink); }
</style>
