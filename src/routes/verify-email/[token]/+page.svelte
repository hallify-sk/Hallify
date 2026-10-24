<script lang="ts">
	import { enhance } from '$app/forms';
	import { pageTitle, venueTitle } from '$lib/page-title';
	import { t } from '$lib/i18n.svelte';
	import AuthShell from '$lib/components/AuthShell.svelte';
	import VenueAuthCard from '$lib/site/VenueAuthCard.svelte';
	import type { ActionData, PageData } from './$types';

	interface Props { data: PageData; form: ActionData; }
	const { data, form }: Props = $props();

	const joined = $derived(form && 'joined' in form ? form.joined : null);
	const joinError = $derived(form && 'joinError' in form ? form.joinError : '');

	const ok = $derived(data.result.status === 'verified');
	const title = $derived(ok ? t.identity.verifiedTitle : t.identity.linkInvalidTitle);
</script>

<svelte:head>
	<title>{data.domainOrg ? venueTitle(data.domainOrg.name, title) : pageTitle(title)}</title>
</svelte:head>

{#snippet body()}
	<div class="auth-header">
		<h1>{title}</h1>
		{#if data.result.status === 'verified'}
			<p class="subtitle">{t.identity.verifiedLead.replace('{email}', data.result.email)}</p>
			{#if joined}
				<p class="subtitle">{t.identity.claimedNote(joined)}</p>
			{/if}
		{:else}
			<p class="subtitle">{data.result.status === 'stale' ? t.identity.linkStale : t.identity.linkInvalid}</p>
		{/if}
	</div>

	<!-- Old venue accounts with this address are joined only with the Hallify password
	     (or a session of the account) as well as this link: the account may have been
	     made with this address by someone else. -->
	{#if ok && data.join && joined === null}
		<section class="join" aria-labelledby="join-title">
			<h2 id="join-title">{t.identity.joinTitle}</h2>
			<p class="hint">{t.identity.joinLead(data.join.venues.join(', '))}</p>
			{#if joinError}
				<div class="notice notice-error" role="alert">{joinError}</div>
			{/if}
			<form method="POST" action="?/join" use:enhance class="auth-form">
				{#if !data.join.signedIn}
					<div class="field">
						<label for="j-password">{t.identity.joinPassword}</label>
						<input id="j-password" name="password" type="password" required autocomplete="current-password" />
					</div>
				{/if}
				<button type="submit" class="secondary-btn">{t.identity.joinSubmit}</button>
			</form>
			{#if !data.join.signedIn}
				<p class="hint"><a href={data.forgotUrl}>{t.identity.joinNotYours}</a></p>
			{/if}
		</section>
	{/if}

	{#if ok}
		<a class="submit-btn" href={data.next}>{t.identity.continue}</a>
	{:else}
		<a class="submit-btn" href={data.resendUrl}>{t.identity.resend}</a>
	{/if}
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

	.join { margin-bottom: 24px; padding-bottom: 20px; border-bottom: 1px solid var(--border-subtle, var(--border)); }
	h2 { font-size: 15px; font-weight: 650; color: var(--text-base); margin: 0 0 4px; }
	.hint { font-size: 12px; color: var(--text-muted); line-height: 1.6; margin: 8px 0 14px; }
	.hint a { color: var(--accent-ink); }
	.notice {
		padding: 10px 14px;
		border-radius: var(--radius-sm);
		font-size: 13px;
		font-weight: 500;
		margin-bottom: 16px;
	}
	.notice-error {
		background: var(--danger-dim);
		color: var(--danger);
		border: 1px solid color-mix(in srgb, var(--danger) 25%, transparent);
	}
	.auth-form { display: flex; flex-direction: column; gap: 14px; }
	.field { display: flex; flex-direction: column; gap: 5px; }
	label { font-size: 12px; font-weight: 600; color: var(--text-muted); }
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

	.submit-btn {
		display: block;
		box-sizing: border-box;
		width: 100%;
		padding: 12px;
		border-radius: var(--radius-sm);
		background: var(--accent);
		color: var(--accent-contrast);
		font-size: 14px;
		font-weight: 650;
		text-align: center;
		text-decoration: none;
		transition: transform .2s, background .2s;
	}
	.submit-btn:hover { background: var(--accent-hover); transform: translateY(-2px); text-decoration: none; }
	.submit-btn:active { transform: translateY(0); }

	@media (prefers-reduced-motion: reduce) {
		.submit-btn:hover { transform: none; }
	}
</style>
