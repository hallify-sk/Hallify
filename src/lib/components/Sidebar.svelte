<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import OrgSwitcher from './OrgSwitcher.svelte';
  import type { SessionUser } from '$lib/auth';
  import type { Branding, OrgContext } from '../../app.d';
  import { t, getLocale, chooseLocale, type Locale } from '$lib/i18n.svelte';
  import { themeStore } from '$lib/stores/theme.svelte';
  import { uiStore } from '$lib/stores/ui.svelte';
  import { afterNavigate } from '$app/navigation';
  import { consoleNav } from '$lib/console-nav';
  import { orgRoleLabel } from '$lib/role-label';

  interface OrgOption { id: string; name: string; slug: string; role: string; }

  interface Props {
    user: SessionUser | null | undefined;
    branding?: Branding;
    currentOrg?: OrgContext | null;
    orgs?: OrgOption[];
    allOrgs?: { id: string; name: string; slug: string }[];
    onBubble?: boolean;
    unreadMessages?: number;
    unreadAnnouncements?: number;
    /** The member's effective permissions in currentOrg (decides which links show). */
    permissions?: string[];
    /** The organisation's own public site: '/halls' on its host, its domain elsewhere. */
    venueSiteUrl?: string | null;
    /** Rendered inside the phone drawer: full height of the drawer, never a rail,
     *  with a close button. */
    inDrawer?: boolean;
    onclose?: () => void;
  }

  const { user, branding, currentOrg, orgs = [], allOrgs = [], onBubble = false, unreadMessages = 0, unreadAnnouncements = 0, permissions = [], venueSiteUrl = null, inDrawer = false, onclose }: Props = $props();

  const isOrgAdmin    = $derived(currentOrg?.role === 'owner' || currentOrg?.role === 'admin');
  // Each console link shows when the member holds the permission its page requires,
  // not by owner/admin role, so custom roles get links to the pages they may use.
  const nav = $derived(consoleNav(currentOrg?.role, permissions));
  const showOrgSection = $derived(nav.console || nav.announcements || !!nav.members || nav.billing || nav.settings);
  const isPlatformAdmin = $derived(user?.is_platform_admin ?? false);

  const initials = $derived(
    user ? `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}`.toUpperCase() : ''
  );

  const userRoleLabel = $derived(
    currentOrg?.role ? orgRoleLabel(currentOrg.role, t) : isPlatformAdmin ? t.platformOrgs.platformAdmin : ''
  );

  let userMenuOpen = $state(false);

  // The swatch shows each theme's PAPER colour — the accent is the same pink in
  // all three, so a per-theme accent dot would say nothing. Warm's page colour is
  // a near-twin of slate's and indistinguishable at 9px, so warm shows the most
  // saturated tone of its own paper ramp (its --border value) instead.
  const THEMES = $derived([
    { id: 'slate', label: t.settingsPages.themeSlate, dot: '#f9f9f7' },
    { id: 'dark',  label: t.settingsPages.themeDark,  dot: '#181c1a' },
    { id: 'warm',  label: t.settingsPages.themeWarm,  dot: '#e5ddd2' },
  ] as const);

  function setTheme(id: string) {
    themeStore.set(id);
    localStorage.setItem('hallify-theme', id);
  }

  const LANGS: { id: Locale; label: string }[] = [
    { id: 'sk', label: 'SK' },
    { id: 'en', label: 'EN' },
  ];

  function closeUserMenu(e: MouseEvent) {
    if (!(e.target as HTMLElement).closest('.user-footer')) userMenuOpen = false;
  }

  $effect(() => {
    if (userMenuOpen) {
      document.addEventListener('click', closeUserMenu, true);
      return () => document.removeEventListener('click', closeUserMenu, true);
    }
  });

  // The sidebar outlives the page, so its menus would otherwise stay open on the next one.
  afterNavigate(() => { userMenuOpen = false; });
</script>

<aside class="sidebar" class:rail={uiStore.sidebarRail && !inDrawer} class:in-drawer={inDrawer}>
  <!-- Logo -->
  <div class="sidebar-header">
    <a href="/app/" class="logo-link">
      <img src={branding?.logoUrl || '/Hallify.svg'} alt="" class="logo-img" />
      <span class="logo-text">{branding?.appName || 'Hallify'}</span>
    </a>
    {#if inDrawer && onclose}
      <button class="drawer-close" type="button" aria-label={t.sidebar.closeMenu} onclick={onclose}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    {/if}
  </div>

  {#if user}
    <!-- Org switcher -->
    {#if currentOrg}
      <div class="sidebar-org">
        <OrgSwitcher {currentOrg} {orgs} {allOrgs} {onBubble} isPlatformAdmin={!!isPlatformAdmin} returnTo={$page.url.pathname} />
      </div>
    {/if}

    <!-- Navigation -->
    <nav class="sidebar-nav">

      <!-- Main (personal home + messages) — only for plain members.
           Owners/admins live in the Admin section, which has its own dashboard
           and its own client-messages view, so these two would be redundant. -->
      {#if !isOrgAdmin}
        <div class="nav-section">
          <a href="/app/" class="nav-item" class:active={$page.url.pathname === '/app/'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            </svg>
            {t.nav.home}
          </a>
          <a href="/app/messages" class="nav-item" class:active={$page.url.pathname.startsWith('/app/messages')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <!-- With the client inbox below, this one is the team's own chat. -->
            {nav.clientMessages ? t.sidebar.teamChat : t.nav.messages}
            {#if unreadMessages > 0}
              <span class="nav-badge">{unreadMessages}</span>
            {/if}
          </a>
        </div>
      {/if}

      <!-- Console: each link by the permission its page requires. View permissions
           bring their read-only pages without the dashboard. -->
      {#if nav.section}
        <div class="nav-section">
          <span class="nav-label">{t.sidebar.sectionAdmin}</span>
          {#if nav.console}
          <a href="/app/manage" class="nav-item" class:active={$page.url.pathname === '/app/manage'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
            {t.nav.dashboard}
          </a>
          {/if}
          {#if nav.halls}
          <a href="/app/manage/halls" class="nav-item" class:active={$page.url.pathname.startsWith('/app/manage/halls')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            {t.nav.halls}
          </a>
          {/if}
          {#if nav.reservations}
          <a href="/app/manage/reservations" class="nav-item" class:active={$page.url.pathname.startsWith('/app/manage/reservations')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
              <path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/>
              <path d="M8 18h.01"/><path d="M12 18h.01"/>
            </svg>
            {t.nav.reservations}
          </a>
          {/if}
          <!-- RSVP feature hidden for now (kept route + i18n intact for re-enabling later)
          <a href="/app/manage/rsvp-templates" class="nav-item" class:active={$page.url.pathname.startsWith('/app/manage/rsvp-templates')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="16" y1="13" x2="8" y2="13"/>
            </svg>
            {t.nav.rsvpTemplates}
          </a>
          -->
          {#if nav.calendar}
          <a href="/app/manage/calendar" class="nav-item" class:active={$page.url.pathname === '/app/manage/calendar'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            {t.nav.calendar}
          </a>
          {/if}
          {#if nav.assistant}
          <a href="/app/manage/assistant" class="nav-item" class:active={$page.url.pathname.startsWith('/app/manage/assistant')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>
            </svg>
            {t.ai.navLabel}
            <span class="beta nav-beta" title={t.ai.betaHint}>{t.ai.beta}</span>
          </a>
          {/if}
          {#if nav.clientMessages}
          <a href="/app/manage/messages" class="nav-item" class:active={$page.url.pathname.startsWith('/app/manage/messages')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            {t.nav.messages}
            {#if unreadMessages > 0}<span class="nav-ping" aria-label={t.sidebar.unreadMessages}></span>{/if}
          </a>
          {/if}
          <!-- Staff land in the client inbox above; team chat (channels, presence)
               lives at /app/messages, which plain members reach through "Messages". -->
          {#if isOrgAdmin}
          <a href="/app/messages" class="nav-item" class:active={$page.url.pathname.startsWith('/app/messages')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            {t.sidebar.teamChat}
          </a>
          {/if}
        </div>
      {/if}

      {#if showOrgSection}
        <!-- Organisation -->
        <div class="nav-section">
          <span class="nav-label">{t.sidebar.sectionOrganization}</span>
          {#if nav.announcements}
          <a href="/app/announcements" class="nav-item" class:active={$page.url.pathname.startsWith('/app/announcements')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 11l18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>
            </svg>
            {t.sidebar.announcements}
            {#if unreadAnnouncements > 0}<span class="nav-ping" aria-label={t.sidebar.unreadAnnouncements}></span>{/if}
          </a>
          {/if}
          {#if nav.members}
          <a href={nav.members} class="nav-item" class:active={$page.url.pathname.startsWith('/app/manage/members')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            {t.peopleArea.navLabel}
          </a>
          {/if}
          {#if nav.billing}
          <a href="/app/billing" class="nav-item" class:active={$page.url.pathname.startsWith('/app/billing')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
              <line x1="1" y1="10" x2="23" y2="10"/>
            </svg>
            {t.sidebar.billingPlan}
          </a>
          {/if}
          <!-- Customize, Domains, Webhooks, Email and Analytics live as tabs under
               Settings now; one entry replaces five. -->
          {#if nav.settings}
          <a href="/app/manage/settings" class="nav-item" class:active={$page.url.pathname.startsWith('/app/manage/settings') || $page.url.pathname.startsWith('/app/manage/domains')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            {t.sidebar.settings}
          </a>
          {/if}
          {#if nav.console}
          <a href="/app/manage/help" class="nav-item" class:active={$page.url.pathname.startsWith('/app/manage/help')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            {t.sidebar.help}
          </a>
          {/if}
        </div>
      {/if}

      <!-- Platform admin -->
      {#if isPlatformAdmin}
        <div class="nav-section">
          <span class="nav-label">{t.sidebar.sectionPlatform}</span>
          <a href="/app/platform" class="nav-item" class:active={$page.url.pathname === '/app/platform'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
            {t.sidebar.overview}
          </a>
          <a href="/app/platform/orgs" class="nav-item" class:active={$page.url.pathname.startsWith('/app/platform/orgs')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            </svg>
            {t.sidebar.organizations}
          </a>
          <a href="/app/platform/announcements" class="nav-item" class:active={$page.url.pathname.startsWith('/app/platform/announcements')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 11l18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>
            </svg>
            {t.sidebar.announcements}
          </a>
          <a href="/app/platform/users" class="nav-item" class:active={$page.url.pathname.startsWith('/app/platform/users')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
            </svg>
            {t.sidebar.allUsers}
          </a>
          <a href="/app/platform/email" class="nav-item" class:active={$page.url.pathname.startsWith('/app/platform/email')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="4" width="20" height="16" rx="2"/>
              <path d="m22 7-10 5L2 7"/>
            </svg>
            {t.settings.tabEmail}
          </a>
          <a href="/app/platform/settings" class="nav-item" class:active={$page.url.pathname.startsWith('/app/platform/settings')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            {t.platformSettings.title}
          </a>
          <a href="/app/platform/floorplan-requests" class="nav-item" class:active={$page.url.pathname.startsWith('/app/platform/floorplan-requests')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>
            </svg>
            {t.floorplanService.queueTitle}
          </a>
          <a href="/app/platform/closed-orgs" class="nav-item" class:active={$page.url.pathname.startsWith('/app/platform/closed-orgs')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><line x1="10" y1="12" x2="14" y2="12"/>
            </svg>
            {t.sidebar.closedOrgs}
          </a>
        </div>
      {/if}

      <!-- The public side: this organisation's own site (its /halls on its own host,
           its domain from the apex, where "/" is Hallify's venue search and not the
           venue's site), and on the apex the venue search as well. -->
      <div class="nav-section">
        {#if venueSiteUrl}
          <a
            href={venueSiteUrl}
            class="nav-item"
            target={onBubble ? undefined : '_blank'}
            rel={onBubble ? undefined : 'noopener'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/></svg>
            {t.sidebar.publicSiteOrg}
            {#if !onBubble}
              <svg class="nav-external" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
              <span class="visually-hidden">({t.sidebar.opensInNewTab})</span>
            {/if}
          </a>
        {/if}
        {#if !onBubble}
          <a href="/" class="nav-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            {t.sidebar.publicSite}
          </a>
        {/if}
      </div>

    </nav>

    <!-- Language switcher -->
    <div class="lang-switcher">
      {#each LANGS as l}
        <button
          class="lang-btn"
          class:active={getLocale() === l.id}
          onclick={() => chooseLocale(l.id)}
          type="button"
        >{l.label}</button>
      {/each}
    </div>

    <!-- Theme switcher -->
    <div class="theme-switcher">
      {#each THEMES as th}
        <button
          class="theme-btn"
          class:active={themeStore.current === th.id}
          onclick={() => setTheme(th.id)}
          title={th.label}
          type="button"
        >
          <span class="theme-dot" style="background:{th.dot}"></span>
          <span class="theme-label">{th.label}</span>
        </button>
      {/each}
    </div>

    <!-- User footer -->
    <div class="user-footer">
      <button class="user-btn" onclick={() => userMenuOpen = !userMenuOpen} type="button">
        <div class="avatar">{initials}</div>
        <div class="user-info">
          <span class="user-name">{user.first_name} {user.last_name}</span>
          <span class="user-role">{userRoleLabel}</span>
        </div>
        <svg class="chevron" class:rotated={userMenuOpen} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {#if userMenuOpen}
        <div class="user-dropdown">
          <a href="/app/profile" class="dropdown-item">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            {t.nav.profile}
          </a>
          <form method="POST" action="/app/logout">
            <button type="submit" class="dropdown-item">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
              {t.nav.signOut}
            </button>
          </form>
        </div>
      {/if}
    </div>

  {:else}
    <div class="sidebar-nav" style="flex:1"></div>
    <div class="user-footer">
      <a href="/app/login" class="sign-in-link">{t.nav.signIn}</a>
    </div>
  {/if}
</aside>

<style>
  /* The assistant is in beta: said wherever it is offered. */
  .beta {
    display: inline-flex; align-items: center; padding: 1px 6px; border-radius: var(--radius-sm);
    font-size: 9.5px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; line-height: 1.5;
    background: var(--accent-dim); color: var(--accent-ink); vertical-align: middle;
  }
  .nav-beta { margin-left: auto; }

  .sidebar {
    width: var(--sidebar-width, 240px);
    flex-shrink: 0;
    background: var(--bg-panel);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100dvh;
    overflow: hidden;
  }

  /* In the phone drawer the drawer owns the size; the menu just fills it. */
  .sidebar.in-drawer {
    width: 100%;
    height: 100%;
    border-right: none;
  }

  /* Logo */
  .sidebar-header {
    padding: 16px 14px 10px;
    flex-shrink: 0;
  }
  .sidebar.in-drawer .sidebar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 10px 8px 14px;
  }
  .drawer-close {
    width: 40px; height: 40px;
    display: inline-flex; align-items: center; justify-content: center;
    border: none; background: none; border-radius: var(--radius-sm);
    color: var(--text-muted); cursor: pointer;
  }
  .drawer-close:hover { background: var(--bg-hover); color: var(--text-base); }
  /* Finger-sized rows on a phone. */
  .sidebar.in-drawer .nav-item { padding: 10px 9px; font-size: 14px; }

  .logo-link {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    text-decoration: none;
  }

  .logo-img { width: 22px; height: 22px; }

  .logo-text {
    font-family: 'Poppins', 'Segoe UI', system-ui, -apple-system, sans-serif;
    font-weight: 900;
    font-style: italic;
    font-size: 15px;
    color: var(--text-base);
    letter-spacing: -0.05em;
  }

  /* Org switcher */
  .sidebar-org {
    padding: 0 10px 6px;
    flex-shrink: 0;
  }

  /* Nav */
  .sidebar-nav {
    flex: 1;
    overflow-y: auto;
    padding: 4px 10px 8px;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .nav-section {
    display: flex;
    flex-direction: column;
    gap: 1px;
    padding-bottom: 6px;
    margin-bottom: 6px;
    border-bottom: 1px solid var(--border-subtle);
  }

  .nav-section:last-child {
    border-bottom: none;
    margin-bottom: 0;
    padding-bottom: 0;
  }

  .nav-label {
    display: block;
    padding: 8px 9px 4px;
    font-size: 10px;
    font-weight: 650;
    text-transform: uppercase;
    letter-spacing: .13em;
    line-height: 1.7;
    color: var(--text-muted);
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 9px;
    border-radius: var(--radius-sm);
    font-size: 13px;
    font-weight: 500;
    color: var(--text-muted);
    text-decoration: none;
    transition: background .15s, color .15s;
    cursor: pointer;
    position: relative;
  }
  .nav-item:hover { background: var(--bg-hover); color: var(--text-base); text-decoration: none; }
  .nav-item.active { background: var(--accent-dim); color: var(--accent-ink); font-weight: 600; }
  .nav-item svg { flex-shrink: 0; }
  .nav-item .nav-external { margin-left: auto; color: var(--text-subtle); }
  .visually-hidden {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
  }

  .nav-badge {
    margin-left: auto;
    background: var(--danger);
    color: var(--on-danger);
    font-size: 10px;
    font-weight: 650;
    padding: 1px 5px;
    border-radius: var(--radius-sm);
    min-width: 16px;
    text-align: center;
    line-height: 1.4;
  }
  .nav-ping {
    margin-left: auto;
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--danger); flex-shrink: 0;
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--danger) 70%, transparent);
    animation: nav-ping-pulse 1.8s ease-out infinite;
  }
  @keyframes nav-ping-pulse {
    0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--danger) 60%, transparent); }
    70% { box-shadow: 0 0 0 6px transparent; }
    100% { box-shadow: 0 0 0 0 transparent; }
  }

  /* User footer */
  .user-footer {
    flex-shrink: 0;
    padding: 8px 10px;
    border-top: 1px solid var(--border);
    position: relative;
  }

  .user-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 7px;
    border-radius: var(--radius);
    background: none;
    border: none;
    cursor: pointer;
    font-family: inherit;
    transition: background .15s;
  }
  .user-btn:hover { background: var(--bg-hover); }

  .avatar {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-contrast);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 650;
    flex-shrink: 0;
  }

  .user-info {
    flex: 1;
    min-width: 0;
    text-align: left;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .user-name {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-base);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.3;
  }

  .user-role {
    font-size: 10px;
    color: var(--text-subtle);
    text-transform: capitalize;
    line-height: 1.3;
  }

  .chevron {
    flex-shrink: 0;
    color: var(--text-subtle);
    transition: transform .15s;
  }
  .chevron.rotated { transform: rotate(180deg); }

  .user-dropdown {
    position: absolute;
    bottom: calc(100% + 2px);
    left: 10px;
    right: 10px;
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    padding: 6px;
    box-shadow: var(--shadow);
    z-index: 200;
  }

  .dropdown-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 7px 10px;
    border-radius: var(--radius-sm);
    font-size: 13px;
    font-weight: 500;
    color: var(--text-base);
    text-decoration: none;
    cursor: pointer;
    background: none;
    border: none;
    font-family: inherit;
    transition: background .15s;
  }
  .dropdown-item:hover { background: var(--bg-hover); text-decoration: none; }

  .sign-in-link {
    display: block;
    text-align: center;
    padding: 8px;
    font-size: 13px;
    font-weight: 600;
    color: var(--accent-ink);
    text-decoration: none;
  }

  /* ── Theme switcher ──────────────────────────── */

  /* The divider needs air on both sides of it. The language row used to end
     flush against this border and the theme row started 6px under it, so the
     two switchers read as one crowded block. */
  .theme-switcher {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 10px 10px 12px;
    border-top: 1px solid var(--border-subtle);
  }

  .theme-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 5px 6px;
    border-radius: var(--radius-sm);
    border: 1px solid transparent;
    background: none;
    cursor: pointer;
    font-family: inherit;
    font-size: 11px;
    font-weight: 500;
    color: var(--text-subtle);
    transition: background .15s, border-color .15s, color .15s;
  }

  .theme-btn:hover {
    background: var(--bg-hover);
    color: var(--text-muted);
  }

  .theme-btn.active {
    background: var(--bg-hover);
    border-color: var(--border);
    color: var(--text-base);
    font-weight: 600;
  }

  /* The dot is the theme's paper colour, so the pale ones need a ring to read
     as a swatch rather than a hole in the button. */
  .theme-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    border: 1px solid var(--border);
    flex-shrink: 0;
  }

  .theme-label {
    line-height: 1;
  }

  .lang-switcher {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 10px 10px 11px;
  }
  .lang-btn {
    flex: 1;
    padding: 5px 6px;
    border-radius: var(--radius-sm);
    border: 1px solid transparent;
    background: none;
    cursor: pointer;
    font-family: inherit;
    font-size: 11px;
    font-weight: 500;
    letter-spacing: .04em;
    color: var(--text-subtle);
    transition: background .15s, border-color .15s, color .15s;
  }
  .lang-btn:hover { background: var(--bg-hover); color: var(--text-muted); }
  .lang-btn.active {
    background: var(--bg-hover);
    border-color: var(--border);
    color: var(--text-base);
    font-weight: 600;
  }

  /* ── Rail mode ──
     The floor-plan editor asks for the menu as a 56 px strip of icons so the plan
     gets the width. Hovering the strip opens the full menu OVER the page (the
     negative margin keeps its slot 56 px wide), so nothing reflows while editing. */
  .sidebar { transition: width .18s ease, margin-right .18s ease; }
  .sidebar.rail {
    width: 56px;
    position: relative;
    z-index: 60;
  }
  .sidebar.rail:hover {
    width: var(--sidebar-width, 240px);
    margin-right: calc(56px - var(--sidebar-width, 240px));
    box-shadow: var(--shadow);
  }
  .sidebar.rail:not(:hover) .logo-text,
  .sidebar.rail:not(:hover) .sidebar-org,
  .sidebar.rail:not(:hover) .nav-label,
  .sidebar.rail:not(:hover) .nav-beta,
  .sidebar.rail:not(:hover) .nav-external,
  .sidebar.rail:not(:hover) .lang-switcher,
  .sidebar.rail:not(:hover) .theme-switcher,
  .sidebar.rail:not(:hover) .user-info,
  .sidebar.rail:not(:hover) .user-footer .chevron { display: none; }
  .sidebar.rail:not(:hover) .sidebar-header { padding: 16px 0 10px; text-align: center; }
  .sidebar.rail:not(:hover) .sidebar-nav { padding: 4px 8px 8px; }
  .sidebar.rail:not(:hover) .nav-item {
    font-size: 0;
    gap: 0;
    justify-content: center;
    padding: 9px 0;
  }
  .sidebar.rail:not(:hover) .nav-item svg { width: 16px; height: 16px; }
  .sidebar.rail:not(:hover) .nav-badge {
    position: absolute; top: 2px; right: 2px; margin: 0;
    font-size: 9px; padding: 0 4px; min-width: 14px;
  }
  .sidebar.rail:not(:hover) .nav-ping { position: absolute; top: 4px; right: 4px; margin: 0; }
</style>
