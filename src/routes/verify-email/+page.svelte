<script lang="ts">
	import { pageTitle, venueTitle } from '$lib/page-title';
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n.svelte';
	import AuthShell from '$lib/components/AuthShell.svelte';
	import VenueAuthCard from '$lib/site/VenueAuthCard.svelte';
	import type { PageData, ActionData } from './$types';

	interface Props { data: PageData; form: ActionData; }
	const { data, form }: Props = $props();

	const sentTo = $derived(form && 'sent' in form && form.sent ? form.email : null);
	const error = $derived(form && 'error' in form ? form.error : null);
	const changeError = $derived(form && 'changeError' in form ? form.changeError : null);
	const shownEmail = $derived(sentTo ?? data.email);
	const title = $derived(data.verified ? t.identity.verifiedTitle : t.identity.pageTitle);
</script>

<svelte:head>
	<title>{data.domainOrg ? venueTitle(data.domainOrg.name, title) : pageTitle(title)}</title>
</svelte:head>

{#snippet body()}
	<div class="auth-header">
		<h1>{title}</h1>
		{#if data.verified}
			<p class="subtitle">{t.identity.verifiedLead.replace('{email}', data.email)}</p>
		{:else}
			<p class="subtitle">{t.identity.pageLead.replace('{email}', shownEmail)}</p>
			{#if data.gated}<p class="subtitle">{t.identity.gateLead}</p>{/if}
		{/if}
	</div>

	{#if sentTo}
		<div class="notice notice-success" role="status">{t.identity.resent.replace('{email}', sentTo)}</div>
	{/if}
	{#if error}
		<div class="notice notice-error" role="alert">{error}</div>
	{/if}

	{#if data.verified}
		<a class="submit-btn as-link" href={data.next}>{t.identity.continue}</a>
	{:else}
		<form method="POST" action="?/resend" use:enhance class="auth-form">
			<button type="submit" class="submit-btn">{t.identity.resend}</button>
		</form>

		{#if data.canChange}
			<details class="change" open={!!changeError}>
				<summary>{t.identity.changeTitle}</summary>
				<p class="hint">{t.identity.changeHint}</p>
				{#if changeError}
					<div class="notice notice-error" role="alert">{changeError}</div>
				{/if}
				<form method="POST" action="?/change" use:enhance class="auth-form">
					<div class="field">
						<label for="v-email">{t.identity.newEmail}</label>
						<input id="v-email" name="email" type="email" required autocomplete="email" value={data.email} />
					</div>
					<div class="field">
						<label for="v-password">{t.auth.password}</label>
						<input id="v-password" name="password" type="password" required autocomplete="current-password" />
					</div>
					<button type="submit" class="secondary-btn">{t.identity.changeSubmit}</button>
				</form>
			</details>
		{/if}
	{/if}

	<form method={data.domainOrg ? 'GET' : 'POST'} action={data.signOut} class="auth-switch">
		<button type="submit" class="link-btn">{t.identity.signOut}</button>
	</form>
{/snippet}

{#if data.domainOrg}
	<VenueAuthCard org={data.domainOrg}>{@render body()}</VenueAuthCard>
{:else}
	<AuthShell>{@render body()}</AuthShell>
{/if}

<style>
	.auth-header { margin-bottom: 28px; }

	h1 {
		font-size: 28px;
		font-weight: 550;
		color: var(--text-base);
		letter-spacing: -0.045em;
		line-height: 1.12;
		margin: 0 0 8px;
	}

	.subtitle {
		font-size: 14px;
		color: var(--text-muted);
		line-height: 1.75;
		margin: 0 0 6px;
		overflow-wrap: anywhere;
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
		border: 1px solid color-mix(in srgb, var(--success) 25%, transparent);
	}
	.notice-error {
		background: var(--danger-dim);
		color: var(--danger);
		border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent);
	}

	.auth-form { display: flex; flex-direction: column; gap: 16px; }
	.field { display: flex; flex-direction: column; gap: 5px; }
	label { font-size: 12px; font-weight: 600; color: var(--text-muted); }

	.submit-btn {
		width: 100%;
		padding: 12px;
		border-radius: var(--radius-sm);
		background: var(--accent);
		color: var(--accent-contrast);
		font-size: 14px;
		font-weight: 650;
		border: none;
		cursor: pointer;
		font-family: inherit;
		text-align: center;
		transition: transform .2s, background .2s;
	}
	.submit-btn:hover { background: var(--accent-hover); transform: translateY(-2px); }
	.submit-btn:active { transform: translateY(0); }
	.as-link { display: block; text-decoration: none; box-sizing: border-box; }
	.as-link:hover { text-decoration: none; }

	.secondary-btn {
		width: 100%;
		padding: 11px;
		border-radius: var(--radius-sm);
		background: transparent;
		color: var(--text-base);
		border: 1px solid var(--border);
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		font-family: inherit;
	}
	.secondary-btn:hover { border-color: var(--accent); color: var(--accent-ink); }

	.change { margin-top: 24px; border-top: 1px solid var(--border-subtle, var(--border)); padding-top: 16px; }
	.change summary { cursor: pointer; font-size: 13px; font-weight: 600; color: var(--text-base); }
	.hint { font-size: 12px; color: var(--text-muted); line-height: 1.6; margin: 8px 0 14px; }

	.auth-switch { text-align: center; margin-top: 28px; }
	.link-btn {
		background: none; border: none; padding: 0; cursor: pointer; font-family: inherit;
		font-size: 13px; color: var(--text-muted); text-decoration: underline;
	}
	.link-btn:hover { color: var(--accent-ink); }

	@media (prefers-reduced-motion: reduce) {
		.submit-btn:hover { transform: none; }
	}
</style>
