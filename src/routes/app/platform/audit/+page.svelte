<script lang="ts">
	import { pageTitle } from '$lib/page-title';
	import { t, getLocale } from '$lib/i18n.svelte';
	import { formatDateTime } from '$lib/format';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/** The server returns at most this many rows (see +page.server.ts). */
	const LIMIT = 300;

	const FILTERS = [
		{ id: '', label: () => t.platformExtra.auditAll },
		{ id: 'org.', label: () => t.platformOrgs.organizations },
		{ id: 'user.', label: () => t.platformExtra.users },
		{ id: 'org.view_as', label: () => t.platformOrgs.viewAs },
		{ id: 'announcement.', label: () => t.platformMisc.announcementsTitle },
		{ id: 'email.', label: () => t.platformMisc.emailTitle },
		{ id: 'settings.', label: () => t.platformSettings.title },
		{ id: 'webhook.', label: () => t.platformWebhooks.title },
	];

	type Row = PageData['rows'][number];
	function targetHref(row: Row): string | null {
		if (row.target_type === 'org' && row.target_id) return `/app/platform/orgs/${row.target_id}`;
		if (row.target_type === 'user' && row.target_id) return `/app/platform/users/${row.target_id}`;
		if (row.target_type === 'announcement') return '/app/platform/announcements';
		if (row.target_type === 'email') return '/app/platform/email';
		if (row.target_type === 'settings') return '/app/platform/settings';
		return null;
	}
	/** What the row is about, in words: the stored label, or a named settings area,
	 *  never a bare id when something better is known. */
	function targetText(row: Row): string {
		if (row.target_label) return row.target_label;
		if (row.target_id && t.platformExtra.auditTargets[row.target_id]) return t.platformExtra.auditTargets[row.target_id];
		if (row.target_type === 'org') return t.platformOrgs.organization;
		return row.target_id ?? '—';
	}
</script>

<svelte:head><title>{pageTitle(t.platformOrgs.auditTitle, t.platformOrgs.platformAdmin)}</title></svelte:head>

<div class="wrap page">
	<a href="/app/platform" class="back">
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
		{t.platformExtra.overviewTitle}
	</a>

	<header class="page-header">
		<div>
			<p class="eyebrow">{t.platformOrgs.platformAdmin}</p>
			<div class="page-header-left">
				<h1 class="page-title">{t.platformOrgs.auditTitle}</h1>
				<span class="total-badge">{data.rows.length}</span>
			</div>
			<p class="page-lead">{t.platformExtra.auditLead}</p>
		</div>
	</header>

	<section class="section section--lead">
		<nav class="chip-filters" aria-label={t.platformOrgs.auditTitle}>
			{#each FILTERS as f (f.id)}
				<a href={f.id ? `?action=${encodeURIComponent(f.id)}` : '?'} class="chip" class:active={data.action === f.id} aria-current={data.action === f.id ? 'page' : undefined}>{f.label()}</a>
			{/each}
		</nav>

		{#if data.rows.length === 0}
			<div class="card--inset state-block">
				<span class="icon-tile" aria-hidden="true">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
				</span>
				<h2>{t.platformOrgs.auditEmpty}</h2>
			</div>
		{:else}
			<div class="table-scroll">
				<div class="row-list audit-table" role="table" aria-label={t.platformOrgs.auditTitle}>
					<div role="row" class="row-item row-head audit-row">
						<span role="columnheader">{t.platformOrgs.colDate}</span>
						<span role="columnheader">{t.platformExtra.auditWhat}</span>
						<span role="columnheader">{t.platformExtra.auditTarget}</span>
						<span role="columnheader">{t.platformExtra.auditWho}</span>
					</div>
					{#each data.rows as row (row.id)}
						{@const href = targetHref(row)}
						<div role="row" class="row-item audit-row">
							<span role="cell" class="muted nowrap">{formatDateTime(row.created_at, getLocale())}</span>
							<span role="cell" class="cell-main">
								<span class="action">{t.platformExtra.auditActions[row.action] ?? row.action}</span>
								<span class="cell-sub mono" title={row.details ?? row.action}>{row.action}{#if row.details}{' '}· {row.details}{/if}</span>
							</span>
							<span role="cell" class="ellipsis" title={row.target_label ?? row.target_id ?? ''}>
								{#if href}<a {href}>{targetText(row)}</a>{:else}{targetText(row)}{/if}
							</span>
							<span role="cell" class="muted ellipsis" title={row.actor_email ?? ''}>{row.actor_email ?? '—'}</span>
						</div>
					{/each}
				</div>
			</div>
			{#if data.rows.length >= LIMIT}<p class="table-note">{t.platformExtra.auditCapped(LIMIT)}</p>{/if}
		{/if}
	</section>
</div>

<style>
	.audit-table { min-width: 720px; }
	.audit-row { display: grid; grid-template-columns: 150px minmax(0, 1.8fr) minmax(0, 1fr) minmax(0, 1fr); gap: 14px; align-items: start; }
	.action { font-weight: 600; }
</style>
