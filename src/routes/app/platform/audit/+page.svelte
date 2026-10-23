<script lang="ts">
	import { pageTitle } from '$lib/page-title';
	import { t, getLocale } from '$lib/i18n.svelte';
	import { formatDateTime } from '$lib/format';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const FILTERS = [
		{ id: '', label: () => t.platformExtra.auditAll },
		{ id: 'org.', label: () => t.platformOrgs.organizations },
		{ id: 'user.', label: () => t.platformExtra.users },
		{ id: 'org.view_as', label: () => t.platformOrgs.viewAs },
		{ id: 'announcement.', label: () => t.platformMisc.announcementsTitle },
		{ id: 'settings.', label: () => t.platformSettings.title },
	];

	function targetHref(row: PageData['rows'][number]): string | null {
		if (row.target_type === 'org' && row.target_id) return `/app/platform/orgs/${row.target_id}`;
		if (row.target_type === 'user' && row.target_id) return `/app/platform/users/${row.target_id}`;
		return null;
	}
</script>

<svelte:head><title>{pageTitle(t.platformOrgs.auditTitle)}</title></svelte:head>

<div class="wrap page">
	<section class="section section--lead">
		<div class="section-head">
			<p class="eyebrow">{t.platformOrgs.platformAdmin}</p>
			<h1>{t.platformOrgs.auditTitle}</h1>
			<p>{t.platformExtra.auditLead}</p>
		</div>

		<nav class="filters" aria-label={t.platformOrgs.auditTitle}>
			{#each FILTERS as f (f.id)}
				<a href={f.id ? `?action=${encodeURIComponent(f.id)}` : '?'} class="filter" class:active={data.action === f.id} aria-current={data.action === f.id ? 'page' : undefined}>{f.label()}</a>
			{/each}
		</nav>

		{#if data.rows.length === 0}
			<p class="muted">{t.platformOrgs.auditEmpty}</p>
		{:else}
			<div class="row-list" role="table">
				<div role="row" class="row-item row-head audit-row">
					<span role="columnheader">{t.platformOrgs.colDate}</span>
					<span role="columnheader">{t.platformExtra.auditWho}</span>
					<span role="columnheader">{t.platformExtra.auditWhat}</span>
					<span role="columnheader">{t.platformExtra.auditTarget}</span>
				</div>
				{#each data.rows as row (row.id)}
					{@const href = targetHref(row)}
					<div role="row" class="row-item audit-row">
						<span role="cell" class="muted">{formatDateTime(row.created_at, getLocale())}</span>
						<span role="cell" class="ellipsis">{row.actor_email ?? '—'}</span>
						<span role="cell"><code>{row.action}</code>{#if row.details}<span class="details">{row.details}</span>{/if}</span>
						<span role="cell" class="ellipsis">
							{#if href}<a {href}>{row.target_label ?? row.target_id}</a>{:else}{row.target_label ?? row.target_id ?? '—'}{/if}
						</span>
					</div>
				{/each}
			</div>
		{/if}
	</section>
</div>

<style>
	.page { padding-block: 24px; }
	h1 { font-size: var(--display-size); font-weight: 550; letter-spacing: -.055em; line-height: 1.08; margin: 0; }
	.filters { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 16px; }
	.filter { font-size: 12px; font-weight: 600; padding: 5px 11px; border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text-muted); text-decoration: none; }
	.filter:hover { background: var(--bg-hover); text-decoration: none; }
	.filter.active { border-color: var(--accent); background: var(--accent-dim); color: var(--accent-ink); }
	.audit-row { display: grid; grid-template-columns: 150px minmax(0, 1fr) minmax(0, 1.6fr) minmax(0, 1fr); gap: 12px; align-items: start; font-size: 12.5px; }
	.row-head { font-size: 10px; font-weight: 650; color: var(--text-muted); text-transform: uppercase; letter-spacing: .13em; }
	.muted { color: var(--text-muted); }
	.ellipsis { overflow: hidden; text-overflow: ellipsis; }
	.details { display: block; font-size: 11px; color: var(--text-subtle); overflow-wrap: anywhere; margin-top: 2px; }
	@media (max-width: 760px) {
		.audit-row { grid-template-columns: 1fr 1fr; }
		.row-head { display: none; }
	}
</style>
