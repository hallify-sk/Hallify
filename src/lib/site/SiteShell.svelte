<script lang="ts">
  /**
   * The frame around an organisation's public site: its rail, its main column and
   * the Hallify footer.
   *
   * Shared by the live bubble layout and by the builder's preview for the same
   * reason SiteSections is — a preview that renders its own approximation of the
   * chrome starts lying the first time the real one changes. The preview passes
   * `inert`, which drops the interactive parts (navigation, sign-out, language)
   * without changing a pixel of the layout.
   */
  import { getLocale, chooseLocale, type Locale, t } from '$lib/i18n.svelte';

  interface Props {
    org: { name: string; logoUrl: string | null };
    /** Inline custom properties from the chosen template. */
    templateStyle: string;
    template: string;
    user?: { first_name?: string | null; last_name?: string | null } | null;
    unread?: number;
    /** Current pathname, used to mark the active rail item. */
    path?: string;
    inert?: boolean;
    /** The signed-in client has not confirmed their email yet (D11): a reminder. */
    verifyReminder?: boolean;
    children: import('svelte').Snippet;
  }

  const {
    org, templateStyle, template, user = null, unread = 0, path = '/halls',
    inert = false, verifyReminder = false, children
  }: Props = $props();

  const initials = $derived(
    user ? `${user.first_name?.[0] ?? ''}${user.last_name?.[0] ?? ''}`.toUpperCase() : ''
  );

  const isBrowse = $derived(
    path === '/halls' ||
    (path.startsWith('/halls/') &&
      !path.startsWith('/halls/my-reservations') &&
      !path.startsWith('/halls/messages'))
  );

  const LANGS: { id: Locale; label: string }[] = [
    { id: 'sk', label: 'SK' },
    { id: 'en', label: 'EN' }
  ];

  /** In the preview nothing navigates: the iframe must stay on the preview route. */
  const to = (href: string) => (inert ? undefined : href);
  const tab = inert ? -1 : undefined;
</script>

<div class="b-shell" style={templateStyle} data-template={template}>
  <div class="b-frame">
    <aside class="b-sidebar">
      <a href={to('/halls')} class="b-brand" tabindex={tab}>
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
        <a href={to('/halls')} class="b-item" class:active={isBrowse} tabindex={tab}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          {t.bubble.browseHalls}
        </a>
        {#if user}
          <a href={to('/halls/my-reservations')} class="b-item" class:active={path.startsWith('/halls/my-reservations')} tabindex={tab}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            {t.bubble.myReservations}
          </a>
          <a href={to('/halls/messages')} class="b-item" class:active={path.startsWith('/halls/messages')} tabindex={tab}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
            {t.nav.messages}
            {#if unread > 0}<span class="b-badge">{unread}</span>{/if}
          </a>
        {/if}
      </nav>

      <div class="b-foot">
        <div class="b-langs">
          {#each LANGS as l}
            <button
              type="button"
              class="b-lang"
              class:active={getLocale() === l.id}
              disabled={inert}
              tabindex={tab}
              onclick={() => chooseLocale(l.id)}
            >{l.label}</button>
          {/each}
        </div>

        {#if user}
          <div class="b-account">
            <div class="b-avatar">{initials}</div>
            <div class="b-acct-info">
              <span class="b-acct-name">{user.first_name} {user.last_name}</span>
              <span class="b-acct-sub">{t.bubble.signedIn}</span>
            </div>
            <!-- A full page load: signing out client-side left the root layout's data
                 (name, "Moje rezervácie") on screen until the next reload. -->
            <a href={to('/logout')} class="b-signout" title={t.nav.signOut} aria-label={t.nav.signOut} tabindex={tab} data-sveltekit-reload>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
            </a>
          </div>
        {:else}
          <a href={to('/login')} class="b-signin" tabindex={tab}>{t.nav.signIn}</a>
        {/if}
      </div>
    </aside>

    <div class="b-main-wrap">
      <main class="b-main">
        {#if verifyReminder && !inert}
          <!-- Booking works without it; this only reminds them to confirm (D11). -->
          <div class="b-verify" role="status">
            <span>{t.identity.bannerText}</span>
            <a href="/verify-email">{t.identity.bannerAction}</a>
          </div>
        {/if}
        {@render children()}
      </main>
      <footer class="b-pwr">
        {t.bubble.poweredBy}
        <a href={inert ? undefined : 'https://hallify.sk'} target="_blank" rel="noopener" class="b-pwr-link" tabindex={tab}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-1px"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
          <strong>Hallify</strong>
        </a>
      </footer>
    </div>
  </div>
</div>

<style>
  .b-verify {
    display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px;
    margin: 0 0 20px; padding: 10px 14px; border-radius: var(--radius-sm);
    background: var(--warning-dim); color: var(--text-base); font-size: 13px; line-height: 1.5;
  }
  .b-verify a { color: var(--accent-ink); font-weight: 650; white-space: nowrap; }

  /* Headings follow the template. Body text stays Inter everywhere: the templates
     differ by palette, shape and weight, and only borrow a SYSTEM serif for
     headings — self-hosting eight families would cost megabytes and the CSP
     blocks third-party font CDNs. */
  .b-shell :global(h1),
  .b-shell :global(h2),
  .b-shell :global(h3) {
    font-family: var(--heading-font, inherit);
    font-weight: var(--heading-weight, 550);
    letter-spacing: var(--heading-tracking, -.03em);
  }

  /* A container, so the preview collapses on ITS OWN width. Keyed to the iframe,
     the rail would stay desktop-wide inside a 420px phone preview.
     The flex layout lives on .b-frame, not here: a container query cannot style
     the container itself, so a `flex-direction: column` aimed at .b-shell never
     applied — the rail went horizontal but stayed a column beside the content. */
  .b-shell {
    min-height: 100vh;
    background: var(--bg-base);
    /* `color` is as necessary as `background` here, and for a subtler reason.
       app.css sets `html, body { color: var(--text-base) }`, which resolves
       against the APP's tokens — near-white under the dark theme. The template's
       own --text-base lands on this element, but nothing inside re-applies
       `color`, so headings (which set no colour of their own) just inherited
       white straight through a pale template and became unreadable. Re-stating
       it here makes the whole subtree derive from the template again. */
    color: var(--text-base);
    container: b-shell / inline-size;
  }
  .b-frame { display: flex; min-height: 100vh; }

  .b-sidebar {
    width: 232px; flex-shrink: 0; background: var(--bg-panel); border-right: 1px solid var(--border);
    display: flex; flex-direction: column; position: sticky; top: 0; height: 100vh;
  }
  .b-brand { display: flex; align-items: center; gap: 10px; padding: 18px 16px 14px; text-decoration: none; }
  .b-brand:hover { text-decoration: none; }
  .b-logo { width: 30px; height: 30px; border-radius: var(--radius); object-fit: contain; }
  /* Icon over a light tint, so it writes in --accent-ink, not the fill colour. */
  .b-logo-ph { width: 30px; height: 30px; border-radius: var(--radius); display: flex; align-items: center; justify-content: center; color: var(--accent-ink); background: color-mix(in srgb, var(--accent) 12%, transparent); border: 1px solid color-mix(in srgb, var(--accent) 22%, transparent); }
  .b-name { font-size: 15px; font-weight: 650; color: var(--text-base); letter-spacing: -.03em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .b-nav { flex: 1; display: flex; flex-direction: column; gap: 2px; padding: 6px 10px; overflow-y: auto; }
  .b-item { display: flex; align-items: center; gap: 9px; padding: 8px 10px; border-radius: var(--radius); font-size: 13px; font-weight: 500; color: var(--text-muted); text-decoration: none; transition: background .15s, color .15s; }
  .b-item:hover { background: var(--bg-hover); color: var(--text-base); text-decoration: none; }
  /* Text on the accent tint, so --accent-ink rather than the fill colour. */
  .b-item.active { background: var(--accent-dim); color: var(--accent-ink); font-weight: 600; }
  .b-item svg { flex-shrink: 0; }
  /* Text on a solid --danger fill: --on-danger, never a literal #fff. The dark
     theme inverts --danger to a pale coral, where white drops to 2.5:1. */
  .b-badge { margin-left: auto; background: var(--danger); color: var(--on-danger); font-size: 10px; font-weight: 650; padding: 1px 6px; border-radius: 3px; min-width: 16px; text-align: center; }

  .b-foot { flex-shrink: 0; }
  .b-langs { display: flex; gap: 4px; padding: 8px 12px 0; }
  .b-lang { flex: 1; padding: 5px 4px; border-radius: var(--radius-sm); border: 1px solid transparent; background: none; cursor: pointer; font-family: inherit; font-size: 11px; font-weight: 500; color: var(--text-subtle); transition: background .15s, color .15s, border-color .15s; }
  .b-lang:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-muted); }
  .b-lang.active { background: var(--bg-hover); border-color: var(--border); color: var(--text-base); font-weight: 600; }
  .b-lang:disabled { cursor: default; }

  .b-account { display: flex; align-items: center; gap: 9px; padding: 11px 12px; border-top: 1px solid var(--border); }
  .b-avatar { width: 30px; height: 30px; border-radius: 50%; background: var(--accent); color: var(--accent-contrast); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 650; flex-shrink: 0; }
  .b-acct-info { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .b-acct-name { font-size: 12.5px; font-weight: 600; color: var(--text-base); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .b-acct-sub { font-size: 10.5px; color: var(--text-subtle); }
  .b-signout { width: 30px; height: 30px; border-radius: var(--radius); display: flex; align-items: center; justify-content: center; color: var(--text-muted); flex-shrink: 0; transition: background .15s, color .15s; }
  .b-signout:hover { background: var(--danger-dim); color: var(--danger); text-decoration: none; }
  /* Signing in is the primary action in this rail, so it takes the hover lift. */
  .b-signin { display: block; margin: 11px 12px; padding: 10px; text-align: center; border-radius: var(--radius-sm); background: var(--accent); color: var(--accent-contrast); font-size: 13px; font-weight: 650; text-decoration: none; transition: transform .2s, background .2s; }
  .b-signin:hover { background: var(--accent-hover); transform: translateY(-2px); text-decoration: none; }
  .b-signin:active { transform: translateY(0); }

  /* --consent-space is set by the cookie banner while it is open, so the last
     thing on a page (the booking form's submit button) can scroll above it. */
  .b-main-wrap { flex: 1; min-width: 0; display: flex; flex-direction: column; padding-bottom: var(--consent-space, 0px); }
  .b-main { flex: 1; max-width: 1080px; width: 100%; margin: 0 auto; padding: 30px 28px 48px; }
  .b-pwr { text-align: center; padding: 16px; font-size: 11px; color: var(--text-subtle); border-top: 1px solid var(--border); }
  .b-pwr strong { color: var(--text-muted); }
  .b-pwr-link { color: inherit; text-decoration: none; transition: color .15s; }
  .b-pwr-link:hover strong { color: var(--accent-ink); }
  .b-pwr-link:hover { color: var(--accent-ink); text-decoration: none; }

  @media (prefers-reduced-motion: reduce) {
    .b-signin:hover { transform: none; }
  }

  /* Phones: two rows. The venue and the account controls on top, and the
     navigation as a full-width tab bar underneath. A single row squeezed the nav
     into a 169px strip that scrolled sideways with no cue, so "Moje rezervácie"
     read "Mo" and "Správy" (with its unread badge) was off-screen. */
  @container b-shell (max-width: 760px) {
    .b-frame { flex-direction: column; }
    .b-sidebar { width: auto; height: auto; position: static; flex-direction: row; flex-wrap: wrap; align-items: center; border-right: none; border-bottom: 1px solid var(--border); padding: 0 8px; gap: 0 4px; }
    .b-brand { padding: 10px 8px; flex: 1; min-width: 0; }
    .b-name { font-size: 14px; }
    .b-foot { display: flex; align-items: center; gap: 4px; }
    .b-nav { order: 3; flex: 1 1 100%; flex-direction: row; padding: 2px 0 6px; gap: 2px; overflow: visible; border-top: 1px solid var(--border-subtle); }
    .b-item { flex: 1 1 0; min-width: 0; position: relative; flex-direction: column; justify-content: center; gap: 3px; padding: 7px 4px; font-size: 11.5px; text-align: center; line-height: 1.25; }
    .b-badge { position: absolute; top: 3px; left: calc(50% + 6px); margin-left: 0; }
    .b-langs { padding: 4px; }
    .b-account { border-top: none; padding: 6px 8px; }
    .b-acct-info { display: none; }
    .b-signin { margin: 6px 8px; padding: 8px 14px; }
    .b-main { padding: 22px 18px 40px; }
  }

  /* Printing a page (the client's seating sheet) prints the page, not the rail. */
  @media print {
    .b-shell { min-height: 0; background: none; }
    .b-frame { display: block; min-height: 0; }
    .b-sidebar, .b-pwr { display: none; }
    .b-main-wrap { padding-bottom: 0; }
    .b-main { max-width: none; padding: 0; }
  }
</style>
