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
	import { usesPersonalTheme } from '$lib/theme-scope';
	import { t } from '$lib/i18n.svelte';
	import { afterNavigate } from '$app/navigation';
	import { fade, fly } from 'svelte/transition';
	import { dialog } from '$lib/actions/dialog';

	const { children, data } = $props();

	// ─── Phone drawer ───
	// Below 900 px the sidebar leaves the row and opens from a top-bar menu button as
	// a drawer, so the page gets the full width (it used to keep 240 px of a 390 px
	// screen). It closes on navigation, on Escape (the dialog action), on the
	// backdrop, and when the window grows back to desktop width.
	const DRAWER_QUERY = '(max-width: 899.98px)';
	let navOpen = $state(false);
	let motionMs = $state(200);
	function closeNav() { navOpen = false; }
	afterNavigate(() => { navOpen = false; });
	onMount(() => {
		const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
		motionMs = reduce.matches ? 0 : 200;
		const narrow = window.matchMedia(DRAWER_QUERY);
		const onChange = () => { if (!narrow.matches) navOpen = false; };
		narrow.addEventListener('change', onChange);
		return () => narrow.removeEventListener('change', onChange);
	});

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

	// ─── Presence heartbeat ───
	// "Online" means "working in the console", so the shell sends it for signed-in
	// staff on every console page. It used to come only from the Messages page, so an
	// owner working on the dashboard showed as offline. A hidden tab skips the beat
	// and so drops out after the two-minute window; coming back sends one at once.
	// A platform admin viewing an org is not one of its members, so sends none.
	const presenceOrgId = $derived(
		data.user && data.user.account_type !== 'client' && data.currentOrg && !data.currentOrg.impersonated
			&& ($page.url.pathname === '/app' || $page.url.pathname.startsWith('/app/'))
			? data.currentOrg.id
			: null
	);
	$effect(() => {
		if (!presenceOrgId) return;
		const beat = () => {
			if (document.hidden) return;
			fetch('/api/presence', { method: 'POST' }).catch(() => {});
		};
		beat();
		const timer = setInterval(beat, 30_000);
		document.addEventListener('visibilitychange', beat);
		return () => {
			clearInterval(timer);
			document.removeEventListener('visibilitychange', beat);
		};
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

	// The organisation's default theme (Settings → Customize), or null when it set none.
	const orgTheme = $derived<string | null>(branding?.theme ?? null);

	const AUTH_PATHS = ['/app/login', '/app/register', '/app/forgot-password', '/app/reset-password', '/app/invite', '/login', '/forgot-password', '/reset-password'];
	const isAuthPage = $derived(AUTH_PATHS.some(p => $page.url.pathname.startsWith(p)));
	const isLandingPage = $derived(['/', '/pre-prevadzkovatelov', '/priestory'].includes($page.url.pathname) || $page.url.pathname.startsWith('/priestory/') || (!!$page.error && !data.onBubble && !$page.url.pathname.startsWith('/app'))); // venue pages, and public error pages (in the marketing shell)
	const isPublicHallsPage = $derived($page.url.pathname.startsWith('/halls'));
	// Document-style pages (printable seating manifest, printable floor plans and
	// templates) render without the app shell.
	const isDocPage = $derived(
		$page.url.pathname.endsWith('/manifest') ||
		/^\/app\/manage\/halls\/[^/]+\/(editor|templates\/[^/]+)\/print$/.test($page.url.pathname)
	);
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

	// The personal theme applies in the console only; the public site, marketing and
	// legal pages stay light. Re-evaluated on every navigation, because "Public site"
	// in the sidebar is a client-side navigation out of the console (and back).
	// Without a personal preference the organisation's default theme (Settings →
	// Customize) applies, and without one the OS preference; it is re-read when the
	// org theme changes (e.g. org switch). Ignoring the org default made choosing one
	// in Customize do nothing.
	const personalTheme = $derived(usesPersonalTheme($page.url.pathname));
	$effect(() => {
		const o = orgTheme;
		if (!personalTheme) {
			document.documentElement.removeAttribute('data-theme');
			return;
		}
		let saved: string | null = null;
		try { saved = localStorage.getItem('hallify-theme'); } catch { /* storage blocked */ }
		themeStore.set(saved ?? o ?? osTheme());
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
	{#snippet sidebar(inDrawer: boolean)}
		<Sidebar
			user={data.user}
			branding={branding}
			currentOrg={data.currentOrg}
			orgs={data.orgs ?? []}
			allOrgs={data.allOrgs ?? []}
			onBubble={data.onBubble ?? false}
			unreadMessages={liveUnreadMessages}
			unreadAnnouncements={liveUnreadAnnouncements}
			permissions={data.navPermissions ?? []}
			venueSiteUrl={data.venueSiteUrl ?? null}
			{inDrawer}
			onclose={inDrawer ? closeNav : undefined}
		/>
	{/snippet}
	<div class="app-shell" style={brandStyle} data-density={density}>
		{#if !isAuthPage}
			<!-- Desktop: the sidebar in the row. Below 900 px it is hidden and the top bar
			     opens the same menu as a drawer instead. -->
			<div class="shell-side">{@render sidebar(false)}</div>

			<header class="mobile-bar">
				<button
					class="menu-btn"
					type="button"
					aria-label={t.sidebar.openMenu}
					aria-expanded={navOpen}
					aria-controls="mobile-nav"
					onclick={() => (navOpen = true)}
				>
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
						<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
					</svg>
					{#if liveUnreadMessages > 0 || liveUnreadAnnouncements > 0}<span class="menu-ping" aria-hidden="true"></span>{/if}
				</button>
				<a href="/app/" class="mobile-brand">
					<img src={branding?.logoUrl || '/Hallify.svg'} alt="" width="22" height="22" />
					<span>{branding?.appName || 'Hallify'}</span>
				</a>
				{#if data.currentOrg}<span class="mobile-org">{data.currentOrg.name}</span>{/if}
			</header>

			{#if navOpen}
				<button type="button" class="drawer-backdrop" tabindex="-1" aria-label={t.sidebar.closeMenu} transition:fade={{ duration: motionMs }} onclick={closeNav}></button>
				<div
					id="mobile-nav"
					class="drawer"
					role="dialog"
					aria-modal="true"
					aria-label={t.sidebar.menu}
					use:dialog={{ onclose: closeNav }}
					transition:fly={{ x: -320, duration: motionMs, opacity: 1 }}
				>
					{@render sidebar(true)}
				</div>
			{/if}
		{/if}
		<main class="app-main" class:full-page={isAuthPage}>
			{#if !isAuthPage && data.currentOrg?.impersonated}
				<div class="imp-banner">
					<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
					<span>{t.platformOrgs.viewingAsPre} <strong>{data.currentOrg.name}</strong> {t.platformOrgs.viewingAsPost}</span>
					<form method="POST" action="/app/org/switch" class="imp-exit-form">
						<input type="hidden" name="org_id" value="" />
						<input type="hidden" name="return_to" value="/app/platform/orgs" />
						<button type="submit" class="imp-exit">{t.platformOrgs.exitViewAs}</button>
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
		height: 100dvh;
		overflow: hidden;
	}

	/* ─── Phone layout ─── */
	.shell-side { display: contents; }
	.mobile-bar { display: none; }

	.drawer-backdrop {
		position: fixed;
		inset: 0;
		z-index: 140;
		border: none;
		padding: 0;
		cursor: default;
		background: rgba(20, 22, 21, 0.45);
	}
	.drawer {
		position: fixed;
		top: 0;
		left: 0;
		bottom: 0;
		z-index: 150;
		width: min(300px, 86vw);
		height: 100dvh;
		background: var(--bg-panel);
		box-shadow: var(--shadow);
	}

	@media (max-width: 899.98px) {
		.app-shell { flex-direction: column; }
		.shell-side { display: none; }
		.app-main { flex: 1 1 auto; min-height: 0; }

		.mobile-bar {
			display: flex;
			align-items: center;
			gap: 10px;
			flex-shrink: 0;
			min-height: 52px;
			padding: 6px 12px;
			background: var(--bg-panel);
			border-bottom: 1px solid var(--border);
		}
		.menu-btn {
			position: relative;
			width: 40px;
			height: 40px;
			flex-shrink: 0;
			display: inline-flex;
			align-items: center;
			justify-content: center;
			border: 1px solid var(--border);
			border-radius: var(--radius-sm);
			background: none;
			color: var(--text-base);
			cursor: pointer;
		}
		.menu-btn:hover { background: var(--bg-hover); }
		.menu-ping {
			position: absolute;
			top: 6px;
			right: 6px;
			width: 8px;
			height: 8px;
			border-radius: 50%;
			background: var(--danger);
		}
		.mobile-brand {
			display: inline-flex;
			align-items: center;
			gap: 8px;
			text-decoration: none;
			flex-shrink: 0;
		}
		.mobile-brand span {
			font-family: 'Poppins', 'Segoe UI', system-ui, -apple-system, sans-serif;
			font-weight: 900;
			font-style: italic;
			font-size: 15px;
			letter-spacing: -0.05em;
			color: var(--text-base);
		}
		.mobile-org {
			margin-left: auto;
			min-width: 0;
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			font-size: 12px;
			font-weight: 600;
			color: var(--text-muted);
		}
	}
	/* A drawer left open while the window widens past the breakpoint. */
	@media (min-width: 900px) {
		.drawer, .drawer-backdrop { display: none; }
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
