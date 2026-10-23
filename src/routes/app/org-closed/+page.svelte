<script lang="ts">
	import { pageTitle } from '$lib/page-title';
	import { t } from '$lib/i18n.svelte';
	import type { PageData } from './$types';

	const { data }: { data: PageData } = $props();
</script>

<svelte:head><title>{pageTitle(t.membersAdmin.orgClosedTitle)}</title></svelte:head>

<div class="wrap page">
	<div class="closed" role="status">
		<div class="icon-tile" aria-hidden="true">
			<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20 6 9 17l-5-5"/></svg>
		</div>
		<h1>{t.membersAdmin.orgClosedTitle}</h1>
		<p class="lead">{t.membersAdmin.orgClosedLead(data.name)}</p>
		<ul class="facts">
			{#if data.subscriptionCancelled}
				<li>{t.membersAdmin.orgClosedBilling}</li>
			{/if}
			{#if data.clientsNotified > 0}
				<li>{t.membersAdmin.orgClosedClients(data.clientsNotified)}</li>
			{/if}
			{#if data.clientsNotNotified > 0}
				<li class="warn">{t.membersAdmin.orgClosedClientsFailed(data.clientsNotNotified)}</li>
			{/if}
		</ul>
		<div class="actions">
			<a href="/app/" class="btn-action">{t.membersAdmin.orgClosedContinue}</a>
			{#if !data.hasOtherOrg}
				<a href="/app/org/new" class="btn-outline">{t.membersAdmin.orgClosedNewOrg}</a>
			{/if}
		</div>
	</div>
</div>

<style>
	.page { padding-block: 48px; }
	.closed { max-width: 520px; }
	.icon-tile { width: 48px; height: 48px; margin-bottom: 18px; color: var(--success); }
	h1 { font-size: 22px; font-weight: 650; letter-spacing: -.03em; margin: 0 0 10px; color: var(--text-base); }
	.lead { font-size: 14px; line-height: 1.6; color: var(--text-muted); margin: 0 0 14px; }
	.facts { margin: 0 0 22px; padding-left: 18px; font-size: 13px; line-height: 1.7; color: var(--text-base); }
	.facts .warn { color: var(--warning); }
	.actions { display: flex; gap: 10px; flex-wrap: wrap; }
	.actions a { text-decoration: none; }
</style>
