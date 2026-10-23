<script lang="ts">
  /**
   * The frame of the venue's own sign-in pages: the venue's name and logo over a
   * narrow column, on the page background. Password recovery used Hallify's
   * AuthShell, so a client who clicked "Zabudnuté heslo" on a venue's site landed
   * on Hallify's English marketing panel with a "Back to Hallify" link.
   * Matches the look of /login.
   */
  interface Props {
    org: { name: string; logoUrl: string | null };
    children: import('svelte').Snippet;
  }
  const { org, children }: Props = $props();
</script>

<div class="va-root">
  <section class="section section--lead va-card">
    <a class="va-brand" href="/halls">
      {#if org.logoUrl}
        <img src={org.logoUrl} alt="" class="va-logo" />
      {:else}
        <span class="va-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
        </span>
      {/if}
      <span class="va-name">{org.name}</span>
    </a>
    {@render children()}
  </section>
</div>

<style>
  .va-root {
    min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: var(--bg-base); padding: 40px 24px;
  }
  .va-card { width: 100%; max-width: 400px; padding-block: 0; }
  .va-brand { display: flex; align-items: center; gap: 10px; margin-bottom: 28px; text-decoration: none; color: inherit; }
  .va-brand:hover { text-decoration: none; }
  .va-logo { width: 36px; height: 36px; border-radius: var(--radius-sm); object-fit: contain; }
  .va-icon {
    width: 36px; height: 36px; border-radius: var(--radius-sm); background: var(--accent-dim);
    display: flex; align-items: center; justify-content: center; color: var(--accent-ink);
  }
  .va-name { font-size: 17px; font-weight: 650; color: var(--text-base); letter-spacing: -.03em; min-width: 0; overflow-wrap: anywhere; }
</style>
