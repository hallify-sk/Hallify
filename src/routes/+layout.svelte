<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import { page } from '$app/stores';
	import { themeStore } from '$lib/stores/theme.svelte';

	const { children, data } = $props();

	const branding = $derived(data.branding);

	function hexToRgb(hex: string): string {
		const h = hex.replace('#', '');
		const r = parseInt(h.substring(0, 2), 16);
		const g = parseInt(h.substring(2, 4), 16);
		const b = parseInt(h.substring(4, 6), 16);
		return `${r}, ${g}, ${b}`;
	}

	function dimColor(hex: string, opacity: number): string {
		return `rgba(${hexToRgb(hex)}, ${opacity})`;
	}

	const brandStyle = $derived(
		branding?.primaryColor
			? `--accent: ${branding.primaryColor}; --accent-dim: ${dimColor(branding.primaryColor, 0.1)}; --accent-hover: ${branding.primaryColor}cc; --accent-action: ${branding.primaryColor}; --accent-action-dim: ${dimColor(branding.primaryColor, 0.1)};`
			: ''
	);

	const orgTheme = $derived(branding?.theme ?? 'slate');

	const AUTH_PATHS = ['/app/login', '/app/register', '/app/forgot-password', '/app/reset-password', '/app/invite', '/login'];
	const isAuthPage = $derived(AUTH_PATHS.some(p => $page.url.pathname.startsWith(p)));
	const isLandingPage = $derived($page.url.pathname === '/');
	const isPublicHallsPage = $derived($page.url.pathname.startsWith('/halls'));

	onMount(() => {
		const saved = localStorage.getItem('hallify-theme');
		themeStore.set(saved ?? orgTheme);
	});

	// When org theme changes (e.g. org switch) and user has no personal preference, adopt it
	$effect(() => {
		const o = orgTheme;
		if (typeof localStorage !== 'undefined') {
			const saved = localStorage.getItem('hallify-theme');
			if (!saved) themeStore.set(o);
		}
	});
</script>

{#if isLandingPage || isPublicHallsPage}
	<div style={brandStyle}>
		{@render children()}
	</div>
{:else}
	<div class="app-shell" style={brandStyle}>
		{#if !isAuthPage}
			<Sidebar
				user={data.user}
				branding={branding}
				currentOrg={data.currentOrg}
				orgs={data.orgs ?? []}
				unreadMessages={data.unreadMessages ?? 0}
			/>
		{/if}
		<main class="app-main" class:full-page={isAuthPage}>
			{@render children()}
		</main>
	</div>
{/if}

<style>
	.app-shell {
		display: flex;
		flex-direction: row;
		height: 100vh;
		overflow: hidden;
	}

	.app-main {
		flex: 1;
		overflow-y: auto;
		overflow-x: hidden;
		background: var(--bg-base);
		min-width: 0;
	}

	.app-main.full-page {
		background: var(--bg-panel);
	}
</style>
