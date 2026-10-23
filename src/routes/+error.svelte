<script lang="ts">
  import { page } from '$app/stores';
  import { t } from '$lib/i18n.svelte';
  import MarketingShell from '$lib/marketing/MarketingShell.svelte';

  const status = $derived($page.status);
  const isNotFound = $derived(status === 404);
  // The framework's default message is developer-facing ("Internal Error"); show
  // something a customer can act on, and keep the real detail for 4xx only.
  const detail = $derived(
    isNotFound ? t.errorPage.notFoundBody
    : status === 403 ? t.errorPage.forbiddenBody
    : status === 429 ? t.errorPage.rateLimitedBody
    : t.errorPage.serverBody
  );
  // On the public Hallify site (not the console, not a venue's own site) a missing
  // page keeps the site's header, footer and theme, and offers the directory.
  const marketing = $derived(!($page.data as { onBubble?: boolean }).onBubble && !$page.url.pathname.startsWith('/app'));
</script>

<svelte:head><title>{status} · Hallify</title></svelte:head>

{#if marketing}
<MarketingShell audience="customer">
  <section class="wrap marketing-error">
    <p class="eyebrow">{status}</p>
    <h1>{isNotFound ? t.errorPage.notFoundTitle : t.errorPage.genericTitle}</h1>
    <p class="lead">{detail}</p>
    <div class="marketing-error-actions">
      <a class="primary" href="/priestory">{t.errorPage.browseVenues}</a>
      <a class="marketing-error-home" href="/">{t.errorPage.backHome}</a>
    </div>
  </section>
</MarketingShell>
{:else}
<div class="err">
  <a href="/" class="brand">
    <img src="/Hallify.svg" alt="" />
    <span>Hallify</span>
  </a>
  <p class="code">{status}</p>
  <h1>{isNotFound ? t.errorPage.notFoundTitle : t.errorPage.genericTitle}</h1>
  <p class="detail">{detail}</p>
  <div class="actions">
    <a class="btn-action" href="/">{t.errorPage.backHome}</a>
    <button class="btn-outline" type="button" onclick={() => history.back()}>{t.errorPage.goBack}</button>
  </div>
</div>
{/if}

<style>
  .marketing-error { padding: 90px 0 120px; min-height: 55vh; }
  .marketing-error h1 { max-width: 14ch; }
  .marketing-error-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 22px; }
  .marketing-error-home { font-size: 12px; font-weight: 650; color: var(--accent-ink); }
  .err {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 32px 24px;
    text-align: center;
    background: var(--bg-base);
    color: var(--text-base);
    font-family: 'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif;
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    text-decoration: none;
    color: inherit;
    margin-bottom: 22px;
    opacity: 0.85;
  }
  .brand:hover { text-decoration: none; }
  .brand img { width: 24px; height: 24px; }
  /* The wordmark — the one place Poppins 900 italic is allowed. */
  .brand span {
    font-family: 'Poppins', 'Segoe UI', system-ui, -apple-system, sans-serif;
    font-weight: 900;
    font-style: italic;
    letter-spacing: -0.05em;
  }
  .code {
    font-size: 3.2rem;
    font-weight: 550;
    letter-spacing: -0.055em;
    margin: 0;
    opacity: 0.28;
    line-height: 1;
  }
  h1 {
    font-size: 1.35rem;
    font-weight: 550;
    margin: 6px 0 0;
    letter-spacing: -0.045em;
  }
  .detail {
    color: var(--text-muted);
    margin: 0;
    max-width: 42ch;
    line-height: 1.75;
    font-size: 0.95rem;
  }
  .actions { display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap; justify-content: center; }
  /* The two ways out use the shared button primitives (.btn-action keeps the
     hover lift, .btn-outline is the quiet one), so nothing is restated here. */
</style>
