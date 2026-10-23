<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import Sidebar from '$lib/components/Sidebar.svelte';
	import { page } from '$app/stores';
	import { themeStore } from '$lib/stores/theme.svelte';
	import { setLocale } from '$lib/i18n.svelte';
	import { playSound } from '$lib/sounds';
	import ConsentBanner from '$lib/components/ConsentBanner.svelte';
	import AssistantWidget from '$lib/components/assistant/AssistantWidget.svelte';
	import { setUserContext } from '$lib/analytics';
	import { cameFromHallify } from '$lib/analytics-referral';
	import { readableInkOn, inkOnLight, inkOnDark } from '$lib/contrast';

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
	// $effect.pre, so the context is in place before a page's first event (its onMount).
	$effect.pre(() => {
		if (data.analyticsUser) setUserContext({ ...data.analyticsUser, hallify_referral: data.onBubble ? cameFromHallify(data.hallifyHost) : undefined });
	});

	const branding = $derived(data.branding);

	function rgbOf(hex: string): [number, number, number] {
		const h = hex.replace('#', '');
		return [
			parseInt(h.substring(0, 2), 16),
			parseInt(h.substring(2, 4), 16),
			parseInt(h.substring(4, 6), 16)
		];
	}

	function dimColor(hex: string, opacity: number): string {
		return `rgba(${rgbOf(hex).join(', ')}, ${opacity})`;
	}

	const brandStyle = $derived(
		branding?.primaryColor
			? `--accent: ${branding.primaryColor};` +
			  ` --brand-ink-light: ${inkOnLight(branding.primaryColor)};` +
			  ` --brand-ink-dark: ${inkOnDark(branding.primaryColor)};` +
			  ` --accent-contrast: ${readableInkOn(branding.primaryColor)};` +
			  ` --accent-dim: ${dimColor(branding.primaryColor, 0.1)};` +
			  ` --accent-hover: ${branding.primaryColor}cc;` +
			  ` --accent-action: ${branding.primaryColor};` +
			  ` --accent-action-dim: ${dimColor(branding.primaryColor, 0.1)};`
			: ''
	);

	const orgTheme = $derived(branding?.theme ?? 'slate');

	const AUTH_PATHS = ['/app/login', '/app/register', '/app/forgot-password', '/app/reset-password', '/app/invite', '/login'];
	const isAuthPage = $derived(AUTH_PATHS.some(p => $page.url.pathname.startsWith(p)));
	const isLandingPage = $derived(['/', '/pre-prevadzkovatelov', '/priestory'].includes($page.url.pathname) || $page.url.pathname.startsWith('/priestory/'));
	const isPublicHallsPage = $derived($page.url.pathname.startsWith('/halls'));
	// Document-style pages (printable seating manifest) render without the app shell.
	const isDocPage = $derived($page.url.pathname.endsWith('/manifest'));
	// Legal documents render standalone, like the landing page.
	const isLegalPage = $derived(['/terms', '/privacy', '/dpa'].includes($page.url.pathname));
	// The site builder's preview is a public site inside an iframe: it must render
	// with no app chrome around it, or the operator is previewing our sidebar.
	const isSitePreview = $derived($page.url.pathname === '/app/manage/settings/site/preview');

	// Density by surface. Anything a customer sees breathes like the landing page;
	// the operator tools (manage, platform, reservations, messages, the editor) use
	// the same parts at working density, because a booking table at marketing
	// spacing is hostile to someone living in it all day.
	const OPERATOR_PREFIXES = [
		'/app/manage', '/app/platform', '/app/reservation',
		'/app/messages', '/app/announcements', '/app/profile'
	];
	const isOperatorSurface = $derived(
		$page.url.pathname === '/app' ||
		$page.url.pathname === '/app/' ||
		OPERATOR_PREFIXES.some((prefix) => $page.url.pathname.startsWith(prefix))
	);
	const density = $derived(isOperatorSurface ? 'compact' : 'comfortable');

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

<!-- Consent gate for GTM. Renders nothing when no container is configured — which
     is how the builder's preview suppresses it: a cookie banner inside the preview
     iframe would cover the page the operator is trying to look at, and the preview
     has no analytics to consent to anyway. -->
<ConsentBanner containers={isSitePreview ? [] : (data.analyticsContainers ?? [])} onVenueSite={!!data.onBubble} />

{#if isLandingPage || isPublicHallsPage || isDocPage || isLegalPage || isSitePreview}
	<div style={brandStyle} data-density={isDocPage ? 'compact' : 'comfortable'}>
		{@render children()}
	</div>
{:else}
	<div class="app-shell" style={brandStyle} data-density={density}>
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
		<!-- The assistant page IS the assistant, so the widget steps aside there. -->
		{#if data.assistant && data.currentOrg && !isAuthPage && !$page.url.pathname.startsWith('/app/manage/assistant')}
			<AssistantWidget orgId={data.currentOrg.id} />
		{/if}
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
		/* A column, so a page that wants the whole height (the floor-plan editor) can
		   take what is left under the impersonation banner instead of overflowing it. */
		display: flex;
		flex-direction: column;
	}
	.app-main > :global(*) { flex-shrink: 0; }
	.app-main > :global(.fill-main) { flex: 1 1 auto; min-height: 0; }

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
		/* Self-contained colors (theme-independent) for a readable, high-contrast alert:
		   an admin must notice they are impersonating no matter which theme is active, so
		   this one bar deliberately opts out of the token system. The amber is warmed to
		   sit with the paper palette, but it stays loud on purpose. */
		color: #3a2408;
		background: #f5c75b;
		border-bottom: 1px solid #c2881b;
	}
	.imp-banner svg { color: #6b4410; flex-shrink: 0; }
	.imp-banner strong { font-weight: 650; color: #3a2408; }
	.imp-exit-form { margin-left: auto; }
	.imp-exit {
		padding: 5px 14px;
		border-radius: var(--radius-sm);
		font-size: 12px;
		font-weight: 650;
		background: #3a2408;
		color: #f5c75b;
		border: none;
		cursor: pointer;
		font-family: inherit;
		transition: background .15s;
	}
	.imp-exit:hover { background: #54350c; }
</style>
