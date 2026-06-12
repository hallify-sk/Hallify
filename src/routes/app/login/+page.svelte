<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/stores';
	import { t } from '$lib/i18n';
	import AuthShell from '$lib/components/AuthShell.svelte';
	import type { ActionData } from './$types';

	interface Props { form: ActionData; }
	const { form }: Props = $props();

	const resetSuccess = $derived($page.url.searchParams.get('reset') === 'success');
</script>

<svelte:head><title>{t.auth.signIn} – Hallify</title></svelte:head>

<AuthShell>
	<div class="auth-header">
		<h1>{t.auth.welcomeBack}</h1>
		<p class="subtitle">{t.auth.signInSubtitle}</p>
	</div>

	{#if resetSuccess}
		<div class="notice notice-success">{t.forgotPassword.resetSuccess}</div>
	{/if}
	{#if form?.error}
		<div class="notice notice-error">{form.error}</div>
	{/if}

	<form method="POST" use:enhance class="auth-form">
		<div class="field">
			<label for="email">{t.auth.email}</label>
			<input id="email" name="email" type="email" placeholder="you@example.com" required autocomplete="email" />
		</div>
		<div class="field">
			<label for="password">
				{t.auth.password}
				<a href="/app/forgot-password" class="label-link">{t.forgotPassword.title}</a>
			</label>
			<input id="password" name="password" type="password" placeholder="••••••••" required autocomplete="current-password" />
		</div>
		<button type="submit" class="submit-btn">{t.auth.signIn}</button>
	</form>

	<p class="auth-switch">{t.auth.noAccount} <a href="/app/register">{t.auth.createAccount}</a></p>
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
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 12px;
		font-weight: 600;
		color: var(--text-muted);
	}

	.label-link {
		font-size: 11px;
		font-weight: 500;
		color: var(--text-subtle);
		text-decoration: none;
	}
	.label-link:hover { color: var(--accent); text-decoration: none; }

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
	.auth-switch a {
		color: var(--accent);
		font-weight: 600;
		text-decoration: none;
	}
	.auth-switch a:hover { text-decoration: underline; }
</style>
