<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n';
	import type { PageData, ActionData } from './$types';

	interface Props { data: PageData; form: ActionData; }
	const { data, form }: Props = $props();

	const profile = $derived(data.profile);
</script>

<svelte:head><title>{t.nav.profile} – Hallify</title></svelte:head>

<div class="page">
	<div class="profile-header">
		<div class="avatar">{profile.first_name[0]}{profile.last_name[0]}</div>
		<div>
			<h1>{profile.first_name} {profile.last_name}</h1>
			<p class="subtitle">{profile.email}</p>
		</div>
	</div>

	<div class="profile-grid">
		<!-- Profile info -->
		<div class="card profile-card">
			<h3>{t.profile.personalInfo}</h3>

			{#if form?.success && form?.section === 'profile'}
				<div class="alert-success">{t.profile.saved}</div>
			{/if}
			{#if form?.error && form?.section !== 'password'}
				<div class="alert-error">{form.error}</div>
			{/if}

			<form method="POST" action="?/updateProfile" use:enhance={() => { return async ({ update }) => { await update({ reset: false }); }; }}>
				<div class="field-row">
					<div class="field">
						<label for="firstName">{t.auth.firstName}</label>
						<input id="firstName" name="firstName" type="text" value={profile.first_name} required />
					</div>
					<div class="field">
						<label for="lastName">{t.auth.lastName}</label>
						<input id="lastName" name="lastName" type="text" value={profile.last_name} required />
					</div>
				</div>
				<div class="field">
					<label for="email">{t.auth.email}</label>
					<input id="email" name="email" type="email" value={profile.email} required />
				</div>
				<div class="form-actions">
					<button type="submit" class="btn-action">{t.common.save}</button>
				</div>
			</form>
		</div>

		<!-- Change password -->
		<div class="card profile-card">
			<h3>{t.profile.changePassword}</h3>

			{#if form?.success && form?.section === 'password'}
				<div class="alert-success">{t.profile.passwordChanged}</div>
			{/if}
			{#if form?.error && form?.section === 'password'}
				<div class="alert-error">{form.error}</div>
			{/if}

			<form method="POST" action="?/changePassword" use:enhance={() => { return async ({ update }) => { await update({ reset: false }); }; }}>
				<div class="field">
					<label for="currentPassword">{t.profile.currentPassword}</label>
					<input id="currentPassword" name="currentPassword" type="password" required />
				</div>
				<div class="field-row">
					<div class="field">
						<label for="newPassword">{t.profile.newPassword}</label>
						<input id="newPassword" name="newPassword" type="password" required minlength="6" />
					</div>
					<div class="field">
						<label for="confirmPassword">{t.profile.confirmPassword}</label>
						<input id="confirmPassword" name="confirmPassword" type="password" required minlength="6" />
					</div>
				</div>
				<p class="hint">{t.auth.passwordMin}</p>
				<div class="form-actions">
					<button type="submit" class="btn-action">{t.profile.changePassword}</button>
				</div>
			</form>
		</div>

		<!-- Account info -->
		<div class="card profile-card">
			<h3>{t.profile.accountInfo}</h3>
			<div class="info-grid">
				<div class="info-item">
					<span class="info-label">{t.users.role}</span>
					<span class="info-value role-badge">{profile.role === 'admin' ? t.users.admin : t.users.user}</span>
				</div>
				<div class="info-item">
					<span class="info-label">{t.users.registered}</span>
					<span class="info-value">{new Date(profile.created_at).toLocaleDateString()}</span>
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.page { padding: 28px 32px; max-width: 900px; margin: 0 auto; }

	.profile-header {
		display: flex;
		align-items: center;
		gap: 16px;
		margin-bottom: 28px;
	}

	.avatar {
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: var(--accent);
		color: #fff;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 20px;
		font-weight: 700;
		flex-shrink: 0;
		text-transform: uppercase;
	}

	.profile-header h1 {
		font-size: 22px;
		font-weight: 700;
		margin: 0;
	}

	.subtitle {
		font-size: 13px;
		color: var(--text-muted);
		margin: 2px 0 0;
	}

	.profile-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 20px;
	}

	.profile-card { padding: 24px; }

	.profile-card h3 {
		font-size: 14px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--accent);
		margin: 0 0 16px;
	}

	.field { margin-bottom: 12px; }
	.field label {
		display: block;
		font-size: 12px;
		font-weight: 600;
		color: var(--text-muted);
		margin-bottom: 4px;
	}
	.field input { width: 100%; }
	.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

	.hint {
		font-size: 11px;
		color: var(--text-muted);
		margin: 0 0 4px;
	}

	.form-actions { margin-top: 16px; }

	.btn-action {
		padding: 8px 20px;
		border-radius: 8px;
		font-size: 13px;
		font-weight: 600;
		background: var(--accent-action);
		color: white;
		border: none;
		cursor: pointer;
	}
	.btn-action:hover { opacity: 0.9; }

	.alert-success {
		padding: 10px 16px;
		border-radius: 8px;
		background: #dcfce7;
		color: #15803d;
		font-size: 13px;
		font-weight: 500;
		margin-bottom: 12px;
	}

	.alert-error {
		padding: 10px 16px;
		border-radius: 8px;
		background: #fef2f2;
		color: #dc2626;
		font-size: 13px;
		font-weight: 500;
		margin-bottom: 12px;
	}

	.info-grid { display: flex; flex-direction: column; gap: 8px; }

	.info-item {
		display: flex;
		justify-content: space-between;
		padding: 10px 0;
		border-bottom: 1px solid var(--border);
	}

	.info-label {
		font-size: 12px;
		color: var(--text-muted);
	}

	.info-value {
		font-size: 12px;
		font-weight: 600;
	}

	.role-badge {
		text-transform: capitalize;
		color: var(--accent);
	}

	@media (max-width: 700px) {
		.profile-grid { grid-template-columns: 1fr; }
	}
</style>
