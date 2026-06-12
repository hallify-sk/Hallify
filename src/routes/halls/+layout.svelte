<script lang="ts">
  import type { LayoutData } from './$types';

  interface Props { data: LayoutData; children: import('svelte').Snippet; }
  const { data, children }: Props = $props();

  const org = $derived(data.domainOrg);
  const user = $derived(data.user);
</script>

<div class="domain-shell">

  <header class="domain-header">
    <a href="/halls" class="org-brand">
      {#if org.logoUrl}
        <img src={org.logoUrl} alt={org.name} class="org-logo" />
      {:else}
        <div class="org-logo-placeholder">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
        </div>
      {/if}
      <span class="org-name">{org.name}</span>
    </a>

    <nav class="header-nav">
      <a href="/halls" class="nav-link">Browse halls</a>
    </nav>

    <div class="header-right">
      {#if user}
        <span class="user-name">{user.first_name}</span>
        <a href="/logout" class="btn-ghost">Sign out</a>
      {:else}
        <a href="/login" class="btn-primary">Sign in</a>
      {/if}
    </div>
  </header>

  <main class="domain-main">
    {@render children()}
  </main>

  <footer class="domain-footer">
    Powered by
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-2px">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <line x1="3" y1="9" x2="21" y2="9"/>
      <line x1="9" y1="21" x2="9" y2="9"/>
    </svg>
    <strong>Hallify</strong>
  </footer>

</div>

<style>
  .domain-shell {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background: var(--bg-base, #0f1117);
  }

  /* ── Header ── */
  .domain-header {
    display: flex; align-items: center; gap: 20px;
    padding: 0 32px; height: 58px;
    background: var(--bg-panel);
    border-bottom: 1px solid var(--border);
    position: sticky; top: 0; z-index: 20;
  }

  .org-brand {
    display: flex; align-items: center; gap: 10px;
    text-decoration: none; flex-shrink: 0;
  }
  .org-logo {
    width: 32px; height: 32px; border-radius: 7px; object-fit: contain;
  }
  .org-logo-placeholder {
    width: 32px; height: 32px; border-radius: 7px;
    background: color-mix(in srgb, var(--accent) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
    display: flex; align-items: center; justify-content: center;
    color: var(--accent); flex-shrink: 0;
  }
  .org-name {
    font-size: 15px; font-weight: 800; color: var(--text-base);
    letter-spacing: -.02em;
  }

  .header-nav {
    display: flex; align-items: center; gap: 4px; flex: 1;
  }
  .nav-link {
    padding: 5px 11px; border-radius: 6px; font-size: 13px; font-weight: 500;
    color: var(--text-muted); text-decoration: none;
    transition: background .1s, color .1s;
  }
  .nav-link:hover { background: var(--bg-panel2, var(--bg-base)); color: var(--text-base); }

  .header-right {
    display: flex; align-items: center; gap: 10px; flex-shrink: 0;
  }
  .user-name {
    font-size: 13px; color: var(--text-muted);
  }
  .btn-primary {
    padding: 7px 18px; border-radius: 7px;
    background: var(--accent); color: #fff;
    font-size: 13px; font-weight: 600; text-decoration: none;
    transition: opacity .12s;
  }
  .btn-primary:hover { opacity: .88; }
  .btn-ghost {
    padding: 6px 13px; border-radius: 7px;
    border: 1px solid var(--border); background: none; color: var(--text-muted);
    font-size: 13px; font-weight: 500; text-decoration: none; cursor: pointer;
    font-family: inherit; transition: border-color .1s, color .1s;
  }
  .btn-ghost:hover { border-color: var(--accent); color: var(--text-base); }

  /* ── Main ── */
  .domain-main {
    flex: 1;
  }

  /* ── Footer ── */
  .domain-footer {
    text-align: center; padding: 18px;
    font-size: 11px; color: var(--text-subtle);
    border-top: 1px solid var(--border);
  }
  .domain-footer strong { color: var(--text-muted); }

  @media (max-width: 640px) {
    .domain-header { padding: 0 18px; }
    .header-nav { display: none; }
  }
</style>
