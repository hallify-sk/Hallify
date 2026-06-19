<script lang="ts">
  import type { SessionUser } from '$lib/auth';
  import type { Branding, OrgContext } from '../../app.d';
  import { page } from '$app/stores';
  import { t } from '$lib/i18n.svelte';
  import OrgSwitcher from './OrgSwitcher.svelte';

  interface OrgOption { id: string; name: string; slug: string; role: string; }

  interface Props {
    user: SessionUser | null | undefined;
    branding?: Branding;
    currentOrg?: OrgContext | null;
    orgs?: OrgOption[];
    unreadMessages?: number;
  }
  const { user, branding, currentOrg, orgs = [], unreadMessages = 0 }: Props = $props();

  const isAdminRoute    = $derived($page.url.pathname.startsWith('/admin'));
  const isPlatformRoute = $derived($page.url.pathname.startsWith('/platform'));
  const isOrgAdmin      = $derived(currentOrg?.role === 'owner' || currentOrg?.role === 'admin');

  const initials = $derived(
    user ? `${user.first_name[0] ?? ''}${user.last_name[0] ?? ''}`.toUpperCase() : ''
  );

  const userRoleLabel = $derived(
    currentOrg ? currentOrg.role : (user?.is_platform_admin ? 'platform admin' : 'member')
  );

  let userMenuOpen = $state(false);

  function closeUserMenu(e: MouseEvent) {
    if (!(e.target as HTMLElement).closest('.user-menu-wrap')) userMenuOpen = false;
  }

  $effect(() => {
    if (userMenuOpen) {
      document.addEventListener('click', closeUserMenu, true);
      return () => document.removeEventListener('click', closeUserMenu, true);
    }
  });
</script>

<nav class="nav">
  <!-- Logo -->
  <a href="/" class="logo">
    <img src={branding?.logoUrl || '/Hallify.svg'} alt="" class="logo-svg" />
    <span class="logo-text">{branding?.appName || 'Hallify'}</span>
  </a>

  <!-- Org switcher (only when logged in + not in an org-less state) -->
  {#if user && !isAdminRoute && !isPlatformRoute}
    <div class="org-switcher-wrap">
      <OrgSwitcher {currentOrg} {orgs} returnTo={$page.url.pathname} />
    </div>
  {/if}

  <!-- Nav links -->
  <div class="nav-links">
    {#if user}
      {#if isAdminRoute || isPlatformRoute}
        <!-- Section label shown in sidebar; nothing here -->
      {:else}
        <a href="/" class="nav-link" class:active={$page.url.pathname === '/'}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          </svg>
          {t.nav.home}
        </a>
        <a href="/messages" class="nav-link" class:active={$page.url.pathname.startsWith('/messages')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          {t.nav.messages}
          {#if unreadMessages > 0}
            <span class="unread-badge">{unreadMessages}</span>
          {/if}
        </a>

        {#if isOrgAdmin}
          <div class="nav-divider"></div>
          <a href="/admin" class="nav-link mode-switch">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            {t.nav.adminPanel}
          </a>
        {/if}

        {#if user.is_platform_admin}
          <a href="/platform" class="nav-link platform-link">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            {t.sidebar.sectionPlatform}
          </a>
        {/if}
      {/if}
    {/if}
  </div>

  <!-- User section -->
  <div class="nav-user">
    {#if user}
      <div class="user-menu-wrap">
        <button class="user-btn" onclick={() => userMenuOpen = !userMenuOpen}>
          <div class="avatar">{initials}</div>
          <div class="user-info">
            <span class="user-name">{user.first_name} {user.last_name}</span>
            <span class="user-role">{userRoleLabel}</span>
          </div>
        </button>
        {#if userMenuOpen}
          <div class="user-dropdown">
            <a href="/profile" class="dropdown-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
              {t.nav.profile}
            </a>
            <a href="/billing" class="dropdown-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                <line x1="1" y1="10" x2="23" y2="10"/>
              </svg>
              {t.sidebar.billing}
            </a>
            <form method="POST" action="/logout">
              <button type="submit" class="dropdown-item">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                {t.nav.signOut}
              </button>
            </form>
          </div>
        {/if}
      </div>
    {:else}
      <span class="unauth-label">{t.sidebar.notSignedIn}</span>
      <a href="/login" class="sign-in-link">{t.nav.signIn}</a>
    {/if}
  </div>
</nav>

<style>
  .nav {
    position: sticky; top: 0; z-index: 100;
    display: flex; align-items: center; gap: 4px;
    padding: 0 16px; height: 48px;
    background: var(--bg-panel); border-bottom: 1px solid var(--border);
  }

  .logo {
    display: flex; align-items: center; gap: 8px;
    text-decoration: none; margin-right: 8px; flex-shrink: 0;
  }
  .logo-svg { width: 26px; height: 26px; }
  .logo-text {
    font-family: 'Poppins', sans-serif; font-weight: 900;
    font-style: italic; font-size: 15px; color: #334155;
  }

  .org-switcher-wrap { margin-right: 8px; flex-shrink: 0; }

  .nav-links {
    display: flex; align-items: center; gap: 2px; flex: 1;
  }

  .nav-link {
    display: flex; align-items: center; gap: 5px;
    padding: 5px 10px; border-radius: 6px;
    font-size: 13px; font-weight: 500;
    color: var(--text-muted); text-decoration: none;
    transition: background 0.12s, color 0.12s; white-space: nowrap;
  }
  .nav-link:hover, .nav-link.active {
    background: var(--accent-dim); color: var(--accent); text-decoration: none;
  }

  .nav-divider { width: 1px; height: 20px; background: var(--border); margin: 0 6px; flex-shrink: 0; }

  .mode-switch { color: var(--accent); font-weight: 600; font-size: 12px; }
  .mode-switch:hover { background: var(--accent-dim); }

  .platform-link { color: var(--accent-action); font-weight: 600; font-size: 12px; }
  .platform-link:hover { background: var(--accent-action-dim); }

  .nav-user { display: flex; align-items: center; gap: 10px; margin-left: auto; }

  .user-menu-wrap { position: relative; }

  .user-btn {
    display: flex; align-items: center; gap: 8px;
    padding: 3px 6px; border-radius: 8px;
    cursor: pointer; background: none; border: none; transition: background 0.12s;
  }
  .user-btn:hover { background: var(--bg-panel2); }

  .avatar {
    width: 30px; height: 30px; border-radius: 50%;
    background: var(--accent); color: #fff;
    display: flex; align-items: center; justify-content: center;
    font-size: 11px; font-weight: 700; flex-shrink: 0;
  }

  .user-info { display: flex; flex-direction: column; align-items: flex-start; line-height: 1.2; }
  .user-name { font-size: 12px; font-weight: 600; color: var(--text-base); }
  .user-role { font-size: 10px; color: var(--text-muted); text-transform: capitalize; }

  .user-dropdown {
    position: absolute; top: 100%; right: 0; margin-top: 4px;
    background: var(--bg-panel); border: 1px solid var(--border);
    border-radius: 10px; padding: 6px; min-width: 160px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.08); z-index: 201;
  }

  .dropdown-item {
    display: flex; align-items: center; gap: 8px;
    width: 100%; padding: 8px 14px; border-radius: 6px;
    font-size: 13px; font-weight: 500; color: var(--text-base);
    text-decoration: none; cursor: pointer;
    background: none; border: none; font-family: inherit;
  }
  .dropdown-item:hover { background: var(--bg-panel2); }

  .unauth-label { font-size: 12px; color: var(--text-muted); }
  .sign-in-link { font-size: 12px; font-weight: 600; color: var(--accent); text-decoration: none; }
  .sign-in-link:hover { text-decoration: underline; }

  .unread-badge {
    display: inline-flex; align-items: center; justify-content: center;
    min-width: 16px; height: 16px; padding: 0 4px; border-radius: 8px;
    background: var(--danger); color: white; font-size: 10px; font-weight: 700; line-height: 1;
  }
</style>
