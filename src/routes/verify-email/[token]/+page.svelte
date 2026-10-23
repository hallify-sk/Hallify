<script lang="ts">
	import { pageTitle, venueTitle } from '$lib/page-title';
	import { t } from '$lib/i18n.svelte';
	import AuthShell from '$lib/components/AuthShell.svelte';
	import VenueAuthCard from '$lib/site/VenueAuthCard.svelte';
	import type { PageData } from './$types';

	interface Props { data: PageData; }
	const { data }: Props = $props();

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
			{#if data.result.claimed > 0}
				<p class="subtitle">{t.identity.claimedNote(data.result.claimed)}</p>
			{/if}
		{:else}
			<p class="subtitle">{data.result.status === 'stale' ? t.identity.linkStale : t.identity.linkInvalid}</p>
		{/if}
	</div>

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
