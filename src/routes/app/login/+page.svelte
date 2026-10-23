<script lang="ts">
	import { pageTitle } from '$lib/page-title';
	import { enhance } from '$app/forms';
	import { page } from '$app/stores';
	import { t } from '$lib/i18n.svelte';
	import AuthShell from '$lib/components/AuthShell.svelte';
	import type { ActionData } from './$types';

	interface Props { form: ActionData; }
	const { form }: Props = $props();

	const resetSuccess = $derived($page.url.searchParams.get('reset') === 'success');
	const accountDeleted = $derived($page.url.searchParams.get('deleted') === '1');

	// Carry a ?redirect= through to registration, so someone who came here from a
	// venue page and turns out to have no account still lands back on it. Only a
	// same-origin path is forwarded; the register action re-validates it anyway.
	const nextParam = $derived.by(() => {
		const raw = $page.url.searchParams.get('redirect') ?? '';
		return raw.startsWith('/') && !raw.startsWith('//') && !raw.startsWith('/\\') ? raw : '';
	});
	const registerHref = $derived(nextParam ? `/app/register?redirect=${encodeURIComponent(nextParam)}` : '/app/register');
	const operatorHref = $derived(
		nextParam
			? `/app/register?intent=operator&redirect=${encodeURIComponent(nextParam)}`
			: '/app/register?intent=operator'
	);
</script>

<svelte:head><title>{pageTitle(t.auth.signIn)}</title></svelte:head>

<AuthShell>
	<div class="section-head auth-header">
		<h1>{t.auth.welcomeBack}</h1>
		<p class="subtitle">{t.auth.signInSubtitle}</p>
	</div>

	{#if accountDeleted}
		<div class="notice notice-success" role="status">{t.identity.deletedNotice}</div>
	{/if}
	{#if resetSuccess}
		<div class="notice notice-success">{t.forgotPassword.resetSuccess}</div>
	{/if}
	{#if form?.error}
		<div class="notice notice-error">{form.error}</div>
	{/if}

	<form method="POST" use:enhance class="auth-form">
		<!-- Carried into the POST as well as the register links: the action re-validates
		     it, and without it signing in from an invitation link would drop the
		     invitation and land on the dashboard. -->
		{#if nextParam}<input type="hidden" name="redirect" value={nextParam} />{/if}
		<div class="field">
			<label for="email">{t.auth.email}</label>
			<input id="email" name="email" type="email" placeholder="you@example.com" required autocomplete="email" />
		</div>
		<!-- The recovery link comes AFTER the input in the DOM, so Tab goes from the
		     email straight to the password; the grid still shows it beside the label.
		     Inside the label it took the Tab stop, and Enter then opened recovery. -->
		<div class="field field--password">
			<label for="password">{t.auth.password}</label>
			<input id="password" name="password" type="password" placeholder="••••••••" required autocomplete="current-password" />
			<a href="/app/forgot-password" class="label-link">{t.forgotPassword.title}</a>
		</div>
		<button type="submit" class="submit-btn">{t.auth.signIn}</button>
	</form>

	<p class="auth-switch">{t.auth.noAccount} <a href={registerHref}>{t.auth.createAccount}</a></p>
	<p class="auth-aside">{t.authPages.loginOperatorPrompt} <a href={operatorHref}>{t.authPages.loginOperatorLink}</a></p>
</AuthShell>

<style>
	/* Spacing and the subtitle's treatment come from the global .section-head. */
	h1 {
		font-size: 28px;
		font-weight: 550;
		color: var(--text-base);
		letter-spacing: -0.045em;
		line-height: 1.12;
		margin: 0;
	}

	.notice {
		padding: 10px 14px;
		border-radius: var(--radius-sm);
		font-size: 13px;
		font-weight: 500;
		margin-bottom: 20px;
	}
	.notice-success {
		background: var(--success-dim);
		color: var(--success);
	}
	.notice-error {
		background: var(--danger-dim);
		color: var(--danger);
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

	.field--password {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		row-gap: 5px;
	}
	.field--password label { grid-column: 1; grid-row: 1; }
	.field--password input { grid-column: 1 / -1; grid-row: 2; }
	.field--password .label-link { grid-column: 2; grid-row: 1; }

	.label-link {
		font-size: 11px;
		font-weight: 500;
		color: var(--text-subtle);
		text-decoration: none;
	}
	.label-link:hover { color: var(--accent-ink); text-decoration: none; }

	.submit-btn {
		width: 100%;
		padding: 12px;
		margin-top: 6px;
		border-radius: var(--radius-sm);
		background: var(--accent);
		color: var(--accent-contrast);
		font-size: 14px;
		font-weight: 650;
		border: none;
		cursor: pointer;
		font-family: inherit;
		transition: transform .2s, background .2s;
	}
	.submit-btn:hover { background: var(--accent-hover); transform: translateY(-2px); }
	.submit-btn:active { transform: translateY(0); }

	.auth-switch {
		text-align: center;
		font-size: 13px;
		color: var(--text-muted);
		margin-top: 28px;
	}
	.auth-switch a {
		color: var(--accent-ink);
		font-weight: 600;
		text-decoration: none;
	}
	.auth-switch a:hover { text-decoration: underline; }

	/* The second audience. Both sign in here, so the operator route stays visible
	   without competing with the ordinary "create an account" line above it. */
	.auth-aside {
		text-align: center;
		font-size: 12px;
		color: var(--text-subtle);
		margin: 10px 0 0;
		padding-top: 12px;
		border-top: 1px solid var(--border-subtle);
	}
	.auth-aside a { color: var(--accent-ink); font-weight: 600; text-decoration: none; }
	.auth-aside a:hover { text-decoration: underline; }

	@media (prefers-reduced-motion: reduce) {
		.submit-btn:hover { transform: none; }
	}
</style>
