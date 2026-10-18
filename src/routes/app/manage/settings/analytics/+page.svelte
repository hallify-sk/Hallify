<script lang="ts">
  import { enhance } from '$app/forms';
  import { t } from '$lib/i18n.svelte';
  import type { PageData, ActionData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head><title>{t.settingsPages.analyticsTitle} – {t.settings.title} – Hallify</title></svelte:head>

<!-- ══ Analytics ══════════════════════════════════════════════════ -->
<section class="section section--lead" id="analytics">
  <div class="section-head">
    <h2>{t.settingsPages.analyticsTitle}</h2>
    <p>{t.settingsPages.analyticsHint}</p>
  </div>
  <form method="POST" action="?/saveGtm" class="gtm-form"
    use:enhance={() => { return async ({ update }) => { await update({ reset: false }); }; }}>
    <label class="sr-only" for="gtm-id">{t.settingsPages.analyticsTitle}</label>
    <input id="gtm-id" class="gtm-input" type="text" name="gtmContainerId" placeholder="GTM-XXXXXXX"
      value={data.gtmContainerId ?? ''} autocomplete="off" spellcheck="false" />
    <button type="submit" class="btn-action gtm-save">{t.settingsPages.saveAnalytics}</button>
  </form>
  {#if form?.gtmSuccess}<p class="gtm-ok">{t.settingsPages.analyticsSaved}</p>{/if}
</section>

<style>
  .gtm-form { display: flex; align-items: stretch; gap: 10px; flex-wrap: wrap; }
  .gtm-input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-dim); }
  .gtm-input {
    flex: 1; min-width: 200px; max-width: 320px; height: 38px; box-sizing: border-box;
    padding: 0 11px; border-radius: var(--radius-sm);
    border: 1px solid var(--border); background: var(--bg-panel2);
    color: var(--text-base); font-family: ui-monospace, monospace; font-size: 13px;
    outline: none; transition: border-color .15s, box-shadow .15s;
  }
  .gtm-save { height: 38px; box-sizing: border-box; padding-top: 0; padding-bottom: 0; flex-shrink: 0; }
  .gtm-ok { color: var(--success); font-size: 12px; margin: 8px 0 0; }
  .sr-only {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
  }
</style>
