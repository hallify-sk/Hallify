<script lang="ts">
	import { t } from '$lib/i18n';
	import SectionHeader from '$lib/components/SectionHeader.svelte';
	import type { PageData } from './$types';

	interface Props { data: PageData; }
	const { data }: Props = $props();

	function formatDate(d: Date | string) {
		return new Date(d).toLocaleDateString('sk-SK', { day: 'numeric', month: 'short', year: 'numeric' });
	}
</script>

<svelte:head><title>{t.users.manageUsers} – Hallify</title></svelte:head>

<div class="page">
	<SectionHeader overline={t.users.manage} title={t.users.manageUsers} />

	<div class="card table-section">
		<div class="table-wrap">
			<table>
				<thead>
					<tr>
						<th>{t.users.name}</th>
						<th>{t.users.email}</th>
						<th>{t.users.role}</th>
						<th>{t.users.reservations}</th>
						<th>{t.users.registered}</th>
					</tr>
				</thead>
				<tbody>
					{#each data.users as u}
						<tr class="clickable-row" onclick={() => window.location.href = `/admin/users/${u.id}`}>
							<td>
								<div class="user-cell">
									<div class="avatar">{u.first_name[0]}{u.last_name[0]}</div>
									<span class="link">{u.first_name} {u.last_name}</span>
								</div>
							</td>
							<td class="muted">{u.email}</td>
							<td>
								<span class="role-badge" class:admin={u.role === 'admin'}>
									{u.role === 'admin' ? t.users.admin : t.users.user}
								</span>
							</td>
							<td class="muted">{u.reservation_count}</td>
							<td class="muted">{formatDate(u.created_at)}</td>
						</tr>
					{/each}
					{#if data.users.length === 0}
						<tr><td colspan="5" class="empty-cell">{t.common.noData}</td></tr>
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</div>

<style>
	.page { padding: 28px 32px; }

	.table-section { margin-bottom: 20px; }
	.table-wrap { overflow-x: auto; }

	table { width: 100%; border-collapse: collapse; }

	th {
		text-align: left;
		font-size: 11px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--text-muted);
		padding: 10px 12px;
		background: var(--bg-panel2);
		border-bottom: 1px solid var(--border);
		white-space: nowrap;
	}

	th:first-child { border-radius: 8px 0 0 0; }
	th:last-child { border-radius: 0 8px 0 0; }

	td {
		padding: 12px;
		font-size: 14px;
		border-bottom: 1px solid var(--border);
		vertical-align: middle;
	}

	tr:last-child td { border-bottom: none; }

	.clickable-row { cursor: pointer; }
	.clickable-row:hover td { background: var(--bg-panel2); }

	.muted { color: var(--text-muted); font-size: 13px; }

	.user-cell {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.avatar {
		width: 30px;
		height: 30px;
		border-radius: 50%;
		background: var(--accent-dim);
		color: var(--accent);
		font-size: 11px;
		font-weight: 700;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		text-transform: uppercase;
	}

	.role-badge {
		padding: 3px 10px;
		border-radius: 20px;
		font-size: 11px;
		font-weight: 600;
		background: var(--bg-panel2);
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.role-badge.admin {
		background: var(--accent-dim);
		color: var(--accent);
	}

	.link {
		color: var(--accent);
		text-decoration: none;
		font-weight: 500;
	}
	.link:hover { text-decoration: underline; }

	.empty-cell {
		text-align: center;
		padding: 40px !important;
		color: var(--text-muted);
	}
</style>
