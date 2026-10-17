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

<div class="wrap page">
	<div class="page-top">
		<SectionHeader overline={t.users.manage} title="{user.first_name} {user.last_name}" />
		<div class="header-actions">
			<a href="/app/manage/users" class="btn-outline">{t.common.back}</a>
		</div>
	</div>

	<div class="detail-grid">
		<!-- Left: Edit details -->
		<section class="section section--lead">
			<div class="section-head">
				<h2>{t.users.userDetail}</h2>
			</div>
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
		</section>

		<!-- Right: Info + Actions -->
		<div class="side-stack">
			<section class="section section--lead">
				<div class="section-head">
					<h2>{t.profile.accountInfo}</h2>
				</div>
				<div class="row-list">
					<div class="row-item info-row">
						<span class="info-label">{t.users.role}</span>
						<span class="role-badge" class:admin={user.role === 'admin'}>
							{user.role === 'admin' ? t.users.admin : t.users.user}
						</span>
					</div>
					<div class="row-item info-row">
						<span class="info-label">{t.users.email}</span>
						<a href="mailto:{user.email}" class="link">{user.email}</a>
					</div>
					<div class="row-item info-row">
						<span class="info-label">{t.users.reservations}</span>
						<span>{user.reservation_count}</span>
					</div>
					<div class="row-item info-row">
						<span class="info-label">{t.users.registered}</span>
						<span>{formatDate(user.created_at)}</span>
					</div>
				</div>
			</section>

			<!-- Role management -->
			<section class="section">
				<div class="section-head">
					<h2>{t.users.role}</h2>
				</div>
				<form method="POST" action="?/setRole" use:enhance={() => {
					return async ({ update }) => { await update({ reset: false }); };
				}}>
					<input type="hidden" name="role" value={user.role === 'admin' ? 'user' : 'admin'} />
					<button type="submit" class="btn-action-full"
						onclick={(e) => { if (!confirm(`${t.users.confirmRoleChange} ${user.first_name} ${user.last_name}?`)) e.preventDefault(); }}>
						{user.role === 'admin' ? t.users.demote : t.users.promoteAdmin}
					</button>
				</form>
			</section>

			<!-- Reset password -->
			<section class="section">
				<div class="section-head">
					<h2>{t.users.resetPassword}</h2>
				</div>
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
			</section>

			<!-- Delete user -->
			<section class="section danger-zone">
				<div class="section-head">
					<h2>{t.common.delete}</h2>
				</div>
				<form method="POST" action="?/deleteUser" use:enhance>
					<button type="submit" class="btn-danger"
						onclick={(e) => { if (!confirm(t.users.confirmDeleteUser)) e.preventDefault(); }}>
						{t.common.delete} {user.first_name} {user.last_name}
					</button>
				</form>
			</section>
		</div>
	</div>

	<!-- User's reservations -->
	{#if data.reservations.length > 0}
		<section class="section">
			<div class="section-head section-head--row">
				<h2>{t.users.reservations} ({data.reservations.length})</h2>
			</div>

			<div class="row-head">
				<span>{t.adminReservations.event}</span>
				<span>{t.adminReservations.hall}</span>
				<span>{t.adminReservations.date}</span>
				<span>{t.adminReservations.status}</span>
			</div>

			<div class="row-list">
				{#each data.reservations as res}
					<button type="button" class="row-item res-row clickable-row" onclick={() => window.location.href = `/admin/reservations/${res.id}`}>
						<span class="link">{res.title}</span>
						<span>{res.hall_name}</span>
						<span>{formatDate(res.event_date)}</span>
						<span><StatusBadge status={res.status as ReservationStatus} /></span>
					</button>
				{/each}
			</div>
		</section>
	{/if}
</div>

<style>
	.page { padding: 28px 0; overflow-y: auto; height: 100%; }

	.page-top {
		display: flex; justify-content: space-between;
		align-items: flex-start; flex-wrap: wrap; gap: 16px;
	}
	.header-actions { display: flex; gap: 10px; }

	.detail-grid {
		display: grid;
		grid-template-columns: 1fr 360px;
		gap: 0 32px;
	}

	.form-group {
		margin-bottom: 16px;
	}
	.form-group label {
		display: block; font-size: 13px; font-weight: 600;
		color: var(--text-muted); margin-bottom: 4px;
	}
	.form-group input {
		width: 100%; padding: 9px 13px; border-radius: var(--radius-sm);
		border: 1px solid var(--border); font-size: 14px;
		background: var(--bg-panel2); color: var(--text-base);
		font-family: inherit;
		transition: border-color .15s, box-shadow .15s;
	}
	.form-group input:focus {
		border-color: var(--accent); outline: none;
		box-shadow: 0 0 0 3px var(--accent-dim);
	}

	.form-row {
		display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
	}

	.side-stack { display: flex; flex-direction: column; }

	/* .row-item carries the hairline; the row only has to place its two ends. */
	.info-row { justify-content: space-between; font-size: 14px; }
	.info-label { color: var(--text-muted); font-size: 13px; }

	.role-badge {
		padding: 3px 10px; border-radius: 3px;
		font-size: 11px; font-weight: 600;
		background: var(--bg-panel2); color: var(--text-muted);
		text-transform: uppercase; letter-spacing: 0.04em;
	}
	.role-badge.admin {
		background: var(--accent-dim); color: var(--accent-ink);
	}

	.btn-primary {
		padding: 10px 20px; border-radius: var(--radius-sm); font-size: 13px;
		font-weight: 650; background: var(--accent); color: var(--accent-contrast);
		border: none; cursor: pointer;
		transition: transform .2s, background .2s;
	}
	.btn-primary:hover { background: var(--accent-hover); transform: translateY(-2px); }
	.btn-primary:active { transform: translateY(0); }

	.btn-outline {
		display: inline-flex; align-items: center; gap: 6px;
		padding: 6px 14px; border-radius: var(--radius-sm); font-size: 13px;
		font-weight: 500; border: 1px solid var(--border);
		background: var(--bg-panel); color: var(--text-base);
		text-decoration: none; cursor: pointer;
		transition: background .15s, border-color .15s;
	}
	.btn-outline:hover { background: var(--bg-hover); border-color: var(--text-subtle); }

	.btn-action-full {
		width: 100%; padding: 8px 20px; border-radius: var(--radius-sm);
		font-size: 13px; font-weight: 600;
		background: var(--bg-panel2); color: var(--text-base);
		border: 1px solid var(--border); cursor: pointer;
		transition: border-color .15s, color .15s;
	}
	.btn-action-full:hover { border-color: var(--accent); color: var(--accent-ink); }

	.danger-zone h2 { color: var(--danger); }

	.btn-danger {
		width: 100%; padding: 8px 20px; border-radius: var(--radius-sm);
		font-size: 13px; font-weight: 600;
		background: var(--danger-dim); color: var(--danger);
		border: 1px solid color-mix(in srgb, var(--danger) 20%, transparent); cursor: pointer;
		transition: background .15s;
	}
	.btn-danger:hover { background: color-mix(in srgb, var(--danger) 15%, transparent); }

	.link { color: var(--accent-ink); text-decoration: none; }
	.link:hover { text-decoration: underline; }

	/* Reservation rows — the hairline table. */
	.row-head,
	.res-row {
		display: grid;
		grid-template-columns: minmax(160px, 2fr) minmax(120px, 1.4fr) 160px 120px;
		align-items: center;
		gap: 14px;
	}
	.row-head {
		padding: 0 0 8px;
		border-bottom: 1px solid var(--border);
		font-size: 11px; font-weight: 600;
		text-transform: uppercase; letter-spacing: 0.12em;
		color: var(--text-muted);
	}
	.res-row { font-size: 14px; }

	.clickable-row { cursor: pointer; }
	.clickable-row:hover { background: var(--bg-hover); }

	@media (max-width: 960px) {
		.detail-grid { grid-template-columns: 1fr; gap: 0; }
	}

	@media (max-width: 860px) {
		.row-head { display: none; }
		.res-row { grid-template-columns: 1fr auto; row-gap: 6px; }
	}

	@media (prefers-reduced-motion: reduce) {
		.btn-primary:hover { transform: none; }
	}
</style>
