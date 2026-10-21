<script lang="ts">
  import { enhance } from '$app/forms';
  import { t, getLocale } from '$lib/i18n.svelte';
  import { ANALYTICS_EVENTS, USER_DIMENSIONS } from '$lib/analytics-catalogue';
  import type { PageData, ActionData } from './$types';
  let { data, form }: { data: PageData; form: ActionData } = $props();

  const locale = $derived(getLocale() === 'en' ? 'en' : 'sk');

  const SURFACES = $derived([
    { key: 'site' as const, label: t.analyticsDocs.surfaceSite, note: t.analyticsDocs.surfaceSiteNote },
    { key: 'booking' as const, label: t.analyticsDocs.surfaceBooking, note: t.analyticsDocs.surfaceBookingNote }
  ]);
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
    <div class="gtm-field">
      <label class="gtm-label" for="gtm-id">{t.settingsPages.gtmIdLabel}</label>
      <input id="gtm-id" class="gtm-input" type="text" name="gtmContainerId" placeholder="GTM-XXXXXXX"
        value={data.gtmContainerId ?? ''} autocomplete="off" spellcheck="false" />
    </div>
    <div class="gtm-field gtm-field--wide">
      <label class="gtm-label" for="gtm-sgtm">{t.settingsPages.gtmServerLabel}</label>
      <input id="gtm-sgtm" class="gtm-input" type="url" name="gtmServerUrl" placeholder="https://data.vasa-domena.sk"
        value={data.gtmServerUrl ?? ''} autocomplete="off" spellcheck="false" />
    </div>
    <button type="submit" class="btn-action gtm-save">{t.settingsPages.saveAnalytics}</button>
  </form>
  {#if form?.gtmSuccess}<p class="gtm-ok">{t.settingsPages.analyticsSaved}</p>{/if}
  {#if form?.error}<p class="gtm-err">{form.error}</p>{/if}
  <p class="gtm-note">{t.settingsPages.gtmServerHint}</p>
  <p class="gtm-note">{t.settingsPages.gtmPlatformNote}</p>
</section>

<!-- ══ Event reference ════════════════════════════════════════════ -->
<!-- The container is useless without the event names, and until now the only
     way to find them was to read our source. Grouped by where they happen,
     because that is how someone building a trigger thinks about them. -->
<section class="section">
  <div class="section-head">
    <h2>{t.analyticsDocs.title}</h2>
    <p>{t.analyticsDocs.lead}</p>
  </div>

  {#each SURFACES as surface (surface.key)}
    <h3 class="ev-group">{surface.label}</h3>
    <p class="ev-group-note">{surface.note}</p>

    <div class="row-list ev-rows" role="table">
      <div class="row-item row-head" role="row">
        <span role="columnheader">{t.analyticsDocs.colEvent}</span>
        <span role="columnheader">{t.analyticsDocs.colTrigger}</span>
        <span role="columnheader">{t.analyticsDocs.colWhere}</span>
      </div>
      {#each ANALYTICS_EVENTS.filter((e) => e.surface === surface.key) as ev (ev.name)}
        <div class="row-item" role="row">
          <span role="cell"><code>{ev.name}</code></span>
          <span role="cell">{ev.trigger[locale]}</span>
          <span role="cell" class="muted">
            {ev.where[locale]}
            <span class="ev-params">
              {#each ev.params as p (p)}<code class="ev-param">{p}</code>{/each}
            </span>
          </span>
        </div>
      {/each}
    </div>
  {/each}

  <h3 class="ev-group">{t.analyticsDocs.dimensionsTitle}</h3>
  <p class="ev-group-note">{t.analyticsDocs.dimensionsLead}</p>
  <div class="ev-params ev-params--block">
    {#each USER_DIMENSIONS as d (d)}<code class="ev-param">{d}</code>{/each}
  </div>

  <p class="ev-footnote">{t.analyticsDocs.consentNote}</p>
</section>

<style>
  .gtm-form { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; }
  .gtm-field { display: flex; flex-direction: column; gap: 5px; flex: 1; min-width: 180px; max-width: 260px; }
  .gtm-field--wide { max-width: 340px; }
  .gtm-field .gtm-input { max-width: none; width: 100%; }
  .gtm-label { font-size: 12px; font-weight: 600; color: var(--text-muted); }
  .gtm-err { color: var(--danger); font-size: 12px; margin: 8px 0 0; }
  .gtm-note { font-size: var(--meta-size); color: var(--text-muted); margin: 10px 0 0; max-width: 72ch; line-height: 1.6; }
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

  .ev-group {
    font-size: 11px; font-weight: 650; text-transform: uppercase; letter-spacing: .08em;
    color: var(--text-subtle); margin: 26px 0 4px;
  }
  .ev-group:first-of-type { margin-top: 0; }
  .ev-group-note { font-size: var(--meta-size); color: var(--text-muted); margin: 0 0 10px; }

  .ev-rows > .row-item {
    display: grid;
    grid-template-columns: minmax(0, .9fr) minmax(0, 1.2fr) minmax(0, 1.3fr);
    gap: 14px;
    align-items: start;
    font-size: 13px;
  }
  .ev-rows > .row-item span { line-height: 1.6; }

  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11.5px;
    padding: 2px 6px;
    border-radius: var(--radius-sm);
    background: var(--bg-hover);
    color: var(--accent-ink);
    white-space: nowrap;
  }
  .ev-params { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
  .ev-params--block { margin-top: 0; }
  .ev-param { font-size: 10.5px; color: var(--text-subtle); background: none; border: 1px solid var(--border); padding: 1px 5px; }

  .ev-footnote {
    margin: 22px 0 0;
    padding: 11px 13px;
    border-left: 2px solid var(--border);
    font-size: var(--meta-size);
    line-height: 1.7;
    color: var(--text-muted);
  }

  @media (max-width: 760px) {
    .ev-rows > .row-item { grid-template-columns: 1fr; gap: 6px; }
    .ev-rows > .row-head { display: none; }
  }
</style>
