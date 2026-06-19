<script lang="ts">
  import { page } from '$app/stores';
  import { themeStore } from '$lib/stores/theme.svelte';
  import { getLocale, chooseLocale, type Locale, t } from '$lib/i18n.svelte';
  import type { LayoutData } from './$types';

  interface Props { data: LayoutData; children: import('svelte').Snippet; }
  const { data, children }: Props = $props();

  const org = $derived(data.domainOrg);
  const user = $derived(data.user);
  const unread = $derived(data.unreadMessages ?? 0);
  const path = $derived($page.url.pathname);
  const initials = $derived(user ? `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}`.toUpperCase() : '');

  const THEMES = [
    { id: 'slate', label: 'Slate', dot: '#4f6ef7' },
    { id: 'dark',  label: 'Dark',  dot: '#818cf8' },
    { id: 'warm',  label: 'Warm',  dot: '#7c3aed' },
  ] as const;

  function setTheme(id: string) {
    themeStore.set(id);
    localStorage.setItem('hallify-theme', id);
  }

  const LANGS: { id: Locale; label: string }[] = [
    { id: 'sk', label: 'SK' },
    { id: 'en', label: 'EN' },
  ];
</script>

<div class="b-shell">
  <aside class="b-sidebar">
    <a href="/halls" class="b-brand">
      {#if org.logoUrl}
        <img src={org.logoUrl} alt="" class="b-logo" />
      {:else}
        <div class="b-logo-ph">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        </div>
      {/if}
      <span class="b-name">{org.name}</span>
    </a>

    <nav class="b-nav">
      <a href="/halls" class="b-item" class:active={path === '/halls' || path.startsWith('/halls/') && !path.startsWith('/halls/my-reservations') && !path.startsWith('/halls/messages')}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        {t.bubble.browseHalls}
      </a>
      {#if user}
        <a href="/halls/my-reservations" class="b-item" class:active={path.startsWith('/halls/my-reservations')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          {t.bubble.myReservations}
        </a>
        <a href="/halls/messages" class="b-item" class:active={path.startsWith('/halls/messages')}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          {t.nav.messages}
          {#if unread > 0}<span class="b-badge">{unread}</span>{/if}
        </a>
      {/if}
    </nav>

    <div class="b-foot">
      <div class="b-langs">
        {#each LANGS as l}
          <button type="button" class="b-lang" class:active={getLocale() === l.id} onclick={() => chooseLocale(l.id)}>{l.label}</button>
        {/each}
      </div>
      <div class="b-themes">
        {#each THEMES as th}
          <button type="button" class="b-theme" class:active={themeStore.current === th.id} onclick={() => setTheme(th.id)} title={th.label}>
            <span class="b-dot" style="background:{th.dot}"></span>
            <span class="b-theme-label">{th.label}</span>
          </button>
        {/each}
      </div>

      {#if user}
        <div class="b-account">
          <div class="b-avatar">{initials}</div>
          <div class="b-acct-info">
            <span class="b-acct-name">{user.first_name} {user.last_name}</span>
            <span class="b-acct-sub">{t.bubble.signedIn}</span>
          </div>
          <a href="/logout" class="b-signout" title={t.nav.signOut} aria-label={t.nav.signOut}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </a>
        </div>
      {:else}
        <a href="/login" class="b-signin">{t.nav.signIn}</a>
      {/if}
    </div>
  </aside>

  <div class="b-main-wrap">
    <main class="b-main">{@render children()}</main>
    <footer class="b-pwr">
      {t.bubble.poweredBy}
      <a href="https://hallify.sk" target="_blank" rel="noopener" class="b-pwr-link">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
        <strong>Hallify</strong>
      </a>
    </footer>
  </div>
</div>

<style>
  .b-shell { display: flex; min-height: 100vh; background: var(--bg-base); }

  .b-sidebar {
    width: 232px; flex-shrink: 0; background: var(--bg-panel); border-right: 1px solid var(--border);
    display: flex; flex-direction: column; position: sticky; top: 0; height: 100vh;
  }
  .b-brand { display: flex; align-items: center; gap: 10px; padding: 18px 16px 14px; text-decoration: none; }
  .b-logo { width: 30px; height: 30px; border-radius: 7px; object-fit: contain; }
  .b-logo-ph { width: 30px; height: 30px; border-radius: 7px; display: flex; align-items: center; justify-content: center; color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 22%, transparent); }
  .b-name { font-size: 15px; font-weight: 800; color: var(--text-base); letter-spacing: -.02em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .b-nav { flex: 1; display: flex; flex-direction: column; gap: 2px; padding: 6px 10px; overflow-y: auto; }
  .b-item { display: flex; align-items: center; gap: 9px; padding: 8px 10px; border-radius: 7px; font-size: 13px; font-weight: 500; color: var(--text-muted); text-decoration: none; transition: background .1s, color .1s; }
  .b-item:hover { background: var(--bg-hover); color: var(--text-base); }
  .b-item.active { background: var(--accent-dim); color: var(--accent); font-weight: 600; }
  .b-item svg { flex-shrink: 0; }
  .b-badge { margin-left: auto; background: var(--danger); color: #fff; font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 10px; min-width: 16px; text-align: center; }

  .b-foot { flex-shrink: 0; }
  .b-langs { display: flex; gap: 4px; padding: 8px 12px 0; }
  .b-lang { flex: 1; padding: 5px 4px; border-radius: 6px; border: 1px solid transparent; background: none; cursor: pointer; font-family: inherit; font-size: 11px; font-weight: 500; color: var(--text-subtle); transition: all .1s; }
  .b-lang:hover { background: var(--bg-hover); color: var(--text-muted); }
  .b-lang.active { background: var(--bg-hover); border-color: var(--border); color: var(--text-base); font-weight: 600; }
  .b-themes { display: flex; gap: 4px; padding: 8px 12px; border-top: 1px solid var(--border-subtle); }
  .b-theme { flex: 1; display: flex; align-items: center; justify-content: center; gap: 5px; padding: 5px 4px; border-radius: 6px; border: 1px solid transparent; background: none; cursor: pointer; font-family: inherit; font-size: 11px; font-weight: 500; color: var(--text-subtle); transition: all .1s; }
  .b-theme:hover { background: var(--bg-hover); color: var(--text-muted); }
  .b-theme.active { background: var(--bg-hover); border-color: var(--border); color: var(--text-base); font-weight: 600; }
  .b-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
  .b-theme-label { line-height: 1; }

  .b-account { display: flex; align-items: center; gap: 9px; padding: 11px 12px; border-top: 1px solid var(--border); }
  .b-avatar { width: 30px; height: 30px; border-radius: 50%; background: var(--accent); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; flex-shrink: 0; }
  .b-acct-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .b-acct-name { font-size: 12.5px; font-weight: 600; color: var(--text-base); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .b-acct-sub { font-size: 10.5px; color: var(--text-subtle); }
  .b-signout { width: 30px; height: 30px; border-radius: 7px; display: flex; align-items: center; justify-content: center; color: var(--text-muted); flex-shrink: 0; transition: background .1s, color .1s; }
  .b-signout:hover { background: var(--danger-dim); color: var(--danger); }
  .b-signin { display: block; margin: 11px 12px; padding: 9px; text-align: center; border-radius: 8px; background: var(--accent); color: #fff; font-size: 13px; font-weight: 600; text-decoration: none; }

  .b-main-wrap { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .b-main { flex: 1; max-width: 1080px; width: 100%; margin: 0 auto; padding: 30px 28px 48px; }
  .b-pwr { text-align: center; padding: 16px; font-size: 11px; color: var(--text-subtle); border-top: 1px solid var(--border); }
  .b-pwr strong { color: var(--text-muted); }
  .b-pwr-link { color: inherit; text-decoration: none; }
  .b-pwr-link:hover strong { color: var(--accent); }
  .b-pwr-link:hover { color: var(--accent); }

  @media (max-width: 760px) {
    .b-shell { flex-direction: column; }
    .b-sidebar { width: auto; height: auto; position: static; flex-direction: row; align-items: center; border-right: none; border-bottom: 1px solid var(--border); padding: 0 8px; gap: 4px; overflow-x: auto; }
    .b-brand { padding: 10px 8px; }
    .b-name { display: none; }
    .b-nav { flex-direction: row; flex: 1; padding: 6px 4px; gap: 2px; overflow-x: auto; }
    .b-item { white-space: nowrap; padding: 7px 9px; }
    .b-foot { display: flex; align-items: center; gap: 4px; }
    .b-langs { padding: 4px; }
    .b-themes { border-top: none; padding: 4px; }
    .b-theme-label { display: none; }
    .b-theme { padding: 6px; }
    .b-account { border-top: none; padding: 6px 8px; }
    .b-acct-info { display: none; }
    .b-signin { margin: 6px 8px; padding: 8px 14px; }
    .b-main { padding: 22px 18px 40px; }
  }
</style>
