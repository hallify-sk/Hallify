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

<svelte:head><title>Dashboard – Hallify</title></svelte:head>

<div class="page">
	<div class="greeting">
		<h1>Welcome back, {data.user.first_name}!</h1>
		{#if data.upcomingCount > 0}
			<p>You have <strong>{data.upcomingCount}</strong> upcoming reservation{data.upcomingCount > 1 ? 's' : ''}.</p>
		{:else}
			<p>No upcoming reservations. Find a hall and book one!</p>
		{/if}
	</div>

	<a href="/app/halls" class="browse-cta">
		<span class="cta-icon">
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
			<strong>Browse halls</strong>
			<span>Discover and book the perfect venue</span>
		</div>
		<span class="cta-arrow">→</span>
	</a>

	{#if data.reservations.length > 0}
		<section class="section">
			<div class="section-head">
				<h2>My reservations</h2>
				<a href="/app/client/reservations">View all →</a>
			</div>
			<div class="reservation-list">
				{#each data.reservations as r}
					<div class="res-row">
						<div class="res-main">
							<span class="res-title">{r.title}</span>
							<span class="res-hall">{r.hall_name} · {r.org_name}</span>
						</div>
						<span class="res-date">{fmtDate(r.event_date)}</span>
						<span class="badge {STATUS_CLASS[r.status] ?? 'badge-muted'}">{STATUS_LABEL[r.status] ?? r.status}</span>
					</div>
				{/each}
			</div>
		</section>
	{:else}
		<div class="empty">
			<p>You haven't made any reservations yet.</p>
		</div>
	{/if}
</div>

<style>
	.page { display: flex; flex-direction: column; gap: 28px; }

	.greeting h1 { font-size: 22px; font-weight: 700; color: var(--text-base); margin-bottom: 4px; }
	.greeting p { font-size: 14px; color: var(--text-muted); }

	.browse-cta {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 18px 20px;
		border-radius: 12px;
		background: color-mix(in srgb, var(--accent) 8%, var(--surface));
		border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
		text-decoration: none;
		color: var(--text-base);
		transition: background .15s;
	}
	.browse-cta:hover { background: color-mix(in srgb, var(--accent) 14%, var(--surface)); }

	.cta-icon { display: flex; align-items: center; flex-shrink: 0; color: var(--accent); }

	.browse-cta div {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.browse-cta strong { font-size: 15px; font-weight: 700; }
	.browse-cta span:not(.cta-arrow):not(.cta-icon) { font-size: 13px; color: var(--text-muted); }
	.cta-arrow { font-size: 18px; color: var(--accent); font-weight: 700; }

	.section { display: flex; flex-direction: column; gap: 12px; }

	.section-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.section-head h2 { font-size: 16px; font-weight: 700; color: var(--text-base); }
	.section-head a { font-size: 13px; color: var(--accent); text-decoration: none; font-weight: 500; }

	.reservation-list { display: flex; flex-direction: column; gap: 1px; border-radius: 10px; overflow: hidden; border: 1px solid var(--border); }

	.res-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		background: var(--surface);
	}
	.res-row:not(:last-child) { border-bottom: 1px solid var(--border); }

	.res-main { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
	.res-title { font-size: 14px; font-weight: 600; color: var(--text-base); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.res-hall { font-size: 12px; color: var(--text-muted); }
	.res-date { font-size: 13px; color: var(--text-muted); white-space: nowrap; }

	.badge {
		padding: 3px 8px;
		border-radius: 99px;
		font-size: 11px;
		font-weight: 600;
		white-space: nowrap;
	}
	.badge-warning { background: color-mix(in srgb, #f59e0b 15%, transparent); color: #92400e; }
	.badge-success { background: color-mix(in srgb, #22c55e 15%, transparent); color: #166534; }
	.badge-info { background: color-mix(in srgb, #3b82f6 15%, transparent); color: #1e40af; }
	.badge-muted { background: var(--border); color: var(--text-muted); }
	.badge-danger { background: var(--danger-dim); color: var(--danger); }

	.empty { padding: 40px; text-align: center; color: var(--text-muted); font-size: 14px; }
</style>
