<script lang="ts">
  import { pageTitle } from '$lib/page-title';
  import { enhance } from '$app/forms';
  import { t, getLocale } from '$lib/i18n.svelte';
  import { formatDateTime } from '$lib/format';
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let containerId = $state(data.analytics.containerId);
  let includeBubbles = $state(data.analytics.includeBubbles);
  let serverUrl = $state(data.analytics.serverUrl);

  // Re-seed from what is stored whenever it changes (after a save). The plain
  // `use:enhance` used to reset the form, which emptied these bound fields and
  // switched the toggle off, so the NEXT save wrote blanks over the real settings.
  $effect(() => {
    containerId = data.analytics.containerId;
    includeBubbles = data.analytics.includeBubbles;
    serverUrl = data.analytics.serverUrl;
  });

  /** Keep the fields as they are after a save; the effect above refreshes them. */
  const keepFields = () => async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
    await update({ reset: false });
  };

  const fmt = (d: string | null) => formatDateTime(d, getLocale());
</script>

<svelte:head><title>{pageTitle(t.platformSettings.title)}</title></svelte:head>

<div class="wrap page">
  <section class="section section--lead">
    <div class="section-head">
      <p class="eyebrow">{t.platformOrgs.platformAdmin}</p>
      <h1>{t.platformSettings.title}</h1>
      <p>{t.platformSettings.lead}</p>
    </div>

    {#if form?.saved}<div class="alert-success">{t.settingsPages.changesSaved}</div>{/if}
    {#if form?.error}<div class="alert-error">{form.error}</div>{/if}
  </section>

  <section class="section">
    <div class="section-head">
      <h2>{t.platformSettings.analyticsTitle}</h2>
      <p>{t.platformSettings.analyticsLead}</p>
    </div>

    <form method="POST" action="?/saveAnalytics" use:enhance={keepFields}>
      <div class="field">
        <label class="field-label" for="pf-gtm">{t.platformSettings.containerLabel}</label>
        <input
          id="pf-gtm" name="containerId" type="text" bind:value={containerId}
          placeholder="GTM-XXXXXXX" spellcheck="false" autocomplete="off" maxlength="20"
        />
        <p class="field-hint">{t.platformSettings.containerHint}</p>
      </div>

      <div class="field">
        <label class="field-label" for="pf-sgtm">{t.platformSettings.serverUrlLabel}</label>
        <input id="pf-sgtm" name="serverUrl" type="url" bind:value={serverUrl}
          placeholder="https://data.hallify.sk" spellcheck="false" autocomplete="off" maxlength="200" />
        <p class="field-hint">{t.platformSettings.serverUrlHint}</p>
      </div>

      {#if data.envContainer && data.envContainer !== containerId}
        <!-- Without this, an empty field looks like "analytics is off" while the
             deployment's own variable is still loading a container. -->
        <p class="alert-warning">
          {t.platformSettings.envFallback} <code>{data.envContainer}</code>
        </p>
      {/if}

      <!-- The app's one switch (.ui-switch in app.css), not a bare checkbox. -->
      <div class="toggle-row">
        <label class="ui-switch">
          <input id="pf-bubbles" type="checkbox" name="includeBubbles" bind:checked={includeBubbles} />
          <span class="ui-switch-track" aria-hidden="true"></span>
        </label>
        <label class="toggle-copy" for="pf-bubbles">
          <strong>{t.platformSettings.includeBubbles}</strong>
          <span>{t.platformSettings.includeBubblesHint}</span>
        </label>
      </div>

      <p class="legal-note">{t.platformSettings.dpaNote}</p>

      <div class="row-actions-end">
        {#if data.updatedAt}
          <span class="meta">
            {t.platformSettings.lastChanged} {fmt(data.updatedAt)}{#if data.updatedBy}{' '}· {data.updatedBy}{/if}
          </span>
        {/if}
        <button type="submit" class="btn-action">{t.common.save}</button>
      </div>
    </form>
  </section>

  <!-- AI assistant. Admin-only and English-only on purpose: these numbers set what
       every organisation pays, and are read by the people who set prices. -->
  <section class="section">
    <div class="section-head">
      <h2>AI assistant</h2>
      <p>Model, markup and exchange rate for every organisation's credits (10 credits = €1).
        Charge = OpenAI cost × markup, in euros.</p>
    </div>
    {#if !data.aiConfigured}
      <p class="alert-warning">OPENAI_API_KEY is not set on this deployment — the assistant shows as unavailable everywhere.</p>
    {/if}
    <form method="POST" action="?/saveAi" use:enhance={keepFields}>
      <div class="toggle-row">
        <label class="ui-switch">
          <input id="pf-ai" type="checkbox" name="enabled" checked={data.ai.enabled} />
          <span class="ui-switch-track" aria-hidden="true"></span>
        </label>
        <label class="toggle-copy" for="pf-ai">
          <strong>Assistant available</strong>
          <span>Off stops every organisation from starting a turn. Balances and history are kept.</span>
        </label>
      </div>
      <div class="ai-grid">
        <div class="field">
          <span class="field-label">Model</span>
          <!-- Fixed in code (AI_MODEL), not a setting: one model, one reasoning effort. -->
          <p class="fixed-model">
            <code>{data.model.id}</code> · {data.model.effort} reasoning<br />
            <span>${data.model.input} in / ${data.model.output} out per 1M · ≈{data.model.turnCredits.toFixed(2)} credits a turn</span>
          </p>
        </div>
        <div class="field">
          <label class="field-label" for="pf-markup">Markup (×)</label>
          <input id="pf-markup" name="markup" type="number" min="1" max="20" step="0.1" value={data.ai.markup} />
        </div>
        <div class="field">
          <label class="field-label" for="pf-rate">EUR per USD</label>
          <input id="pf-rate" name="usdToEur" type="number" min="0.3" max="3" step="0.001" value={data.ai.usdToEur} />
        </div>
      </div>
      <p class="field-hint">"A turn" assumes 6,000 input and 600 output tokens; tool-heavy turns cost more.</p>
      <div class="row-actions-end">
        <button type="submit" class="btn-action">{t.common.save}</button>
      </div>
    </form>
  </section>

  <section class="section">
    <div class="section-head">
      <h2>{t.platformSettings.moreTitle}</h2>
      <p>{t.platformSettings.moreLead}</p>
    </div>
  </section>
</div>

<style>
  .field-hint { font-size: var(--meta-size); color: var(--text-muted); margin: 6px 0 0; }
  .fixed-model { margin: 6px 0 0; font-size: 13px; line-height: 1.6; }
  .fixed-model span { font-size: var(--meta-size); color: var(--text-muted); }
  .ai-grid { display: grid; grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr); gap: 14px; margin-top: 18px; }
  @media (max-width: 720px) { .ai-grid { grid-template-columns: minmax(0, 1fr); } }

  .toggle-row {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    margin: 20px 0 0;
  }
  .toggle-row .ui-switch { margin-top: 1px; }
  .toggle-copy { display: flex; flex-direction: column; gap: 3px; cursor: pointer; }
  .toggle-copy strong { font-size: 13px; font-weight: 600; }
  .toggle-copy span { font-size: var(--meta-size); color: var(--text-muted); line-height: 1.6; }

  .legal-note {
    margin: 18px 0 0;
    padding: 11px 13px;
    border-left: 2px solid var(--border);
    font-size: var(--meta-size);
    line-height: 1.7;
    color: var(--text-muted);
  }

  .row-actions-end {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 14px;
    margin-top: 22px;
  }
  .meta { font-size: var(--meta-size); color: var(--text-subtle); }

  code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11px;
    padding: 1px 5px;
    border-radius: var(--radius-sm);
    background: var(--bg-hover);
  }
</style>
