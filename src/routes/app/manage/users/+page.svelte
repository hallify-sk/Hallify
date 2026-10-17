<script lang="ts">
	import { t } from '$lib/i18n.svelte';
	import SectionHeader from '$lib/components/SectionHeader.svelte';
	import type { PageData } from './$types';

	interface Props { data: PageData; }
	const { data }: Props = $props();

	function formatDate(d: Date | string) {
		return new Date(d).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short', year: 'numeric' });
	}
</script>

<svelte:head><title>{t.users.manageUsers} – Hallify</title></svelte:head>

<div class="wrap page">
	<SectionHeader overline={t.users.manage} title={t.users.manageUsers} />

	<section class="section section--lead">
		<div class="row-head">
			<span class="col-name">{t.users.name}</span>
			<span class="col-email">{t.users.email}</span>
			<span class="col-role">{t.users.role}</span>
			<span class="col-count">{t.users.reservations}</span>
			<span class="col-date">{t.users.registered}</span>
		</div>

		<div class="row-list">
			{#each data.users as u}
				<button type="button" class="row-item user-row clickable-row" onclick={() => window.location.href = `/admin/users/${u.id}`}>
					<span class="col-name user-cell">
						<span class="avatar">{u.first_name[0]}{u.last_name[0]}</span>
						<span class="link">{u.first_name} {u.last_name}</span>
					</span>
					<span class="col-email muted">{u.email}</span>
					<span class="col-role">
						<span class="role-badge" class:admin={u.role === 'admin'}>
							{u.role === 'admin' ? t.users.admin : t.users.user}
						</span>
					</span>
					<span class="col-count muted">{u.reservation_count}</span>
					<span class="col-date muted">{formatDate(u.created_at)}</span>
				</button>
			{/each}
			{#if data.users.length === 0}
				<div class="card--inset empty-state">
					<span class="icon-tile" aria-hidden="true">
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>
					</span>
					<h2>{t.common.noData}</h2>
				</div>
			{/if}
		</div>
	</section>
</div>

<style>
	.page { padding: 28px 0; }

	.muted { color: var(--text-muted); font-size: 13px; }

	/* Column rhythm shared by the header strip and every data row. */
	.row-head,
	.user-row {
		display: grid;
		grid-template-columns: minmax(180px, 1.6fr) minmax(180px, 1.6fr) 110px 110px 140px;
		align-items: center;
		gap: 14px;
	}

	.row-head {
		padding: 0 0 8px;
		border-bottom: 1px solid var(--border);
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--text-muted);
		white-space: nowrap;
	}

	.clickable-row { cursor: pointer; }
	.clickable-row:hover { background: var(--bg-hover); }

	.user-cell {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}

	.avatar {
		width: 30px;
		height: 30px;
		border-radius: 50%;
		background: var(--accent-dim);
		color: var(--accent-ink);
		font-size: 11px;
		font-weight: 650;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		text-transform: uppercase;
	}

	.col-email { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

	.role-badge {
		padding: 3px 10px;
		border-radius: 3px;
		font-size: 11px;
		font-weight: 600;
		background: var(--bg-panel2);
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.role-badge.admin {
		background: var(--accent-dim);
		color: var(--accent-ink);
	}

	.link {
		color: var(--accent-ink);
		text-decoration: none;
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.link:hover { text-decoration: underline; }

	.empty-state { display: flex; align-items: center; gap: 16px; }
	.empty-state h2 { font-size: 14px; font-weight: 600; letter-spacing: -.03em; margin: 0; }

	@media (max-width: 860px) {
		.row-head { display: none; }
		.user-row { grid-template-columns: 1fr auto; row-gap: 6px; }
	}
</style>
