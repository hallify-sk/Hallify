<script lang="ts">
	import { enhance } from '$app/forms';
	import { t, getLocale } from '$lib/i18n.svelte';
	import { formatDate } from '$lib/format';
	import { orgRoleLabel } from '$lib/role-label';
	import type { PageData, ActionData } from './$types';

	interface Props { data: PageData; form: ActionData; }
	const { data, form }: Props = $props();

	const profile = $derived(data.profile);
	// The role that means something to the user: theirs in the current organisation.
	// The platform-wide 'user' role ('Používateľ') said nothing; it shows only for admins.
	const roleText = $derived(
		data.currentOrg?.role ? orgRoleLabel(data.currentOrg.role, t) : profile.role === 'admin' ? t.users.admin : ''
	);

	// Changing the sign-in email asks for the current password, so the field appears
	// as soon as the address differs from the saved one (and stays after a refusal).
	let email = $state(data.profile.email);
	$effect(() => { email = data.profile.email; });
	const emailChanged = $derived(email.trim().toLowerCase() !== profile.email);
</script>

<svelte:head><title>{t.nav.profile} – Hallify</title></svelte:head>

<div class="wrap profile-wrap">
	<div class="section section--lead profile-header">
		<div class="avatar">{profile.first_name[0]}{profile.last_name[0]}</div>
		<div>
			<h1>{profile.first_name} {profile.last_name}</h1>
			<p class="subtitle">{profile.email}</p>
		</div>
	</div>

	<!-- Profile info -->
	<section class="section">
		<div class="section-head">
			<h3>{t.profile.personalInfo}</h3>
		</div>

		{#if form?.success && form?.section === 'profile'}
			<div class="alert-success">{form.emailChanged ? t.profile.emailChangedSaved : t.profile.saved}</div>
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
				<input id="email" name="email" type="email" bind:value={email} required autocomplete="email" />
			</div>
			{#if emailChanged || (form?.section === 'profile' && 'needsPassword' in form && form.needsPassword)}
				<div class="field">
					<label for="emailPassword">{t.profile.currentPassword}</label>
					<input id="emailPassword" name="currentPassword" type="password" required autocomplete="current-password" />
					<p class="hint">{t.profile.emailChangeHint}</p>
				</div>
			{/if}
			<div class="form-actions">
				<button type="submit" class="btn-action">{t.common.save}</button>
			</div>
		</form>
	</section>

	<!-- Change password -->
	<section class="section">
		<div class="section-head">
			<h3>{t.profile.changePassword}</h3>
		</div>

		{#if form?.success && form?.section === 'password'}
			<div class="alert-success">{t.profile.passwordChangedElsewhere}</div>
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
	</section>

	<!-- Account info -->
	<section class="section">
		<div class="section-head">
			<h3>{t.profile.accountInfo}</h3>
		</div>
		<div class="row-list">
			{#if roleText}
			<div class="row-item">
				<span class="info-label">{t.users.role}</span>
				<span class="info-value role-badge">{roleText}</span>
			</div>
			{/if}
			<div class="row-item">
				<span class="info-label">{t.users.registered}</span>
				<span class="info-value">{formatDate(profile.created_at, getLocale())}</span>
			</div>
		</div>
	</section>
</div>

<style>
	.profile-wrap { --page-max: 900px; }

	.profile-header {
		display: flex;
		align-items: center;
		gap: 16px;
	}

	.avatar {
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: var(--accent);
		color: var(--accent-contrast);
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 20px;
		font-weight: 650;
		letter-spacing: -0.03em;
		flex-shrink: 0;
		text-transform: uppercase;
	}

	.profile-header h1 {
		font-size: var(--display-size);
		font-weight: 550;
		letter-spacing: -0.055em;
		margin: 0;
	}

	.subtitle {
		font-size: var(--body-size);
		color: var(--text-muted);
		margin: 2px 0 0;
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
		padding: 10px 20px;
		border-radius: var(--radius-sm);
		font-size: 13px;
		font-weight: 650;
		background: var(--accent-action);
		color: var(--accent-contrast);
		border: none;
		cursor: pointer;
		transition: transform 0.2s, background 0.2s;
	}
	.btn-action:hover { background: var(--accent-hover); transform: translateY(-2px); }
	.btn-action:active { transform: translateY(0); }

	.alert-success {
		padding: 10px 16px;
		border-radius: var(--radius-sm);
		background: var(--success-dim);
		border: 1px solid color-mix(in srgb, var(--success) 25%, transparent);
		color: var(--success);
		font-size: 13px;
		font-weight: 500;
		margin-bottom: 12px;
	}

	.alert-error {
		padding: 10px 16px;
		border-radius: var(--radius-sm);
		background: var(--danger-dim);
		border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent);
		color: var(--danger);
		font-size: 13px;
		font-weight: 500;
		margin-bottom: 12px;
	}

	.row-item { justify-content: space-between; }

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
		color: var(--accent-ink);
	}

	@media (max-width: 700px) {
		.field-row { grid-template-columns: 1fr; }
	}

	@media (prefers-reduced-motion: reduce) {
		.btn-action:hover { transform: none; }
	}
</style>
