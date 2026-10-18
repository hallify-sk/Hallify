<script lang="ts">
  import { enhance } from '$app/forms';
  import { t, getLocale } from '$lib/i18n.svelte';
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let selected = $state(data.selected);
  const locale = $derived(getLocale() === 'en' ? 'en' : 'sk');

  /** A premium template the org cannot currently use is shown but not choosable:
   *  hiding it makes the feature invisible to the people most likely to buy it. */
  const locked = (premium: boolean) => premium && !data.allowPremium;
</script>

<svelte:head><title>{t.settings.title} – Hallify</title></svelte:head>

{#if form?.saved}
  <div class="alert-success">{t.settingsPages.changesSaved}</div>
{/if}
{#if form?.error}
  <div class="alert-error">{form.error}</div>
{/if}

<form method="POST" action="?/save" use:enhance={() => async ({ update }) => { await update({ reset: false }); }}>
  <section class="section section--lead">
    <div class="section-head">
      <h2>{t.settingsPages.siteTemplateTitle}</h2>
      <p>{t.settingsPages.siteTemplateHint}</p>
    </div>

    {#if !data.allowPremium}
      <p class="alert-warning">{t.settingsPages.siteTemplatePaid}</p>
    {:else if data.selected !== data.effective}
      <!-- Stored choice and served choice disagree: say so rather than showing a
           selected card that nobody visiting the site is actually seeing. -->
      <p class="alert-warning">{t.settingsPages.siteTemplateFallback}</p>
    {/if}

    <div class="tpl-grid">
      {#each data.templates as tpl}
        <label class="tpl" class:is-selected={selected === tpl.id} class:is-locked={locked(tpl.premium)}>
          <input
            type="radio"
            name="template"
            value={tpl.id}
            bind:group={selected}
            disabled={locked(tpl.premium)}
            class="sr-only"
          />
          <span
            class="tpl-preview"
            style="background:{tpl.swatch.bg}; border-color:{tpl.swatch.line}; border-radius:{tpl.swatch.radius}"
            aria-hidden="true"
          >
            <span class="tpl-bar" style="background:{tpl.swatch.ink}"></span>
            <span class="tpl-line" style="background:{tpl.swatch.line}"></span>
            <span class="tpl-line short" style="background:{tpl.swatch.line}"></span>
            <span class="tpl-pill" style="background:{tpl.swatch.accent}; border-radius:{tpl.swatch.radius}"></span>
          </span>
          <span class="tpl-meta">
            <span class="tpl-name">
              {tpl.name}
              {#if tpl.premium}<span class="tpl-tag">{t.settingsPages.siteTemplatePremium}</span>{/if}
            </span>
            <span class="tpl-desc">{tpl.description[locale]}</span>
          </span>
        </label>
      {/each}
    </div>
  </section>

  <section class="section">
    <div class="section-head">
      <h2>{t.settingsPages.siteCopyTitle}</h2>
      <p>{t.settingsPages.siteCopyHint}</p>
    </div>

    <div class="field">
      <label class="field-label" for="site-tagline">{t.settingsPages.siteTagline}</label>
      <input id="site-tagline" name="tagline" type="text" maxlength="140"
        value={data.tagline} disabled={!data.allowPremium}
        placeholder={t.settingsPages.siteTaglinePlaceholder} />
    </div>

    <div class="field">
      <label class="field-label" for="site-intro">{t.settingsPages.siteIntro}</label>
      <textarea id="site-intro" name="intro" rows="4" maxlength="600"
        disabled={!data.allowPremium}
        placeholder={t.settingsPages.siteIntroPlaceholder}>{data.intro}</textarea>
    </div>

    <button type="submit" class="btn-action">{t.common.save}</button>
  </section>
</form>

<style>
  .tpl-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 16px;
  }

  .tpl { display: block; cursor: pointer; }
  .tpl.is-locked { cursor: not-allowed; opacity: .55; }

  .tpl-preview {
    display: block;
    position: relative;
    height: 104px;
    padding: 14px;
    border: 1px solid var(--border);
    overflow: hidden;
    transition: box-shadow .15s, border-color .15s, transform .15s;
  }
  .tpl:not(.is-locked):hover .tpl-preview { transform: translateY(-2px); }
  .tpl.is-selected .tpl-preview {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent);
  }
  /* The radio is visually hidden, so the ring has to come back on keyboard focus
     or the grid is unusable without a mouse. */
  .tpl input:focus-visible + .tpl-preview {
    outline: 2px solid var(--accent-ink);
    outline-offset: 3px;
  }

  /* A miniature of the template: heading bar, two text lines, one accent button. */
  .tpl-bar { display: block; width: 58%; height: 9px; margin-bottom: 9px; }
  .tpl-line { display: block; width: 86%; height: 4px; margin-bottom: 5px; }
  .tpl-line.short { width: 62%; }
  .tpl-pill { display: block; width: 44px; height: 14px; margin-top: 11px; }

  .tpl-meta { display: block; margin-top: 10px; }
  .tpl-name {
    display: flex; align-items: center; gap: 7px;
    font-size: 13px; font-weight: 600; letter-spacing: -.02em;
  }
  .tpl-tag {
    font-size: 9px; font-weight: 650; text-transform: uppercase; letter-spacing: .1em;
    color: var(--accent-ink);
  }
  .tpl-desc {
    display: block; margin-top: 4px;
    font-size: var(--meta-size); line-height: 1.6; color: var(--text-muted);
  }

  .sr-only {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
  }
</style>
