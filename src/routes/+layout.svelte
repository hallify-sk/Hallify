<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import { page } from '$app/stores';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { setLocale } from '$lib/i18n.svelte';
	import { playSound } from '$lib/sounds';
	import ConsentBanner from '$lib/components/ConsentBanner.svelte';
	import { setUserContext } from '$lib/analytics';

	const { children, data } = $props();

	// Sync the reactive locale with the server-resolved locale. Runs synchronously during
	// SSR render (before children) so server HTML matches, and re-syncs on navigation
	// (e.g. an org switch or a ?lang= change). A manual switch (chooseLocale) updates the
	// cookie, so the next server resolution agrees with the client.
	setLocale(data.locale ?? 'sk');
	$effect(() => { setLocale(data.locale ?? 'sk'); });

	// ─── Live notification counts (polled; drive sidebar pings + sounds) ───
	let liveUnreadMessages = $state(0);
	let liveUnreadAnnouncements = $state(0);
	$effect(() => { liveUnreadMessages = data.unreadMessages ?? 0; });
	$effect(() => { liveUnreadAnnouncements = data.unreadAnnouncements ?? 0; });

	onMount(() => {
		if (!data.user) return;
		let prevMessages = data.unreadMessages ?? 0;
		const seenAnnouncements = new Set<string>();
		let primed = false; // first poll seeds state without playing sounds

		async function poll() {
			try {
				const res = await fetch('/api/notifications', { headers: { accept: 'application/json' } });
				if (!res.ok) return;
				const n = await res.json() as { unreadMessages: number; unreadAnnouncements: number; announcements: { id: string }[] };

				// New message while the tab is in the background → ticket sound.
				if (primed && n.unreadMessages > prevMessages && document.hidden) playSound('ticket');
				prevMessages = n.unreadMessages;
				liveUnreadMessages = n.unreadMessages;

				// A freshly-received announcement → announcement sound (once per id).
				liveUnreadAnnouncements = n.unreadAnnouncements;
				let fresh = false;
				for (const a of n.announcements ?? []) {
					if (!seenAnnouncements.has(a.id)) { seenAnnouncements.add(a.id); if (primed) fresh = true; }
				}
				if (fresh) playSound('announcement');

				primed = true;
			} catch { /* offline — try again next tick */ }
		}

		poll();
		const timer = setInterval(poll, 15_000);
		return () => clearInterval(timer);
	});

	// Push segmentation context on load and whenever it changes (login, org switch,
	// plan change). setUserContext de-dupes, so navigation doesn't spam the dataLayer.
	$effect(() => {
		if (data.analyticsUser) setUserContext(data.analyticsUser);
	});

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
	const isLandingPage = $derived(['/', '/pre-prevadzkovatelov', '/priestory'].includes($page.url.pathname));
	const isPublicHallsPage = $derived($page.url.pathname.startsWith('/halls'));
	// Document-style pages (printable seating manifest) render without the app shell.
	const isDocPage = $derived($page.url.pathname.endsWith('/manifest'));
	// Legal documents render standalone, like the landing page.
	const isLegalPage = $derived(['/terms', '/privacy', '/dpa'].includes($page.url.pathname));

	function osTheme(): string {
		return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'slate';
	}

	onMount(() => {
		const saved = localStorage.getItem('hallify-theme');
		themeStore.set(saved ?? osTheme());
	});

	// When org theme changes (e.g. org switch) and user has no personal preference,
	// fall back to OS preference rather than the org default.
	$effect(() => {
		const _o = orgTheme;
		if (typeof localStorage !== 'undefined') {
			const saved = localStorage.getItem('hallify-theme');
			if (!saved) themeStore.set(osTheme());
		}
	});
</script>

<!-- Consent gate for GTM. Renders nothing when no container is configured. -->
<ConsentBanner containerId={data.gtmId ?? null} />

{#if isLandingPage || isPublicHallsPage || isDocPage || isLegalPage}
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
				allOrgs={data.allOrgs ?? []}
				onBubble={data.onBubble ?? false}
				unreadMessages={liveUnreadMessages}
				unreadAnnouncements={liveUnreadAnnouncements}
			/>
		{/if}
		<main class="app-main" class:full-page={isAuthPage}>
			{#if !isAuthPage && data.currentOrg?.impersonated}
				<div class="imp-banner">
					<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
					<span>Viewing <strong>{data.currentOrg.name}</strong> as platform admin</span>
					<form method="POST" action="/app/org/switch" class="imp-exit-form">
						<input type="hidden" name="org_id" value="" />
						<input type="hidden" name="return_to" value="/app/platform/orgs" />
						<button type="submit" class="imp-exit">Exit</button>
					</form>
				</div>
			{/if}
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

	.imp-banner {
		position: sticky;
		top: 0;
		z-index: 30;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 9px 18px;
		font-size: 13px;
		font-weight: 600;
		/* Self-contained colors (theme-independent) for a readable, high-contrast alert. */
		color: #422006;
		background: #fcd34d;
		border-bottom: 1px solid #d97706;
	}
	.imp-banner svg { color: #92400e; flex-shrink: 0; }
	.imp-banner strong { font-weight: 800; color: #422006; }
	.imp-exit-form { margin-left: auto; }
	.imp-exit {
		padding: 4px 14px;
		border-radius: 7px;
		font-size: 12px;
		font-weight: 700;
		background: #422006;
		color: #fcd34d;
		border: none;
		cursor: pointer;
		font-family: inherit;
	}
	.imp-exit:hover { background: #5c2e0a; }
</style>
