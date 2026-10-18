<script lang="ts">
  import { enhance } from '$app/forms';
  import { t, getLocale } from '$lib/i18n.svelte';
  import { sectionDefinition, type SectionType, type SiteSection } from '$lib/site-sections';
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const locale = $derived(getLocale() === 'en' ? 'en' : 'sk');

  // ─── The draft ───
  // Everything on this page edits one in-memory draft, which is posted to the
  // preview on every change and submitted in one go. Nothing is written until the
  // operator saves, so they can rearrange their public site freely and walk away.
  let template = $state(data.selected);
  let tagline = $state(data.tagline);
  let intro = $state(data.intro);
  let sections = $state<SiteSection[]>(data.sections.map((s) => ({ ...s })));

  /** A premium template the org cannot currently use is shown but not choosable:
   *  hiding it makes the feature invisible to the people most likely to buy it. */
  const locked = (premium: boolean) => premium && !data.allowPremium;

  const enabled = $derived(sections.filter((s) => s.enabled));
  const available = $derived(sections.filter((s) => !s.enabled));

  const labelOf = (type: SectionType) => sectionDefinition(type)?.label[locale] ?? type;
  const descOf = (type: SectionType) => sectionDefinition(type)?.description[locale] ?? '';

  /**
   * Why an enabled section will not appear. The live page hides a section with
   * nothing in it rather than publishing a heading over blank space, so without
   * this an operator switches Contact on, sees no change, and concludes the
   * builder is broken.
   */
  function blockedReason(type: SectionType): string | null {
    const def = sectionDefinition(type);
    if (!def) return null;
    if (def.needsHalls && data.hallCount === 0) return t.settingsPages.siteSectionNeedsHalls;
    if (def.needsContact && !data.hasContact) return t.settingsPages.siteSectionNeedsContact;
    if (def.needsIntro && !intro.trim()) return t.settingsPages.siteSectionNeedsIntro;
    return null;
  }

  function indexOf(type: SectionType) {
    return sections.findIndex((s) => s.type === type);
  }

  /** Enabling appends to the foot of the page: a new section arriving in the
   *  middle of someone's arrangement is never what was meant. */
  function enable(type: SectionType) {
    const i = indexOf(type);
    if (i === -1) return;
    const [item] = sections.splice(i, 1);
    item.enabled = true;
    const lastEnabled = sections.reduce((acc, s, n) => (s.enabled ? n : acc), -1);
    sections.splice(lastEnabled + 1, 0, item);
  }

  function disable(type: SectionType) {
    const i = indexOf(type);
    if (i !== -1) sections[i].enabled = false;
  }

  /** Move within the enabled run, skipping any disabled rows parked between. */
  function move(type: SectionType, dir: -1 | 1) {
    const i = indexOf(type);
    if (i === -1) return;
    let j = i + dir;
    while (j >= 0 && j < sections.length && !sections[j].enabled) j += dir;
    if (j < 0 || j >= sections.length) return;
    [sections[i], sections[j]] = [sections[j], sections[i]];
  }

  // ─── Drag to reorder ───
  // Buttons stay the primary control (they work with a keyboard and on a phone);
  // dragging is the shortcut a builder is expected to have.
  let dragging = $state<SectionType | null>(null);
  let dragOver = $state<SectionType | null>(null);

  function onDrop(target: SectionType) {
    const from = dragging;
    dragging = null;
    dragOver = null;
    if (!from || from === target) return;
    const a = indexOf(from);
    const b = indexOf(target);
    if (a === -1 || b === -1) return;
    const [item] = sections.splice(a, 1);
    sections.splice(indexOf(target) + (a < b ? 1 : 0), 0, item);
  }

  // ─── Unsaved state ───
  const initial = JSON.stringify({
    template: data.selected, tagline: data.tagline, intro: data.intro, sections: data.sections
  });
  const current = $derived(JSON.stringify({ template, tagline, intro, sections }));
  const dirty = $derived(current !== initial);

  // ─── Live preview ───
  let frame = $state<HTMLIFrameElement | null>(null);
  let device = $state<'desktop' | 'phone'>('desktop');

  function push() {
    frame?.contentWindow?.postMessage(
      { type: 'hallify:site-draft', draft: { template, tagline, intro, sections } },
      window.location.origin
    );
  }

  // Re-posts whenever any part of the draft changes. `current` is read so the
  // effect depends on the whole draft rather than on one field of it.
  $effect(() => {
    current;
    push();
  });

  // The iframe asks for the draft once it is listening, which removes the race
  // between its first paint and this page's first push.
  $effect(() => {
    function onReady(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      if ((e.data as { type?: string } | null)?.type === 'hallify:preview-ready') push();
    }
    window.addEventListener('message', onReady);
    return () => window.removeEventListener('message', onReady);
  });
</script>

<svelte:head><title>{t.settings.title} – Hallify</title></svelte:head>

{#if form?.saved}
  <div class="alert-success">{t.settingsPages.changesSaved}</div>
{/if}
{#if form?.error}
  <div class="alert-error">{form.error}</div>
{/if}

<div class="builder">
  <form
    class="builder-pane"
    method="POST"
    action="?/save"
    use:enhance={() => async ({ update }) => { await update({ reset: false }); }}
  >
    <!-- Submitted as one field: the arrangement is an ordered list, which ordinary
         form encoding has no faithful way to carry. -->
    <input type="hidden" name="sections" value={JSON.stringify(sections)} />
    <input type="hidden" name="template" value={template} />

    <section class="section section--lead">
      <div class="section-head">
        <h2>{t.settingsPages.siteLayoutTitle}</h2>
        <p>{t.settingsPages.siteLayoutHint}</p>
      </div>

      <h3 class="sb-sub">{t.settingsPages.siteSectionsOn}</h3>
      <ul class="sb-list">
        {#each enabled as s, i (s.type)}
          {@const reason = blockedReason(s.type)}
          <li
            class="sb-item"
            class:is-dragging={dragging === s.type}
            class:is-over={dragOver === s.type && dragging !== s.type}
            draggable="true"
            ondragstart={() => (dragging = s.type)}
            ondragend={() => { dragging = null; dragOver = null; }}
            ondragover={(e) => { e.preventDefault(); dragOver = s.type; }}
            ondrop={(e) => { e.preventDefault(); onDrop(s.type); }}
          >
            <span class="sb-grip" aria-hidden="true">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/></svg>
            </span>

            <span class="sb-copy">
              <strong>{labelOf(s.type)}</strong>
              <span class="sb-desc">{descOf(s.type)}</span>
              {#if reason}<span class="sb-warn">{reason}</span>{/if}
            </span>

            <span class="sb-controls">
              <button
                type="button" class="sb-icon" disabled={i === 0}
                aria-label={t.settingsPages.siteMoveUp} title={t.settingsPages.siteMoveUp}
                onclick={() => move(s.type, -1)}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="18 15 12 9 6 15"/></svg>
              </button>
              <button
                type="button" class="sb-icon" disabled={i === enabled.length - 1}
                aria-label={t.settingsPages.siteMoveDown} title={t.settingsPages.siteMoveDown}
                onclick={() => move(s.type, 1)}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              <button
                type="button" class="sb-icon sb-icon--off"
                aria-label={t.settingsPages.siteSectionRemove} title={t.settingsPages.siteSectionRemove}
                onclick={() => disable(s.type)}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
            </span>
          </li>
        {/each}
      </ul>

      {#if enabled.length === 0}
        <p class="sb-empty">{t.settingsPages.siteNoSections}</p>
      {/if}

      {#if available.length > 0}
        <h3 class="sb-sub">{t.settingsPages.siteSectionsAvailable}</h3>
        <ul class="sb-list sb-list--off">
          {#each available as s (s.type)}
            <li class="sb-item sb-item--off">
              <span class="sb-copy">
                <strong>{labelOf(s.type)}</strong>
                <span class="sb-desc">{descOf(s.type)}</span>
              </span>
              <button type="button" class="sb-add" onclick={() => enable(s.type)}>
                {t.settingsPages.siteSectionAdd}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="section">
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
          <label class="tpl" class:is-selected={template === tpl.id} class:is-locked={locked(tpl.premium)}>
            <input
              type="radio"
              value={tpl.id}
              bind:group={template}
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
          bind:value={tagline} disabled={!data.allowPremium}
          placeholder={t.settingsPages.siteTaglinePlaceholder} />
      </div>

      <div class="field">
        <label class="field-label" for="site-intro">{t.settingsPages.siteIntro}</label>
        <textarea id="site-intro" name="intro" rows="4" maxlength="600"
          bind:value={intro} disabled={!data.allowPremium}
          placeholder={t.settingsPages.siteIntroPlaceholder}></textarea>
      </div>
    </section>

    <!-- Stays in view while the operator works further down the page: a builder
         whose Save button is somewhere above the fold loses work. -->
    <div class="sb-save" class:is-dirty={dirty}>
      <span class="sb-save-note">{dirty ? t.settingsPages.siteUnsaved : t.settingsPages.siteUpToDate}</span>
      <button type="submit" class="btn-action" disabled={!dirty}>{t.common.save}</button>
    </div>
  </form>

  <aside class="preview-pane">
    <div class="pv-head">
      <h2>{t.settingsPages.sitePreviewTitle}</h2>
      <div class="pv-tools">
        <div class="pv-devices" role="group" aria-label={t.settingsPages.sitePreviewTitle}>
          <button type="button" class="pv-device" class:active={device === 'desktop'}
            onclick={() => (device = 'desktop')}>{t.settingsPages.sitePreviewDesktop}</button>
          <button type="button" class="pv-device" class:active={device === 'phone'}
            onclick={() => (device = 'phone')}>{t.settingsPages.sitePreviewPhone}</button>
        </div>
      </div>
    </div>
    <p class="pv-note">{t.settingsPages.sitePreviewHint}</p>

    <div class="pv-frame" class:is-phone={device === 'phone'}>
      <iframe
        bind:this={frame}
        src="/app/manage/settings/site/preview"
        title={t.settingsPages.sitePreviewTitle}
        onload={push}
      ></iframe>
    </div>
  </aside>
</div>

<style>
  /* Builder left, preview right. The preview sticks, so it stays beside whichever
     control the operator has scrolled to. */
  .builder {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(360px, 46%);
    gap: 28px;
    align-items: start;
  }
  .builder-pane { min-width: 0; }

  /* ─── Section list ─── */
  .sb-sub {
    font-size: 11px; font-weight: 650; text-transform: uppercase; letter-spacing: .08em;
    color: var(--text-subtle); margin: 0 0 9px;
  }
  .sb-sub + .sb-list { margin-bottom: 22px; }

  .sb-list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }

  .sb-item {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 11px;
    align-items: center;
    padding: 11px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--bg-panel);
    cursor: grab;
    transition: border-color .15s, background .15s, opacity .15s;
  }
  .sb-item:hover { border-color: var(--border-strong, var(--border)); }
  .sb-item.is-dragging { opacity: .4; cursor: grabbing; }
  .sb-item.is-over { border-color: var(--accent); background: var(--accent-dim); }
  .sb-item--off { grid-template-columns: minmax(0, 1fr) auto; cursor: default; background: none; }

  .sb-grip { display: flex; color: var(--text-subtle); }
  .sb-copy { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .sb-copy strong { font-size: 13px; font-weight: 600; letter-spacing: -.02em; }
  .sb-desc { font-size: var(--meta-size); color: var(--text-muted); line-height: 1.5; }
  .sb-warn { font-size: var(--meta-size); color: var(--warning); margin-top: 2px; }

  .sb-controls { display: flex; gap: 3px; }
  .sb-icon {
    width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;
    border: 1px solid transparent; border-radius: var(--radius-sm);
    background: none; color: var(--text-muted); cursor: pointer;
    transition: background .15s, color .15s, border-color .15s;
  }
  .sb-icon:hover:not(:disabled) { background: var(--bg-hover); color: var(--text-base); border-color: var(--border); }
  .sb-icon:disabled { opacity: .3; cursor: default; }
  .sb-icon--off:hover:not(:disabled) { background: var(--danger-dim); color: var(--danger); border-color: transparent; }

  .sb-add {
    padding: 6px 13px; border: 1px solid var(--border); border-radius: var(--radius-sm);
    background: var(--bg-panel); color: var(--text-base);
    font-family: inherit; font-size: 12px; font-weight: 600; cursor: pointer;
    transition: background .15s, border-color .15s;
  }
  .sb-add:hover { background: var(--accent-dim); border-color: var(--accent); color: var(--accent-ink); }

  .sb-empty {
    padding: 18px; border: 1px dashed var(--border); border-radius: var(--radius-sm);
    color: var(--text-muted); font-size: var(--meta-size); text-align: center; margin: 0 0 22px;
  }

  /* ─── Save bar ─── */
  .sb-save {
    position: sticky; bottom: 0; z-index: 5;
    display: flex; align-items: center; justify-content: flex-end; gap: 14px;
    margin-top: 10px; padding: 13px 0;
    background: linear-gradient(to top, var(--bg-base) 72%, transparent);
  }
  .sb-save-note { font-size: var(--meta-size); color: var(--text-subtle); }
  .sb-save.is-dirty .sb-save-note { color: var(--warning); font-weight: 600; }

  /* ─── Preview ─── */
  .preview-pane { position: sticky; top: 18px; min-width: 0; }
  .pv-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 4px; }
  .pv-head h2 { margin: 0; font-size: var(--h2-size); }
  .pv-note { font-size: var(--meta-size); color: var(--text-muted); margin: 0 0 11px; }

  .pv-devices { display: flex; gap: 2px; padding: 2px; background: var(--bg-hover); border-radius: var(--radius-sm); }
  .pv-device {
    padding: 5px 11px; border: none; border-radius: 3px; background: none;
    font-family: inherit; font-size: 11px; font-weight: 600; color: var(--text-muted);
    cursor: pointer; transition: background .15s, color .15s;
  }
  .pv-device.active { background: var(--bg-panel); color: var(--text-base); box-shadow: 0 1px 2px rgba(0,0,0,.06); }

  .pv-frame {
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    background: var(--bg-panel);
    height: calc(100vh - 150px);
    min-height: 460px;
    transition: max-width .2s;
  }
  /* The phone view narrows the frame rather than scaling it: SiteShell collapses on
     its own container width, so a 390px frame shows the real mobile layout. */
  .pv-frame.is-phone { max-width: 390px; margin: 0 auto; }
  .pv-frame iframe { display: block; width: 100%; height: 100%; border: 0; }

  /* ─── Template picker ─── */
  .tpl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 16px; }

  .tpl { display: block; cursor: pointer; }
  .tpl.is-locked { cursor: not-allowed; opacity: .55; }

  .tpl-preview {
    display: block; position: relative; height: 92px; padding: 14px;
    border: 1px solid var(--border); overflow: hidden;
    transition: box-shadow .15s, border-color .15s, transform .15s;
  }
  .tpl:not(.is-locked):hover .tpl-preview { transform: translateY(-2px); }
  .tpl.is-selected .tpl-preview { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent); }
  /* The radio is visually hidden, so the ring has to come back on keyboard focus
     or the grid is unusable without a mouse. */
  .tpl input:focus-visible + .tpl-preview { outline: 2px solid var(--accent-ink); outline-offset: 3px; }

  /* A miniature of the template: heading bar, two text lines, one accent button. */
  .tpl-bar { display: block; width: 58%; height: 9px; margin-bottom: 9px; }
  .tpl-line { display: block; width: 86%; height: 4px; margin-bottom: 5px; }
  .tpl-line.short { width: 62%; }
  .tpl-pill { display: block; width: 44px; height: 14px; margin-top: 11px; }

  .tpl-meta { display: block; margin-top: 10px; }
  .tpl-name { display: flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 600; letter-spacing: -.02em; }
  .tpl-tag { font-size: 9px; font-weight: 650; text-transform: uppercase; letter-spacing: .1em; color: var(--accent-ink); }
  .tpl-desc { display: block; margin-top: 4px; font-size: var(--meta-size); line-height: 1.6; color: var(--text-muted); }

  .sr-only {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
  }

  /* Below this the two panes cannot both be useful side by side, so the preview
     moves under the controls and stops sticking. */
  @media (max-width: 1100px) {
    .builder { grid-template-columns: minmax(0, 1fr); }
    .preview-pane { position: static; }
    .pv-frame { height: 70vh; }
  }
</style>
