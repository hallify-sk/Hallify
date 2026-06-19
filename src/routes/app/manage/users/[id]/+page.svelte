<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n.svelte';
	import SectionHeader from '$lib/components/SectionHeader.svelte';
	import StatusBadge from '$lib/components/StatusBadge.svelte';
	import type { PageData } from './$types';
	import type { ReservationStatus } from '$lib/db';

	interface Props { data: PageData; }
	const { data }: Props = $props();

	const user = $derived(data.user);

	function formatDate(d: Date | string) {
		return new Date(d).toLocaleDateString('sk-SK', { day: 'numeric', month: 'long', year: 'numeric' });
	}
</script>

<svelte:head><title>{user.first_name} {user.last_name} – {t.users.manageUsers} – Hallify</title></svelte:head>

<div class="page">
	<div class="page-top">
		<SectionHeader overline={t.users.manage} title="{user.first_name} {user.last_name}" />
		<div class="header-actions">
			<a href="/app/manage/users" class="btn-outline">{t.common.back}</a>
		</div>
	</div>

	<div class="detail-grid">
		<!-- Left: Edit details -->
		<div class="card detail-card">
			<h2>{t.users.userDetail}</h2>
			<form method="POST" action="?/updateDetails" use:enhance={() => {
				return async ({ update }) => { await update({ reset: false }); };
			}}>
				<div class="form-row">
					<div class="form-group">
						<label for="first_name">{t.users.firstName}</label>
						<input id="first_name" name="first_name" type="text" value={user.first_name} required />
					</div>
					<div class="form-group">
						<label for="last_name">{t.users.lastName}</label>
						<input id="last_name" name="last_name" type="text" value={user.last_name} required />
					</div>
				</div>
				<div class="form-group">
					<label for="email">{t.users.email}</label>
					<input id="email" name="email" type="email" value={user.email} required />
				</div>
				<button type="submit" class="btn-primary">{t.common.save}</button>
			</form>
		</div>

		<!-- Right: Info + Actions -->
		<div class="side-stack">
			<div class="card info-card">
				<h3>{t.profile.accountInfo}</h3>
				<div class="info-row">
					<span class="info-label">{t.users.role}</span>
					<span class="role-badge" class:admin={user.role === 'admin'}>
						{user.role === 'admin' ? t.users.admin : t.users.user}
					</span>
				</div>
				<div class="info-row">
					<span class="info-label">{t.users.email}</span>
					<a href="mailto:{user.email}" class="link">{user.email}</a>
				</div>
				<div class="info-row">
					<span class="info-label">{t.users.reservations}</span>
					<span>{user.reservation_count}</span>
				</div>
				<div class="info-row">
					<span class="info-label">{t.users.registered}</span>
					<span>{formatDate(user.created_at)}</span>
				</div>
			</div>

			<!-- Role management -->
			<div class="card action-card">
				<h3>{t.users.role}</h3>
				<form method="POST" action="?/setRole" use:enhance={() => {
					return async ({ update }) => { await update({ reset: false }); };
				}}>
					<input type="hidden" name="role" value={user.role === 'admin' ? 'user' : 'admin'} />
					<button type="submit" class="btn-action-full"
						onclick={(e) => { if (!confirm(`${t.users.confirmRoleChange} ${user.first_name} ${user.last_name}?`)) e.preventDefault(); }}>
						{user.role === 'admin' ? t.users.demote : t.users.promoteAdmin}
					</button>
				</form>
			</div>

			<!-- Reset password -->
			<div class="card action-card">
				<h3>{t.users.resetPassword}</h3>
				<form method="POST" action="?/resetPassword" use:enhance={() => {
					return async ({ update }) => { await update({ reset: false }); };
				}}>
					<div class="form-group">
						<label for="password">{t.users.newPassword}</label>
						<input id="password" name="password" type="password" minlength="6" required
							placeholder={t.auth.passwordMin} />
					</div>
					<button type="submit" class="btn-primary">{t.users.resetPassword}</button>
				</form>
			</div>

			<!-- Delete user -->
			<div class="card action-card danger-zone">
				<h3>{t.common.delete}</h3>
				<form method="POST" action="?/deleteUser" use:enhance>
					<button type="submit" class="btn-danger"
						onclick={(e) => { if (!confirm(t.users.confirmDeleteUser)) e.preventDefault(); }}>
						{t.common.delete} {user.first_name} {user.last_name}
					</button>
				</form>
			</div>
		</div>
	</div>

	<!-- User's reservations -->
	{#if data.reservations.length > 0}
		<div class="card table-section">
			<h3 class="section-title">{t.users.reservations} ({data.reservations.length})</h3>
			<table>
				<thead>
					<tr>
						<th>{t.adminReservations.event}</th>
						<th>{t.adminReservations.hall}</th>
						<th>{t.adminReservations.date}</th>
						<th>{t.adminReservations.status}</th>
					</tr>
				</thead>
				<tbody>
					{#each data.reservations as res}
						<tr class="clickable-row" onclick={() => window.location.href = `/admin/reservations/${res.id}`}>
							<td><span class="link">{res.title}</span></td>
							<td>{res.hall_name}</td>
							<td>{formatDate(res.event_date)}</td>
							<td><StatusBadge status={res.status as ReservationStatus} /></td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<style>
	.page { padding: 28px 32px; overflow-y: auto; height: 100%; }

	.page-top {
		display: flex; justify-content: space-between;
		align-items: flex-start; flex-wrap: wrap; gap: 16px;
	}
	.header-actions { display: flex; gap: 10px; }

	.detail-grid {
		display: grid;
		grid-template-columns: 1fr 360px;
		gap: 20px;
	}

	.detail-card h2, .info-card h3, .action-card h3 {
		font-size: 16px; font-weight: 600; margin-bottom: 20px;
	}

	.form-group {
		margin-bottom: 16px;
	}
	.form-group label {
		display: block; font-size: 13px; font-weight: 500;
		color: var(--text-muted); margin-bottom: 4px;
	}
	.form-group input {
		width: 100%; padding: 8px 12px; border-radius: 8px;
		border: 1px solid var(--border); font-size: 14px;
		background: var(--bg-base); color: var(--text-base);
		font-family: inherit;
	}
	.form-group input:focus {
		border-color: var(--accent); outline: none;
	}

	.form-row {
		display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
	}

	.side-stack { display: flex; flex-direction: column; gap: 16px; }

	.info-card, .action-card { padding: 20px; }

	.info-row {
		display: flex; justify-content: space-between;
		align-items: center; padding: 8px 0;
		border-bottom: 1px solid var(--border);
		font-size: 14px;
	}
	.info-row:last-of-type { border-bottom: none; }
	.info-label { color: var(--text-muted); font-size: 13px; }

	.role-badge {
		padding: 3px 10px; border-radius: 20px;
		font-size: 11px; font-weight: 600;
		background: var(--bg-panel2); color: var(--text-muted);
		text-transform: uppercase; letter-spacing: 0.04em;
	}
	.role-badge.admin {
		background: var(--accent-dim); color: var(--accent);
	}

	.btn-primary {
		padding: 8px 20px; border-radius: 8px; font-size: 13px;
		font-weight: 600; background: var(--accent); color: white;
		border: none; cursor: pointer;
	}
	.btn-primary:hover { opacity: 0.9; }

	.btn-outline {
		display: inline-flex; align-items: center; gap: 6px;
		padding: 6px 14px; border-radius: 8px; font-size: 13px;
		font-weight: 500; border: 1px solid var(--border);
		background: var(--bg-panel); color: var(--text-base);
		text-decoration: none; cursor: pointer;
	}
	.btn-outline:hover { border-color: var(--accent); color: var(--accent); }

	.btn-action-full {
		width: 100%; padding: 8px 20px; border-radius: 8px;
		font-size: 13px; font-weight: 600;
		background: var(--bg-panel2); color: var(--text-base);
		border: 1px solid var(--border); cursor: pointer;
	}
	.btn-action-full:hover { border-color: var(--accent); color: var(--accent); }

	.danger-zone {
		border-color: #fecaca;
	}
	.danger-zone h3 { color: var(--danger); }

	.btn-danger {
		width: 100%; padding: 8px 20px; border-radius: 8px;
		font-size: 13px; font-weight: 600;
		background: #fef2f2; color: var(--danger);
		border: 1px solid #fecaca; cursor: pointer;
	}
	.btn-danger:hover { background: #fee2e2; }

	.link { color: var(--accent); text-decoration: none; }
	.link:hover { text-decoration: underline; }

	.section-title {
		font-size: 16px; font-weight: 600; margin-bottom: 16px;
		padding: 0 12px;
	}

	.table-section { margin-top: 20px; overflow-x: auto; }

	table { width: 100%; border-collapse: collapse; }

	th {
		text-align: left; padding: 10px 12px;
		font-size: 11px; font-weight: 600;
		text-transform: uppercase; letter-spacing: 0.04em;
		color: var(--text-muted); background: var(--bg-panel2);
		border-bottom: 1px solid var(--border);
	}

	td {
		padding: 12px; font-size: 14px;
		border-bottom: 1px solid var(--border);
		vertical-align: top;
	}

	.clickable-row { cursor: pointer; }
	.clickable-row:hover td { background: var(--bg-panel2); }
</style>
