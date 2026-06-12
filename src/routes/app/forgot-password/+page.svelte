<script lang="ts">
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n';
	import AuthShell from '$lib/components/AuthShell.svelte';
	import type { ActionData } from './$types';

	interface Props { form: ActionData; }
	const { form }: Props = $props();
</script>

<svelte:head><title>{t.forgotPassword.title} – Hallify</title></svelte:head>

<AuthShell>
	<div class="auth-header">
		<h1>{t.forgotPassword.title}</h1>
		<p class="subtitle">{t.forgotPassword.subtitle}</p>
	</div>

	{#if form?.sent}
		<div class="notice notice-success">{t.forgotPassword.sent}</div>
	{/if}
	{#if form?.error}
		<div class="notice notice-error">{form.error}</div>
	{/if}

	<form method="POST" use:enhance class="auth-form">
		<div class="field">
			<label for="email">{t.auth.email}</label>
			<input id="email" name="email" type="email" placeholder="you@example.com" required autocomplete="email" />
		</div>
		<button type="submit" class="submit-btn">{t.forgotPassword.send}</button>
	</form>

	<p class="auth-switch">
		<a href="/app/login">
			<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
				<polyline points="15 18 9 12 15 6"/>
			</svg>
			{t.forgotPassword.backToLogin}
		</a>
	</p>
</AuthShell>

<style>
	.auth-header { margin-bottom: 32px; }

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
		line-height: 1.5;
	}

	.notice {
		padding: 10px 14px;
		border-radius: 8px;
		font-size: 13px;
		font-weight: 500;
		margin-bottom: 20px;
	}
	.notice-success {
		background: var(--success-dim);
		color: var(--success);
		border: 1px solid color-mix(in srgb, var(--success) 25%, transparent);
	}
	.notice-error {
		background: var(--danger-dim);
		color: var(--danger);
		border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent);
	}

	.auth-form { display: flex; flex-direction: column; gap: 16px; }

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
		margin-top: 24px;
	}
	.auth-switch a {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: var(--text-muted);
		text-decoration: none;
	}
	.auth-switch a:hover { color: var(--accent); text-decoration: none; }
</style>
