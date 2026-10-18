<script lang="ts">
	import { page } from '$app/stores';
	import { t } from '$lib/i18n.svelte';
	import SectionHeader from '$lib/components/SectionHeader.svelte';

	const { children } = $props();

	// Same shape as Settings: one destination, three linkable tabs, each a real
	// route so the back button and a bookmarked tab behave the way an operator
	// expects. `exact` is needed for Members because it is the index route —
	// a prefix match would leave it lit on /roles and /invites too.
	const tabs = $derived([
		{ href: '/app/manage/members',         label: t.peopleArea.tabMembers, exact: true },
		{ href: '/app/manage/members/roles',   label: t.peopleArea.tabRoles,   exact: false },
		{ href: '/app/manage/members/invites', label: t.peopleArea.tabInvites, exact: false },
	]);

	const path = $derived($page.url.pathname);
	const isActive = (tab: { href: string; exact: boolean }) =>
		tab.exact ? path === tab.href : path === tab.href || path.startsWith(tab.href + '/');
</script>

<div class="wrap page">
	<SectionHeader overline={t.peopleArea.overline} title={t.peopleArea.title} />
	<p class="page-sub">{t.peopleArea.sub}</p>

	<nav class="tabs" aria-label={t.peopleArea.title}>
		{#each tabs as tab (tab.href)}
			<a
				href={tab.href}
				class="tab"
				class:active={isActive(tab)}
				aria-current={isActive(tab) ? 'page' : undefined}
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
