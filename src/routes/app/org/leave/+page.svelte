<script lang="ts">
	import { pageTitle } from '$lib/page-title';
	import { enhance } from '$app/forms';
	import { t } from '$lib/i18n.svelte';
	import { confirmFirst } from '$lib/forms';
	import type { PageData, ActionData } from './$types';

	const { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>{pageTitle(t.membersAdmin.leaveOrg)}</title></svelte:head>

<div class="wrap page">
	<div class="leave">
		<h1>{t.membersAdmin.leaveOrg}</h1>
		<p class="lead">{t.membersAdmin.leaveOrgDescPre} <strong>{data.orgName}</strong>. {t.membersAdmin.leaveOrgDescPost}</p>
		{#if data.isOwner}
			<p class="note">{t.serverErrors.onlyOwnerPromoteOrClose}</p>
		{/if}
		{#if form?.error}
			<div class="alert-error" role="alert">{form.error}</div>
		{/if}
		<form method="POST" use:enhance={confirmFirst(() => t.membersAdmin.confirmLeave)} class="actions">
			<button type="submit" class="btn-danger" disabled={data.impersonated}>{t.membersAdmin.leave}</button>
			<a href="/app/" class="btn-outline">{t.common.cancel}</a>
		</form>
	</div>
</div>

<style>
	.page { padding-block: 48px; }
	.leave { max-width: 520px; }
	h1 { font-size: 22px; font-weight: 650; letter-spacing: -.03em; margin: 0 0 10px; color: var(--text-base); }
	.lead, .note { font-size: 14px; line-height: 1.6; color: var(--text-muted); margin: 0 0 16px; }
	.actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 8px; }
	.actions a { text-decoration: none; }
</style>
