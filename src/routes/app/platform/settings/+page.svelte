<script lang="ts">
  import { enhance } from '$app/forms';
  import { t } from '$lib/i18n.svelte';
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let containerId = $state(data.analytics.containerId);
  let includeBubbles = $state(data.analytics.includeBubbles);

  const fmt = (d: string | null) => (d ? new Date(d + 'Z').toLocaleString() : '—');
</script>

<svelte:head><title>{t.platformSettings.title} – Hallify</title></svelte:head>

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

    <form method="POST" action="?/saveAnalytics" use:enhance>
      <div class="field">
        <label class="field-label" for="pf-gtm">{t.platformSettings.containerLabel}</label>
        <input
          id="pf-gtm" name="containerId" type="text" bind:value={containerId}
          placeholder="GTM-XXXXXXX" spellcheck="false" autocomplete="off" maxlength="20"
        />
        <p class="field-hint">{t.platformSettings.containerHint}</p>
      </div>

      {#if data.envContainer && data.envContainer !== containerId}
        <!-- Without this, an empty field looks like "analytics is off" while the
             deployment's own variable is still loading a container. -->
        <p class="alert-warning">
          {t.platformSettings.envFallback} <code>{data.envContainer}</code>
        </p>
      {/if}

      <label class="toggle-row">
        <input type="checkbox" name="includeBubbles" bind:checked={includeBubbles} />
        <span class="toggle-copy">
          <strong>{t.platformSettings.includeBubbles}</strong>
          <span>{t.platformSettings.includeBubblesHint}</span>
        </span>
      </label>

      <p class="legal-note">{t.platformSettings.dpaNote}</p>

      <div class="row-actions-end">
        {#if data.updatedAt}
          <span class="meta">
            {t.platformSettings.lastChanged} {fmt(data.updatedAt)}{#if data.updatedBy} · {data.updatedBy}{/if}
          </span>
        {/if}
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

  .toggle-row {
    display: flex;
    align-items: flex-start;
    gap: 11px;
    margin: 20px 0 0;
    cursor: pointer;
  }
  .toggle-row input { margin-top: 2px; flex-shrink: 0; }
  .toggle-copy { display: flex; flex-direction: column; gap: 3px; }
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
