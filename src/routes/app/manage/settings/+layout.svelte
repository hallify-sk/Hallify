<script lang="ts">
	import { page } from '$app/stores';
	import { t } from '$lib/i18n.svelte';
	import SectionHeader from '$lib/components/SectionHeader.svelte';

	const { children } = $props();

	// One destination, three linkable tabs. Each is a real route, so the browser's
	// back button and a bookmarked tab both behave the way an operator expects.
	const tabs = $derived([
		{ href: '/app/manage/settings/domains',   label: t.settingsPages.domains },
		{ href: '/app/manage/settings/customize', label: t.settingsPages.customizeTitle },
		{ href: '/app/manage/settings/site',      label: t.settingsPages.siteTab },
		{ href: '/app/manage/settings/analytics', label: t.settingsPages.analyticsTitle },
		{ href: '/app/manage/settings/advanced',  label: t.settingsPages.tabAdvanced },
	]);

	const path = $derived($page.url.pathname);
	const isActive = (href: string) => path === href || path.startsWith(href + '/');
</script>

<div class="wrap page">
	<SectionHeader overline={t.settingsPages.organization} title={t.settings.title} />
	<p class="page-sub">{t.settingsPages.settingsSub}</p>

	<nav class="tabs" aria-label={t.settings.title}>
		{#each tabs as tab (tab.href)}
			<a
				href={tab.href}
				class="tab"
				class:active={isActive(tab.href)}
				aria-current={isActive(tab.href) ? 'page' : undefined}
			>{tab.label}</a>
		{/each}
	</nav>

	{@render children()}
</div>

<style>
	.page { padding-block: 24px; }

	/* SectionHeader owns the 24px gap under the title; the subtitle belongs with
	   the title, so pull it back up against it. */
	.page-sub {
		font-size: 13px;
		color: var(--text-muted);
		line-height: 1.6;
		max-width: 70ch;
		margin: -18px 0 0;
	}

	/* Square tabs with an underline indicator — no pills, no rounded tabs. */
	.tabs {
		display: flex;
		gap: 2px;
		margin: 20px 0 0;
		border-bottom: 1px solid var(--border);
		overflow-x: auto;
		scrollbar-width: none;
	}
	.tabs::-webkit-scrollbar { display: none; }

	.tab {
		padding: 9px 14px;
		border-radius: var(--radius-sm) var(--radius-sm) 0 0;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		font-size: 13px;
		font-weight: 600;
		color: var(--text-muted);
		text-decoration: none;
		white-space: nowrap;
		transition: background .15s, color .15s, border-color .15s;
	}
	.tab:hover {
		background: var(--bg-hover);
		color: var(--text-base);
		text-decoration: none;
	}
	.tab.active {
		color: var(--text-base);
		border-bottom-color: var(--accent);
	}
</style>
