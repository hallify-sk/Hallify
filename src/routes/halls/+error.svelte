<script lang="ts">
  import { venueTitle } from '$lib/page-title';
  /**
   * Errors on the venue's site stay inside the venue's site. The app-wide error page
   * showed Hallify's logo and a generic 403 text, dropping the specific reason the
   * server gave ("Táto sála momentálne neprijíma rezervácie"). For a 4xx the message
   * is written for the visitor (translated server-side), so it is shown as is.
   */
  import { page } from '$app/stores';
  import { t } from '$lib/i18n.svelte';

  const status = $derived($page.status);
  const isNotFound = $derived(status === 404);
  const message = $derived(
    status >= 400 && status < 500 && $page.error?.message && $page.error.message !== 'Not Found'
      ? $page.error.message
      : isNotFound ? t.errorPage.notFoundBody
      : status === 403 ? t.errorPage.forbiddenBody
      : status === 429 ? t.errorPage.rateLimitedBody
      : t.errorPage.serverBody
  );
</script>

<svelte:head><title>{venueTitle($page.data.domainOrg?.name, isNotFound ? t.errorPage.notFoundTitle : t.errorPage.genericTitle)}</title></svelte:head>

<section class="section section--lead site-error">
  <p class="eyebrow">{status}</p>
  <h1>{isNotFound ? t.errorPage.notFoundTitle : t.errorPage.genericTitle}</h1>
  <p class="detail" role="alert">{message}</p>
  <div class="actions">
    <a class="btn-action" href="/halls">{t.myRes.browseHalls}</a>
    <button class="btn-outline" type="button" onclick={() => history.back()}>{t.errorPage.goBack}</button>
  </div>
</section>

<style>
  .site-error h1 { font-size: var(--display-size); margin: 0 0 12px; }
  .detail { color: var(--text-muted); font-size: var(--body-size); line-height: 1.75; max-width: 56ch; margin: 0 0 22px; }
  .actions { display: flex; flex-wrap: wrap; gap: 10px; }
</style>
