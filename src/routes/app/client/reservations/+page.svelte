<script lang="ts">
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
	<div class="page-head">
		<h1>My reservations</h1>
		<a href="/app/halls" class="browse-link">Browse halls →</a>
	</div>

	{#if data.reservations.length === 0}
		<div class="empty">
			<p>No reservations yet. <a href="/app/halls">Browse halls</a> to make your first booking.</p>
		</div>
	{:else}
		<div class="list">
			{#each data.reservations as r}
				<div class="card">
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
</div>

<style>
	.page { display: flex; flex-direction: column; gap: 20px; }

	.page-head { display: flex; align-items: center; justify-content: space-between; }
	h1 { font-size: 22px; font-weight: 700; color: var(--text-base); }
	.browse-link { font-size: 13px; color: var(--accent); font-weight: 500; text-decoration: none; }

	.list { display: flex; flex-direction: column; gap: 12px; }

	.card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 16px;
		border-radius: 10px;
		background: var(--surface);
		border: 1px solid var(--border);
	}

	.card-top { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
	.card-title { font-size: 15px; font-weight: 600; color: var(--text-base); }
	.card-sub { font-size: 12px; color: var(--text-muted); margin-top: 2px; }

	.card-meta { display: flex; gap: 12px; font-size: 13px; color: var(--text-muted); }
	.meta-item { display: flex; align-items: center; gap: 4px; }
	.card-desc { font-size: 13px; color: var(--text-muted); line-height: 1.5; }

	.badge { padding: 3px 9px; border-radius: 99px; font-size: 11px; font-weight: 600; white-space: nowrap; }
	.badge-warning { background: color-mix(in srgb, #f59e0b 15%, transparent); color: #92400e; }
	.badge-success { background: color-mix(in srgb, #22c55e 15%, transparent); color: #166534; }
	.badge-info { background: color-mix(in srgb, #3b82f6 15%, transparent); color: #1e40af; }
	.badge-muted { background: var(--border); color: var(--text-muted); }
	.badge-danger { background: var(--danger-dim); color: var(--danger); }

	.empty { padding: 60px; text-align: center; color: var(--text-muted); font-size: 14px; }
	.empty a { color: var(--accent); }
</style>
