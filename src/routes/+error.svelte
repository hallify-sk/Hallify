<script lang="ts">
  import { page } from '$app/stores';
  import { t } from '$lib/i18n.svelte';

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
</script>

<svelte:head><title>{status} · Hallify</title></svelte:head>

<div class="err">
  <a href="/" class="brand">
    <img src="/Hallify.svg" alt="" />
    <span>Hallify</span>
  </a>
  <p class="code">{status}</p>
  <h1>{isNotFound ? t.errorPage.notFoundTitle : t.errorPage.genericTitle}</h1>
  <p class="detail">{detail}</p>
  <div class="actions">
    <a class="btn" href="/">{t.errorPage.backHome}</a>
    <button class="btn btn-ghost" type="button" onclick={() => history.back()}>{t.errorPage.goBack}</button>
  </div>
</div>

<style>
  .err {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 32px 24px;
    text-align: center;
    background: var(--bg-base, #0b0e15);
    color: var(--text-primary, rgba(255, 255, 255, 0.92));
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
  .brand img { width: 24px; height: 24px; }
  .brand span { font-weight: 600; }
  .code {
    font-size: 3.2rem;
    font-weight: 700;
    letter-spacing: -0.03em;
    margin: 0;
    opacity: 0.28;
    line-height: 1;
  }
  h1 {
    font-size: 1.35rem;
    font-weight: 620;
    margin: 6px 0 0;
    letter-spacing: -0.01em;
  }
  .detail {
    color: var(--text-secondary, rgba(255, 255, 255, 0.56));
    margin: 0;
    max-width: 42ch;
    line-height: 1.6;
    font-size: 0.95rem;
  }
  .actions { display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap; justify-content: center; }
  .btn {
    padding: 9px 18px;
    border-radius: 9px;
    background: var(--accent, #4f6ef7);
    color: #fff;
    text-decoration: none;
    font-size: 0.9rem;
    font-weight: 560;
    border: none;
    cursor: pointer;
    font-family: inherit;
  }
  .btn-ghost {
    background: transparent;
    color: var(--text-secondary, rgba(255, 255, 255, 0.6));
    border: 1px solid var(--border, rgba(255, 255, 255, 0.14));
  }
</style>
