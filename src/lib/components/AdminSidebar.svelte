<script lang="ts">
  import { page } from '$app/stores';
  import { t } from '$lib/i18n';
</script>

<aside class="sidebar">
  <div class="sidebar-section">
    <span class="sidebar-label">{t.dashboard.overview}</span>
    <a href="/admin" class:active={$page.url.pathname === '/admin'}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
        <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
      </svg>
      {t.nav.dashboard}
    </a>
    <a href="/admin/calendar" class:active={$page.url.pathname === '/admin/calendar'}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
      </svg>
      {t.nav.calendar}
    </a>
  </div>

  <div class="sidebar-section">
    <span class="sidebar-label">{t.halls.manage}</span>
    <a href="/admin/halls" class:active={$page.url.pathname.startsWith('/admin/halls')}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
      {t.nav.halls}
    </a>
    <a href="/admin/reservations" class:active={$page.url.pathname.startsWith('/admin/reservations')}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
        <path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/>
        <path d="M8 18h.01"/><path d="M12 18h.01"/>
      </svg>
      {t.nav.reservations}
    </a>
    <a href="/admin/rsvp-templates" class:active={$page.url.pathname.startsWith('/admin/rsvp-templates')}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
      {t.nav.rsvpTemplates}
    </a>
    <a href="/admin/messages" class:active={$page.url.pathname.startsWith('/admin/messages')}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      {t.nav.messages}
    </a>
  </div>

  <div class="sidebar-section">
    <span class="sidebar-label">Organization</span>
    <a href="/admin/members" class:active={$page.url.pathname.startsWith('/admin/members')}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
      Members
    </a>
    <a href="/billing" class:active={$page.url.pathname.startsWith('/billing')}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
        <line x1="1" y1="10" x2="23" y2="10"/>
      </svg>
      Billing &amp; Plan
    </a>
  </div>

  <div class="sidebar-section">
    <span class="sidebar-label">{t.settings.manage}</span>
    <a href="/admin/settings" class:active={$page.url.pathname === '/admin/settings'}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="3"/>
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
      </svg>
      {t.settings.tabOverview}
    </a>
    <a href="/admin/settings/email" class:active={$page.url.pathname === '/admin/settings/email'}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
        <polyline points="22,6 12,13 2,6"/>
      </svg>
      {t.settings.tabEmail}
    </a>
    <a href="/admin/settings/branding" class:active={$page.url.pathname === '/admin/settings/branding'}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="13.5" cy="6.5" r="2.5"/>
        <path d="M17 2H7a5 5 0 0 0-5 5v10a5 5 0 0 0 5 5h10a5 5 0 0 0 5-5V7a5 5 0 0 0-5-5z"/>
      </svg>
      {t.settings.tabBranding}
    </a>
  </div>

  <div class="sidebar-back">
    <a href="/">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="15 18 9 12 15 6"/>
      </svg>
      {t.nav.backToUser}
    </a>
  </div>
</aside>

<style>
  .sidebar {
    width: 200px; min-height: 0; flex-shrink: 0;
    background: var(--bg-panel); border-right: 1px solid var(--border);
    display: flex; flex-direction: column;
    padding: 16px 0; overflow-y: auto;
  }

  .sidebar-section { padding: 0 12px 16px; }

  .sidebar-label {
    display: block; padding: 0 8px 6px;
    font-size: 10px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted);
  }

  .sidebar-section a {
    display: flex; align-items: center; gap: 8px;
    padding: 7px 10px; border-radius: 7px;
    font-size: 13px; font-weight: 500; color: var(--text-muted);
    text-decoration: none; transition: background 0.12s, color 0.12s;
  }
  .sidebar-section a:hover { background: var(--bg-panel2); color: var(--text-base); }
  .sidebar-section a.active { background: var(--accent-dim); color: var(--accent); }

  .sidebar-back { margin-top: auto; padding: 12px; border-top: 1px solid var(--border); }
  .sidebar-back a {
    display: flex; align-items: center; gap: 6px;
    font-size: 12px; color: var(--text-muted); text-decoration: none;
  }
  .sidebar-back a:hover { color: var(--text-base); }
</style>
