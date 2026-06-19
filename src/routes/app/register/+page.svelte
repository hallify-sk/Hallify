<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n.svelte';
	import AuthShell from '$lib/components/AuthShell.svelte';
	import type { ActionData } from './$types';

	interface Props { form: ActionData; }
	const { form }: Props = $props();
</script>

<svelte:head><title>{t.auth.createAccount} – Hallify</title></svelte:head>

<AuthShell>
	<div class="auth-header">
		<h1>{t.authPages.registerTitle}</h1>
		<p class="subtitle">{t.authPages.registerSubtitle}</p>
	</div>

	{#if form?.error}
		<div class="notice notice-error">{form.error}</div>
	{/if}

	<form method="POST" use:enhance class="auth-form">
		<div class="field-row">
			<div class="field">
				<label for="firstName">{t.auth.firstName}</label>
				<input id="firstName" name="firstName" type="text" placeholder="Ján" required />
			</div>
			<div class="field">
				<label for="lastName">{t.auth.lastName}</label>
				<input id="lastName" name="lastName" type="text" placeholder="Novák" required />
			</div>
		</div>
		<div class="field">
			<label for="email">{t.auth.email}</label>
			<input id="email" name="email" type="email" placeholder="you@example.com" required autocomplete="email" />
		</div>
		<div class="field">
			<label for="password">{t.auth.password}</label>
			<input id="password" name="password" type="password" placeholder={t.auth.passwordMin} required autocomplete="new-password" />
		</div>
		<button type="submit" class="submit-btn">{t.authPages.registerSubmit}</button>
	</form>

	<p class="auth-switch">{t.auth.hasAccount} <a href="/app/login">{t.auth.signInLink}</a></p>
</AuthShell>

<style>
	.auth-header { margin-bottom: 24px; }

	h1 {
		font-size: 24px;
		font-weight: 700;
		color: var(--text-base);
		letter-spacing: -0.02em;
		margin-bottom: 6px;
	}

	.subtitle {
		font-size: 14px;
		color: var(--text-muted);
	}

	.notice {
		padding: 10px 14px;
		border-radius: 8px;
		font-size: 13px;
		font-weight: 500;
		margin-bottom: 16px;
		background: var(--danger-dim);
		color: var(--danger);
		border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent);
	}

	.auth-form { display: flex; flex-direction: column; gap: 16px; }

	.field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

	.field { display: flex; flex-direction: column; gap: 5px; }

	label {
		font-size: 12px;
		font-weight: 600;
		color: var(--text-muted);
	}

	.submit-btn {
		width: 100%;
		padding: 11px;
		margin-top: 4px;
		border-radius: 8px;
		background: var(--accent);
		color: #fff;
		font-size: 14px;
		font-weight: 600;
		border: none;
		cursor: pointer;
		font-family: inherit;
		transition: background .15s;
	}
	.submit-btn:hover { background: var(--accent-hover); }

	.auth-switch {
		text-align: center;
		font-size: 13px;
		color: var(--text-muted);
		margin-top: 24px;
	}
	.auth-switch a { color: var(--accent); font-weight: 600; text-decoration: none; }
	.auth-switch a:hover { text-decoration: underline; }
</style>
